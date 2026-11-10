import path from 'path';
import fs from 'fs';
import { Router, Response } from 'express';
import { z } from 'zod';
import { Role, ModifierSelectionType } from '@prisma/client';
import * as menuService from '../services/menu.service';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../types';

const router = Router();

// ======================== VALIDATION SCHEMAS ========================

const categoryInputSchema = z.object({
  name: z.string().min(1, 'Category name is required').max(255),
  description: z.string().optional().nullable(),
  image_url: z.string().optional().nullable().or(z.literal('')),
  imageUrl: z.string().optional().nullable().or(z.literal('')),
  display_order: z.number().int().optional(),
  displayOrder: z.number().int().optional(),
  is_active: z.boolean().optional(),
  isActive: z.boolean().optional()
});

const createCategorySchema = categoryInputSchema.transform((data) => ({
  name: data.name,
  description: data.description || undefined,
  image_url: data.image_url ?? data.imageUrl ?? undefined,
  display_order: data.display_order ?? data.displayOrder ?? 0,
  is_active: data.is_active ?? data.isActive ?? true
}));

const updateCategorySchema = categoryInputSchema.partial().transform((data) => ({
  name: data.name,
  description: data.description,
  image_url: data.image_url !== undefined ? (data.image_url || null) : (data.imageUrl !== undefined ? (data.imageUrl || null) : undefined),
  display_order: data.display_order ?? data.displayOrder,
  is_active: data.is_active ?? data.isActive
}));

const itemModifierOptionInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Option name is required').max(255),
  additional_price: z.number().nonnegative().optional(),
  additionalPrice: z.number().nonnegative().optional(),
  price: z.number().nonnegative().optional(),
  is_available: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
  display_order: z.number().int().optional(),
  displayOrder: z.number().int().optional()
});

const itemModifierGroupInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Group name is required').max(255),
  selection_type: z.nativeEnum(ModifierSelectionType).optional(),
  selectionType: z.nativeEnum(ModifierSelectionType).optional(),
  min_selections: z.number().int().nonnegative().optional(),
  minSelections: z.number().int().nonnegative().optional(),
  max_selections: z.number().int().positive().optional(),
  maxSelections: z.number().int().positive().optional(),
  is_required: z.boolean().optional(),
  isRequired: z.boolean().optional(),
  display_order: z.number().int().optional(),
  displayOrder: z.number().int().optional(),
  options: z.array(itemModifierOptionInputSchema).optional()
});

function parseModifierGroupsInput(groups?: any[]) {
  if (!groups || !Array.isArray(groups)) return undefined;
  return groups
    .filter((g) => g && typeof g.name === 'string' && g.name.trim().length > 0)
    .map((g, idx) => ({
      id: g.id,
      name: g.name.trim(),
      selection_type: g.selection_type || g.selectionType || ModifierSelectionType.SINGLE,
      min_selections: g.min_selections ?? g.minSelections ?? ((g.is_required ?? g.isRequired) ? 1 : 0),
      max_selections: g.max_selections ?? g.maxSelections ?? 1,
      is_required: g.is_required ?? g.isRequired ?? false,
      display_order: g.display_order ?? g.displayOrder ?? idx,
      options: (g.options || [])
        .filter((opt: any) => opt && typeof opt.name === 'string' && opt.name.trim().length > 0)
        .map((opt: any, optIdx: number) => ({
          id: opt.id,
          name: opt.name.trim(),
          additional_price: opt.additional_price ?? opt.additionalPrice ?? opt.price ?? 0,
          is_available: opt.is_available ?? opt.isAvailable ?? true,
          display_order: opt.display_order ?? opt.displayOrder ?? optIdx
        }))
    }));
}

const itemInputSchema = z.object({
  category_id: z.string().uuid('Valid category ID required').optional(),
  categoryId: z.string().uuid('Valid category ID required').optional(),
  name: z.string().min(1, 'Item name is required').max(255),
  description: z.string().optional().nullable(),
  price: z.number().positive('Price must be greater than zero'),
  image_url: z.string().optional().nullable().or(z.literal('')),
  imageUrl: z.string().optional().nullable().or(z.literal('')),
  is_available: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
  preparation_time: z.number().int().nonnegative().optional(),
  preparationTimeMinutes: z.number().int().nonnegative().optional(),
  tax_rate: z.number().nonnegative().optional(),
  taxRate: z.number().nonnegative().optional(),
  display_order: z.number().int().optional(),
  displayOrder: z.number().int().optional(),
  modifier_groups: z.array(itemModifierGroupInputSchema).optional(),
  modifierGroups: z.array(itemModifierGroupInputSchema).optional()
});

const createItemSchema = itemInputSchema.refine(data => data.category_id || data.categoryId, {
  message: 'Valid category ID required',
  path: ['category_id']
}).transform((data) => ({
  category_id: (data.category_id || data.categoryId)!,
  name: data.name,
  description: data.description || undefined,
  price: data.price,
  image_url: data.image_url ?? data.imageUrl ?? undefined,
  is_available: data.is_available ?? data.isAvailable ?? true,
  preparation_time: data.preparation_time ?? data.preparationTimeMinutes ?? 10,
  tax_rate: data.tax_rate ?? data.taxRate,
  display_order: data.display_order ?? data.displayOrder ?? 0,
  modifier_groups: parseModifierGroupsInput(data.modifierGroups !== undefined ? data.modifierGroups : data.modifier_groups)
}));

const updateItemSchema = itemInputSchema.partial().transform((data) => ({
  category_id: data.category_id ?? data.categoryId,
  name: data.name,
  description: data.description,
  price: data.price,
  image_url: data.image_url !== undefined ? (data.image_url || null) : (data.imageUrl !== undefined ? (data.imageUrl || null) : undefined),
  is_available: data.is_available ?? data.isAvailable,
  preparation_time: data.preparation_time ?? data.preparationTimeMinutes,
  tax_rate: data.tax_rate ?? data.taxRate,
  display_order: data.display_order ?? data.displayOrder,
  modifier_groups: (data.modifierGroups !== undefined || data.modifier_groups !== undefined)
    ? parseModifierGroupsInput(data.modifierGroups !== undefined ? data.modifierGroups : data.modifier_groups)
    : undefined
}));

const toggleAvailabilitySchema = z.object({
  is_available: z.boolean().optional(),
  isAvailable: z.boolean().optional()
}).refine(data => data.is_available !== undefined || data.isAvailable !== undefined, {
  message: 'is_available is required',
  path: ['is_available']
}).transform((data) => ({
  is_available: data.is_available ?? data.isAvailable!
}));

const modifierOptionInputSchema = z.object({
  name: z.string().min(1, 'Option name is required').max(255),
  additional_price: z.number().nonnegative().optional(),
  additionalPrice: z.number().nonnegative().optional(),
  price: z.number().nonnegative().optional(),
  is_available: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
  display_order: z.number().int().optional(),
  displayOrder: z.number().int().optional()
});

const modifierOptionSchema = modifierOptionInputSchema.transform((data) => ({
  name: data.name,
  additional_price: data.additional_price ?? data.additionalPrice ?? data.price ?? 0,
  is_available: data.is_available ?? data.isAvailable ?? true,
  display_order: data.display_order ?? data.displayOrder ?? 0
}));

const modifierGroupInputSchema = z.object({
  name: z.string().min(1, 'Group name is required').max(255),
  selection_type: z.nativeEnum(ModifierSelectionType).optional(),
  selectionType: z.nativeEnum(ModifierSelectionType).optional(),
  min_selections: z.number().int().nonnegative().optional(),
  minSelections: z.number().int().nonnegative().optional(),
  max_selections: z.number().int().positive().optional(),
  maxSelections: z.number().int().positive().optional(),
  is_required: z.boolean().optional(),
  isRequired: z.boolean().optional(),
  display_order: z.number().int().optional(),
  displayOrder: z.number().int().optional(),
  options: z.array(modifierOptionInputSchema).optional()
});

const modifierGroupSchema = modifierGroupInputSchema.transform((data) => ({
  name: data.name,
  selection_type: data.selection_type ?? data.selectionType ?? ModifierSelectionType.SINGLE,
  min_selections: data.min_selections ?? data.minSelections ?? 0,
  max_selections: data.max_selections ?? data.maxSelections ?? 1,
  is_required: data.is_required ?? data.isRequired ?? false,
  display_order: data.display_order ?? data.displayOrder ?? 0,
  options: data.options?.map((opt) => ({
    name: opt.name,
    additional_price: opt.additional_price ?? opt.additionalPrice ?? opt.price ?? 0,
    is_available: opt.is_available ?? opt.isAvailable ?? true,
    display_order: opt.display_order ?? opt.displayOrder ?? 0
  }))
}));

const updateModifierGroupSchema = modifierGroupInputSchema.partial().transform((data) => ({
  name: data.name,
  selection_type: data.selection_type ?? data.selectionType,
  min_selections: data.min_selections ?? data.minSelections,
  max_selections: data.max_selections ?? data.maxSelections,
  is_required: data.is_required ?? data.isRequired,
  display_order: data.display_order ?? data.displayOrder,
  options: data.options?.map((opt) => ({
    name: opt.name,
    additional_price: opt.additional_price ?? opt.additionalPrice ?? opt.price,
    is_available: opt.is_available ?? opt.isAvailable,
    display_order: opt.display_order ?? opt.displayOrder
  }))
}));

const updateModifierOptionSchema = modifierOptionInputSchema.partial().transform((data) => ({
  name: data.name,
  additional_price: data.additional_price ?? data.additionalPrice ?? data.price,
  is_available: data.is_available ?? data.isAvailable,
  display_order: data.display_order ?? data.displayOrder
}));

function formatModifierOption(opt: any) {
  if (!opt) return opt;
  const price = Number(opt.additional_price ?? opt.additionalPrice ?? opt.price ?? 0);
  return {
    id: opt.id,
    modifierGroupId: opt.group_id || opt.modifierGroupId,
    groupId: opt.group_id || opt.modifierGroupId,
    group_id: opt.group_id || opt.modifierGroupId,
    name: opt.name,
    additional_price: price,
    additionalPrice: price,
    price: price,
    is_available: opt.is_available ?? opt.isAvailable ?? true,
    isAvailable: opt.is_available ?? opt.isAvailable ?? true,
    display_order: opt.display_order ?? opt.displayOrder ?? 0,
    displayOrder: opt.display_order ?? opt.displayOrder ?? 0,
  };
}

function formatModifierGroup(group: any) {
  if (!group) return group;
  return {
    id: group.id,
    businessId: group.business_id || group.businessId,
    business_id: group.business_id || group.businessId,
    menuItemId: group.menu_item_id || group.menuItemId,
    menu_item_id: group.menu_item_id || group.menuItemId,
    name: group.name,
    selectionType: group.selection_type || group.selectionType || 'SINGLE',
    selection_type: group.selection_type || group.selectionType || 'SINGLE',
    minSelections: group.min_selections ?? group.minSelections ?? 0,
    min_selections: group.min_selections ?? group.minSelections ?? 0,
    maxSelections: group.max_selections ?? group.maxSelections ?? 1,
    max_selections: group.max_selections ?? group.maxSelections ?? 1,
    isRequired: group.is_required ?? group.isRequired ?? false,
    is_required: group.is_required ?? group.isRequired ?? false,
    displayOrder: group.display_order ?? group.displayOrder ?? 0,
    display_order: group.display_order ?? group.displayOrder ?? 0,
    options: (group.options || []).map(formatModifierOption),
  };
}

function formatItem(item: any) {
  if (!item) return item;
  const formattedGroups = (item.modifier_groups || item.modifierGroups || []).map(formatModifierGroup);
  return {
    ...item,
    categoryId: item.category_id || item.categoryId,
    category_id: item.category_id || item.categoryId,
    isAvailable: item.is_available ?? item.isAvailable ?? true,
    is_available: item.is_available ?? item.isAvailable ?? true,
    imageUrl: item.image_url ?? item.imageUrl,
    image_url: item.image_url ?? item.imageUrl,
    preparationTimeMinutes: item.preparation_time ?? item.preparationTimeMinutes ?? 10,
    preparation_time: item.preparation_time ?? item.preparationTimeMinutes ?? 10,
    taxRate: item.tax_rate !== undefined ? Number(item.tax_rate) : undefined,
    tax_rate: item.tax_rate !== undefined ? Number(item.tax_rate) : undefined,
    price: Number(item.price),
    modifierGroups: formattedGroups,
    modifier_groups: formattedGroups,
  };
}

function formatCategory(cat: any) {
  if (!cat) return cat;
  return {
    ...cat,
    isActive: cat.is_active,
    imageUrl: cat.image_url,
    displayOrder: cat.display_order,
    items: cat.items ? cat.items.map(formatItem) : undefined,
  };
}

// Require authentication for all menu management routes
router.use(authenticate);

// ======================== FULL MENU ========================

// GET /api/menu
router.get('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const menu = await menuService.getFullMenu(req.user!.businessId, false);
    res.status(200).json({ success: true, data: menu.map(formatCategory) });
  } catch (err) {
    next(err);
  }
});

// ======================== CATEGORIES ========================

// GET /api/menu/categories
router.get('/categories', async (req: AuthRequest, res: Response, next) => {
  try {
    const categories = await menuService.getCategories(req.user!.businessId, false);
    res.status(200).json({ success: true, data: categories.map(formatCategory) });
  } catch (err) {
    next(err);
  }
});

// GET /api/menu/categories/:id
router.get('/categories/:id', async (req: AuthRequest, res: Response, next) => {
  try {
    const category = await menuService.getCategoryById(req.params.id, req.user!.businessId);
    res.status(200).json({ success: true, data: formatCategory(category) });
  } catch (err) {
    next(err);
  }
});

// POST /api/menu/categories
router.post(
  '/categories',
  authorize([Role.ADMIN]),
  validate({ body: createCategorySchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const category = await menuService.createCategory(req.user!.businessId, req.body);
      res.status(201).json({ success: true, message: 'Category created', data: formatCategory(category) });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/menu/categories/:id
router.put(
  '/categories/:id',
  authorize([Role.ADMIN]),
  validate({ body: updateCategorySchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const category = await menuService.updateCategory(
        req.params.id,
        req.user!.businessId,
        req.body
      );
      res.status(200).json({ success: true, message: 'Category updated', data: formatCategory(category) });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/menu/categories/:id
router.delete(
  '/categories/:id',
  authorize([Role.ADMIN]),
  async (req: AuthRequest, res: Response, next) => {
    try {
      await menuService.deleteCategory(req.params.id, req.user!.businessId);
      res.status(200).json({ success: true, message: 'Category deleted successfully' });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/menu/upload-image
router.post(
  '/upload-image',
  authorize([Role.ADMIN]),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const { image } = req.body;
      if (!image || typeof image !== 'string') {
        res.status(400).json({ success: false, message: 'Image base64 data is required' });
        return;
      }

      // Check if image is a data URI
      const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      let buffer: Buffer;

      if (matches && matches.length === 3) {
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        buffer = Buffer.from(image, 'base64');
      }

      // Enforce max upload size: 5MB
      const MAX_SIZE = 5 * 1024 * 1024;
      if (buffer.length > MAX_SIZE) {
        res.status(400).json({ success: false, message: 'Image size exceeds maximum limit of 5MB' });
        return;
      }

      // Detect safe image format by magic numbers (PNG, JPEG, WebP)
      let ext: string | null = null;
      if (
        buffer.length >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      ) {
        ext = 'png';
      } else if (
        buffer.length >= 3 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff
      ) {
        ext = 'jpg';
      } else if (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      ) {
        ext = 'webp';
      }

      if (!ext) {
        res.status(400).json({
          success: false,
          message: 'Invalid image format. Only JPG, PNG, and WebP image files are allowed.'
        });
        return;
      }

      const uploadsDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const safeName = `item_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const filePath = path.join(uploadsDir, safeName);
      await fs.promises.writeFile(filePath, buffer);

      const fileUrl = `/uploads/${safeName}`;
      res.status(200).json({ success: true, url: fileUrl });
    } catch (err) {
      next(err);
    }
  }
);

// ======================== MENU ITEMS ========================

// GET /api/menu/items
router.get('/items', async (req: AuthRequest, res: Response, next) => {
  try {
    const categoryId = req.query.category_id as string | undefined;
    const items = await menuService.getItems(req.user!.businessId, categoryId, false);
    res.status(200).json({ success: true, data: items.map(formatItem) });
  } catch (err) {
    next(err);
  }
});

// GET /api/menu/items/:id
router.get('/items/:id', async (req: AuthRequest, res: Response, next) => {
  try {
    const item = await menuService.getItemById(req.params.id, req.user!.businessId);
    res.status(200).json({ success: true, data: formatItem(item) });
  } catch (err) {
    next(err);
  }
});

// POST /api/menu/items
router.post(
  '/items',
  authorize([Role.ADMIN]),
  validate({ body: createItemSchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const item = await menuService.createItem(req.user!.businessId, req.body);
      res.status(201).json({ success: true, message: 'Menu item created', data: formatItem(item) });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/menu/items/:id
router.put(
  '/items/:id',
  authorize([Role.ADMIN]),
  validate({ body: updateItemSchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const item = await menuService.updateItem(
        req.params.id,
        req.user!.businessId,
        req.body
      );
      res.status(200).json({ success: true, message: 'Menu item updated', data: formatItem(item) });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/menu/items/:id
router.delete(
  '/items/:id',
  authorize([Role.ADMIN]),
  async (req: AuthRequest, res: Response, next) => {
    try {
      await menuService.deleteItem(req.params.id, req.user!.businessId);
      res.status(200).json({ success: true, message: 'Menu item deleted' });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/menu/items/:id/availability
router.patch(
  '/items/:id/availability',
  authorize([Role.ADMIN, Role.CASHIER]),
  validate({ body: toggleAvailabilitySchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const item = await menuService.toggleItemAvailability(
        req.params.id,
        req.user!.businessId,
        req.body.is_available
      );
      res.status(200).json({
        success: true,
        message: `Item marked as ${item.is_available ? 'available' : 'unavailable'}`,
        data: formatItem(item)
      });
    } catch (err) {
      next(err);
    }
  }
);

// ======================== MODIFIERS ========================

// POST /api/menu/items/:id/modifiers
router.post(
  '/items/:id/modifiers',
  authorize([Role.ADMIN]),
  validate({ body: modifierGroupSchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const group = await menuService.createModifierGroup(
        req.user!.businessId,
        req.params.id,
        req.body
      );
      res.status(201).json({ success: true, message: 'Modifier group created', data: group });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/menu/modifiers/groups/:id
router.put(
  '/modifiers/groups/:id',
  authorize([Role.ADMIN]),
  validate({ body: updateModifierGroupSchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const group = await menuService.updateModifierGroup(
        req.params.id,
        req.user!.businessId,
        req.body
      );
      res.status(200).json({ success: true, message: 'Modifier group updated', data: group });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/menu/modifiers/groups/:id
router.delete(
  '/modifiers/groups/:id',
  authorize([Role.ADMIN]),
  async (req: AuthRequest, res: Response, next) => {
    try {
      await menuService.deleteModifierGroup(req.params.id, req.user!.businessId);
      res.status(200).json({ success: true, message: 'Modifier group deleted' });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/menu/modifiers/groups/:id/options
router.post(
  '/modifiers/groups/:id/options',
  authorize([Role.ADMIN]),
  validate({ body: modifierOptionSchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const option = await menuService.addModifierOption(req.params.id, req.body);
      res.status(201).json({ success: true, message: 'Modifier option added', data: option });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/menu/modifiers/options/:id
router.put(
  '/modifiers/options/:id',
  authorize([Role.ADMIN]),
  validate({ body: updateModifierOptionSchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const option = await menuService.updateModifierOption(req.params.id, req.body);
      res.status(200).json({ success: true, message: 'Modifier option updated', data: option });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/menu/modifiers/options/:id
router.delete(
  '/modifiers/options/:id',
  authorize([Role.ADMIN]),
  async (req: AuthRequest, res: Response, next) => {
    try {
      await menuService.deleteModifierOption(req.params.id);
      res.status(200).json({ success: true, message: 'Modifier option deleted' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
