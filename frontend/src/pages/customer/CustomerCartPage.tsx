import React, { useEffect } from 'react';
import { useNavigate, useParams, useOutletContext } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Trash2, Plus, Minus, ShoppingBag } from 'lucide-react';
import useCartStore from '@/store/cart';
import { OrderingStatus } from '@/types';
import { formatCurrency } from '@/lib/utils';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';

export const CustomerCartPage: React.FC = () => {
  const { qrToken } = useParams<{ qrToken: string }>();
  const navigate = useNavigate();
  const context = useOutletContext<{ orderingStatus?: OrderingStatus }>() || {};
  const orderingStatus = context.orderingStatus;
  const isOrderingOpen = orderingStatus ? orderingStatus.isOpen : true;
  const closedButtonText = orderingStatus?.closedButtonText || 'Sorry, we are closed today';

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const {
    items,
    updateQuantity,
    removeItem,
    clearCart,
    getSubtotal,
    getTax,
    getTotal,
    specialInstructions,
    setSpecialInstructions,
  } = useCartStore();

  const subtotal = getSubtotal();
  const tax = getTax(5);
  const total = getTotal(5);

  if (items.length === 0) {
    return (
      <div className="p-6">
        <button
          onClick={() => navigate(`/order/t/${qrToken}`)}
          className="flex items-center gap-1.5 text-xs font-bold text-[#3A0A0F] hover:text-[#5B0F1B] mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Menu</span>
        </button>

        <EmptyState
          icon={<ShoppingBag className="w-10 h-10 text-[#3A0A0F]" />}
          title="Your Cart is Empty"
          description="Browse our menu and pick something tasty to start your order!"
          action={
            <Button
              variant="primary"
              onClick={() => navigate(`/order/t/${qrToken}`)}
              className="mt-2 font-bold shadow-md shadow-[#3A0A0F]/20"
            >
              Browse Menu
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-80px)] p-4 space-y-4 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#EAD8C0]">
        <button
          onClick={() => navigate(`/order/t/${qrToken}`)}
          className="flex items-center gap-1.5 text-xs font-bold text-[#3A0A0F] hover:text-[#5B0F1B] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Menu</span>
        </button>

        <button
          onClick={clearCart}
          className="text-xs text-[#5B0F1B] hover:text-red-700 font-semibold"
        >
          Clear Cart
        </button>
      </div>

      <h2 className="text-xl font-extrabold text-[#3A0A0F]">Review Your Order</h2>

      {/* Cart Items List */}
      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.cartItemId}
            className="bg-[#FDF6EC] rounded-2xl p-4 border border-[#EAD8C0] shadow-xs space-y-2.5"
          >
            <div className="flex items-start justify-between gap-3">
              {item.menuItem.imageUrl && (
                <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-[#EAD8C0] bg-white shadow-2xs">
                  <img
                    src={item.menuItem.imageUrl}
                    alt={item.menuItem.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-[#3A0A0F] text-sm truncate">{item.menuItem.name}</h4>
                <p className="text-xs text-[#6B4F48] font-semibold">{formatCurrency(item.unitPrice)}</p>
              </div>
              <button
                onClick={() => removeItem(item.cartItemId)}
                className="text-[#6B4F48] hover:text-[#5B0F1B] p-1"
                title="Remove item"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Customizations */}
            {item.customizations && item.customizations.length > 0 && (
              <div className="flex flex-wrap gap-1 text-[11px] text-[#3A0A0F] bg-[#FAF4F2] p-2 rounded-lg border border-[#EAD8C0]">
                {item.customizations.map((mod, idx) => (
                  <span key={idx} className="bg-[#EAD8C0]/50 px-2 py-0.5 rounded border border-[#EAD8C0] font-medium text-[#3A0A0F]">
                    +{mod.optionName} {mod.price > 0 && `(${formatCurrency(mod.price)})`}
                  </span>
                ))}
              </div>
            )}

            {/* Quantity and Price */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2 bg-[#FAF4F2] border border-[#EAD8C0] p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)}
                  className="w-7 h-7 rounded-lg bg-[#FDF6EC] border border-[#EAD8C0] flex items-center justify-center text-[#3A0A0F] shadow-xs hover:bg-[#EAD8C0]"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-6 text-center text-xs font-bold text-[#3A0A0F]">{item.quantity}</span>
                <button
                  type="button"
                  onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)}
                  className="w-7 h-7 rounded-lg bg-[#FDF6EC] border border-[#EAD8C0] flex items-center justify-center text-[#3A0A0F] shadow-xs hover:bg-[#EAD8C0]"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <span className="text-sm font-extrabold text-[#3A0A0F]">
                {formatCurrency(item.lineTotal)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Special Instructions */}
      <div className="bg-[#FDF6EC] p-4 rounded-2xl border border-[#EAD8C0] space-y-1.5">
        <label className="text-xs font-bold text-[#3A0A0F] uppercase tracking-wider">
          Special Cooking Request
        </label>
        <textarea
          rows={2}
          value={specialInstructions}
          onChange={(e) => setSpecialInstructions(e.target.value)}
          placeholder="E.g. Extra spicy, less oil, pack condiments separately..."
          className="w-full text-xs rounded-xl border border-[#EAD8C0] bg-[#FAF4F2] text-[#3A0A0F] p-2.5 focus:border-[#3A0A0F] focus:outline-none focus:ring-1 focus:ring-[#3A0A0F]"
        />
      </div>

      {/* Bill Summary */}
      <div className="bg-[#FDF6EC] p-4 rounded-2xl border border-[#EAD8C0] space-y-2 text-xs">
        <h4 className="font-bold text-[#3A0A0F] text-sm pb-1 border-b border-[#EAD8C0]">Bill Summary</h4>
        <div className="flex justify-between text-[#6B4F48]">
          <span>Subtotal</span>
          <span className="font-semibold text-[#3A0A0F] font-mono">{formatCurrency(subtotal)}</span>
        </div>
        <div className="flex justify-between text-[#6B4F48]">
          <span>GST / Taxes (5%)</span>
          <span className="font-semibold text-[#3A0A0F] font-mono">{formatCurrency(tax)}</span>
        </div>
        <div className="flex justify-between pt-2 border-t border-[#EAD8C0] text-base font-black text-[#3A0A0F]">
          <span>Total Payable</span>
          <span className="text-[#3A0A0F] font-mono font-black">{formatCurrency(total)}</span>
        </div>
      </div>

      {/* Always Floating Bottom Proceed Button */}
      <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto p-4 z-40 bg-gradient-to-t from-[#F8EFE6] via-[#F8EFE6]/95 to-transparent pt-6 pointer-events-none">
        <div className="pointer-events-auto">
          {isOrderingOpen ? (
            <button
              type="button"
              onClick={() => navigate(`/order/t/${qrToken}/order-type`)}
              className="w-full bg-[#3A0A0F] hover:bg-[#5B0F1B] active:scale-[0.98] text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between transition-all border border-white/10"
            >
              <div className="text-left">
                <p className="text-[10px] text-white/80 font-bold uppercase tracking-wider">Total Amount</p>
                <p className="text-lg font-black text-white font-mono leading-tight">{formatCurrency(total)}</p>
              </div>
              <div className="flex items-center gap-1.5 bg-white/15 px-4 py-2 rounded-xl text-sm font-bold text-white tracking-wide border border-white/20">
                <span>Proceed to Order Type</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </div>
            </button>
          ) : (
            <div className="w-full bg-white/95 backdrop-blur-md border border-[#EAD8C0] p-3.5 sm:p-4 rounded-3xl shadow-2xl flex items-center justify-between gap-3 transition-all">
              <div className="text-left shrink-0">
                <p className="text-xl font-black text-[#1E293B] font-mono leading-tight">{formatCurrency(total)}</p>
                <p className="text-xs font-bold text-[#8C232C] mt-0.5">Total Bill</p>
              </div>
              <button
                type="button"
                disabled
                className="cursor-not-allowed bg-[#A86B6B] text-white px-5 py-3 rounded-full font-bold text-sm shadow-sm transition-all text-center select-none shrink-0"
              >
                {closedButtonText}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerCartPage;
