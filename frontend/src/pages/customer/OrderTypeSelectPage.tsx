import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useOutletContext } from 'react-router-dom';
import { Utensils, ShoppingBag, Check, ArrowLeft, ArrowRight } from 'lucide-react';
import { OrderType, OrderingStatus } from '@/types';

export const OrderTypeSelectPage: React.FC = () => {
  const { qrToken } = useParams<{ qrToken: string }>();
  const navigate = useNavigate();
  const context = useOutletContext<{ tableInfo?: { tableName: string }; orderingStatus?: OrderingStatus }>();

  const [selectedType, setSelectedType] = useState<OrderType | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    if (context?.orderingStatus && !context.orderingStatus.isOpen) {
      navigate(`/order/t/${qrToken}/cart`, { replace: true });
    }
  }, [context?.orderingStatus, qrToken, navigate]);

  const handleContinue = () => {
    if (!selectedType) return;
    // Pass selected order type to payment page via router state
    navigate(`/order/t/${qrToken}/payment`, {
      state: { orderType: selectedType },
    });
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-100px)] p-4 space-y-6 pb-28">
      {/* Back to Cart */}
      <button
        onClick={() => navigate(`/order/t/${qrToken}/cart`)}
        className="flex items-center gap-1.5 text-xs font-bold text-[#3A0A0F] hover:text-[#5B0F1B] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Cart</span>
      </button>

      {/* Headings */}
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-black text-[#3A0A0F] tracking-tight">
          How would you like to receive your order?
        </h2>
        <p className="text-xs text-[#6B4F48]">
          Please select your preferred dining option to proceed
        </p>
      </div>

      {/* Two Prominent Cards */}
      <div className="space-y-4 pt-2">
        {/* Dine-In Option */}
        <button
          type="button"
          onClick={() => setSelectedType(OrderType.DINE_IN)}
          className={`w-full p-6 rounded-2xl border-2 text-left transition-all relative flex items-center gap-4 ${
            selectedType === OrderType.DINE_IN
              ? 'border-[#3A0A0F] bg-[#FAF4F2] shadow-md ring-2 ring-[#3A0A0F]/20'
              : 'border-[#EAD8C0] bg-[#FDF6EC] hover:border-[#3A0A0F]/40'
          }`}
        >
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
              selectedType === OrderType.DINE_IN
                ? 'bg-[#3A0A0F] text-white shadow-md shadow-[#3A0A0F]/20'
                : 'bg-[#EAD8C0]/50 text-[#3A0A0F]'
            }`}
          >
            <Utensils className="w-7 h-7" />
          </div>

          <div className="flex-1">
            <h3 className="font-bold text-base text-[#3A0A0F]">Dine-In</h3>
            <p className="text-xs text-[#6B4F48] mt-0.5">
              {context?.tableInfo?.tableName
                ? `Enjoy your food served right at ${context.tableInfo.tableName}`
                : 'Enjoy your food in the dining area (Token will be called)'}
            </p>
          </div>

          {selectedType === OrderType.DINE_IN && (
            <div className="w-6 h-6 rounded-full bg-[#3A0A0F] text-white flex items-center justify-center shrink-0">
              <Check className="w-4 h-4 stroke-[3]" />
            </div>
          )}
        </button>

        {/* Takeaway Option */}
        <button
          type="button"
          onClick={() => setSelectedType(OrderType.TAKEAWAY)}
          className={`w-full p-6 rounded-2xl border-2 text-left transition-all relative flex items-center gap-4 ${
            selectedType === OrderType.TAKEAWAY
              ? 'border-[#3A0A0F] bg-[#FAF4F2] shadow-md ring-2 ring-[#3A0A0F]/20'
              : 'border-[#EAD8C0] bg-[#FDF6EC] hover:border-[#3A0A0F]/40'
          }`}
        >
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
              selectedType === OrderType.TAKEAWAY
                ? 'bg-[#3A0A0F] text-white shadow-md shadow-[#3A0A0F]/20'
                : 'bg-[#EAD8C0]/50 text-[#3A0A0F]'
            }`}
          >
            <ShoppingBag className="w-7 h-7" />
          </div>

          <div className="flex-1">
            <h3 className="font-bold text-base text-[#3A0A0F]">Takeaway (Parcel)</h3>
            <p className="text-xs text-[#6B4F48] mt-0.5">
              Packed fresh to take home or on the go
            </p>
          </div>

          {selectedType === OrderType.TAKEAWAY && (
            <div className="w-6 h-6 rounded-full bg-[#3A0A0F] text-white flex items-center justify-center shrink-0">
              <Check className="w-4 h-4 stroke-[3]" />
            </div>
          )}
        </button>
      </div>

      {/* Always Floating Bottom Continue Button */}
      <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto p-4 z-40 bg-gradient-to-t from-[#F8EFE6] via-[#F8EFE6]/95 to-transparent pt-6 pointer-events-none">
        <div className="pointer-events-auto">
          <button
            type="button"
            disabled={!selectedType}
            onClick={handleContinue}
            className={`w-full p-4 rounded-2xl shadow-2xl flex items-center justify-between transition-all border border-white/10 ${
              selectedType
                ? 'bg-[#3A0A0F] hover:bg-[#5B0F1B] active:scale-[0.98] text-white cursor-pointer'
                : 'bg-neutral-300 text-neutral-500 cursor-not-allowed opacity-80'
            }`}
          >
            <span className="text-xs font-bold uppercase tracking-wider">
              {selectedType
                ? `Selected: ${selectedType === OrderType.DINE_IN ? 'Dine-In' : 'Takeaway'}`
                : 'Choose Option Above'}
            </span>
            <div className="flex items-center gap-1.5 bg-white/15 px-4 py-2 rounded-xl text-sm font-bold tracking-wide border border-white/20">
              <span>Continue to Payment</span>
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderTypeSelectPage;
