import { Router, Response } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import * as tableService from '../services/table.service';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../types';

const router = Router();

// ======================== SCHEMAS ========================

const createTableSchema = z.object({
  table_name: z.string().min(1).max(100).optional(),
  tableName: z.string().min(1).max(100).optional(),
  tableNumber: z.string().optional(),
  table_number: z.string().optional(),
  is_active: z.boolean().optional(),
  isActive: z.boolean().optional()
}).refine(data => data.table_name || data.tableName, {
  message: 'Table name is required',
  path: ['table_name']
}).transform((data) => ({
  table_name: (data.table_name || data.tableName)!,
  is_active: data.is_active ?? data.isActive ?? true
}));

const updateTableSchema = z.object({
  table_name: z.string().min(1).max(100).optional(),
  tableName: z.string().min(1).max(100).optional(),
  is_active: z.boolean().optional(),
  isActive: z.boolean().optional()
}).transform((data) => ({
  table_name: data.table_name ?? data.tableName,
  is_active: data.is_active ?? data.isActive
}));

function formatTable(table: any) {
  if (!table) return table;
  const numMatch = (table.table_name || '').match(/\d+/);
  return {
    ...table,
    tableName: table.table_name,
    qrToken: table.qr_token,
    isActive: table.is_active,
    businessId: table.business_id,
    tableNumber: numMatch ? numMatch[0] : '1'
  };
}

router.use(authenticate);

// GET /api/tables (List all tables)
router.get('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const tables = await tableService.getTables(req.user!.businessId, false);
    res.status(200).json({
      success: true,
      data: tables.map(formatTable)
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/tables/:id (Get single table)
router.get('/:id', async (req: AuthRequest, res: Response, next) => {
  try {
    const table = await tableService.getTableById(req.params.id, req.user!.businessId);
    res.status(200).json({
      success: true,
      data: formatTable(table)
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/tables (Create new table with unique QR token)
router.post(
  '/',
  authorize([Role.ADMIN]),
  validate({ body: createTableSchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const table = await tableService.createTable(req.user!.businessId, req.body);
      res.status(201).json({
        success: true,
        message: 'Table created with unique QR token',
        data: formatTable(table)
      });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/tables/:id (Update table)
router.put(
  '/:id',
  authorize([Role.ADMIN]),
  validate({ body: updateTableSchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const table = await tableService.updateTable(
        req.params.id,
        req.user!.businessId,
        req.body
      );
      res.status(200).json({
        success: true,
        message: 'Table updated successfully',
        data: formatTable(table)
      });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/tables/:id (Delete table)
router.delete(
  '/:id',
  authorize([Role.ADMIN]),
  async (req: AuthRequest, res: Response, next) => {
    try {
      await tableService.deleteTable(req.params.id, req.user!.businessId);
      res.status(200).json({
        success: true,
        message: 'Table deleted successfully'
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/tables/:id/regenerate-qr (Regenerate QR token)
router.post(
  '/:id/regenerate-qr',
  authorize([Role.ADMIN]),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const table = await tableService.regenerateQrToken(req.params.id, req.user!.businessId);
      res.status(200).json({
        success: true,
        message: 'QR token regenerated successfully',
        data: formatTable(table)
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/tables/:id/qrcode (Generate QR Code Data URL for print / display)
router.get('/:id/qrcode', async (req: AuthRequest, res: Response, next) => {
  try {
    const frontendUrl = (req.query.frontend_url as string) || process.env.FRONTEND_URL;
    const result = await tableService.getTableQRCodeDataUrl(
      req.params.id,
      req.user!.businessId,
      frontendUrl
    );
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
});

export default router;
