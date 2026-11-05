import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Loader2,
  Smartphone,
  AlertTriangle,
  RotateCcw,
  Banknote,
  Utensils,
} from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '@/api/client';
import publicApi from '@/api/public';
import useCartStore from '@/store/cart';
import { playNotificationSound } from '@/lib/sound';
import { formatCurrency } from '@/lib/utils';

export const PhonePeCheckoutPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const mtid = searchParams.get('mtid') || '';
  const initialAmount = searchParams.get('amount') || '';
  const urlOrderId = searchParams.get('orderId') || '';
  const urlQrToken = searchParams.get('qrToken') || '';

  const [isLoading, setIsLoading] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [paymentData, setPaymentData] = useState<any>(null);
  const [paymentStatus, setPaymentStatus] = useState<'PENDING' | 'PAID' | 'FAILED'>('PENDING');

  const cartItems = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);

  const targetOrderId =
    paymentData?.order?.id ||
    paymentData?.order_id ||
    urlOrderId;

  const targetQrToken =
    urlQrToken ||
    paymentData?.order?.qr_token_id ||
    paymentData?.order?.qrToken ||
    paymentData?.order?.table?.qr_token ||
    paymentData?.order?.table?.qrToken ||
    'main';

  useEffect(() => {
    if (!mtid) return;

    let isMounted = true;
    const fetchStatus = () => {
      apiClient
        .get(`/payments/${mtid}/status`)
        .then((res) => {
          if (!isMounted) return;
          const data = res.data?.data || res.data;
          setPaymentData(data);
          const resolvedId = data?.order?.id || data?.order_id || urlOrderId;
          const resolvedQrToken =
            urlQrToken ||
            data?.order?.qr_token_id ||
            data?.order?.qrToken ||
            data?.order?.table?.qr_token ||
            data?.order?.table?.qrToken ||
            'main';

          if (data.paymentStatus === 'PAID') {
            setPaymentStatus('PAID');
            clearCart();
            if (resolvedId) {
              setTimeout(() => {
                navigate(`/order/t/${resolvedQrToken}/confirmation/${resolvedId}`);
              }, 1200);
            }
          } else if (data.paymentStatus === 'FAILED') {
            setPaymentStatus('FAILED');
          }
        })
        .catch((err) => {
          console.error('Failed to fetch payment status', err);
        });
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [mtid, navigate, urlOrderId, urlQrToken, clearCart]);

  const amountToDisplay = Number(paymentData?.amount || initialAmount || 0);

  // Derive order items to show customer what they ordered (even if payment failed)
  const orderItems = useMemo(() => {
    if (
      paymentData?.order?.items &&
      Array.isArray(paymentData.order.items) &&
      paymentData.order.items.length > 0
    ) {
      return paymentData.order.items.map((it: any) => ({
        id: it.id,
        name: it.item_name_snapshot || it.name || 'Item',
        quantity: it.quantity,
        price: Number(it.unit_price_snapshot || it.unitPrice || 0),
        total: Number(
          it.line_total ||
            it.totalPrice ||
            (it.quantity || 1) * Number(it.unit_price_snapshot || it.unitPrice || 0)
        ),
        customizations: it.customization_snapshot || it.customizations || [],
      }));
    }
    return cartItems.map((ci) => ({
      id: ci.cartItemId,
      name: ci.menuItem.name,
      quantity: ci.quantity,
      price: ci.unitPrice,
      total: ci.lineTotal,
      customizations: ci.customizations || [],
    }));
  }, [paymentData, cartItems]);

  const handleSimulatePayment = async (status: 'SUCCESS' | 'FAILED') => {
    if (!mtid) {
      toast.error('Merchant Transaction ID missing');
      return;
    }

    setIsLoading(true);
    try {
      const code = status === 'SUCCESS' ? 'PAYMENT_SUCCESS' : 'PAYMENT_ERROR';
      const fakeTxnId = `UPI_REF_${Date.now()}`;

      const res = await apiClient.post('/payments/phonepe/webhook', {
        merchantTransactionId: mtid,
        code,
        transactionId: fakeTxnId,
        amount: Math.round(amountToDisplay * 100),
      });

      if (status === 'SUCCESS') {
        setPaymentStatus('PAID');
        clearCart();
        playNotificationSound();
        toast.success('Payment of ' + formatCurrency(amountToDisplay) + ' received via PhonePe UPI!');

        const resolvedTargetOrderId =
          res.data?.orderId ||
          res.data?.data?.orderId ||
          targetOrderId;

        const resolvedTargetQr =
          res.data?.qrToken ||
          res.data?.data?.qrToken ||
          targetQrToken;

        setTimeout(() => {
          if (resolvedTargetOrderId) {
            navigate(`/order/t/${resolvedTargetQr}/confirmation/${resolvedTargetOrderId}`);
          } else {
            navigate(`/order/t/${resolvedTargetQr}`);
          }
        }, 1200);
      } else {
        setPaymentStatus('FAILED');
        toast.error('Payment was not completed');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Payment simulation error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchToCounter = async () => {
    if (!targetOrderId) {
      toast.error('Order reference not found');
      return;
    }
    setIsSwitching(true);
    try {
      const switched = await publicApi.switchToCounter(targetOrderId);
      clearCart();
      toast.success('Switched to Pay at Counter! Please show reference to cashier.');
      navigate(`/order/t/${targetQrToken}/confirmation/${targetOrderId}`, {
        state: { order: switched, isPayAtCounter: true },
        replace: true,
      });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to switch to counter payment');
    } finally {
      setIsSwitching(false);
    }
  };

  const upiUri = `upi://pay?pa=thefoodtruck@phonepe&pn=The+Rolling+Gourmet&am=${amountToDisplay.toFixed(2)}&tr=${mtid}&tn=Order+Payment`;

  return (
    <div className="min-h-screen bg-[#F8EFE6] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#FDF6EC] rounded-3xl shadow-xl overflow-hidden border border-[#EAD8C0]">
        {/* PhonePe Header */}
        <div className="bg-[#5f259f] px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center font-black text-xl tracking-tighter">
              पे
            </div>
            <div>
              <h1 className="font-extrabold text-lg leading-tight tracking-tight">PhonePe Payment</h1>
              <p className="text-[11px] text-purple-200 font-medium flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> 100% Secure 256-Bit UPI Gateway
              </p>
            </div>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
            Sandbox
          </span>
        </div>

        {/* Payment Content */}
        <div className="p-6 space-y-6">
          {/* Amount Box */}
          <div className="text-center bg-[#FAF4F2] border border-[#EAD8C0] rounded-2xl p-4">
            <span className="text-xs font-semibold text-[#5B0F1B] uppercase tracking-wider">
              Amount to Pay
            </span>
            <div className="text-3xl font-black text-[#3A0A0F] mt-1">
              ₹{amountToDisplay.toFixed(2)}
            </div>
            <p className="text-xs text-[#6B4F48] mt-0.5 font-medium">
              Merchant: <strong className="text-[#3A0A0F]">The Rolling Gourmet Food Truck</strong>
            </p>
            {mtid && (
              <p className="text-[10px] font-mono text-[#6B4F48] mt-1 truncate">
                Ref: {mtid}
              </p>
            )}
          </div>

          {/* Status Display: PAID */}
          {paymentStatus === 'PAID' ? (
            <div className="py-8 flex flex-col items-center text-center space-y-3">
              <div className="w-16 h-16 bg-[#DDF0E4] text-[#1F5A34] rounded-full flex items-center justify-center shadow-md animate-bounce">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h2 className="text-xl font-bold text-[#3A0A0F]">Payment Successful!</h2>
              <p className="text-xs text-[#6B4F48]">
                Your payment has been verified. Redirecting to your token confirmation slip...
              </p>
            </div>
          ) : paymentStatus === 'FAILED' ? (
            /* Status Display: FAILED with Order Details and Recovery Options */
            <div className="space-y-4">
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
                <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <XCircle className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-rose-950">Payment Unsuccessful</h2>
                  <p className="text-xs text-rose-700 mt-0.5 leading-relaxed">
                    Your UPI payment was cancelled or failed. Your order details are saved below — you can retry UPI or pay directly at the counter.
                  </p>
                </div>
              </div>

              {/* Order Items Breakdown */}
              {orderItems.length > 0 && (
                <div className="bg-[#FAF4F2] border border-[#EAD8C0] rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-[#3A0A0F] pb-1.5 border-b border-[#EAD8C0]">
                    <span className="flex items-center gap-1.5">
                      <Utensils className="w-3.5 h-3.5 text-[#5B0F1B]" />
                      <span>Items in Your Order</span>
                    </span>
                    <span className="text-[#6B4F48]">{orderItems.length} item(s)</span>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto divide-y divide-[#EAD8C0]/50 pr-1">
                    {orderItems.map((item: any, idx: number) => (
                      <div key={idx} className="pt-1.5 first:pt-0 flex justify-between items-start text-xs">
                        <div className="flex-1 pr-2">
                          <p className="font-semibold text-[#3A0A0F]">
                            {item.quantity} × {item.name}
                          </p>
                          {item.customizations && item.customizations.length > 0 && (
                            <p className="text-[10px] text-[#6B4F48]">
                              {item.customizations
                                .map((c: any) => c.optionName || c.option_name || c.name)
                                .join(', ')}
                            </p>
                          )}
                        </div>
                        <span className="font-mono font-bold text-[#3A0A0F] shrink-0">
                          {formatCurrency(item.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 border-t border-[#EAD8C0] flex justify-between items-center text-sm font-black text-[#3A0A0F]">
                    <span>Total Payable</span>
                    <span className="font-mono text-base text-[#3A0A0F]">
                      {formatCurrency(amountToDisplay)}
                    </span>
                  </div>
                </div>
              )}

              {/* Recovery Action Buttons */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  disabled={isSwitching}
                  onClick={() => setPaymentStatus('PENDING')}
                  className="w-full py-3.5 px-4 bg-[#5f259f] hover:bg-[#4d1e82] text-white font-bold rounded-2xl shadow-md flex items-center justify-center gap-2 text-sm transition-all active:scale-[0.98]"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Retry UPI Payment</span>
                </button>

                <button
                  type="button"
                  disabled={isSwitching}
                  onClick={handleSwitchToCounter}
                  className="w-full py-3.5 px-4 bg-[#3A0A0F] hover:bg-[#5B0F1B] text-white font-bold rounded-2xl shadow-md flex items-center justify-center gap-2 text-sm transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {isSwitching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Banknote className="w-4 h-4" />
                  )}
                  <span>Pay at Counter Instead</span>
                </button>

                <button
                  type="button"
                  disabled={isSwitching}
                  onClick={() => navigate(`/order/t/${targetQrToken}/cart`)}
                  className="w-full py-2 text-xs font-semibold text-[#6B4F48] hover:text-[#3A0A0F] flex items-center justify-center gap-1 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Cart / Edit Items</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Dynamic QR Code */}
              <div className="flex flex-col items-center justify-center space-y-3">
                <div className="p-3 bg-white border-2 border-[#EAD8C0] rounded-2xl shadow-xs">
                  <QRCodeSVG value={upiUri} size={180} level="M" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-[#3A0A0F]">Scan with any UPI App</p>
                  <p className="text-[11px] text-[#6B4F48]">Google Pay • PhonePe • Paytm • BHIM</p>
                </div>
              </div>

              {/* Simulation Action Buttons for Testing */}
              <div className="space-y-2 pt-2 border-t border-[#EAD8C0]">
                <div className="flex items-center gap-1.5 text-[11px] text-amber-800 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Developer Simulation Mode (PhonePe UPI Gateway Sandbox)</span>
                </div>

                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => handleSimulatePayment('SUCCESS')}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#5f259f] hover:bg-[#4d1e82] text-white font-bold rounded-xl shadow-md shadow-purple-900/20 transition-colors disabled:opacity-50 text-sm"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Smartphone className="w-4 h-4" />
                  )}
                  <span>Approve & Simulate UPI Payment ({formatCurrency(amountToDisplay)})</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleSimulatePayment('FAILED')}
                    className="py-2 px-3 border border-[#EAD8C0] bg-[#FAF4F2] hover:bg-[#EAD8C0]/40 text-[#3A0A0F] font-semibold rounded-xl text-xs transition-colors"
                  >
                    Simulate Failure
                  </button>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => navigate(`/order/t/${targetQrToken}/payment`)}
                    className="py-2 px-3 border border-[#EAD8C0] bg-[#FAF4F2] hover:bg-[#EAD8C0]/40 text-[#3A0A0F] font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-1"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    <span>Back to Payment</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PhonePeCheckoutPage;
