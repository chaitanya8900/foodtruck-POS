import {
  Prisma,
  OrderSource,
  OrderType,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  PrintJobStatus,
  DocumentType
} from '@prisma/client';
import prisma from '../prisma';
import {
  ValidationError,
  NotFoundError,
  ConflictError
} from '../middleware/errorHandler';
import {
  CreateCounterOrderInput,
  CreateQROrderInput,
  ConfirmPaymentInput,
  OrderQueryFilters,
  CartItemInput
} from '../types';
import { generateOrderNumber, calculateTax, roundToTwo } from '../utils/helpers';
import { generateNextToken } from '../utils/token';
import { createPrintJobs, dispatchPrintJobsForOrder } from './print.service';
import { emitNewOrder, emitOrderUpdate } from '../socket';
import { getLocalStartOfDay } from '../utils/operatingHours';
import logger from '../utils/logger';

// In-memory cache for order listing queries (10-second TTL, invalidated on write)
const ordersQueryCache = new Map<string, { timestamp: number; data: any }>();
const ORDERS_CACHE_TTL = 10000;

export function clearOrdersQueryCache() {
  ordersQueryCache.clear();
}

const businessTaxRateCache = new Map<string, { taxRate: number; expiresAt: number }>();

export function invalidateBusinessTaxRateCache(businessId: string) {
  businessTaxRateCache.delete(businessId);
}

async function getCachedTaxRate(businessId: string): Promise<number> {
  let cached = businessTaxRateCache.get(businessId);
  if (!cached || Date.now() > cached.expiresAt) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { tax_rate: true }
    });
    const taxRate = Number(business?.tax_rate || 5.0);
    cached = { taxRate, expiresAt: Date.now() + 60 * 1000 };
    businessTaxRateCache.set(businessId, cached);
  }
  return cached.taxRate;
}

const menuItemsCache = new Map<string, { items: any[]; expiresAt: number }>();

export function invalidateMenuItemsCache(businessId?: string) {
  if (businessId) {
    menuItemsCache.delete(businessId);
  } else {
    menuItemsCache.clear();
  }
}

async function getCachedMenuItems(businessId: string): Promise<any[]> {
  let cached = menuItemsCache.get(businessId);
  if (!cached || Date.now() > cached.expiresAt) {
    const items = await prisma.menuItem.findMany({
      where: { business_id: businessId },
      include: {
        modifier_groups: {
          include: { options: true }
        }
      }
    });
    cached = { items, expiresAt: Date.now() + 60 * 1000 };
    menuItemsCache.set(businessId, cached);
  }
  return cached.items;
}

/**
 * Server-side item pricing and validation.
 * Never trusts frontend prices.
 */
async function validateAndCalculateItems(
  businessId: string,
  itemsInput: CartItemInput[]
): Promise<{
  calculatedItems: Array<{
    menu_item_id: string;
    item_name_snapshot: string;
    unit_price_snapshot: Prisma.Decimal;
    quantity: number;
    customization_snapshot: any;
    special_instructions?: string | null;
    line_total: Prisma.Decimal;
  }>;
  subtotal: number;
  taxRate: number;
}> {
  if (!itemsInput || itemsInput.length === 0) {
    throw new ValidationError('Cart cannot be empty. Please select at least one item.');
  }

  // Fetch business default tax rate (cached in memory for 60s)
  const defaultTaxRate = await getCachedTaxRate(businessId);

  // Cache menu items for calculation (30s TTL)
  const dbItems = await getCachedMenuItems(businessId);
  const itemMap = new Map(dbItems.map((item: any) => [item.id, item]));

  let subtotal = 0;
  const calculatedItems = [];

  for (const inputItem of itemsInput) {
    let dbItem = itemMap.get(inputItem.menu_item_id);
    if (!dbItem) {
      // Fallback query if item was created in last seconds
      const fetched = await prisma.menuItem.findFirst({
        where: { id: inputItem.menu_item_id, business_id: businessId },
        include: { modifier_groups: { include: { options: true } } }
      });
      if (!fetched) {
        throw new NotFoundError(`Menu item ${inputItem.menu_item_id} does not exist or belongs to another business.`);
      }
      dbItem = fetched;
    }

    if (!dbItem.is_available) {
      throw new ValidationError(`Menu item "${dbItem.name}" is currently unavailable.`);
    }

    if (!inputItem.quantity || inputItem.quantity <= 0) {
      throw new ValidationError(`Quantity for "${dbItem.name}" must be greater than zero.`);
    }

    const basePrice = Number(dbItem.price);
    let modifiersCost = 0;
    const sanitizedModifiers: any[] = [];

    if (inputItem.modifiers && inputItem.modifiers.length > 0) {
      // Validate modifier selections against database modifier groups
      for (const modSelection of inputItem.modifiers) {
        const group = dbItem.modifier_groups?.find((g: any) => g.id === modSelection.group_id);
        if (!group) continue;

        const option = group.options?.find((o: any) => o.id === modSelection.option_id);
        if (!option) continue;

        if (!option.is_available) {
          throw new ValidationError(
            `Selected modifier "${option.name}" for "${dbItem.name}" is currently unavailable.`
          );
        }

        const addPrice = Number(option.additional_price);
        modifiersCost += addPrice;

        sanitizedModifiers.push({
          group_id: group.id,
          group_name: group.name,
          option_id: option.id,
          option_name: option.name,
          price: addPrice
        });
      }
    }

    const unitPrice = roundToTwo(basePrice + modifiersCost);
    const lineTotal = roundToTwo(unitPrice * inputItem.quantity);
    subtotal += lineTotal;

    calculatedItems.push({
      menu_item_id: dbItem.id,
      item_name_snapshot: dbItem.name,
      unit_price_snapshot: new Prisma.Decimal(unitPrice),
      quantity: inputItem.quantity,
      customization_snapshot: sanitizedModifiers.length > 0 ? sanitizedModifiers : null,
      special_instructions: inputItem.special_instructions || null,
      line_total: new Prisma.Decimal(lineTotal)
    });
  }

  return {
    calculatedItems,
    subtotal: roundToTwo(subtotal),
    taxRate: defaultTaxRate
  };
}

function generateFastUniqueOrderNumber(prefix: string = 'ORD'): string {
  const code = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${code}`;
}

/**
 * Creates and confirms a counter POS order with immediate payment and token generation.
 */
export async function createCounterOrder(
  businessId: string,
  cashierId: string,
  input: CreateCounterOrderInput
) {
  const { calculatedItems, subtotal, taxRate } = await validateAndCalculateItems(
    businessId,
    input.items
  );

  const discount = Math.max(0, input.discount || 0);
  const { taxAmount, totalAmount } = calculateTax(subtotal, discount, taxRate);
  const orderNumber = generateFastUniqueOrderNumber('POS');

  // Verify table if dine-in
  if (input.order_type === OrderType.DINE_IN && input.table_id) {
    const table = await prisma.table.findFirst({
      where: { id: input.table_id, business_id: businessId }
    });
    if (!table || !table.is_active) {
      throw new ValidationError('Selected table is invalid or inactive.');
    }
  }

  // Fast Atomic Transaction: Token + Order + Items + Payment
  const createdOrder = await prisma.$transaction(async (tx) => {
    // 1. Concurrency-safe atomic token generation
    const tokenNumber = await generateNextToken(businessId, tx);

    // 2. Create the Order & Items
    const order = await tx.order.create({
      data: {
        business_id: businessId,
        order_number: orderNumber,
        token_number: tokenNumber,
        source: OrderSource.POS,
        order_type: input.order_type,
        table_id: input.table_id || null,
        order_status: OrderStatus.CONFIRMED,
        payment_status: PaymentStatus.PAID,
        payment_method: input.payment_method,
        subtotal: new Prisma.Decimal(subtotal),
        discount: new Prisma.Decimal(discount),
        tax_amount: new Prisma.Decimal(taxAmount),
        total_amount: new Prisma.Decimal(totalAmount),
        special_instructions: input.special_instructions || null,
        cashier_id: cashierId,
        confirmed_at: new Date(),
        items: {
          create: calculatedItems
        }
      },
      include: {
        items: true,
        table: true
      }
    });

    // 3. Record verified payment
    await tx.payment.create({
      data: {
        order_id: order.id,
        payment_method: input.payment_method,
        payment_status: PaymentStatus.PAID,
        amount: new Prisma.Decimal(totalAmount),
        transaction_reference: input.transaction_reference || null,
        verified_at: new Date(),
        recorded_by: cashierId
      }
    });

    return order;
  }, { timeout: 10000, maxWait: 8000 });

  const fullOrder = formatOrder(createdOrder);
  clearOrdersQueryCache();

  // Non-blocking background audit log & print jobs
  setImmediate(async () => {
    try {
      await prisma.auditLog.create({
        data: {
          business_id: businessId,
          user_id: cashierId,
          action: 'ORDER_CONFIRMED',
          entity_type: 'ORDER',
          entity_id: createdOrder.id,
          new_values: {
            order_number: createdOrder.order_number,
            token_number: createdOrder.token_number,
            total_amount: totalAmount,
            payment_method: input.payment_method
          }
        }
      });
      await createPrintJobs(createdOrder.id, false);
      await dispatchPrintJobsForOrder(createdOrder.id, businessId);
    } catch (err) {
      logger.warn({ err, orderId: createdOrder.id }, 'Background post-order tasks warning');
    }
  });

  // Emit real-time event to staff and printer immediately
  emitNewOrder(businessId, fullOrder);

  return fullOrder;
}

/**
 * Creates a customer self-order via QR code.
 * Initial status is PENDING_PAYMENT, NO token is assigned yet.
 */
export async function createQROrder(input: CreateQROrderInput) {
  let business: any;
  let tableId: string | null = null;
  let tableNameSnapshot: string = 'Main QR (Direct)';

  if (input.qr_token === 'main' || input.qr_token === 'qr_main') {
    business = await prisma.business.findFirst({
      where: { is_active: true }
    });
    if (!business) {
      throw new ValidationError('No active business found.');
    }
  } else {
    // 1. Validate QR token and find table & business
    const table = await prisma.table.findUnique({
      where: { qr_token: input.qr_token },
      include: { business: true }
    });

    if (!table || !table.is_active || !table.business || !table.business.is_active) {
      throw new ValidationError('Invalid or inactive QR code.');
    }

    business = table.business;
    tableId = table.id;
    tableNameSnapshot = table.table_name;
  }

  // Validate order type allowed
  if (input.order_type === OrderType.DINE_IN && !business.is_dine_in_enabled) {
    throw new ValidationError('Dine-in ordering is currently disabled for this food truck.');
  }
  if (input.order_type === OrderType.TAKEAWAY && !business.is_takeaway_enabled) {
    throw new ValidationError('Takeaway ordering is currently disabled for this food truck.');
  }

  // 2. Validate & calculate items server-side
  const { calculatedItems, subtotal, taxRate } = await validateAndCalculateItems(
    business.id,
    input.items
  );

  const { taxAmount, totalAmount } = calculateTax(subtotal, 0, taxRate);
  const orderNumber = generateFastUniqueOrderNumber('QR');

  // 3. Create Order without token (No token generated until payment confirmed)
  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        business_id: business.id,
        order_number: orderNumber,
        token_number: null, // NO TOKEN for unpaid order!
        source: OrderSource.QR,
        order_type: input.order_type,
        table_id: tableId,
        qr_token_id: input.qr_token,
        order_status: OrderStatus.PENDING_PAYMENT,
        payment_status: PaymentStatus.PENDING,
        payment_method: input.payment_method || null,
        subtotal: new Prisma.Decimal(subtotal),
        discount: new Prisma.Decimal(0),
        tax_amount: new Prisma.Decimal(taxAmount),
        total_amount: new Prisma.Decimal(totalAmount),
        special_instructions: input.special_instructions || null,
        items: {
          create: calculatedItems
        }
      },
      include: {
        items: true,
        table: true
      }
    });

    // Audit Log
    await tx.auditLog.create({
      data: {
        business_id: business.id,
        action: 'QR_ORDER_CREATED',
        entity_type: 'ORDER',
        entity_id: created.id,
        new_values: {
          order_number: created.order_number,
          table_name: tableNameSnapshot,
          order_type: input.order_type,
          total_amount: totalAmount
        }
      }
    });

    return created;
  });

  const formatted = formatOrder(order);
  clearOrdersQueryCache();

  // Emit event to cashier Mobile Orders dashboard in real-time ONLY for Pay-at-Counter orders!
  // For online UPI prepaid orders, we only emit after payment is successfully verified.
  if (input.payment_method !== PaymentMethod.UPI && input.payment_method !== PaymentMethod.PHONEPE) {
    emitNewOrder(business.id, formatted);
  }

  return formatted;
}

/**
 * Confirms payment for Pay-at-Counter mobile order.
 * Generates token and prints slips.
 */
export async function confirmPayment(
  orderId: string,
  businessId: string,
  cashierId: string,
  input: ConfirmPaymentInput
) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, business_id: businessId }
  });

  if (!order) {
    throw new NotFoundError(`Order ${orderId} not found.`);
  }

  if (order.order_status === OrderStatus.CANCELLED) {
    throw new ConflictError('Cannot confirm payment on a cancelled order.');
  }

  if (order.payment_status === PaymentStatus.PAID && order.token_number) {
    throw new ConflictError('Order payment has already been confirmed and token issued.');
  }

  const confirmedOrder = await prisma.$transaction(async (tx) => {
    // 1. Generate unique sequential token
    const tokenNumber = await generateNextToken(businessId, tx);

    // 2. Record payment
    await tx.payment.create({
      data: {
        order_id: orderId,
        payment_method: input.payment_method,
        payment_status: PaymentStatus.PAID,
        amount: input.amount ? new Prisma.Decimal(input.amount) : order.total_amount,
        transaction_reference: input.transaction_reference || null,
        verified_at: new Date(),
        recorded_by: cashierId
      }
    });

    // 3. Update Order status, payment status, token, cashier, confirmed_at
    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        order_status: OrderStatus.CONFIRMED,
        payment_status: PaymentStatus.PAID,
        payment_method: input.payment_method,
        token_number: tokenNumber,
        cashier_id: cashierId,
        confirmed_at: new Date()
      },
      include: {
        items: true,
        table: true,
        payments: true
      }
    });

    // 4. Audit Log
    await tx.auditLog.create({
      data: {
        business_id: businessId,
        user_id: cashierId,
        action: 'PAY_AT_COUNTER_CONFIRMED',
        entity_type: 'ORDER',
        entity_id: orderId,
        new_values: {
          token_number: tokenNumber,
          payment_method: input.payment_method,
          amount: Number(order.total_amount)
        }
      }
    });

    return updated;
  }, { timeout: 20000, maxWait: 15000 });

  const fullOrder = formatOrder(confirmedOrder);
  clearOrdersQueryCache();
  emitOrderUpdate(businessId, fullOrder);

  // Run thermal print job creation & socket dispatch in background asynchronously
  Promise.resolve().then(async () => {
    try {
      await createPrintJobs(orderId, false);
      await dispatchPrintJobsForOrder(confirmedOrder.id, businessId);
    } catch (printErr) {
      logger.warn({ printErr, orderId }, 'Background print dispatch error on payment confirmation');
    }
  });

  return fullOrder;
}

/**
 * Issues a token for a prepaid order whose payment is already verified (PAID).
 */
export async function issueToken(
  orderId: string,
  businessId: string,
  cashierId?: string
) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, business_id: businessId }
  });

  if (!order) {
    throw new NotFoundError(`Order ${orderId} not found.`);
  }

  // Business Rule: Validate payment is PAID before issuing token
  if (order.payment_status !== PaymentStatus.PAID) {
    throw new ValidationError(
      `Cannot issue token / print KOT: Order payment status is ${order.payment_status}. Payment must be PAID.`
    );
  }

  const updatedOrder = await prisma.$transaction(async (tx) => {
    // 1. If order already has token (e.g. prepaid UPI order), reuse it; otherwise generate sequential token
    let tokenNumber = order.token_number;
    if (!tokenNumber) {
      tokenNumber = await generateNextToken(businessId, tx);
    }

    // 2. Update Order
    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        order_status: OrderStatus.CONFIRMED,
        token_number: tokenNumber,
        cashier_id: cashierId || order.cashier_id,
        confirmed_at: order.confirmed_at || new Date()
      },
      include: {
        items: true,
        table: true,
        payments: true,
        print_jobs: true
      }
    });

    // 3. Audit Log
    await tx.auditLog.create({
      data: {
        business_id: businessId,
        user_id: cashierId || null,
        action: 'KOT_PRINTED',
        entity_type: 'ORDER',
        entity_id: orderId,
        new_values: { token_number: tokenNumber }
      }
    });

    return updated;
  }, { timeout: 20000, maxWait: 15000 });

  // Run thermal print job creation & dispatch for KOT and receipt
  try {
    await createPrintJobs(orderId, false);
    await dispatchPrintJobsForOrder(updatedOrder.id, businessId);
  } catch (printErr) {
    logger.warn({ printErr, orderId }, 'Background print dispatch error on KOT printing');
  }

  // Refetch to include newly created print_jobs
  const refetched = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      table: true,
      payments: true,
      print_jobs: true
    }
  });

  const fullOrder = formatOrder(refetched || updatedOrder);
  clearOrdersQueryCache();
  emitOrderUpdate(businessId, fullOrder);

  return fullOrder;
}

/**
 * Switches an unpaid QR order to Pay at Counter.
 */
export async function switchToCounterPayment(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId }
  });

  if (!order) {
    throw new NotFoundError(`Order ${orderId} not found.`);
  }

  if (order.payment_status === PaymentStatus.PAID) {
    throw new ConflictError('Cannot change payment method for an already paid order.');
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      payment_method: PaymentMethod.CASH,
      updated_at: new Date()
    },
    include: {
      table: true,
      items: true,
      payments: true,
      print_jobs: true
    }
  });

  const fullOrder = formatOrder(updated);
  clearOrdersQueryCache();
  // Notify cashier POS that a Pay-at-Counter order has arrived
  emitNewOrder(order.business_id, fullOrder);
  return fullOrder;
}

/**
 * Cancels an order with a mandatory reason.
 */
export async function cancelOrder(
  orderId: string,
  businessId: string,
  userId?: string,
  reason?: string
) {
  if (!reason || reason.trim() === '') {
    throw new ValidationError('Cancellation reason is required.');
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, business_id: businessId }
  });

  if (!order) {
    throw new NotFoundError(`Order ${orderId} not found.`);
  }

  if (order.order_status === OrderStatus.COMPLETED) {
    throw new ConflictError('Completed orders cannot be cancelled.');
  }

  if (order.order_status === OrderStatus.CANCELLED) {
    throw new ConflictError('Order is already cancelled.');
  }

  const updatedOrder = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        order_status: OrderStatus.CANCELLED,
        cancel_reason: reason.trim()
      },
      include: {
        items: true,
        table: true,
        payments: true
      }
    });

    // Invalidate pending print jobs for cancelled order
    await tx.printJob.updateMany({
      where: {
        order_id: orderId,
        status: PrintJobStatus.PENDING
      },
      data: {
        status: PrintJobStatus.FAILED,
        failure_reason: `Order cancelled: ${reason.trim()}`
      }
    });

    // Audit Log
    await tx.auditLog.create({
      data: {
        business_id: businessId,
        user_id: userId || null,
        action: 'ORDER_CANCELLED',
        entity_type: 'ORDER',
        entity_id: orderId,
        old_values: { order_status: order.order_status },
        new_values: { order_status: OrderStatus.CANCELLED, reason }
      }
    });

    return updated;
  });

  const fullOrder = await getOrderById(updatedOrder.id, businessId);
  clearOrdersQueryCache();
  emitOrderUpdate(businessId, fullOrder);

  return fullOrder;
}

/**
 * Automatically cancels any pending payment orders created before the start of the current
 * business day. Ensures the pending payments page refreshes everyday and only shows today's orders.
 */
export async function autoCancelStalePendingPaymentOrders(businessId?: string): Promise<number> {
  try {
    const businesses = businessId
      ? await prisma.business.findMany({ where: { id: businessId } })
      : await prisma.business.findMany({ where: { is_active: true } });

    let totalCancelled = 0;

    for (const biz of businesses) {
      const timezone = biz.timezone || 'Asia/Kolkata';
      const resetTime = biz.token_reset_time || '04:00';
      const startOfToday = getLocalStartOfDay(timezone, resetTime);

      const staleOrders = await prisma.order.findMany({
        where: {
          business_id: biz.id,
          order_status: OrderStatus.PENDING_PAYMENT,
          created_at: { lt: startOfToday }
        },
        select: { id: true, order_number: true }
      });

      if (staleOrders.length > 0) {
        const staleIds = staleOrders.map((o) => o.id);
        const updateResult = await prisma.order.updateMany({
          where: { id: { in: staleIds } },
          data: {
            order_status: OrderStatus.CANCELLED,
            payment_status: PaymentStatus.FAILED,
            cancel_reason: 'Auto-cancelled: Expired at end of day',
            updated_at: new Date()
          }
        });

        totalCancelled += updateResult.count;
        clearOrdersQueryCache();

        for (const order of staleOrders) {
          try {
            emitOrderUpdate(biz.id, {
              id: order.id,
              orderNumber: order.order_number,
              orderStatus: OrderStatus.CANCELLED,
              paymentStatus: PaymentStatus.FAILED
            });
          } catch {}
        }
      }
    }

    return totalCancelled;
  } catch (err) {
    logger.error({ err }, 'Error auto-cancelling stale pending payment orders');
    return 0;
  }
}

/**
 * Cancels all remaining pending payment orders for a business (e.g. when food truck closes for the day).
 */
export async function cancelAllPendingPaymentOrders(businessId: string, reason: string = 'Auto-cancelled: Closed for today'): Promise<number> {
  try {
    const pendingOrders = await prisma.order.findMany({
      where: {
        business_id: businessId,
        order_status: OrderStatus.PENDING_PAYMENT
      },
      select: { id: true, order_number: true }
    });

    if (pendingOrders.length === 0) return 0;

    const ids = pendingOrders.map((o) => o.id);
    const updateResult = await prisma.order.updateMany({
      where: { id: { in: ids } },
      data: {
        order_status: OrderStatus.CANCELLED,
        payment_status: PaymentStatus.FAILED,
        cancel_reason: reason,
        updated_at: new Date()
      }
    });

    clearOrdersQueryCache();

    for (const order of pendingOrders) {
      try {
        emitOrderUpdate(businessId, {
          id: order.id,
          orderNumber: order.order_number,
          orderStatus: OrderStatus.CANCELLED,
          paymentStatus: PaymentStatus.FAILED
        });
      } catch {}
    }

    return updateResult.count;
  } catch (err) {
    logger.error({ err }, 'Error cancelling all pending payment orders');
    return 0;
  }
}

/**
 * Kitchen workflow: updates order status (CONFIRMED -> PREPARING -> READY -> COMPLETED).
 */
export async function updateOrderStatus(
  orderId: string,
  businessId: string,
  newStatus: OrderStatus,
  userId?: string
) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, business_id: businessId }
  });

  if (!order) {
    throw new NotFoundError(`Order ${orderId} not found.`);
  }

  if (order.order_status === OrderStatus.CANCELLED) {
    throw new ConflictError('Cannot change status of a cancelled order.');
  }

  const updateData: any = {
    order_status: newStatus
  };

  if (newStatus === OrderStatus.COMPLETED) {
    updateData.completed_at = new Date();
  }

  const updated = await prisma.$transaction(async (tx) => {
    const ord = await tx.order.update({
      where: { id: orderId },
      data: updateData,
      include: {
        items: true,
        table: true,
        payments: true
      }
    });

    await tx.auditLog.create({
      data: {
        business_id: businessId,
        user_id: userId || null,
        action: 'ORDER_STATUS_CHANGED',
        entity_type: 'ORDER',
        entity_id: orderId,
        old_values: { status: order.order_status },
        new_values: { status: newStatus }
      }
    });

    return ord;
  });

  const fullOrder = formatOrder(updated);
  clearOrdersQueryCache();
  emitOrderUpdate(businessId, fullOrder);

  return fullOrder;
}

/**
 * Reprints order receipts/KOT slips while retaining original token number.
 */
export async function reprintOrder(
  orderId: string,
  businessId: string,
  documentType?: 'CUSTOMER_RECEIPT' | 'KOT' | 'ALL',
  userId?: string
) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, business_id: businessId }
  });

  if (!order) {
    throw new NotFoundError(`Order ${orderId} not found.`);
  }

  if (!order.token_number) {
    throw new ValidationError('Cannot reprint an order that has not been confirmed or issued a token.');
  }

  const newJobs = await prisma.$transaction(async (tx) => {
    const created = [];

    if (!documentType || documentType === 'CUSTOMER_RECEIPT' || documentType === 'ALL') {
      const receiptJob = await tx.printJob.create({
        data: {
          order_id: orderId,
          document_type: 'CUSTOMER_RECEIPT',
          status: PrintJobStatus.PENDING,
          is_reprint: true,
          attempt_count: 0
        }
      });
      created.push(receiptJob);
    }

    if (!documentType || documentType === 'KOT' || documentType === 'ALL') {
      const kotJob = await tx.printJob.create({
        data: {
          order_id: orderId,
          document_type: 'KOT',
          status: PrintJobStatus.PENDING,
          is_reprint: true,
          attempt_count: 0
        }
      });
      created.push(kotJob);
    }

    await tx.auditLog.create({
      data: {
        business_id: businessId,
        user_id: userId || null,
        action: 'ORDER_REPRINT_REQUESTED',
        entity_type: 'ORDER',
        entity_id: orderId,
        new_values: { documentType: documentType || 'ALL', token_number: order.token_number }
      }
    });

    return created;
  });

  const fullOrder = await getOrderById(orderId, businessId);
  emitOrderUpdate(businessId, fullOrder);
  await dispatchPrintJobsForOrder(orderId, businessId);

  return { message: 'Reprint job created successfully', printJobs: newJobs };
}

/**
 * Retrieves orders with multiple filters, search, and pagination.
 */
export async function getOrders(businessId: string, filters: OrderQueryFilters) {
  const cacheKey = `${businessId}:${JSON.stringify(filters)}`;
  const cached = ordersQueryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < ORDERS_CACHE_TTL) {
    return cached.data;
  }

  const page = Math.max(1, Number(filters.page || 1));
  const limit = Math.max(1, Math.min(100, Number(filters.limit || 20)));
  const skip = (page - 1) * limit;

  const rawOrderType = (filters.order_type || (filters as any).orderType);
  const rawStatus = (filters.order_status || (filters as any).orderStatus);
  const rawPaymentStatus = (filters.payment_status || (filters as any).paymentStatus);
  const rawSource = (filters.source || (filters as any).source);

  let orderTypeFilter: OrderType | undefined = undefined;
  if (rawOrderType) {
    const upper = rawOrderType.toString().toUpperCase();
    if (upper === 'DINE_IN' || upper.includes('DINE')) orderTypeFilter = OrderType.DINE_IN;
    else if (upper === 'TAKEAWAY' || upper.includes('TAKE')) orderTypeFilter = OrderType.TAKEAWAY;
  }

  let sourceFilter: OrderSource | undefined = undefined;
  if (rawSource) {
    const upper = rawSource.toString().toUpperCase();
    if (upper === 'POS') sourceFilter = OrderSource.POS;
    else if (upper === 'QR') sourceFilter = OrderSource.QR;
  }

  let statusFilter: OrderStatus | undefined = undefined;
  if (rawStatus) {
    const upper = rawStatus.toString().toUpperCase();
    if (Object.values(OrderStatus).includes(upper as any)) statusFilter = upper as OrderStatus;
  }

  let paymentStatusFilter: PaymentStatus | undefined = undefined;
  if (rawPaymentStatus) {
    const upper = rawPaymentStatus.toString().toUpperCase();
    if (Object.values(PaymentStatus).includes(upper as any)) paymentStatusFilter = upper as PaymentStatus;
  }

  const where: Prisma.OrderWhereInput = {
    business_id: businessId,
    ...(sourceFilter ? { source: sourceFilter } : {}),
    ...(orderTypeFilter ? { order_type: orderTypeFilter } : {}),
    ...(statusFilter ? { order_status: statusFilter } : {}),
    ...(paymentStatusFilter ? { payment_status: paymentStatusFilter } : {})
  };

  // Tab filter support for mobile orders
  const tabFilter = (filters.filter || (filters as any).tab || '').toString().toLowerCase();
  if (tabFilter === 'pending_payment' || tabFilter === 'pending') {
    where.payment_status = PaymentStatus.PENDING;
    where.order_status = { not: OrderStatus.CANCELLED };
    // Pending payments only show current operating day's orders
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true, token_reset_time: true }
    });
    const startOfToday = getLocalStartOfDay(business?.timezone || 'Asia/Kolkata', business?.token_reset_time || '04:00');
    where.created_at = { ...(where.created_at as any || {}), gte: startOfToday };
  } else if (tabFilter === 'ready_for_token' || tabFilter === 'ready') {
    where.payment_status = PaymentStatus.PAID;
    where.order_status = { not: OrderStatus.CANCELLED };
    where.print_jobs = { none: { document_type: DocumentType.KOT } };
  } else if (tabFilter === 'confirmed') {
    where.token_number = { not: null };
    where.order_status = { not: OrderStatus.CANCELLED };
    where.print_jobs = { some: { document_type: DocumentType.KOT } };
  }

  if (filters.startDate || filters.endDate) {
    where.created_at = {};
    if (filters.startDate) {
      where.created_at.gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      where.created_at.lte = end;
    }
  }

  if (filters.search) {
    const s = filters.search.trim();
    where.OR = [
      { order_number: { contains: s, mode: 'insensitive' } },
      { token_number: { contains: s, mode: 'insensitive' } },
      { table: { table_name: { contains: s, mode: 'insensitive' } } }
    ];
  }

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        table: true,
        cashier: {
          select: { id: true, name: true, email: true }
        },
        items: true,
        print_jobs: true
      }
    })
  ]);

  const result = {
    orders: orders.map(formatOrder),
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };

  ordersQueryCache.set(cacheKey, { timestamp: Date.now(), data: result });
  return result;
}

/**
 * Normalizes an Order object ensuring both camelCase and snake_case properties
 * are present, decimal numbers are properly converted to JavaScript numbers,
 * and item snapshot names/totals are accessible.
 */
export function formatOrder(order: any): any {
  if (!order) return order;

  const items = Array.isArray(order.items)
    ? order.items.map((item: any) => {
        const unitPrice = Number(item.unit_price_snapshot ?? item.unitPrice ?? 0);
        const lineTotal = Number(item.line_total ?? item.totalPrice ?? (unitPrice * (item.quantity || 1)));
        const name = item.item_name_snapshot || item.name || '';
        return {
          ...item,
          name,
          itemName: name,
          item_name_snapshot: item.item_name_snapshot || name,
          unitPrice,
          unit_price_snapshot: unitPrice,
          quantity: Number(item.quantity) || 1,
          totalPrice: lineTotal,
          line_total: lineTotal,
          customizations: item.customizations || item.customization_snapshot || [],
          customization_snapshot: item.customization_snapshot || item.customizations || null,
          specialInstructions: item.special_instructions || item.specialInstructions || undefined
        };
      })
    : [];

  const subtotal = Number(order.subtotal ?? 0);
  const tax = Number(order.tax_amount ?? order.tax ?? 0);
  const discount = Number(order.discount ?? 0);
  const totalAmount = Number(order.total_amount ?? order.grandTotal ?? 0);

  const table = order.table
    ? {
        ...order.table,
        tableName: order.table.table_name || order.table.tableName || '',
        table_name: order.table.table_name || order.table.tableName || '',
        tableNumber: order.table.table_number || order.table.tableNumber || '',
        qrToken: order.table.qr_token || order.table.qrToken || ''
      }
    : null;

  const printJobs = order.print_jobs || order.printJobs || [];
  const hasKotPrinted = Boolean(
    order.kot_printed ||
    (Array.isArray(printJobs) && printJobs.some((pj: any) => pj.document_type === 'KOT' || pj.documentType === 'KOT'))
  );

  return {
    ...order,
    orderNumber: order.order_number || order.orderNumber,
    order_number: order.order_number || order.orderNumber,
    tokenNumber: order.token_number !== undefined ? order.token_number : order.tokenNumber,
    token_number: order.token_number !== undefined ? order.token_number : order.tokenNumber,
    orderType: order.order_type || order.orderType,
    order_type: order.order_type || order.orderType,
    qrToken: order.qr_token_id || order.table?.qr_token || 'main',
    qr_token_id: order.qr_token_id || order.table?.qr_token || 'main',
    orderStatus: order.order_status || order.orderStatus,
    order_status: order.order_status || order.orderStatus,
    paymentStatus: order.payment_status || order.paymentStatus,
    payment_status: order.payment_status || order.paymentStatus,
    paymentMethod: order.payment_method || order.paymentMethod,
    payment_method: order.payment_method || order.paymentMethod,
    subtotal,
    tax,
    tax_amount: tax,
    discount,
    grandTotal: totalAmount,
    totalAmount,
    total_amount: totalAmount,
    specialInstructions: order.special_instructions || order.specialInstructions || null,
    special_instructions: order.special_instructions || order.specialInstructions || null,
    createdAt: order.created_at || order.createdAt,
    created_at: order.created_at || order.createdAt,
    confirmedAt: order.confirmed_at || order.confirmedAt || null,
    confirmed_at: order.confirmed_at || order.confirmedAt || null,
    completedAt: order.completed_at || order.completedAt || null,
    completed_at: order.completed_at || order.completedAt || null,
    table,
    items,
    printJobs,
    print_jobs: printJobs,
    hasKotPrinted
  };
}

/**
 * Retrieves a single order by ID with all related entities.
 */
export async function getOrderById(orderId: string, businessId?: string) {
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      ...(businessId ? { business_id: businessId } : {})
    },
    include: {
      business: true,
      table: true,
      cashier: {
        select: { id: true, name: true, email: true }
      },
      items: {
        include: {
          menu_item: {
            select: { id: true, image_url: true }
          }
        }
      },
      payments: {
        include: {
          recorder: {
            select: { id: true, name: true }
          }
        }
      },
      print_jobs: {
        orderBy: { created_at: 'desc' }
      }
    }
  });

  if (!order) {
    throw new NotFoundError(`Order ${orderId} not found.`);
  }

  return formatOrder(order);
}

/**
 * Public status lookup for customer order tracking. Exposes only safe fields.
 */
export async function getPublicOrderStatus(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      order_number: true,
      token_number: true,
      source: true,
      order_type: true,
      qr_token_id: true,
      order_status: true,
      payment_status: true,
      payment_method: true,
      subtotal: true,
      tax_amount: true,
      total_amount: true,
      special_instructions: true,
      created_at: true,
      confirmed_at: true,
      completed_at: true,
      table: {
        select: {
          id: true,
          table_name: true,
          qr_token: true
        }
      },
      items: {
        select: {
          id: true,
          item_name_snapshot: true,
          unit_price_snapshot: true,
          quantity: true,
          customization_snapshot: true,
          line_total: true
        }
      }
    }
  });

  if (!order) {
    throw new NotFoundError(`Order ${orderId} not found.`);
  }

  return formatOrder(order);
}
