import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CartItem, CartItemModifier, MenuItem } from '@/types';

interface CartState {
  items: CartItem[];
  specialInstructions: string;
  addItem: (menuItem: MenuItem, quantity?: number, customizations?: CartItemModifier[], specialInstructions?: string) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  updateCustomizations: (cartItemId: string, customizations: CartItemModifier[]) => void;
  updateCartItem: (cartItemId: string, quantity: number, customizations: CartItemModifier[], instructions?: string) => void;
  setSpecialInstructions: (instructions: string) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getTax: (taxRate?: number) => number;
  getTotal: (taxRate?: number, discount?: number) => number;
  getItemCount: () => number;
}

const areCustomizationsEqual = (a: CartItemModifier[] = [], b: CartItemModifier[] = []): boolean => {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x.optionId.localeCompare(y.optionId));
  const sortedB = [...b].sort((x, y) => x.optionId.localeCompare(y.optionId));
  return sortedA.every((opt, idx) => opt.optionId === sortedB[idx].optionId);
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      specialInstructions: '',

  addItem: (menuItem: MenuItem, quantity = 1, customizations = [], instructions = '') => {
    set((state) => {
      const customizationTotal = customizations.reduce((sum, c) => sum + Number(c.price || 0), 0);
      const unitPrice = Number(menuItem.price || 0);

      // Check if item with identical customizations and instructions exists
      const existingIndex = state.items.findIndex(
        (item) =>
          item.menuItem.id === menuItem.id &&
          areCustomizationsEqual(item.customizations, customizations) &&
          (item.specialInstructions || '') === (instructions || '')
      );

      if (existingIndex > -1) {
        const updatedItems = [...state.items];
        const existing = updatedItems[existingIndex];
        const newQty = existing.quantity + quantity;
        updatedItems[existingIndex] = {
          ...existing,
          quantity: newQty,
          lineTotal: (unitPrice + customizationTotal) * newQty,
        };
        return { items: updatedItems };
      }

      const cartItemId = `${menuItem.id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const newItem: CartItem = {
        cartItemId,
        menuItem,
        quantity,
        customizations,
        unitPrice,
        customizationTotal,
        lineTotal: (unitPrice + customizationTotal) * quantity,
        specialInstructions: instructions,
      };

      return { items: [...state.items, newItem] };
    });
  },

  removeItem: (cartItemId: string) => {
    set((state) => ({
      items: state.items.filter((item) => item.cartItemId !== cartItemId),
    }));
  },

  updateQuantity: (cartItemId: string, quantity: number) => {
    if (quantity <= 0) {
      get().removeItem(cartItemId);
      return;
    }
    set((state) => ({
      items: state.items.map((item) => {
        if (item.cartItemId === cartItemId) {
          return {
            ...item,
            quantity,
            lineTotal: (item.unitPrice + item.customizationTotal) * quantity,
          };
        }
        return item;
      }),
    }));
  },

  updateCustomizations: (cartItemId: string, customizations: CartItemModifier[]) => {
    set((state) => ({
      items: state.items.map((item) => {
        if (item.cartItemId === cartItemId) {
          const customizationTotal = customizations.reduce((sum, c) => sum + Number(c.price || 0), 0);
          return {
            ...item,
            customizations,
            customizationTotal,
            lineTotal: (item.unitPrice + customizationTotal) * item.quantity,
          };
        }
        return item;
      }),
    }));
  },

  updateCartItem: (cartItemId: string, quantity: number, customizations: CartItemModifier[], instructions?: string) => {
    if (quantity <= 0) {
      get().removeItem(cartItemId);
      return;
    }
    set((state) => ({
      items: state.items.map((item) => {
        if (item.cartItemId === cartItemId) {
          const customizationTotal = customizations.reduce((sum, c) => sum + Number(c.price || 0), 0);
          return {
            ...item,
            quantity,
            customizations,
            customizationTotal,
            lineTotal: (item.unitPrice + customizationTotal) * quantity,
            specialInstructions: instructions !== undefined ? instructions : item.specialInstructions,
          };
        }
        return item;
      }),
    }));
  },

  setSpecialInstructions: (instructions: string) => {
    set({ specialInstructions: instructions });
  },

  clearCart: () => {
    set({ items: [], specialInstructions: '' });
  },

  getSubtotal: () => {
    return get().items.reduce((sum, item) => sum + item.lineTotal, 0);
  },

  getTax: (taxRate = 5) => {
    const subtotal = get().getSubtotal();
    return Number(((subtotal * taxRate) / 100).toFixed(2));
  },

  getTotal: (taxRate = 5, discount = 0) => {
    const subtotal = get().getSubtotal();
    const tax = get().getTax(taxRate);
    const total = subtotal + tax - discount;
    return Math.max(0, Number(total.toFixed(2)));
  },

  getItemCount: () => {
    return get().items.reduce((sum, item) => sum + item.quantity, 0);
  },
}),
    {
      name: 'fb-customer-cart-storage',
    }
  )
);

export default useCartStore;
