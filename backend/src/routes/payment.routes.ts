import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as paymentService from '../services/payment.service';
import { validate } from '../middleware/validate';

const router = Router();

const initiatePaymentSchema = z
  .object({
    order_id: z.string().uuid().optional(),
    orderId: z.string().uuid().optional(),
    redirect_url: z.string().url().optional(),
    redirectUrl: z.string().url().optional()
  })
  .refine((data) => Boolean(data.order_id || data.orderId), {
    message: 'Valid order ID is required'
  });

const handleInitiatePayment = async (req: Request, res: Response, next: any) => {
  try {
    const orderId = (req.body.order_id || req.body.orderId) as string;
    const redirectUrl = (req.body.redirect_url || req.body.redirectUrl) as string | undefined;
    const result = await paymentService.initiatePhonePePayment(orderId, redirectUrl);
    res.status(200).json({
      success: true,
      message: 'PhonePe payment initialized',
      data: result,
      paymentId: result.paymentId,
      merchantTransactionId: result.merchantTransactionId,
      paymentUrl: result.payUrl || result.redirectUrl,
      redirectUrl: result.redirectUrl,
      status: 'PENDING'
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/payments/phonepe/initiate and POST /api/payments/initiate
router.post('/phonepe/initiate', validate({ body: initiatePaymentSchema }), handleInitiatePayment);
router.post('/initiate', validate({ body: initiatePaymentSchema }), handleInitiatePayment);

// POST /api/payments/phonepe/webhook (No Auth Required - Gateway Callback)
router.post('/phonepe/webhook', async (req: Request, res: Response, next) => {
  try {
    const receivedChecksum = req.headers['x-verify'] as string | undefined;
    const result = await paymentService.handlePhonePeWebhook(req.body, receivedChecksum);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

const handleStatusCheck = async (req: Request, res: Response, next: any) => {
  try {
    const result = await paymentService.checkPaymentStatus(req.params.transactionId);
    res.status(200).json({
      success: true,
      data: result,
      payment: result
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/payments/phonepe/:transactionId/status and GET /api/payments/:transactionId/status
router.get('/phonepe/:transactionId/status', handleStatusCheck);
router.get('/:transactionId/status', handleStatusCheck);

export default router;
