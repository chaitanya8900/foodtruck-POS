import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { QrCode, Banknote, ArrowLeft, ArrowRight, Check, ShieldCheck } from 'lucide-react';

import publicApi from '@/api/public';
import useCartStore from '@/store/cart';
import { OrderType } from '@/types';
import { formatCurrency } from '@/lib/utils';

export const PaymentSelectPage: React.FC = () => {
  const { qrToken } = useParams<{ qrToken: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isSubmittingOrNavigatingRef = useRef(false);

  // Get orderType from navigation state, fallback to DINE_IN
  const orderType: OrderType = location.state?.orderType || OrderType.DINE_IN;

  const [paymentOption, setPaymentOption] = useState<'online_upi' | 'pay_at_counter'>('online_upi');

  const {
    items,
    getSubtotal,
    getTax,
    getTotal,
    specialInstructions,
  } = useCartStore();

  const subtotal = getSubtotal();
  const tax = getTax(5);
  const total = getTotal(5);

  const createOrderMutation = useMutation({
    mutationFn: publicApi.createQROrder,
    onSuccess: (data) => {
      isSubmittingOrNavigatingRef.current = true;
      if (paymentOption === 'online_upi' && data.paymentUrl) {
        // Keep cart intact in case customer fails payment, cancels, or presses back
        window.location.href = data.paymentUrl;
      } else {
        // Pay at counter (both Takeaway and Dine-In)
        // Directly navigate to confirmation page with order details and reference number
        navigate(`/order/t/${qrToken}/confirmation/${data.order.id}`, {
          state: { order: data.order, isPayAtCounter: true },
          replace: true,
        });
      }
    },
    onError: (err: any) => {
      isSubmittingOrNavigatingRef.current = false;
      toast.error(err.response?.data?.message || 'Failed to submit order. Please try again.');
    },
  });

  // Redirect back to menu ONLY if user directly visited this page with an empty cart
  useEffect(() => {
    if (
      items.length === 0 &&
      qrToken &&
      !isSubmittingOrNavigatingRef.current &&
      !createOrderMutation.isPending &&
      !createOrderMutation.isSuccess
    ) {
      navigate(`/order/t/${qrToken}`, { replace: true });
    }
  }, [items.length, qrToken, navigate, createOrderMutation.isPending, createOrderMutation.isSuccess]);

  const handleSubmitOrder = () => {
    if (!qrToken) return;
    if (items.length === 0) {
      toast.error('Your cart is empty');
      navigate(`/order/t/${qrToken}`);
      return;
    }

    isSubmittingOrNavigatingRef.current = true;
    createOrderMutation.mutate({
      qrToken,
      orderType,
      paymentOption,
      specialInstructions: specialInstructions || undefined,
      items: items.map((i) => ({
        menuItemId: i.menuItem.id,
        quantity: i.quantity,
        customizations: i.customizations,
        specialInstructions: i.specialInstructions,
      })),
    });
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-100px)] p-4 space-y-6 pb-28">
      {/* Back button */}
      <button
        onClick={() => navigate(`/order/t/${qrToken}/order-type`)}
        className="flex items-center gap-1.5 text-xs font-bold text-[#3A0A0F] hover:text-[#5B0F1B] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Change Order Type ({((orderType || '').toString().toUpperCase().includes('DINE')) ? 'Dine-In' : 'Takeaway'})</span>
      </button>

      <div className="space-y-1">
        <h2 className="text-2xl font-black text-[#3A0A0F] tracking-tight">Select Payment Method</h2>
        <p className="text-xs text-[#6B4F48]">
          Fast, contactless payments powered by secure UPI
        </p>
      </div>

      {/* Payment Options Cards */}
      <div className="space-y-3 pt-2">
        {/* Option 1: Pay Online (UPI / PhonePe) */}
        <button
          type="button"
          onClick={() => setPaymentOption('online_upi')}
          className={`w-full p-5 rounded-2xl border-2 text-left transition-all flex items-center gap-4 relative ${
            paymentOption === 'online_upi'
              ? 'border-[#3A0A0F] bg-[#FAF4F2] shadow-md ring-2 ring-[#3A0A0F]/20'
              : 'border-[#EAD8C0] bg-[#FDF6EC] hover:border-[#3A0A0F]/40'
          }`}
        >
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
              paymentOption === 'online_upi'
                ? 'bg-[#3A0A0F] text-white shadow-md shadow-[#3A0A0F]/20'
                : 'bg-[#EAD8C0]/50 text-[#3A0A0F]'
            }`}
          >
            <QrCode className="w-6 h-6" />
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-[#3A0A0F]">Pay Online (UPI)</h3>
              <span className="bg-[#EAD8C0] text-[#3A0A0F] text-[10px] font-bold px-2 py-0.5 rounded-full">
                PhonePe
              </span>
            </div>
            <p className="text-xs text-[#6B4F48] mt-0.5">
              Instant GPay, PhonePe, Paytm, BHIM UPI
            </p>
          </div>

          {paymentOption === 'online_upi' && (
            <div className="w-5 h-5 rounded-full bg-[#3A0A0F] text-white flex items-center justify-center shrink-0">
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </div>
          )}
        </button>

        {/* Option 2: Pay at Counter */}
        <button
          type="button"
          onClick={() => setPaymentOption('pay_at_counter')}
          className={`w-full p-5 rounded-2xl border-2 text-left transition-all flex items-center gap-4 relative ${
            paymentOption === 'pay_at_counter'
              ? 'border-[#3A0A0F] bg-[#FAF4F2] shadow-md ring-2 ring-[#3A0A0F]/20'
              : 'border-[#EAD8C0] bg-[#FDF6EC] hover:border-[#3A0A0F]/40'
          }`}
        >
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
              paymentOption === 'pay_at_counter'
                ? 'bg-[#5B0F1B] text-white shadow-md shadow-[#5B0F1B]/20'
                : 'bg-[#EAD8C0]/50 text-[#3A0A0F]'
            }`}
          >
            <Banknote className="w-6 h-6" />
          </div>

          <div className="flex-1">
            <h3 className="font-bold text-sm text-[#3A0A0F]">Pay at Counter</h3>
            <p className="text-xs text-[#6B4F48] mt-0.5">
              Submit order now, pay Cash or UPI at billing counter
            </p>
          </div>

          {paymentOption === 'pay_at_counter' && (
            <div className="w-5 h-5 rounded-full bg-[#3A0A0F] text-white flex items-center justify-center shrink-0">
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </div>
          )}
        </button>
      </div>

      {/* Order Summary box */}
      <div className="bg-[#FDF6EC] p-4 rounded-2xl border border-[#EAD8C0] space-y-2 text-xs">
        <h4 className="font-bold text-[#3A0A0F] pb-1 border-b border-[#EAD8C0]">Order Summary</h4>
        <div className="flex justify-between text-[#6B4F48]">
          <span>Service Type</span>
          <span className="font-bold capitalize text-[#3A0A0F]">
            {((orderType || '').toString().toUpperCase().includes('DINE')) ? 'Dine-In' : 'Takeaway'}
          </span>
        </div>
        <div className="flex justify-between text-[#6B4F48]">
          <span>Items ({items.length})</span>
          <span className="font-semibold text-[#3A0A0F]">{formatCurrency(subtotal)}</span>
        </div>
        <div className="flex justify-between text-[#6B4F48]">
          <span>GST / Taxes</span>
          <span className="font-semibold text-[#3A0A0F] font-mono">{formatCurrency(tax)}</span>
        </div>
        <div className="flex justify-between pt-2 border-t border-[#EAD8C0] text-base font-black text-[#3A0A0F]">
          <span>Total Payable</span>
          <span className="text-[#3A0A0F] font-mono font-black">{formatCurrency(total)}</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5 text-xs text-[#6B4F48]">
        <ShieldCheck className="w-4 h-4 text-[#1F5A34]" />
        <span>100% Safe & Secure Encryption</span>
      </div>

      {/* Always Floating Bottom Pay Now / Confirm Button */}
      <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto p-4 z-40 bg-gradient-to-t from-[#F8EFE6] via-[#F8EFE6]/95 to-transparent pt-6 pointer-events-none">
        <div className="pointer-events-auto">
          <button
            type="button"
            onClick={handleSubmitOrder}
            disabled={createOrderMutation.isPending}
            className="w-full bg-[#3A0A0F] hover:bg-[#5B0F1B] active:scale-[0.98] disabled:opacity-60 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between transition-all border border-white/10"
          >
            <div className="text-left">
              <p className="text-[10px] text-white/80 font-bold uppercase tracking-wider">
                {paymentOption === 'online_upi' ? 'Pay Via UPI' : 'Pay at Counter'}
              </p>
              <p className="text-lg font-black text-white font-mono leading-tight">{formatCurrency(total)}</p>
            </div>
            <div className="flex items-center gap-1.5 bg-white/15 px-4 py-2 rounded-xl text-sm font-bold text-white tracking-wide border border-white/20">
              {createOrderMutation.isPending ? (
                <span>Placing order...</span>
              ) : paymentOption === 'online_upi' ? (
                <>
                  <span>Pay Now</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </>
              ) : (
                <>
                  <span>Confirm Order</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </>
              )}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentSelectPage;
