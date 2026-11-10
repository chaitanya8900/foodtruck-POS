import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ShoppingCart,
  Plus,
  Minus,
  Search,
  ChevronRight,
  Edit2,
  UtensilsCrossed
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import publicApi from '@/api/public';
import useCartStore from '@/store/cart';
import { MenuItem, MenuCategory, CartItem, CartItemModifier } from '@/types';
import { formatCurrency } from '@/lib/utils';
import Spinner from '@/components/ui/Spinner';
import CustomerCustomizationDrawer, { isItemVeg } from '@/components/customer/CustomerCustomizationDrawer';

export const CustomerMenuPage: React.FC = () => {
  const { qrToken } = useParams<{ qrToken: string }>();
  const navigate = useNavigate();

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [vegFilter, setVegFilter] = useState<'all' | 'veg' | 'non-veg'>('all');

  // Customization drawer states
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null);

  const {
    items,
    addItem,
    updateQuantity,
    updateCartItem,
    getItemCount,
  } = useCartStore();

  const { data: menuData, isLoading } = useQuery({
    queryKey: ['publicMenu', qrToken],
    queryFn: () => publicApi.getPublicMenu(qrToken),
    staleTime: 60000,
  });

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const categories = useMemo(() => {
    const list: any[] = Array.isArray(menuData)
      ? menuData
      : (menuData as any)?.categories || [];

    return list.map((cat: any) => ({
      ...cat,
      items: (cat.items || []).map((item: any) => ({
        ...item,
        categoryId: item.categoryId || item.category_id || cat.id,
        imageUrl: item.imageUrl || item.image_url || '',
        isAvailable: item.isAvailable ?? item.is_available ?? true,
        price: Number(item.price || 0),
        modifierGroups: (item.modifierGroups || item.modifier_groups || []).map((mg: any) => ({
          ...mg,
          selectionType: mg.selectionType || mg.selection_type || 'SINGLE',
          minSelections: mg.minSelections ?? mg.min_selections ?? 0,
          maxSelections: mg.maxSelections ?? mg.max_selections ?? 1,
          isRequired: mg.isRequired ?? mg.is_required ?? false,
          options: (mg.options || []).map((opt: any) => ({
            ...opt,
            price: Number(opt.price ?? opt.additionalPrice ?? opt.additional_price ?? 0),
            isAvailable: opt.isAvailable ?? opt.is_available ?? true,
          })),
        })),
      })),
    })) as MenuCategory[];
  }, [menuData]);

  const allItems = useMemo(() => {
    return categories.flatMap((cat) => cat.items || []);
  }, [categories]);

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      const itemCatId = item.categoryId || (item as any).category_id;
      const matchCat = selectedCategoryId === 'all' || itemCatId === selectedCategoryId;
      const matchSearch =
        !searchQuery.trim() ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));

      const isVeg = isItemVeg(item.name, item.description);
      const matchVeg =
        vegFilter === 'all' ||
        (vegFilter === 'veg' && isVeg) ||
        (vegFilter === 'non-veg' && !isVeg);

      return matchCat && matchSearch && matchVeg;
    });
  }, [allItems, selectedCategoryId, searchQuery, vegFilter]);

  const handleItemClick = (item: MenuItem) => {
    if (!item.isAvailable) return;
    if (item.modifierGroups && item.modifierGroups.length > 0) {
      setEditingCartItem(null);
      setCustomizingItem(item);
    } else {
      addItem(item, 1);
    }
  };

  const handleEditCustomization = (item: MenuItem) => {
    const existingCartItems = items.filter((ci) => ci.menuItem.id === item.id);
    if (existingCartItems.length > 0) {
      setEditingCartItem(existingCartItems[0]);
      setCustomizingItem(item);
    } else {
      setEditingCartItem(null);
      setCustomizingItem(item);
    }
  };

  const handleIncrement = (item: MenuItem) => {
    const inCart = items.filter((ci) => ci.menuItem.id === item.id);
    if (inCart.length > 0) {
      const target = inCart[inCart.length - 1];
      updateQuantity(target.cartItemId, target.quantity + 1);
    } else {
      handleItemClick(item);
    }
  };

  const handleDecrement = (item: MenuItem) => {
    const inCart = items.filter((ci) => ci.menuItem.id === item.id);
    if (inCart.length > 0) {
      const target = inCart[inCart.length - 1];
      updateQuantity(target.cartItemId, target.quantity - 1);
    }
  };

  const handleAddCustomized = (
    item: MenuItem,
    quantity: number,
    customizations: CartItemModifier[],
    instructions?: string
  ) => {
    addItem(item, quantity, customizations, instructions);
  };

  const handleUpdateCartItem = (
    cartItemId: string,
    quantity: number,
    customizations: CartItemModifier[],
    instructions?: string
  ) => {
    updateCartItem(cartItemId, quantity, customizations, instructions);
  };

  const cartItemCount = getItemCount();

  if (isLoading && !menuData) {
    return (
      <div className="py-24 flex items-center justify-center">
        <Spinner label="Loading fresh menu..." />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-120px)] bg-[#FAF4F2]">
      {/* Top Search & Veg / Non-Veg Filters matching IMG_4295.PNG */}
      <div
        className="p-3.5 bg-white sticky z-20 border-b border-neutral-200/80 shadow-xs"
        style={{ top: 'var(--customer-top-offset, 3.5rem)' }}
      >
        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search dishes..."
              className="w-full pl-10 pr-3 py-2 bg-neutral-100 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-[#3A0A0F] text-neutral-900 placeholder:text-neutral-400"
            />
          </div>

          {/* Veg Filter Button matching IMG_4295.PNG */}
          <button
            type="button"
            onClick={() => setVegFilter((cur) => (cur === 'veg' ? 'all' : 'veg'))}
            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all ${
              vegFilter === 'veg'
                ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600/30'
                : 'border-neutral-300 bg-white hover:bg-neutral-50'
            }`}
            title="Filter Veg dishes"
          >
            <span className="w-4 h-4 rounded-xs border border-emerald-600 p-0.5 flex items-center justify-center">
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
            </span>
          </button>

          {/* Non-Veg Filter Button matching IMG_4295.PNG */}
          <button
            type="button"
            onClick={() => setVegFilter((cur) => (cur === 'non-veg' ? 'all' : 'non-veg'))}
            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all ${
              vegFilter === 'non-veg'
                ? 'border-rose-700 bg-rose-50 ring-2 ring-rose-700/30'
                : 'border-neutral-300 bg-white hover:bg-neutral-50'
            }`}
            title="Filter Non-Veg dishes"
          >
            <span className="w-4 h-4 rounded-xs border border-rose-700 p-0.5 flex items-center justify-center">
              <span className="w-2 h-2 rounded-full bg-rose-700" />
            </span>
          </button>
        </div>

        {/* Categories Bar */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-3">
          <button
            type="button"
            onClick={() => setSelectedCategoryId('all')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
              selectedCategoryId === 'all'
                ? 'bg-[#3A0A0F] text-white shadow-md shadow-[#3A0A0F]/20'
                : 'bg-neutral-100 text-neutral-600 border border-neutral-200/80 hover:bg-neutral-200/60'
            }`}
          >
            All Items
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategoryId(cat.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                selectedCategoryId === cat.id
                  ? 'bg-[#3A0A0F] text-white shadow-md shadow-[#3A0A0F]/20'
                  : 'bg-neutral-100 text-neutral-600 border border-neutral-200/80 hover:bg-neutral-200/60'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Menu Items List matching IMG_4295.PNG and Screenshot */}
      <div className="p-3.5 space-y-3 flex-1 pb-28">
        {filteredItems.length === 0 ? (
          <div className="py-16 text-center text-neutral-500">
            <p className="text-sm font-semibold">No dishes found</p>
            <p className="text-xs text-neutral-400 mt-1">Try clearing search or filters</p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const inCart = items.filter((ci) => ci.menuItem.id === item.id);
            const totalInCart = inCart.reduce((sum, ci) => sum + ci.quantity, 0);
            const hasModifiers = item.modifierGroups && item.modifierGroups.length > 0;
            const isVeg = isItemVeg(item.name, item.description);

            return (
              <div
                key={item.id}
                className={`bg-white rounded-2xl p-4 border border-neutral-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex justify-between gap-3.5 transition-all ${
                  item.isAvailable ? '' : 'opacity-60 bg-neutral-50'
                }`}
              >
                {/* Left Info: Veg Icon, Title, Price, Description */}
                <div className="flex-1 min-w-0 flex flex-col justify-between pr-1">
                  <div>
                    {/* Veg / Non-Veg Indicator Icon */}
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center justify-center w-4 h-4 rounded-xs border p-0.5 shrink-0 ${
                          isVeg ? 'border-emerald-600' : 'border-rose-700'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${isVeg ? 'bg-emerald-600' : 'bg-rose-700'}`} />
                      </span>
                      {!item.isAvailable && (
                        <span className="text-[10px] font-bold uppercase text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                          Unavailable
                        </span>
                      )}
                    </div>

                    {/* Dish Name */}
                    <h3 className="font-bold text-neutral-900 text-base leading-tight mt-1.5">
                      {item.name}
                    </h3>

                    {/* Price */}
                    <p className="text-base font-bold text-neutral-900 mt-1">
                      {formatCurrency(item.price)}
                    </p>

                    {/* Description */}
                    {item.description && (
                      <p className="text-xs text-neutral-600 mt-2 line-clamp-3 leading-relaxed">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right Column: Dish Photo with Floating Add (+) / Stepper (- 1 +) and Edit Button */}
                <div className="relative w-28 h-28 sm:w-32 sm:h-32 shrink-0 flex flex-col items-center">
                  {/* Item Picture */}
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl object-cover shadow-xs bg-neutral-100"
                    />
                  ) : (
                    <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-neutral-100 flex flex-col items-center justify-center text-neutral-400 border border-neutral-200/70">
                      <UtensilsCrossed className="w-6 h-6 stroke-1 mb-1 text-neutral-400" />
                      <span className="text-[10px] font-semibold text-neutral-400">Fresh Dish</span>
                    </div>
                  )}

                  {/* Action Controls */}
                  {item.isAvailable && (
                    <>
                      {totalInCart === 0 ? (
                        /* Circular Plus Button matching IMG_4295.PNG */
                        <button
                          type="button"
                          onClick={() => handleItemClick(item)}
                          className="w-8 h-8 rounded-full bg-white shadow-md flex items-center justify-center text-[#3A0A0F] absolute bottom-2 right-2 hover:scale-105 active:scale-90 transition-all border border-neutral-100 z-10"
                          title="Add item"
                        >
                          <Plus className="w-5 h-5 stroke-[2.5]" />
                        </button>
                      ) : (
                        /* Stepper Pill matching Screenshot 2026-11-03 at 1.31.15 PM.png */
                        <>
                          <div className="absolute -bottom-3 inset-x-1 sm:inset-x-2 bg-white shadow-md rounded-full px-2.5 py-1 flex items-center justify-between border border-neutral-100 z-10">
                            <button
                              type="button"
                              onClick={() => handleDecrement(item)}
                              className="w-6 h-6 flex items-center justify-center text-[#3A0A0F] hover:bg-neutral-100 rounded-full font-bold active:scale-90 transition-transform"
                            >
                              <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
                            </button>
                            <span className="font-bold text-sm text-[#3A0A0F] select-none min-w-[18px] text-center font-mono">
                              {totalInCart}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleIncrement(item)}
                              className="w-6 h-6 flex items-center justify-center text-[#3A0A0F] hover:bg-neutral-100 rounded-full font-bold active:scale-90 transition-transform"
                            >
                              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                            </button>
                          </div>

                          {/* Customizable Item 'Edit' button matching Screenshot 2026-11-03 at 1.31.15 PM.png */}
                          {hasModifiers && (
                            <button
                              type="button"
                              onClick={() => handleEditCustomization(item)}
                              className="border border-neutral-300 text-neutral-700 hover:text-black rounded-full px-3 py-0.5 text-[11px] font-semibold flex items-center gap-1 mx-auto mt-4 hover:bg-neutral-50 active:scale-95 transition-all shadow-2xs bg-white"
                            >
                              <Edit2 className="w-3 h-3 text-neutral-500" />
                              <span>Edit</span>
                            </button>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Cart Pill at Bottom matching IMG_4295.PNG */}
      {cartItemCount > 0 && (
        <div className="fixed bottom-4 inset-x-4 max-w-md mx-auto z-40">
          <button
            type="button"
            onClick={() => navigate(`/order/t/${qrToken}/cart`)}
            className="w-full bg-[#3A0A0F] hover:bg-[#5B0F1B] active:scale-[0.98] text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center justify-between transition-all border border-white/10"
          >
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-white" />
            </div>

            {/* User Request: "cart button in the bottom with does not show anything but just no.of items" */}
            <div className="flex items-center gap-1 text-sm font-bold text-white tracking-wide">
              <span>{cartItemCount} {cartItemCount === 1 ? 'item' : 'items'}</span>
              <ChevronRight className="w-4 h-4 stroke-[2.5]" />
            </div>
          </button>
        </div>
      )}

      {/* Item Customizations Bottom Sheet Drawer matching IMG_4294.PNG */}
      <CustomerCustomizationDrawer
        isOpen={!!customizingItem}
        onClose={() => {
          setCustomizingItem(null);
          setEditingCartItem(null);
        }}
        menuItem={customizingItem}
        isEditing={!!editingCartItem}
        initialModifiers={editingCartItem?.customizations || []}
        initialQuantity={editingCartItem?.quantity || 1}
        initialInstructions={editingCartItem?.specialInstructions || ''}
        cartItemId={editingCartItem?.cartItemId}
        onAddToCart={handleAddCustomized}
        onUpdateCartItem={handleUpdateCartItem}
      />
    </div>
  );
};

export default CustomerMenuPage;
