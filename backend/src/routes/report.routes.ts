import { Router, Response } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import * as reportService from '../services/report.service';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../types';

const router = Router();

const reportQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.coerce.number().int().positive().optional()
});

router.use(authenticate);
router.use(authorize([Role.ADMIN, Role.CASHIER]));

// GET /api/reports/daily-sales
router.get(
  '/daily-sales',
  validate({ query: reportQuerySchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const data = await reportService.getDailySales(req.user!.businessId, req.query as any);
      res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/reports/payment-summary
router.get(
  '/payment-summary',
  validate({ query: reportQuerySchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const data = await reportService.getPaymentSummary(req.user!.businessId, req.query as any);
      res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/reports/order-summary
router.get(
  '/order-summary',
  validate({ query: reportQuerySchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const data = await reportService.getOrderSummary(req.user!.businessId, req.query as any);
      res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/reports/top-items
router.get(
  '/top-items',
  validate({ query: reportQuerySchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const limit = Number(req.query.limit) || 10;
      const data = await reportService.getTopItems(req.user!.businessId, req.query as any, limit);
      res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
