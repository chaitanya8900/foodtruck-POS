import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, ShoppingCart, CheckCircle2, RotateCcw, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

import menuApi from '@/api/menu';
import tablesApi from '@/api/tables';
import ordersApi from '@/api/orders';
import useCartStore from '@/store/cart';
import useAuthStore from '@/store/auth';
import {
  MenuItem,
  OrderType,
  PaymentMethod,
  OrderSource,
  CartItemModifier,
  Order,
} from '@/types';
import { formatCurrency } from '@/lib/utils';

import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import CartItem from '@/components/pos/CartItem';
import OrderTypeModal from '@/components/pos/OrderTypeModal';
import ItemCustomizationModal from '@/components/pos/ItemCustomizationModal';

export const POSPage: React.FC = () => {
  const queryClient = useQueryClient();
  const business = useAuthStore((state) => state.business);

  // Search & Category Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');

  // Modals state
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [isOrderTypeModalOpen, setIsOrderTypeModalOpen] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);

  // Payment Selection in Cart
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [cashReceived, setCashReceived] = useState<string>('');
  const [transactionRef, setTransactionRef] = useState<string>('');

  // Cart Store
  const {
    items,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    getSubtotal,
    getTax,
    getTotal,
    specialInstructions,
    setSpecialInstructions,
  } = useCartStore();

  const taxRate = business?.taxRate ?? 5;
  const subtotal = getSubtotal();
  const tax = getTax(taxRate);
  const total = getTotal(taxRate);

  // Queries with 5-minute cache for instant instantaneous tab switches
  const { data: categories = [], isLoading: isLoadingCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: menuApi.getCategories,
    staleTime: 5 * 60 * 1000,
  });

  const { data: menuItems = [], isLoading: isLoadingItems } = useQuery({
    queryKey: ['menuItems'],
    queryFn: () => menuApi.getItems(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: tables = [] } = useQuery({
    queryKey: ['tables'],
    queryFn: tablesApi.getTables,
    staleTime: 5 * 60 * 1000,
  });

  // Filtered menu items
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchesCategory =
        selectedCategoryId === 'all' || item.categoryId === selectedCategoryId;
      const matchesSearch =
        !searchQuery.trim() ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [menuItems, selectedCategoryId, searchQuery]);

  // Handle item click
  const handleItemClick = (item: MenuItem) => {
    if (!item.isAvailable) {
      toast.error(`${item.name} is currently unavailable`);
      return;
    }

    if (item.modifierGroups && item.modifierGroups.length > 0) {
      setCustomizingItem(item);
    } else {
      addItem(item, 1);
      toast.success(`Added ${item.name}`, { duration: 1200 });
    }
  };

  // Add customized item
  const handleAddCustomized = (
    item: MenuItem,
    quantity: number,
    customizations: CartItemModifier[],
    instructions?: string
  ) => {
    addItem(item, quantity, customizations, instructions);
    toast.success(`Added ${item.name}`, { duration: 1200 });
  };

  // Order submission mutation
  const createOrderMutation = useMutation({
    mutationFn: ordersApi.createCounterOrder,
    onSuccess: (order) => {
      setCreatedOrder(order);
      setIsOrderTypeModalOpen(false);
      clearCart();
      setCashReceived('');
      setTransactionRef('');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to create order');
    },
  });

  // Handle Checkout Click
  const handleCheckoutClick = () => {
    if (items.length === 0) {
      toast.error('Cart is empty');
      return;
    }
    setIsOrderTypeModalOpen(true);
  };

  // Handle Order Type Confirmation
  const handleConfirmOrderType = (orderType: OrderType, tableId?: string | null) => {
    createOrderMutation.mutate({
      source: OrderSource.POS,
      orderType,
      tableId: tableId || null,
      paymentMethod,
      specialInstructions: specialInstructions || undefined,
      cashReceived: paymentMethod === PaymentMethod.CASH && cashReceived ? parseFloat(cashReceived) : undefined,
      transactionReference: paymentMethod === PaymentMethod.UPI && transactionRef ? transactionRef : undefined,
      items: items.map((cartItem) => ({
        menuItemId: cartItem.menuItem.id,
        quantity: cartItem.quantity,
        customizations: cartItem.customizations,
        specialInstructions: cartItem.specialInstructions,
      })),
    });
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* ================= LEFT SIDE: 60% MENU & SEARCH ================= */}
      <div className="w-[60%] flex flex-col border-r border-[#EAD8C0] bg-[#F8EFE6] min-w-0">
        {/* Top Search & Filter Bar */}
        <div className="p-4 bg-[#FDF6EC] border-b border-[#EAD8C0] flex flex-col gap-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search food, beverages, combos..."
              className="w-full pl-10 pr-4 py-2 bg-white rounded-xl text-sm border border-[#EAD8C0] focus:border-[#3A0A0F] focus:ring-2 focus:ring-[#3A0A0F]/15 transition-all min-h-[44px] text-[#3A0A0F] placeholder-stone-400"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <button
              type="button"
              onClick={() => setSelectedCategoryId('all')}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shadow-xs ${
                selectedCategoryId === 'all'
                  ? 'bg-[#3A0A0F] text-white shadow-[#3A0A0F]/20'
                  : 'bg-white text-[#3A0A0F] hover:bg-[#EAD8C0]/40 border border-[#EAD8C0]'
              }`}
            >
              All Items ({menuItems.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shadow-xs ${
                  selectedCategoryId === cat.id
                    ? 'bg-[#3A0A0F] text-white shadow-[#3A0A0F]/20'
                    : 'bg-white text-[#3A0A0F] hover:bg-[#EAD8C0]/40 border border-[#EAD8C0]'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Menu Items Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {(isLoadingItems || isLoadingCategories) && menuItems.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <Spinner label="Loading menu items..." />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <EmptyState
                title="No items found"
                description={searchQuery ? `No matching items for "${searchQuery}"` : 'No items in this category'}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {filteredItems.map((item) => {
                const isCustomizable = item.modifierGroups && item.modifierGroups.length > 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    disabled={!item.isAvailable}
                    className={`flex flex-col text-left p-4 rounded-2xl border transition-all text-[#3A0A0F] group select-none relative shadow-xs ${
                      item.isAvailable
                        ? 'bg-[#FDF6EC] border-[#EAD8C0] hover:border-[#3A0A0F] hover:shadow-md active:scale-[0.98]'
                        : 'bg-stone-100 border-[#EAD8C0] opacity-60 cursor-not-allowed'
                    }`}
                  >
                    {!item.isAvailable && (
                      <span className="absolute top-2.5 right-2.5 bg-[#FAF4F2] text-[#9B1C1C] border border-[#EAD8C0] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                        Unavailable
                      </span>
                    )}

                    <div className="flex-1 min-w-0 pr-1">
                      <h4 className="font-black text-sm text-[#3A0A0F] group-hover:text-[#5B0F1B] transition-colors line-clamp-1 tracking-tight">
                        {item.name}
                      </h4>
                      {item.description && (
                        <p className="text-xs text-[#6B4F48] line-clamp-2 mt-1 leading-relaxed">{item.description}</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 mt-2 border-t border-[#EAD8C0] w-full">
                      <span className="font-black text-sm text-[#3A0A0F] font-mono">
                        {formatCurrency(item.price)}
                      </span>
                      {isCustomizable && (
                        <span className="text-[10px] bg-[#EAD8C0] text-[#3A0A0F] font-bold px-1.5 py-0.5 rounded border border-[#DFC9AF]">
                          Custom
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ================= RIGHT SIDE: 40% CART & CHECKOUT ================= */}
      <div className="w-[40%] flex flex-col bg-white h-full border-l border-[#EAD8C0] shadow-xl">
        {/* Cart Header */}
        <div className="p-4 border-b border-[#EAD8C0] flex items-center justify-between bg-[#FDF6EC] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#EAD8C0] text-[#3A0A0F] flex items-center justify-center font-bold shadow-xs">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-[#3A0A0F] text-sm">Current Order</h3>
              <p className="text-[11px] text-[#6B4F48]">{items.length} unique item(s)</p>
            </div>
          </div>
          {items.length > 0 && (
            <button
              type="button"
              onClick={clearCart}
              className="text-xs text-red-600 hover:text-red-700 font-semibold flex items-center gap-1 p-1 hover:bg-[#FAF4F2] rounded-lg"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-[#FAF4F2]/30">
          {items.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <EmptyState
                icon={<ShoppingCart className="w-8 h-8 text-[#5B0F1B]" />}
                title="Your cart is empty"
                description="Click on any menu item from the left panel to begin an order."
              />
            </div>
          ) : (
            items.map((cartItem) => (
              <CartItem
                key={cartItem.cartItemId}
                item={cartItem}
                onUpdateQuantity={updateQuantity}
                onRemove={removeItem}
              />
            ))
          )}
        </div>

        {/* Order Instructions & Totals Panel */}
        {items.length > 0 && (
          <div className="p-4 bg-[#FDF6EC] border-t border-[#EAD8C0] space-y-3.5 shrink-0">
            {/* Special Instructions */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B4F48] mb-1">
                Order Notes
              </label>
              <textarea
                rows={1}
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                placeholder="Kitchen notes (e.g. deliver together, extra napkins)"
                className="w-full text-xs rounded-xl border border-[#EAD8C0] p-2.5 bg-white text-[#3A0A0F] focus:border-[#3A0A0F] focus:ring-1 focus:ring-[#3A0A0F] focus:outline-none"
              />
            </div>

            {/* Price Calculations */}
            <div className="space-y-1.5 text-xs text-[#6B4F48]">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-semibold text-[#3A0A0F] font-mono">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>GST / Tax ({taxRate}%)</span>
                <span className="font-semibold text-[#3A0A0F] font-mono">{formatCurrency(tax)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#EAD8C0] text-base font-black text-[#3A0A0F]">
                <span>Total Amount</span>
                <span className="text-[#3A0A0F] text-lg font-mono font-black">{formatCurrency(total)}</span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2 pt-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B4F48]">
                Payment Method
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod(PaymentMethod.CASH)}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 min-h-[40px] ${
                    paymentMethod === PaymentMethod.CASH
                      ? 'border-[#3A0A0F] bg-[#3A0A0F] text-white shadow-xs'
                      : 'border-[#EAD8C0] bg-white text-[#3A0A0F] hover:bg-[#EAD8C0]/30'
                  }`}
                >
                  💵 Cash
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod(PaymentMethod.UPI)}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 min-h-[40px] ${
                    paymentMethod === PaymentMethod.UPI
                      ? 'border-[#3A0A0F] bg-[#3A0A0F] text-white shadow-xs'
                      : 'border-[#EAD8C0] bg-white text-[#3A0A0F] hover:bg-[#EAD8C0]/30'
                  }`}
                >
                  📱 UPI
                </button>
              </div>

              {/* Cash received optional field */}
              {paymentMethod === PaymentMethod.CASH && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="number"
                    placeholder="Cash Received (₹)"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    className="w-1/2 text-xs p-2 rounded-xl border border-[#EAD8C0] text-[#3A0A0F]"
                  />
                  {cashReceived && parseFloat(cashReceived) >= total && (
                    <span className="text-xs font-bold text-[#1F5A34]">
                      Change: {formatCurrency(parseFloat(cashReceived) - total)}
                    </span>
                  )}
                </div>
              )}

              {/* UPI Reference optional field */}
              {paymentMethod === PaymentMethod.UPI && (
                <input
                  type="text"
                  placeholder="UPI Ref / Transaction ID (Optional)"
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value)}
                  className="w-full text-xs p-2 rounded-xl border border-[#EAD8C0] text-[#3A0A0F]"
                />
              )}
            </div>

            {/* Confirm & Print Button */}
            <Button
              type="button"
              variant="primary"
              size="lg"
              onClick={handleCheckoutClick}
              className="w-full font-bold shadow-md shadow-[#3A0A0F]/20 text-base rounded-xl"
            >
              Confirm & Print ({formatCurrency(total)})
            </Button>
          </div>
        )}
      </div>

      {/* Item Customizations Modal */}
      <ItemCustomizationModal
        isOpen={!!customizingItem}
        onClose={() => setCustomizingItem(null)}
        menuItem={customizingItem}
        onAddToCart={handleAddCustomized}
      />

      {/* Mandatory Order Type Selection Modal */}
      <OrderTypeModal
        isOpen={isOrderTypeModalOpen}
        onClose={() => setIsOrderTypeModalOpen(false)}
        onConfirm={handleConfirmOrderType}
        tables={tables}
        isSubmitting={createOrderMutation.isPending}
      />

      {/* Order Success Token Dialog */}
      <Modal
        isOpen={!!createdOrder}
        onClose={() => setCreatedOrder(null)}
        maxWidth="md"
        showCloseButton={false}
      >
        <div className="flex flex-col items-center text-center p-4 space-y-4">
          <div className="w-16 h-16 rounded-full bg-[#DDF0E4] text-[#1F5A34] flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
          </div>

          <div>
            <h3 className="text-xl font-extrabold text-[#3A0A0F]">Order Placed Successfully!</h3>
            <p className="text-xs text-[#6B4F48] mt-1">Receipt & KOT queued for printing</p>
          </div>

          <div className="w-full bg-[#FAF4F2] border-2 border-[#EAD8C0] rounded-2xl p-6 shadow-inner space-y-1">
            <p className="text-xs font-bold text-[#6B4F48] uppercase tracking-widest">Customer Token</p>
            <p className="text-5xl font-black text-[#3A0A0F] tracking-tight font-mono">
              #{createdOrder?.tokenNumber || createdOrder?.orderNumber}
            </p>
            <div className="pt-2 text-xs text-[#6B4F48] font-medium">
              Order #{createdOrder?.orderNumber} • {(String(createdOrder?.orderType || (createdOrder as any)?.order_type).toUpperCase().includes('DINE')) ? 'Dine-In' : 'Takeaway'}
            </div>
          </div>

          <div className="w-full text-xs text-[#6B4F48] flex items-center justify-center gap-1">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Thermal printer is generating customer slip & KOT</span>
          </div>

          <Button
            type="button"
            variant="primary"
            size="lg"
            className="w-full font-bold"
            onClick={() => setCreatedOrder(null)}
          >
            Start Next Order
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default POSPage;
