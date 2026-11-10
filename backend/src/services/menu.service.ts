import { Prisma, ModifierSelectionType } from '@prisma/client';
import prisma from '../prisma';
import { NotFoundError } from '../middleware/errorHandler';

// High-performance in-memory cache for menu items & categories (30-second TTL)
const menuCache = new Map<string, { timestamp: number; data: any }>();
const MENU_CACHE_TTL_MS = 30 * 1000;

import { invalidateMenuItemsCache } from './order.service';

const menuCacheInvalidationCallbacks: Array<(businessId?: string) => void> = [];

export function onMenuCacheInvalidated(callback: (businessId?: string) => void) {
  menuCacheInvalidationCallbacks.push(callback);
}

export function clearMenuCache(businessId?: string) {
  if (businessId) {
    menuCache.delete(`${businessId}:true`);
    menuCache.delete(`${businessId}:false`);
  } else {
    menuCache.clear();
  }
  invalidateMenuItemsCache(businessId);
  for (const cb of menuCacheInvalidationCallbacks) {
    try {
      cb(businessId);
    } catch {
      // ignore
    }
  }
}

// ======================== CATEGORIES ========================

export async function getCategories(businessId: string, publicOnly: boolean = false) {
  return prisma.menuCategory.findMany({
    where: {
      business_id: businessId,
      ...(publicOnly ? { is_active: true } : {})
    },
    orderBy: { display_order: 'asc' },
    include: {
      _count: {
        select: { items: true }
      }
    }
  });
}

export async function getCategoryById(id: string, businessId: string) {
  const category = await prisma.menuCategory.findFirst({
    where: { id, business_id: businessId },
    include: { items: true }
  });

  if (!category) {
    throw new NotFoundError(`Category with ID ${id} not found.`);
  }

  return category;
}

export async function createCategory(
  businessId: string,
  data: {
    name: string;
    description?: string;
    image_url?: string;
    display_order?: number;
    is_active?: boolean;
  }
) {
  clearMenuCache(businessId);
  return prisma.menuCategory.create({
    data: {
      business_id: businessId,
      name: data.name,
      description: data.description || null,
      image_url: data.image_url || null,
      display_order: data.display_order ?? 0,
      is_active: data.is_active ?? true
    }
  });
}

export async function updateCategory(
  id: string,
  businessId: string,
  data: Partial<{
    name: string;
    description: string | null;
    image_url: string | null;
    display_order: number;
    is_active: boolean;
  }>
) {
  await getCategoryById(id, businessId);
  clearMenuCache(businessId);

  return prisma.menuCategory.update({
    where: { id },
    data: {
      ...data,
      updated_at: new Date()
    }
  });
}

export async function deleteCategory(id: string, businessId: string) {
  await getCategoryById(id, businessId);
  clearMenuCache(businessId);

  return prisma.menuCategory.delete({
    where: { id }
  });
}

// ======================== MENU ITEMS ========================

export async function getItems(
  businessId: string,
  categoryId?: string,
  publicOnly: boolean = false
) {
  return prisma.menuItem.findMany({
    where: {
      business_id: businessId,
      ...(categoryId ? { category_id: categoryId } : {}),
      ...(publicOnly ? { is_available: true } : {})
    },
    orderBy: { display_order: 'asc' },
    include: {
      category: {
        select: { id: true, name: true }
      },
      modifier_groups: {
        orderBy: { display_order: 'asc' },
        include: {
          options: {
            where: publicOnly ? { is_available: true } : {},
            orderBy: { display_order: 'asc' }
          }
        }
      }
    }
  });
}

export async function getItemById(id: string, businessId: string) {
  const item = await prisma.menuItem.findFirst({
    where: { id, business_id: businessId },
    include: {
      category: true,
      modifier_groups: {
        orderBy: { display_order: 'asc' },
        include: {
          options: {
            orderBy: { display_order: 'asc' }
          }
        }
      }
    }
  });

  if (!item) {
    throw new NotFoundError(`Menu item with ID ${id} not found.`);
  }

  return item;
}

export interface ModifierOptionInput {
  id?: string;
  name: string;
  additional_price?: number | Prisma.Decimal;
  is_available?: boolean;
  display_order?: number;
}

export interface ModifierGroupInput {
  id?: string;
  name: string;
  selection_type?: ModifierSelectionType;
  min_selections?: number;
  max_selections?: number;
  is_required?: boolean;
  display_order?: number;
  options?: ModifierOptionInput[];
}

const isUuid = (val?: string): boolean =>
  typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

export async function createItem(
  businessId: string,
  data: {
    category_id: string;
    name: string;
    description?: string;
    price: number | Prisma.Decimal;
    image_url?: string;
    is_available?: boolean;
    preparation_time?: number;
    tax_rate?: number | Prisma.Decimal;
    display_order?: number;
    modifier_groups?: ModifierGroupInput[];
  }
) {
  // Validate category belongs to this business
  await getCategoryById(data.category_id, businessId);

  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.menuItem.create({
      data: {
        business_id: businessId,
        category_id: data.category_id,
        name: data.name,
        description: data.description || null,
        price: new Prisma.Decimal(data.price),
        image_url: data.image_url || null,
        is_available: data.is_available ?? true,
        preparation_time: data.preparation_time || null,
        tax_rate: data.tax_rate !== undefined ? new Prisma.Decimal(data.tax_rate) : new Prisma.Decimal(5.0),
        display_order: data.display_order ?? 0
      }
    });

    if (data.modifier_groups && data.modifier_groups.length > 0) {
      for (let gIdx = 0; gIdx < data.modifier_groups.length; gIdx++) {
        const group = data.modifier_groups[gIdx];
        if (!group.name || !group.name.trim()) continue;

        await tx.modifierGroup.create({
          data: {
            ...(isUuid(group.id) ? { id: group.id } : {}),
            business_id: businessId,
            menu_item_id: item.id,
            name: group.name.trim(),
            selection_type: group.selection_type || ModifierSelectionType.SINGLE,
            min_selections: group.min_selections ?? 0,
            max_selections: group.max_selections ?? 1,
            is_required: group.is_required ?? false,
            display_order: group.display_order ?? gIdx,
            options: group.options && group.options.length > 0
              ? {
                  create: group.options
                    .filter((opt) => opt.name && opt.name.trim())
                    .map((opt, optIdx) => ({
                      ...(isUuid(opt.id) ? { id: opt.id } : {}),
                      name: opt.name.trim(),
                      additional_price: new Prisma.Decimal(opt.additional_price || 0),
                      is_available: opt.is_available ?? true,
                      display_order: opt.display_order ?? optIdx
                    }))
                }
              : undefined
          }
        });
      }
    }

    return tx.menuItem.findUniqueOrThrow({
      where: { id: item.id },
      include: {
        category: true,
        modifier_groups: {
          orderBy: { display_order: 'asc' },
          include: {
            options: {
              orderBy: { display_order: 'asc' }
            }
          }
        }
      }
    });
  });

  clearMenuCache(businessId);
  return result;
}

export async function updateItem(
  id: string,
  businessId: string,
  data: Partial<{
    category_id: string;
    name: string;
    description: string | null;
    price: number | Prisma.Decimal;
    image_url: string | null;
    is_available: boolean;
    preparation_time: number | null;
    tax_rate: number | Prisma.Decimal;
    display_order: number;
    modifier_groups: ModifierGroupInput[];
  }>
) {
  await getItemById(id, businessId);

  if (data.category_id) {
    await getCategoryById(data.category_id, businessId);
  }

  const { modifier_groups, ...scalarData } = data;
  const updateData: any = { ...scalarData };
  if (scalarData.price !== undefined) {
    updateData.price = new Prisma.Decimal(scalarData.price);
  }
  if (scalarData.tax_rate !== undefined) {
    updateData.tax_rate = new Prisma.Decimal(scalarData.tax_rate);
  }

  const result = await prisma.$transaction(async (tx) => {
    if (Object.keys(updateData).length > 0) {
      await tx.menuItem.update({
        where: { id },
        data: updateData
      });
    }

    if (modifier_groups !== undefined) {
      // Remove previous modifier groups (options cascade delete)
      await tx.modifierGroup.deleteMany({
        where: { menu_item_id: id }
      });

      // Insert new/updated modifier groups
      for (let gIdx = 0; gIdx < modifier_groups.length; gIdx++) {
        const group = modifier_groups[gIdx];
        if (!group.name || !group.name.trim()) continue;

        await tx.modifierGroup.create({
          data: {
            ...(isUuid(group.id) ? { id: group.id } : {}),
            business_id: businessId,
            menu_item_id: id,
            name: group.name.trim(),
            selection_type: group.selection_type || ModifierSelectionType.SINGLE,
            min_selections: group.min_selections ?? 0,
            max_selections: group.max_selections ?? 1,
            is_required: group.is_required ?? false,
            display_order: group.display_order ?? gIdx,
            options: group.options && group.options.length > 0
              ? {
                  create: group.options
                    .filter((opt) => opt.name && opt.name.trim())
                    .map((opt, optIdx) => ({
                      ...(isUuid(opt.id) ? { id: opt.id } : {}),
                      name: opt.name.trim(),
                      additional_price: new Prisma.Decimal(opt.additional_price || 0),
                      is_available: opt.is_available ?? true,
                      display_order: opt.display_order ?? optIdx
                    }))
                }
              : undefined
          }
        });
      }
    }

    return tx.menuItem.findUniqueOrThrow({
      where: { id },
      include: {
        category: true,
        modifier_groups: {
          orderBy: { display_order: 'asc' },
          include: {
            options: {
              orderBy: { display_order: 'asc' }
            }
          }
        }
      }
    });
  });

  clearMenuCache(businessId);
  return result;
}

export async function deleteItem(id: string, businessId: string) {
  await getItemById(id, businessId);
  clearMenuCache(businessId);

  return prisma.menuItem.delete({
    where: { id }
  });
}

export async function toggleItemAvailability(
  id: string,
  businessId: string,
  is_available: boolean
) {
  await getItemById(id, businessId);
  clearMenuCache(businessId);

  return prisma.menuItem.update({
    where: { id },
    data: { is_available }
  });
}

// ======================== FULL MENU ========================

export async function getFullMenu(businessId: string, publicOnly: boolean = false) {
  const cacheKey = `${businessId}:${publicOnly}`;
  const cached = menuCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < MENU_CACHE_TTL_MS) {
    return cached.data;
  }

  const result = await prisma.menuCategory.findMany({
    where: {
      business_id: businessId,
      ...(publicOnly ? { is_active: true } : {})
    },
    orderBy: { display_order: 'asc' },
    include: {
      items: {
        orderBy: { display_order: 'asc' },
        include: {
          modifier_groups: {
            orderBy: { display_order: 'asc' },
            include: {
              options: {
                orderBy: { display_order: 'asc' }
              }
            }
          }
        }
      }
    }
  });

  menuCache.set(cacheKey, { timestamp: Date.now(), data: result });
  return result;
}

// ======================== MODIFIERS ========================

export async function createModifierGroup(
  businessId: string,
  menuItemId: string,
  data: {
    name: string;
    selection_type?: ModifierSelectionType;
    min_selections?: number;
    max_selections?: number;
    is_required?: boolean;
    display_order?: number;
    options?: Array<{
      name: string;
      additional_price?: number | Prisma.Decimal;
      is_available?: boolean;
      display_order?: number;
    }>;
  }
) {
  await getItemById(menuItemId, businessId);

  return prisma.modifierGroup.create({
    data: {
      business_id: businessId,
      menu_item_id: menuItemId,
      name: data.name,
      selection_type: data.selection_type || ModifierSelectionType.SINGLE,
      min_selections: data.min_selections ?? 0,
      max_selections: data.max_selections ?? 1,
      is_required: data.is_required ?? false,
      display_order: data.display_order ?? 0,
      options: data.options && data.options.length > 0
        ? {
            create: data.options.map((opt, idx) => ({
              name: opt.name,
              additional_price: new Prisma.Decimal(opt.additional_price || 0),
              is_available: opt.is_available ?? true,
              display_order: opt.display_order ?? idx + 1
            }))
          }
        : undefined
    },
    include: { options: true }
  });
}

export async function updateModifierGroup(
  id: string,
  businessId: string,
  data: Partial<{
    name: string;
    selection_type: ModifierSelectionType;
    min_selections: number;
    max_selections: number;
    is_required: boolean;
    display_order: number;
  }>
) {
  const group = await prisma.modifierGroup.findFirst({
    where: { id, business_id: businessId }
  });

  if (!group) {
    throw new NotFoundError(`Modifier group ${id} not found.`);
  }

  return prisma.modifierGroup.update({
    where: { id },
    data,
    include: { options: true }
  });
}

export async function deleteModifierGroup(id: string, businessId: string) {
  const group = await prisma.modifierGroup.findFirst({
    where: { id, business_id: businessId }
  });

  if (!group) {
    throw new NotFoundError(`Modifier group ${id} not found.`);
  }

  return prisma.modifierGroup.delete({
    where: { id }
  });
}

export async function addModifierOption(
  groupId: string,
  data: {
    name: string;
    additional_price?: number | Prisma.Decimal;
    is_available?: boolean;
    display_order?: number;
  }
) {
  const group = await prisma.modifierGroup.findUnique({
    where: { id: groupId }
  });

  if (!group) {
    throw new NotFoundError(`Modifier group ${groupId} not found.`);
  }

  return prisma.modifierOption.create({
    data: {
      group_id: groupId,
      name: data.name,
      additional_price: new Prisma.Decimal(data.additional_price || 0),
      is_available: data.is_available ?? true,
      display_order: data.display_order ?? 0
    }
  });
}

export async function updateModifierOption(
  id: string,
  data: Partial<{
    name: string;
    additional_price: number | Prisma.Decimal;
    is_available: boolean;
    display_order: number;
  }>
) {
  const option = await prisma.modifierOption.findUnique({
    where: { id }
  });

  if (!option) {
    throw new NotFoundError(`Modifier option ${id} not found.`);
  }

  const updateData: any = { ...data };
  if (data.additional_price !== undefined) {
    updateData.additional_price = new Prisma.Decimal(data.additional_price);
  }

  return prisma.modifierOption.update({
    where: { id },
    data: updateData
  });
}

export async function deleteModifierOption(id: string) {
  const option = await prisma.modifierOption.findUnique({
    where: { id }
  });

  if (!option) {
    throw new NotFoundError(`Modifier option ${id} not found.`);
  }

  return prisma.modifierOption.delete({
    where: { id }
  });
}
