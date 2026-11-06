import React, { useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, ArrowRight } from 'lucide-react';
import publicApi from '@/api/public';
import useCartStore from '@/store/cart';
import { Order, OrderStatus, PaymentStatus } from '@/types';
import { formatCurrency, formatTime } from '@/lib/utils';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';

export const OrderConfirmationPage: React.FC = () => {
  const { qrToken, orderId } = useParams<{ qrToken: string; orderId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // Safely clear cart now that confirmation page has mounted and reset scroll to top
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    useCartStore.getState().clearCart();
  }, []);

  // State passed from payment page if available
  const initialOrder: Order | undefined = location.state?.order;

  // Poll order status to show live updates when counter cashier confirms
  const { data: order, isLoading } = useQuery({
    queryKey: ['publicOrderStatus', orderId],
    queryFn: () => (orderId ? publicApi.getOrderStatus(orderId) : Promise.reject('No ID')),
    initialData: initialOrder,
    enabled: !!orderId,
    refetchInterval: (query) => {
      // Poll every 2 seconds if pending payment or waiting for cashier token issuance
      const current = query.state.data as any;
      const hasIssuedToken = !!(current?.tokenNumber || current?.token_number);
      if (!current || !hasIssuedToken || current.paymentStatus === PaymentStatus.PENDING || current.payment_status === 'PENDING') {
        return 2000;
      }
      return 10000;
    },
  });

  if (isLoading && !order) {
    return (
      <div className="py-24 flex items-center justify-center">
        <Spinner label="Loading your order status..." />
      </div>
    );
  }

  const rawOrder: any = order;
  const tokenNumber = rawOrder?.tokenNumber || rawOrder?.token_number;
  const orderNumber = rawOrder?.orderNumber || rawOrder?.order_number || '';
  const displayToken = tokenNumber ? (tokenNumber.startsWith('#') ? tokenNumber : `#${tokenNumber}`) : '';
  const displayReference = orderNumber ? (orderNumber.startsWith('#') ? orderNumber : `#${orderNumber}`) : '...';
  const totalAmount = Number(rawOrder?.grandTotal ?? rawOrder?.total_amount ?? 0);
  const isPaid = rawOrder?.paymentStatus === PaymentStatus.PAID || rawOrder?.payment_status === 'PAID';
  const hasToken = !!tokenNumber;
  const isConfirmed = hasToken || (rawOrder?.orderStatus && rawOrder.orderStatus !== OrderStatus.PENDING_PAYMENT) || (rawOrder?.order_status && rawOrder.order_status !== 'PENDING_PAYMENT');
  const isPayAtCounter: boolean = location.state?.isPayAtCounter ?? (!isPaid && !hasToken);
  const isTakeaway = (rawOrder?.orderType || rawOrder?.order_type || '').toString().toUpperCase().includes('TAKE');
  const itemsList = Array.isArray(rawOrder?.items) ? rawOrder.items : [];

  return (
    <div className="flex flex-col min-h-[calc(100vh-80px)] p-5 space-y-6 text-center max-w-md mx-auto w-full">
      {/* Status Graphic */}
      <div className="pt-6 flex flex-col items-center">
        {hasToken || isPaid || isConfirmed ? (
          <div className="w-20 h-20 rounded-full bg-[#DDF0E4] text-[#1F5A34] flex items-center justify-center shadow-lg shadow-[#1F5A34]/10 mb-4 animate-bounce">
            <CheckCircle2 className="w-12 h-12 stroke-[2.5]" />
          </div>
        ) : (
          <div className="w-20 h-20 rounded-full bg-[#FAF4F2] text-[#5B0F1B] flex items-center justify-center shadow-lg shadow-[#5B0F1B]/10 mb-4">
            <Clock className="w-12 h-12 stroke-[2.5]" />
          </div>
        )}

        <h2 className="text-2xl font-black text-[#3A0A0F] tracking-tight">
          {hasToken
            ? 'Order Confirmed!'
            : isPaid
            ? 'Payment Successful!'
            : isPayAtCounter
            ? 'Order Placed at Counter'
            : 'Order Received!'}
        </h2>

        <p className="text-xs text-[#6B4F48] mt-1 max-w-xs mx-auto leading-relaxed">
          {hasToken
            ? 'Your token is active and your food is being prepared in the kitchen.'
            : isPaid
            ? 'Payment verified! Your order is waiting for counter token issuance.'
            : 'Please proceed to the billing counter, share this reference number to pay, and collect your token.'}
        </p>
      </div>

      {/* Customer Token / Order Reference Box */}
      <div className="bg-[#FAF4F2] border-2 border-[#EAD8C0] rounded-3xl p-6 shadow-inner space-y-2">
        <span className="text-xs font-bold uppercase tracking-widest text-[#6B4F48]">
          {hasToken ? 'Your Token Number' : 'Order Reference'}
        </span>
        <div className="text-4xl font-black text-[#3A0A0F] font-mono tracking-tight">
          {hasToken ? displayToken : displayReference}
        </div>
        <p className="text-xs text-[#6B4F48] font-medium">
          {hasToken
            ? 'Please listen for this token number when picking up food'
            : isPaid
            ? 'Share this reference with the cashier to collect your token'
            : 'Share this order reference with the cashier at the counter'}
        </p>
        {!hasToken && (
          <div className="pt-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#EAD8C0]/50 text-[#3A0A0F] rounded-full text-[11px] font-bold animate-pulse">
              <Clock className="w-3.5 h-3.5" />
              {isPaid
                ? 'Payment received! Waiting for cashier to issue token...'
                : 'Waiting for counter payment confirmation...'}
            </span>
          </div>
        )}
      </div>

      {/* Order Details Card */}
      {rawOrder && (
        <div className="bg-[#FDF6EC] rounded-2xl border border-[#EAD8C0] p-4 text-left space-y-3 text-xs shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-[#EAD8C0] font-bold text-[#3A0A0F]">
            <div className="flex items-center gap-2">
              <span>Order Summary</span>
              <span
                className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  isTakeaway ? 'bg-[#EAD8C0] text-[#3A0A0F]' : 'bg-[#DDF0E4] text-[#1F5A34]'
                }`}
              >
                {isTakeaway ? 'Takeaway' : 'Dine-In'}
              </span>
            </div>
            <span className="font-mono text-[#6B4F48]">
              {formatTime(rawOrder.createdAt || rawOrder.created_at)}
            </span>
          </div>

          <div className="space-y-1.5 divide-y divide-[#EAD8C0]/40">
            {itemsList.map((item: any, idx: number) => {
              const itemName = item.name || item.item_name_snapshot || 'Item';
              const itemTotal = Number(
                item.totalPrice ?? item.line_total ??
                (Number(item.unitPrice ?? item.unit_price_snapshot ?? 0) * (item.quantity || 1))
              );
              const customSnapshot = item.customizations || item.customization_snapshot;
              return (
                <div key={idx} className="pt-1.5 space-y-0.5">
                  <div className="flex justify-between">
                    <span className="text-[#3A0A0F] font-semibold">
                      {item.quantity} × {itemName}
                    </span>
                    <span className="text-[#3A0A0F] font-bold font-mono">
                      {formatCurrency(itemTotal)}
                    </span>
                  </div>
                  {Array.isArray(customSnapshot) && customSnapshot.length > 0 && (
                    <p className="text-[11px] text-[#6B4F48] pl-4">
                      {customSnapshot.map((c: any) => c.optionName || c.option_name || c.name).join(', ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[#EAD8C0] font-extrabold text-sm text-[#3A0A0F]">
            <span>Total Amount</span>
            <span className="text-[#3A0A0F] font-mono font-black">{formatCurrency(totalAmount)}</span>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="pt-4 mt-auto space-y-3">
        <Button
          type="button"
          variant="primary"
          size="lg"
          rightIcon={<ArrowRight className="w-4 h-4 ml-1.5 shrink-0 inline-block" />}
          onClick={() => {
            const token =
              qrToken ||
              (rawOrder as any)?.qrToken ||
              (rawOrder as any)?.qr_token_id ||
              (rawOrder as any)?.table?.qr_token ||
              (rawOrder as any)?.table?.qrToken ||
              'main';
            navigate(`/order/t/${token}`);
          }}
          className="w-full font-bold shadow-md shadow-[#3A0A0F]/20 flex items-center justify-center whitespace-nowrap"
        >
          Order More Items
        </Button>
      </div>
    </div>
  );
};

export default OrderConfirmationPage;
