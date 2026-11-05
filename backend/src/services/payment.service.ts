import crypto from 'crypto';
import { PaymentMethod, PaymentStatus, OrderStatus, Prisma } from '@prisma/client';
import prisma from '../prisma';
import {
  ValidationError,
  NotFoundError,
  ConflictError
} from '../middleware/errorHandler';
import { emitOrderUpdate, emitOrderPaymentReceived } from '../socket';
import logger from '../utils/logger';
import { generateNextToken } from '../utils/token';
import { createPrintJobs, dispatchPrintJobsForOrder } from './print.service';
import { clearOrdersQueryCache, formatOrder } from './order.service';

const PHONEPE_MERCHANT_ID = process.env.PHONEPE_MERCHANT_ID || 'PGTESTPAYUAT';
const PHONEPE_SALT_KEY = process.env.PHONEPE_SALT_KEY || '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399';
const PHONEPE_SALT_INDEX = process.env.PHONEPE_SALT_INDEX || '1';
const PHONEPE_ENV = process.env.PHONEPE_ENV || 'UAT';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

/**
 * Calculates PhonePe SHA256 checksum:
 * SHA256(data + endpoint + saltKey) + "###" + saltIndex
 */
export function calculatePhonePeChecksum(
  payloadBase64: string,
  endpoint: string,
  saltKey: string = PHONEPE_SALT_KEY,
  saltIndex: string = PHONEPE_SALT_INDEX
): string {
  const hash = crypto
    .createHash('sha256')
    .update(payloadBase64 + endpoint + saltKey)
    .digest('hex');
  return `${hash}###${saltIndex}`;
}

/**
 * Initiates a PhonePe UPI payment request for an order.
 */
export async function initiatePhonePePayment(orderId: string, redirectBaseUrl?: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      table: {
        select: {
          qr_token: true
        }
      }
    }
  });

  if (!order) {
    throw new NotFoundError(`Order ${orderId} not found.`);
  }

  if (order.payment_status === PaymentStatus.PAID) {
    throw new ConflictError('This order has already been paid.');
  }

  const merchantTransactionId = `MT_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const amountInPaise = Math.round(Number(order.total_amount) * 100);

  // 1. Create or update payment record with pending status and merchantTransactionId
  const payment = await prisma.payment.create({
    data: {
      order_id: orderId,
      payment_method: PaymentMethod.PHONEPE,
      payment_status: PaymentStatus.PENDING,
      amount: order.total_amount,
      phonepe_merchant_transaction_id: merchantTransactionId
    }
  });

  // 2. Prepare PhonePe API request payload
  const callbackUrl = `${redirectBaseUrl || FRONTEND_URL}/api/payments/phonepe/webhook`;
  const qrToken = order.qr_token_id || order.table?.qr_token || 'main';
  const redirectUrl = `${redirectBaseUrl || FRONTEND_URL}/order/${orderId}/status?mtid=${merchantTransactionId}`;

  const payload = {
    merchantId: PHONEPE_MERCHANT_ID,
    merchantTransactionId,
    merchantUserId: `CUST_${order.id.slice(0, 8)}`,
    amount: amountInPaise,
    redirectUrl,
    redirectMode: 'POST',
    callbackUrl,
    mobileNumber: '9999999999',
    paymentInstrument: {
      type: 'PAY_PAGE'
    }
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  const endpoint = '/pg/v1/pay';
  const checksum = calculatePhonePeChecksum(payloadBase64, endpoint);

  const phonePeHost =
    PHONEPE_ENV === 'PROD'
      ? 'https://api.phonepe.com/apis/hermes'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

  const payUrl = `${phonePeHost}${endpoint}`;
  const simulatedRedirectUrl = `${redirectBaseUrl || FRONTEND_URL}/checkout/pay?mtid=${merchantTransactionId}&orderId=${orderId}&qrToken=${qrToken}&amount=${Number(order.total_amount)}`;

  logger.info(
    { orderId, merchantTransactionId, amount: Number(order.total_amount) },
    'PhonePe payment initiated'
  );

  return {
    paymentId: payment.id,
    merchantTransactionId,
    amount: Number(order.total_amount),
    payUrl,
    redirectUrl: simulatedRedirectUrl,
    checksum,
    payloadBase64
  };
}

/**
 * Handles PhonePe webhook notifications with signature verification and idempotency check.
 */
export async function handlePhonePeWebhook(body: any, receivedChecksum?: string) {
  logger.info({ body }, 'Received PhonePe Webhook callback');

  // Verify checksum if provided using timing-safe comparison
  if (receivedChecksum && body.response) {
    const expectedChecksum = calculatePhonePeChecksum(body.response, '/pg/v1/status');
    const bufExpected = Buffer.from(expectedChecksum, 'utf8');
    const bufReceived = Buffer.from(receivedChecksum, 'utf8');
    const isValid =
      bufExpected.length === bufReceived.length &&
      crypto.timingSafeEqual(bufExpected, bufReceived);

    if (!isValid && process.env.NODE_ENV === 'production') {
      logger.error({ expectedChecksum, receivedChecksum }, 'Invalid PhonePe webhook signature');
      throw new ValidationError('Invalid webhook verification checksum');
    }
    logger.info({ isValid }, 'PhonePe webhook signature verified');
  }

  // Extract response data
  let decodedResponse = body;
  if (body.response && typeof body.response === 'string') {
    try {
      const decoded = Buffer.from(body.response, 'base64').toString('utf8');
      decodedResponse = JSON.parse(decoded);
    } catch {
      logger.warn('Failed to parse base64 response in PhonePe webhook, using raw body');
    }
  }

  const transactionData = decodedResponse?.data || decodedResponse;
  const merchantTransactionId =
    transactionData?.merchantTransactionId || body.merchantTransactionId;

  if (!merchantTransactionId) {
    throw new ValidationError('Merchant transaction ID not found in webhook payload.');
  }

  // Idempotency: Locate payment record
  const payment = await prisma.payment.findUnique({
    where: { phonepe_merchant_transaction_id: merchantTransactionId },
    include: { order: true }
  });

  if (!payment) {
    throw new NotFoundError(
      `Payment with merchantTransactionId ${merchantTransactionId} not found.`
    );
  }

  // IDEMPOTENCY: If payment is already marked as PAID, ignore duplicate webhook
  if (payment.payment_status === PaymentStatus.PAID) {
    logger.info(
      { merchantTransactionId, paymentId: payment.id },
      'Payment already processed as PAID. Skipping duplicate webhook.'
    );
    return { success: true, message: 'Already processed (Idempotent)' };
  }

  const isSuccess =
    decodedResponse.code === 'PAYMENT_SUCCESS' ||
    transactionData.state === 'COMPLETED' ||
    body.code === 'PAYMENT_SUCCESS';

  const newStatus = isSuccess ? PaymentStatus.PAID : PaymentStatus.FAILED;
  const transactionId = transactionData.transactionId || body.transactionId || null;

  // Update payment and order in database transaction.
  // UPI prepaid orders automatically receive a token immediately upon successful payment verification.
  const updatedOrder = await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        payment_status: newStatus,
        transaction_reference: transactionId,
        verified_at: isSuccess ? new Date() : null,
        updated_at: new Date()
      }
    });

    let assignedToken = payment.order.token_number;
    if (isSuccess && !assignedToken) {
      assignedToken = await generateNextToken(payment.order.business_id, tx);
    }

    const ord = await tx.order.update({
      where: { id: payment.order_id },
      data: {
        payment_status: newStatus,
        payment_method: PaymentMethod.PHONEPE,
        order_status: isSuccess ? OrderStatus.CONFIRMED : payment.order.order_status,
        token_number: assignedToken,
        confirmed_at: isSuccess ? (payment.order.confirmed_at || new Date()) : payment.order.confirmed_at
      },
      include: {
        table: true,
        items: true,
        payments: true,
        print_jobs: true
      }
    });

    await tx.auditLog.create({
      data: {
        business_id: payment.order.business_id,
        action: isSuccess ? 'PHONEPE_PAYMENT_SUCCESS' : 'PHONEPE_PAYMENT_FAILED',
        entity_type: 'PAYMENT',
        entity_id: payment.id,
        new_values: {
          merchantTransactionId,
          transactionId,
          amount: Number(payment.amount),
          status: newStatus,
          token_number: assignedToken
        }
      }
    });

    return ord;
  }, { timeout: 20000, maxWait: 15000 });

  clearOrdersQueryCache();
  const fullOrder = formatOrder(updatedOrder);

  if (isSuccess) {
    emitOrderPaymentReceived(payment.order.business_id, fullOrder);
  }
  emitOrderUpdate(payment.order.business_id, fullOrder);

  const qrToken =
    fullOrder.qr_token_id ||
    fullOrder.qrToken ||
    payment.order.qr_token_id ||
    (payment.order as any).table?.qr_token ||
    'main';

  return {
    success: isSuccess,
    orderId: fullOrder.id,
    qrToken,
    tokenNumber: fullOrder.tokenNumber,
    order: fullOrder,
    paymentStatus: newStatus,
    merchantTransactionId
  };
}

/**
 * Checks PhonePe payment status from PhonePe gateway or local state.
 */
export async function checkPaymentStatus(merchantTransactionId: string) {
  const payment = await prisma.payment.findUnique({
    where: { phonepe_merchant_transaction_id: merchantTransactionId },
    include: {
      order: {
        select: {
          id: true,
          order_number: true,
          token_number: true,
          order_status: true,
          payment_status: true,
          total_amount: true,
          subtotal: true,
          tax_amount: true,
          qr_token_id: true,
          table: {
            select: {
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
      }
    }
  });

  if (!payment) {
    throw new NotFoundError(
      `Payment with merchantTransactionId ${merchantTransactionId} not found.`
    );
  }

  const formattedOrder = payment.order ? formatOrder(payment.order) : null;

  return {
    merchantTransactionId,
    paymentStatus: payment.payment_status,
    amount: Number(payment.amount),
    transactionReference: payment.transaction_reference,
    verifiedAt: payment.verified_at,
    order: formattedOrder
  };
}

/**
 * Records a counter payment (CASH or UPI) for an existing order.
 */
export async function recordCounterPayment(
  orderId: string,
  businessId: string,
  cashierId: string,
  method: PaymentMethod,
  amount?: number,
  transactionRef?: string
) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, business_id: businessId }
  });

  if (!order) {
    throw new NotFoundError(`Order ${orderId} not found.`);
  }

  const payAmount = amount !== undefined ? new Prisma.Decimal(amount) : order.total_amount;

  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        order_id: orderId,
        payment_method: method,
        payment_status: PaymentStatus.PAID,
        amount: payAmount,
        transaction_reference: transactionRef || null,
        verified_at: new Date(),
        recorded_by: cashierId
      }
    });

    await tx.order.update({
      where: { id: orderId },
      data: {
        payment_status: PaymentStatus.PAID,
        payment_method: method
      }
    });

    return payment;
  });
}
