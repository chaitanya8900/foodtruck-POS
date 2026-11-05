import { Router, Response } from 'express';
import { z } from 'zod';
import { DocumentType, PrintJobStatus, Role } from '@prisma/client';
import prisma from '../prisma';
import * as printService from '../services/print.service';
import * as orderService from '../services/order.service';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../types';

const router = Router();

// ======================== SCHEMAS ========================

const createPrintJobSchema = z.object({
  order_id: z.string().uuid('Valid order ID is required').optional(),
  orderId: z.string().uuid('Valid order ID is required').optional(),
  document_type: z.nativeEnum(DocumentType).optional(),
  documentType: z.nativeEnum(DocumentType).optional()
}).refine(data => Boolean(data.order_id || data.orderId), {
  message: 'Valid order ID is required'
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(PrintJobStatus),
  failure_reason: z.string().optional(),
  failureReason: z.string().optional()
});

const reprintSchema = z.object({
  document_type: z.enum(['CUSTOMER_RECEIPT', 'KOT', 'ALL']).optional(),
  documentType: z.enum(['CUSTOMER_RECEIPT', 'KOT', 'ALL']).optional()
});

// Authenticate all print job endpoints
router.use(authenticate);

// GET /api/print-jobs/status (Printer status and pending count)
router.get('/status', async (req: AuthRequest, res: Response, next) => {
  try {
    const pendingJobsCount = await prisma.printJob.count({
      where: {
        order: { business_id: req.user!.businessId },
        status: PrintJobStatus.PENDING
      }
    });

    res.status(200).json({
      success: true,
      data: {
        connected: true,
        printerName: 'Thermal Receipt & KOT Printer',
        pendingJobsCount
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/print-jobs (Create print jobs for an order)
router.post(
  '/',
  authorize([Role.ADMIN, Role.CASHIER]),
  validate({ body: createPrintJobSchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const order_id = (req.body.order_id || req.body.orderId) as string;
      const jobs = await printService.createPrintJobs(order_id);
      res.status(201).json({
        success: true,
        message: 'Print jobs created',
        data: jobs
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/print-jobs/pending (For print agent or cashier)
router.get('/pending', async (req: AuthRequest, res: Response, next) => {
  try {
    const jobs = await printService.getPendingPrintJobs(req.user!.businessId);

    // Format each pending job with receipt / KOT printable data
    const formatted = await Promise.all(
      jobs.map(async (job) => {
        let payload = null;
        if (job.document_type === DocumentType.CUSTOMER_RECEIPT) {
          payload = await printService.getReceiptData(job.order_id, job.is_reprint);
        } else if (job.document_type === DocumentType.KOT) {
          payload = await printService.getKOTData(job.order_id, job.is_reprint);
        }
        return {
          ...job,
          print_payload: payload
        };
      })
    );

    res.status(200).json({
      success: true,
      data: formatted
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/print-jobs/:id/status (Mark as PRINTING, PRINTED, or FAILED)
router.patch(
  '/:id/status',
  validate({ body: updateStatusSchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const { status } = req.body;
      const failure_reason = req.body.failure_reason || req.body.failureReason;
      const updated = await printService.updatePrintJobStatus(
        req.params.id,
        status,
        failure_reason
      );
      res.status(200).json({
        success: true,
        message: `Print job marked as ${status}`,
        data: updated
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/print-jobs/:id/retry
router.post('/:id/retry', async (req: AuthRequest, res: Response, next) => {
  try {
    const updated = await printService.retryPrintJob(req.params.id);
    res.status(200).json({
      success: true,
      message: 'Print job scheduled for retry',
      data: updated
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/print-jobs/orders/:id/reprint (Reprint slip with original token preserved)
router.post(
  '/orders/:id/reprint',
  authorize([Role.ADMIN, Role.CASHIER]),
  validate({ body: reprintSchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const docType = req.body.document_type || req.body.documentType;
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
