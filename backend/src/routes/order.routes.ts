import { Router, Response } from 'express';
import { z } from 'zod';
import {
  Role,
  OrderType,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  OrderSource
} from '@prisma/client';
import * as orderService from '../services/order.service';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../types';

const router = Router();

// ======================== SCHEMAS ========================

const cartItemSchema = z.object({
  menu_item_id: z.string().uuid('Valid menu item ID is required'),
  quantity: z.number().int().positive('Quantity must be at least 1'),
  modifiers: z
    .array(
      z.object({
        group_id: z.string().uuid(),
        group_name: z.string(),
        option_id: z.string().uuid(),
        option_name: z.string(),
        price: z.number().nonnegative()
      })
    )
    .optional(),
  special_instructions: z.string().optional()
});

const counterOrderSchema = z.object({
  order_type: z.nativeEnum(OrderType),
  table_id: z.string().uuid().optional(),
  items: z.array(cartItemSchema).min(1, 'At least one item is required'),
  discount: z.number().nonnegative().optional(),
  special_instructions: z.string().optional(),
  payment_method: z.nativeEnum(PaymentMethod),
  transaction_reference: z.string().optional()
});

const cancelOrderSchema = z.object({
  reason: z.string().optional().default('Cancelled by staff')
});

const updateStatusSchema = z.object({
  status: z.preprocess((val) => {
    if (typeof val === 'string' && val.trim() !== '') {
      const upper = val.trim().toUpperCase();
      if (Object.values(OrderStatus).includes(upper as any)) return upper as OrderStatus;
    }
    return val;
  }, z.nativeEnum(OrderStatus))
});

const orderTypeEnumField = z.preprocess((val) => {
  if (typeof val === 'string' && val.trim() !== '') {
    const upper = val.trim().toUpperCase();
    if (upper === 'DINE_IN' || upper.includes('DINE')) return OrderType.DINE_IN;
    if (upper === 'TAKEAWAY' || upper.includes('TAKE')) return OrderType.TAKEAWAY;
  }
  return undefined;
}, z.nativeEnum(OrderType).optional());

const orderSourceEnumField = z.preprocess((val) => {
  if (typeof val === 'string' && val.trim() !== '') {
    const upper = val.trim().toUpperCase();
    if (upper === 'POS') return OrderSource.POS;
    if (upper === 'QR') return OrderSource.QR;
  }
  return undefined;
}, z.nativeEnum(OrderSource).optional());

const orderStatusEnumField = z.preprocess((val) => {
  if (typeof val === 'string' && val.trim() !== '') {
    const upper = val.trim().toUpperCase();
    if (Object.values(OrderStatus).includes(upper as any)) return upper as OrderStatus;
  }
  return undefined;
}, z.nativeEnum(OrderStatus).optional());

const paymentStatusEnumField = z.preprocess((val) => {
  if (typeof val === 'string' && val.trim() !== '') {
    const upper = val.trim().toUpperCase();
    if (Object.values(PaymentStatus).includes(upper as any)) return upper as PaymentStatus;
  }
  return undefined;
}, z.nativeEnum(PaymentStatus).optional());

const orderQuerySchema = z.object({
  source: orderSourceEnumField,
  order_type: orderTypeEnumField,
  orderType: orderTypeEnumField,
  order_status: orderStatusEnumField,
  orderStatus: orderStatusEnumField,
  payment_status: paymentStatusEnumField,
  paymentStatus: paymentStatusEnumField,
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional()
}).transform((data) => ({
  source: data.source,
  order_type: data.order_type ?? data.orderType,
  order_status: data.order_status ?? data.orderStatus,
  payment_status: data.payment_status ?? data.paymentStatus,
  startDate: data.startDate,
  endDate: data.endDate,
  search: data.search,
  page: data.page,
  limit: data.limit
}));

// Require authentication for all POS order operations
router.use(authenticate);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const handleCounterOrder = async (req: AuthRequest, res: Response, next: any) => {
  try {
    const b = req.body;
    const rawOrderType = (b.order_type || b.orderType || 'dine_in').toString().toUpperCase();
    const order_type = rawOrderType.includes('TAKEAWAY') ? OrderType.TAKEAWAY : OrderType.DINE_IN;

    const rawPayment = (b.payment_method || b.paymentMethod || 'cash').toString().toUpperCase();
    const payment_method = rawPayment.includes('UPI') || rawPayment.includes('PHONEPE') ? PaymentMethod.UPI : PaymentMethod.CASH;

    const rawTableId = b.table_id || b.tableId;
    const table_id = rawTableId && typeof rawTableId === 'string' && UUID_REGEX.test(rawTableId) ? rawTableId : undefined;
    const discount = Math.max(0, Number(b.discount) || 0);
    const special_instructions = typeof (b.special_instructions || b.specialInstructions) === 'string' ? (b.special_instructions || b.specialInstructions).slice(0, 500) : undefined;
    const transaction_reference = typeof (b.transaction_reference || b.transactionReference) === 'string' ? (b.transaction_reference || b.transactionReference).slice(0, 100) : undefined;

    const rawItems = Array.isArray(b.items) ? b.items : [];
    if (rawItems.length === 0) {
      res.status(400).json({ success: false, message: 'Cart cannot be empty. Please select at least one item.' });
      return;
    }

    const items = [];
    for (const item of rawItems) {
      const menuItemId = item.menu_item_id || item.menuItemId;
      if (!menuItemId || typeof menuItemId !== 'string' || !UUID_REGEX.test(menuItemId)) {
        res.status(400).json({ success: false, message: 'Invalid or missing menu item ID in order payload' });
        return;
      }
      const qty = Math.max(1, Math.min(100, Math.floor(Number(item.quantity) || 1)));
      const rawModifiers = Array.isArray(item.modifiers || item.customizations) ? (item.modifiers || item.customizations) : [];
      const modifiers = rawModifiers.map((m: any) => ({
        group_id: (m.group_id || m.groupId || m.modifierGroupId || '00000000-0000-0000-0000-000000000000').toString(),
        group_name: (m.group_name || m.groupName || m.modifierGroupName || '').toString().slice(0, 100),
        option_id: (m.option_id || m.optionId || m.id || '').toString(),
        option_name: (m.option_name || m.optionName || m.name || '').toString().slice(0, 100),
        price: Math.max(0, Number(m.price || m.additionalPrice || 0))
      }));

      items.push({
        menu_item_id: menuItemId,
        quantity: qty,
        modifiers,
        special_instructions: typeof (item.special_instructions || item.specialInstructions) === 'string' ? (item.special_instructions || item.specialInstructions).slice(0, 300) : undefined
      });
    }

    const order = await orderService.createCounterOrder(
      req.user!.businessId,
      req.user!.userId,
      {
        order_type,
        table_id,
        items,
        discount,
        special_instructions,
        payment_method,
        transaction_reference
      }
    );

    res.status(201).json({
      success: true,
      message: 'Counter order created and confirmed successfully',
      data: order
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/orders/counter
router.post('/counter', authorize([Role.ADMIN, Role.CASHIER]), handleCounterOrder);

// POST /api/orders/counter/confirm
router.post('/counter/confirm', authorize([Role.ADMIN, Role.CASHIER]), handleCounterOrder);

// GET /api/orders
router.get(
  '/',
  validate({ query: orderQuerySchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const result = await orderService.getOrders(req.user!.businessId, req.query as any);
      res.status(200).json({
        success: true,
        data: result.orders,
        meta: result.meta
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/orders/:id
router.get('/:id', async (req: AuthRequest, res: Response, next) => {
  try {
    const order = await orderService.getOrderById(req.params.id, req.user!.businessId);
    res.status(200).json({
      success: true,
      data: order
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/orders/:id/cancel
router.post(
  '/:id/cancel',
  authorize([Role.ADMIN, Role.CASHIER]),
  validate({ body: cancelOrderSchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const order = await orderService.cancelOrder(
        req.params.id,
        req.user!.businessId,
        req.user!.userId,
        req.body.reason
      );
      res.status(200).json({
        success: true,
        message: 'Order cancelled successfully',
        data: order
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/orders/:id/status
router.patch(
  '/:id/status',
  authorize([Role.ADMIN, Role.CASHIER, Role.KITCHEN_STAFF]),
  validate({ body: updateStatusSchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const order = await orderService.updateOrderStatus(
        req.params.id,
        req.user!.businessId,
        req.body.status,
        req.user!.userId
      );
      res.status(200).json({
        success: true,
        message: `Order status updated to ${req.body.status}`,
        data: order
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/orders/:id/reprint (Reprint customer receipt or KOT)
router.post(
  '/:id/reprint',
  authorize([Role.ADMIN, Role.CASHIER]),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const docType = req.body?.document_type || req.body?.documentType;
      const result = await orderService.reprintOrder(
        req.params.id,
        req.user!.businessId,
        docType,
        req.user!.userId
      );
      res.status(200).json({
        success: true,
        message: result.message,
        data: result.printJobs
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
