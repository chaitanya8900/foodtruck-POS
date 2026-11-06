import { Router, Request, Response } from 'express';
import os from 'os';
import { z } from 'zod';
import { OrderType, PaymentMethod } from '@prisma/client';
import * as menuService from '../services/menu.service';
import * as tableService from '../services/table.service';
import * as orderService from '../services/order.service';
import { evaluateOrderingStatus, normalizeOperatingHours } from '../utils/operatingHours';
import { validate } from '../middleware/validate';
import prisma from '../prisma';

const router = Router();

// GET /api/public/network-info (Helper for local Wi-Fi mobile testing)
router.get('/network-info', (req: Request, res: Response) => {
  const interfaces = os.networkInterfaces();
  let localIp = '127.0.0.1';
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIp = iface.address;
        break;
      }
    }
  }
  res.status(200).json({
    success: true,
    data: {
      localIp,
      port: 3000
    }
  });
});

// ======================== SCHEMAS ========================

const publicCartItemSchema = z.object({
  menu_item_id: z.string().uuid('Valid menu item ID is required'),
  quantity: z.number().int().positive('Quantity must be greater than zero'),
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

const publicOrderSchema = z.object({
  qr_token: z.string().min(1, 'QR token is required'),
  order_type: z.nativeEnum(OrderType),
  payment_method: z.nativeEnum(PaymentMethod).optional(),
  special_instructions: z.string().optional(),
  items: z.array(publicCartItemSchema).min(1, 'Cart cannot be empty')
});

function formatItem(item: any) {
  if (!item) return item;
  return {
    ...item,
    categoryId: item.category_id,
    isAvailable: item.is_available,
    imageUrl: item.image_url,
    preparationTimeMinutes: item.preparation_time,
    taxRate: item.tax_rate !== undefined ? Number(item.tax_rate) : undefined,
    price: Number(item.price),
    modifierGroups: item.modifier_groups?.map((group: any) => ({
      ...group,
      selectionType: group.selection_type,
      minSelections: group.min_selections,
      maxSelections: group.max_selections,
      isRequired: group.is_required,
      options: group.options?.map((opt: any) => ({
        ...opt,
        additionalPrice: Number(opt.additional_price || 0),
        isAvailable: opt.is_available,
      })),
    })),
  };
}

function formatCategory(cat: any) {
  if (!cat) return cat;
  return {
    ...cat,
    isActive: cat.is_active,
    imageUrl: cat.image_url,
    displayOrder: cat.display_order,
    items: cat.items ? cat.items.map(formatItem) : [],
  };
}

const publicMenuCache = new Map<string, { timestamp: number; data: any }>();
const PUBLIC_MENU_TTL = 30 * 1000;
let cachedDefaultBusinessId: string | null = null;
const tableInfoCache = new Map<string, { timestamp: number; data: any }>();

export function invalidatePublicCache(businessId?: string) {
  if (businessId) {
    publicMenuCache.delete(businessId);
  } else {
    publicMenuCache.clear();
  }
  tableInfoCache.clear();
}

// GET /api/public/menu
router.get('/menu', async (req: Request, res: Response, next) => {
  try {
    let businessId = (req.query.business_id || req.query.businessId) as string | undefined;
    const qrToken = (req.query.qr_token || req.query.qrToken) as string | undefined;

    if (qrToken && qrToken !== 'main' && qrToken !== 'qr_main') {
      try {
        const table = await tableService.getTableByQrToken(qrToken);
        businessId = table.business_id;
      } catch {
        // Fallback to active business
      }
    }

    if (!businessId) {
      if (cachedDefaultBusinessId) {
        businessId = cachedDefaultBusinessId;
      } else {
        const defaultBiz = await prisma.business.findFirst({
          where: { is_active: true }
        });
        if (defaultBiz) {
          cachedDefaultBusinessId = defaultBiz.id;
          businessId = defaultBiz.id;
        }
      }
    }

    if (!businessId) {
      res.status(200).json({ success: true, data: { categories: [], business: null } });
      return;
    }

    const cached = publicMenuCache.get(businessId);
    if (cached && Date.now() - cached.timestamp < PUBLIC_MENU_TTL) {
      res.status(200).json({
        success: true,
        data: cached.data
      });
      return;
    }

    const menu = await menuService.getFullMenu(businessId, true);
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        tax_rate: true,
        is_dine_in_enabled: true,
        is_takeaway_enabled: true,
        operating_hours: true,
        timezone: true
      }
    });

    const orderingStatus = business ? evaluateOrderingStatus(business.operating_hours, business.timezone) : null;

    const formattedData = {
      categories: menu.map(formatCategory),
      business: business
        ? {
            id: business.id,
            name: business.name,
            address: business.address,
            phone: business.phone,
            taxRate: Number(business.tax_rate),
            dineInEnabled: business.is_dine_in_enabled,
            takeawayEnabled: business.is_takeaway_enabled,
            operatingHours: business.operating_hours,
            orderingStatus
          }
        : null
    };

    publicMenuCache.set(businessId, { timestamp: Date.now(), data: formattedData });

    res.status(200).json({
      success: true,
      data: formattedData
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/public/table/:qrToken
router.get('/table/:qrToken', async (req: Request, res: Response, next) => {
  try {
    const { qrToken } = req.params;

    const cached = tableInfoCache.get(qrToken);
    if (cached && Date.now() - cached.timestamp < 60000) {
      res.status(200).json({
        success: true,
        data: cached.data
      });
      return;
    }

    // Support Unified / Main QR without tables
    if (qrToken === 'main' || qrToken === 'qr_main') {
      const defaultBiz = await prisma.business.findFirst({
        where: { is_active: true }
      });
      if (!defaultBiz) {
        res.status(404).json({ success: false, message: 'Business not found' });
        return;
      }

      const orderingStatus = evaluateOrderingStatus(defaultBiz.operating_hours, defaultBiz.timezone);

      const mainQrData = {
        id: 'main',
        table_name: '',
        table_number: '',
        qr_token: 'main',
        is_main_qr: true,
        business: {
          id: defaultBiz.id,
          name: defaultBiz.name,
          currency: defaultBiz.currency,
          tax_rate: Number(defaultBiz.tax_rate),
          is_dine_in_enabled: defaultBiz.is_dine_in_enabled,
          is_takeaway_enabled: defaultBiz.is_takeaway_enabled,
          operatingHours: defaultBiz.operating_hours,
          orderingStatus
        }
      };

      tableInfoCache.set(qrToken, { timestamp: Date.now(), data: mainQrData });

      res.status(200).json({
        success: true,
        data: mainQrData
      });
      return;
    }

    const table = await tableService.getTableByQrToken(qrToken);
    const tableNumberMatch = table.table_name.match(/\d+/);
    const orderingStatus = evaluateOrderingStatus((table.business as any).operating_hours, (table.business as any).timezone);

    const tableData = {
      id: table.id,
      table_name: table.table_name,
      table_number: tableNumberMatch ? tableNumberMatch[0] : '1',
      qr_token: table.qr_token,
      is_main_qr: false,
      business: {
        id: table.business.id,
        name: table.business.name,
        currency: table.business.currency,
        tax_rate: Number(table.business.tax_rate),
        is_dine_in_enabled: table.business.is_dine_in_enabled,
        is_takeaway_enabled: table.business.is_takeaway_enabled,
        operatingHours: (table.business as any).operating_hours,
        orderingStatus
      }
    };

    tableInfoCache.set(qrToken, { timestamp: Date.now(), data: tableData });

    res.status(200).json({
      success: true,
      data: tableData
    });
  } catch (err) {
    next(err);
  }
});

import * as paymentService from '../services/payment.service';

// POST /api/public/orders
router.post(
  '/orders',
  async (req: Request, res: Response, next) => {
    try {
      const b = req.body;
      const qrToken = b.qr_token || b.qrToken;
      if (!qrToken) {
        res.status(400).json({ success: false, message: 'QR token is required' });
        return;
      }

      // Check business operating hours and mobile ordering schedule
      let bizForCheck = null;
      if (qrToken === 'main' || qrToken === 'qr_main') {
        bizForCheck = await prisma.business.findFirst({ where: { is_active: true } });
      } else {
        const table = await prisma.table.findUnique({
          where: { qr_token: qrToken },
          include: { business: true }
        });
        bizForCheck = table?.business || (await prisma.business.findFirst({ where: { is_active: true } }));
      }

      if (bizForCheck) {
        const status = evaluateOrderingStatus(bizForCheck.operating_hours, bizForCheck.timezone);
        if (!status.isOpen) {
          res.status(400).json({
            success: false,
            message: status.message || 'Mobile ordering is currently closed.',
            orderingStatus: status
          });
          return;
        }
      }

      const rawOrderType = (b.order_type || b.orderType || 'dine_in').toString().toUpperCase();
      const orderType = rawOrderType.includes('TAKEAWAY') ? OrderType.TAKEAWAY : OrderType.DINE_IN;

      const isOnlinePayment = b.paymentOption === 'online_upi' || (b.payment_method || b.paymentMethod) === 'UPI';
      const paymentMethod = isOnlinePayment ? PaymentMethod.UPI : PaymentMethod.CASH;

      const rawItems = Array.isArray(b.items) ? b.items : [];
      if (rawItems.length === 0) {
        res.status(400).json({ success: false, message: 'Cart items cannot be empty' });
        return;
      }

      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
          group_name: (m.group_name || m.groupName || '').toString().slice(0, 100),
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

      const order = await orderService.createQROrder({
        qr_token: typeof qrToken === 'string' ? qrToken.slice(0, 50) : '',
        order_type: orderType,
        payment_method: paymentMethod,
        special_instructions: typeof (b.special_instructions || b.specialInstructions) === 'string' ? (b.special_instructions || b.specialInstructions).slice(0, 500) : undefined,
        items
      });

      let paymentUrl: string | undefined = undefined;
      let paymentTransactionId: string | undefined = undefined;

      if (isOnlinePayment) {
        try {
          const origin = req.headers.origin || (req.headers.host ? `http://${req.headers.host}` : undefined);
          const paymentData = await paymentService.initiatePhonePePayment(order.id, origin);
          paymentUrl = paymentData.redirectUrl;
          paymentTransactionId = paymentData.merchantTransactionId;
        } catch {
          // Fallback if payment initiation throws
        }
      }

      res.status(201).json({
        success: true,
        message: 'Order placed successfully. Complete payment to confirm your order.',
        order,
        paymentUrl,
        paymentTransactionId,
        data: {
          order,
          paymentUrl,
          paymentTransactionId
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/public/orders/:id/status
router.get('/orders/:id/status', async (req: Request, res: Response, next) => {
  try {
    const order = await orderService.getPublicOrderStatus(req.params.id);
    res.status(200).json({
      success: true,
      data: order
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/public/orders/:id/switch-to-counter (If online payment fails, switch to Pay at Counter)
router.post('/orders/:id/switch-to-counter', async (req: Request, res: Response, next) => {
  try {
    const order = await orderService.switchToCounterPayment(req.params.id);
    res.status(200).json({
      success: true,
      message: 'Order updated to Pay at Counter',
      data: order
    });
  } catch (err) {
    next(err);
  }
});

export default router;
