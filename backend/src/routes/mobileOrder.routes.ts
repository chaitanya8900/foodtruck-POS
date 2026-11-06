import { Router, Response } from 'express';
import { z } from 'zod';
import { Role, OrderSource, PaymentMethod, OrderStatus, PaymentStatus } from '@prisma/client';
import * as orderService from '../services/order.service';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../types';

const router = Router();

// ======================== SCHEMAS ========================

const paymentMethodEnumField = z.preprocess((val) => {
  if (typeof val === 'string') {
    const upper = val.trim().toUpperCase();
    if (upper === 'CASH') return PaymentMethod.CASH;
    if (upper === 'UPI') return PaymentMethod.UPI;
    if (upper === 'PHONEPE') return PaymentMethod.PHONEPE;
  }
  return val;
}, z.nativeEnum(PaymentMethod));

const confirmPaymentSchema = z.object({
  payment_method: paymentMethodEnumField.optional(),
  paymentMethod: paymentMethodEnumField.optional(),
  transaction_reference: z.string().nullish(),
  transactionReference: z.string().nullish(),
  amount: z.preprocess((val) => (val === '' || val === null || val === undefined ? undefined : Number(val)), z.number().positive().optional()),
  amountReceived: z.preprocess((val) => (val === '' || val === null || val === undefined ? undefined : Number(val)), z.number().positive().optional())
}).refine(data => data.payment_method || data.paymentMethod, {
  message: 'Payment method is required',
  path: ['payment_method']
}).transform((data) => ({
  payment_method: (data.payment_method || data.paymentMethod) as PaymentMethod,
  transaction_reference: (data.transaction_reference || data.transactionReference) || undefined,
  amount: data.amount ?? data.amountReceived
}));

const cancelOrderSchema = z.object({
  reason: z.string().optional().default('Cancelled by staff')
});

const mobileOrderQuerySchema = z.object({
  filter: z.enum(['pending_payment', 'ready_for_token', 'confirmed']).optional(),
  order_status: z.nativeEnum(OrderStatus).optional(),
  payment_status: z.nativeEnum(PaymentStatus).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional()
});

// All mobile order management endpoints require staff authentication
router.use(authenticate);
router.use(authorize([Role.ADMIN, Role.CASHIER]));

// GET /api/mobile-orders
router.get(
  '/',
  validate({ query: mobileOrderQuerySchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      // Auto-cancel any stale pending payment orders from previous days so pending payments refresh daily
      await orderService.autoCancelStalePendingPaymentOrders(req.user!.businessId);

      const filters = {
        ...req.query,
        source: OrderSource.QR
      };
      const result = await orderService.getOrders(req.user!.businessId, filters as any);
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

// GET /api/mobile-orders/:id
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

// POST /api/mobile-orders/:id/confirm-payment (Pay-at-Counter confirmation)
router.post(
  '/:id/confirm-payment',
  validate({ body: confirmPaymentSchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const order = await orderService.confirmPayment(
        req.params.id,
        req.user!.businessId,
        req.user!.userId,
        req.body
      );
      res.status(200).json({
        success: true,
        message: 'Payment confirmed and customer token issued',
        data: order
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/mobile-orders/:id/issue-token and /:id/print-kot (Prints KOT for pre-paid QR orders)
const handlePrintKOT = async (req: AuthRequest, res: Response, next: any) => {
  try {
    const order = await orderService.issueToken(
      req.params.id,
      req.user!.businessId,
      req.user!.userId
    );
    res.status(200).json({
      success: true,
      message: `KOT printed for Token #${order.tokenNumber || order.orderNumber}`,
      data: order
    });
  } catch (err) {
    next(err);
  }
};

router.post('/:id/issue-token', handlePrintKOT);
router.post('/:id/print-kot', handlePrintKOT);

// POST /api/mobile-orders/:id/cancel
router.post(
  '/:id/cancel',
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
        message: 'Mobile order cancelled successfully',
        data: order
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
