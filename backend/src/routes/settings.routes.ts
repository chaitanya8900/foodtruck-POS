import { Router, Response } from 'express';
import { z } from 'zod';
import { Prisma, Role } from '@prisma/client';
import prisma from '../prisma';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { NotFoundError } from '../middleware/errorHandler';
import { AuthRequest } from '../types';

const router = Router();

const updateBusinessSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  gstin: z.string().optional(),
  fssai_number: z.string().optional(),
  logo_url: z.string().url().optional().or(z.literal('')),
  timezone: z.string().optional(),
  currency: z.string().optional(),
  tax_rate: z.number().nonnegative().optional(),
  receipt_header: z.string().optional(),
  receipt_footer: z.string().optional(),
  is_dine_in_enabled: z.boolean().optional(),
  is_takeaway_enabled: z.boolean().optional(),
  operating_hours: z.any().optional(),
  token_prefix: z.string().max(10).optional(),
  token_reset_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Format must be HH:mm').optional()
});

const customSettingsSchema = z.record(z.string(), z.string());

router.use(authenticate);

// GET /api/settings (Get business profile and configuration)
router.get('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const business = await prisma.business.findUnique({
      where: { id: req.user!.businessId },
      include: {
        settings: true
      }
    });

    if (!business) {
      throw new NotFoundError('Business not found.');
    }

    const settingsMap: Record<string, string> = {};
    for (const s of business.settings) {
      settingsMap[s.setting_key] = s.setting_value;
    }

    res.status(200).json({
      success: true,
      data: {
        ...business,
        taxRate: Number(business.tax_rate),
        dineInEnabled: business.is_dine_in_enabled,
        takeawayEnabled: business.is_takeaway_enabled,
        receiptHeader: business.receipt_header,
        receiptFooter: business.receipt_footer,
        fssaiNumber: business.fssai_number,
        tokenPrefix: business.token_prefix,
        tokenResetTime: business.token_reset_time,
        operatingHours: business.operating_hours,
        customSettings: settingsMap
      }
    });
  } catch (err) {
    next(err);
  }
});

// PUT and PATCH /api/settings (Update business settings - Admin only)
const handleUpdateSettings = async (req: AuthRequest, res: Response, next: any) => {
  try {
    const b = req.body;
    const dataToUpdate: any = {};
    if (b.name !== undefined) dataToUpdate.name = b.name;
    if (b.address !== undefined) dataToUpdate.address = b.address;
    if (b.phone !== undefined) dataToUpdate.phone = b.phone;
    if (b.gstin !== undefined) dataToUpdate.gstin = b.gstin;
    if (b.fssai_number !== undefined || b.fssaiNumber !== undefined)
      dataToUpdate.fssai_number = b.fssai_number || b.fssaiNumber;
    if (b.tax_rate !== undefined || b.taxRate !== undefined)
      dataToUpdate.tax_rate = new Prisma.Decimal(Number(b.tax_rate ?? b.taxRate ?? 5));
    if (b.receipt_header !== undefined || b.receiptHeader !== undefined)
      dataToUpdate.receipt_header = b.receipt_header || b.receiptHeader;
    if (b.receipt_footer !== undefined || b.receiptFooter !== undefined)
      dataToUpdate.receipt_footer = b.receipt_footer || b.receiptFooter;
    if (b.is_dine_in_enabled !== undefined || b.dineInEnabled !== undefined)
      dataToUpdate.is_dine_in_enabled = b.is_dine_in_enabled ?? b.dineInEnabled;
    if (b.is_takeaway_enabled !== undefined || b.takeawayEnabled !== undefined)
      dataToUpdate.is_takeaway_enabled = b.is_takeaway_enabled ?? b.takeawayEnabled;
    if (b.token_prefix !== undefined || b.tokenPrefix !== undefined)
      dataToUpdate.token_prefix = b.token_prefix || b.tokenPrefix;
    if (b.token_reset_time !== undefined || b.tokenResetTime !== undefined)
      dataToUpdate.token_reset_time = b.token_reset_time || b.tokenResetTime;
    if (b.operating_hours !== undefined || b.operatingHours !== undefined)
      dataToUpdate.operating_hours = b.operating_hours || b.operatingHours;

    const updated = await prisma.business.update({
      where: { id: req.user!.businessId },
      data: {
        ...dataToUpdate,
        updated_at: new Date()
      }
    });

    // Audit Log
    await prisma.auditLog.create({
      data: {
        business_id: req.user!.businessId,
        user_id: req.user!.userId,
        action: 'BUSINESS_SETTINGS_UPDATED',
        entity_type: 'BUSINESS',
        entity_id: req.user!.businessId,
        new_values: req.body
      }
    });

    res.status(200).json({
      success: true,
      message: 'Business settings updated successfully',
      data: {
        ...updated,
        taxRate: Number(updated.tax_rate),
        dineInEnabled: updated.is_dine_in_enabled,
        takeawayEnabled: updated.is_takeaway_enabled,
        receiptHeader: updated.receipt_header,
        receiptFooter: updated.receipt_footer,
        fssaiNumber: updated.fssai_number,
        tokenPrefix: updated.token_prefix,
        tokenResetTime: updated.token_reset_time,
        operatingHours: updated.operating_hours
      }
    });
  } catch (err) {
    next(err);
  }
};

router.put('/', authorize([Role.ADMIN]), handleUpdateSettings);
router.patch('/', authorize([Role.ADMIN]), handleUpdateSettings);

// GET /api/settings/custom (Get custom key-value settings)
router.get('/custom', async (req: AuthRequest, res: Response, next) => {
  try {
    const settings = await prisma.businessSetting.findMany({
      where: { business_id: req.user!.businessId }
    });

    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      settingsMap[s.setting_key] = s.setting_value;
    }

    res.status(200).json({
      success: true,
      data: settingsMap
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/settings/custom (Batch update custom key-value settings - Admin only)
router.put(
  '/custom',
  authorize([Role.ADMIN]),
  validate({ body: customSettingsSchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const settings = req.body as Record<string, string>;

      const results = await prisma.$transaction(
        Object.entries(settings).map(([key, value]) =>
          prisma.businessSetting.upsert({
            where: {
              business_id_setting_key: {
                business_id: req.user!.businessId,
                setting_key: key
              }
            },
            update: {
              setting_value: value,
              updated_at: new Date()
            },
            create: {
              business_id: req.user!.businessId,
              setting_key: key,
              setting_value: value
            }
          })
        )
      );

      res.status(200).json({
        success: true,
        message: 'Custom settings updated successfully',
        data: results
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
