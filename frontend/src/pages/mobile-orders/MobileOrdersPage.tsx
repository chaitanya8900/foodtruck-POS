import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Clock,
  Printer,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Utensils,
  ShoppingBag,
  Search,
} from 'lucide-react';

import mobileOrdersApi, { ConfirmPaymentPayload, normalizeOrder } from '@/api/mobile-orders';
import printJobsApi from '@/api/print-jobs';
import { useSocketEvent } from '@/hooks/useSocket';
import { Order, OrderType, PaymentMethod, DocumentType, OrderStatus, PaymentStatus } from '@/types';
import { formatCurrency, formatTime } from '@/lib/utils';

import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';

export const MobileOrdersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'pending' | 'ready' | 'confirmed'>('pending');
  const [searchQuery, setSearchQuery] = useState('');

  // Payment Confirmation Modal State
  const [paymentModalOrder, setPaymentModalOrder] = useState<Order | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [paymentReference, setPaymentReference] = useState('');
  const [amountReceived, setAmountReceived] = useState('');
  const [confirmedTokenOrder, setConfirmedTokenOrder] = useState<Order | null>(null);

  // Unified single query for all mobile orders with in-memory caching for instant page transitions
  const { data: allMobileOrders = [], isLoading } = useQuery({
    queryKey: ['mobileOrders'],
    queryFn: () => mobileOrdersApi.getMobileOrders(),
    staleTime: 60 * 1000,
    refetchInterval: 15 * 1000,
  });

  const isMobileQROrder = (order: any): boolean => {
    if (!order) return false;
    const source = (order.source || order.order_source || '').toString().toUpperCase();
    const orderNumber = (order.orderNumber || order.order_number || '').toString().toUpperCase();

    // Explicitly reject any POS counter orders
    if (source === 'POS' || orderNumber.startsWith('POS-')) {
      return false;
    }

    return (
      source === 'QR' ||
      source === 'MOBILE' ||
      orderNumber.startsWith('QR-') ||
      Boolean(order.qrToken) ||
      Boolean(order.qr_token_id)
    );
  };

  // Direct, instantaneous cache updater from WebSocket events
  const updateOrderInCache = (rawOrder: any) => {
    if (!rawOrder || !rawOrder.id) return;
    if (!isMobileQROrder(rawOrder)) return;
    const incoming = normalizeOrder(rawOrder);
    queryClient.setQueryData<Order[]>(['mobileOrders'], (old = []) => {
      const idx = old.findIndex((o) => o.id === incoming.id);
      if (idx >= 0) {
        const copy = [...old];
        copy[idx] = { ...copy[idx], ...incoming };
        return copy;
      }
      return [incoming, ...old];
    });
  };

  // Instantaneous live updates via Socket.IO directly into state (0ms latency)
  useSocketEvent('new_mobile_order', (newOrder: any) => {
    updateOrderInCache(newOrder);
  });

  useSocketEvent('new_order', (newOrder: any) => {
    if (isMobileQROrder(newOrder)) {
      updateOrderInCache(newOrder);
    }
  });

  useSocketEvent('order_payment_received', (paidOrder: any) => {
    if (isMobileQROrder(paidOrder)) {
      updateOrderInCache(paidOrder);
    }
  });

  useSocketEvent('order_updated', (updatedOrder: any) => {
    if (isMobileQROrder(updatedOrder)) {
      updateOrderInCache(updatedOrder);
    }
  });

  // Split tabs in memory without duplicate network calls
  const pendingOrders = useMemo(() => {
    const today = new Date();
    const todayY = today.getFullYear();
    const todayM = today.getMonth();
    const todayD = today.getDate();

    return allMobileOrders.filter((o) => {
      const isPaid = o.paymentStatus === PaymentStatus.PAID || (o as any).payment_status === 'PAID';
      const isCancelled = o.orderStatus === OrderStatus.CANCELLED || (o as any).order_status === 'CANCELLED';
      const hasToken = !!(o.tokenNumber || (o as any).token_number);
      if (isPaid || hasToken || isCancelled) return false;

      // Pending payment tab refreshes everyday: only show today's pay-at-counter orders
      const orderDate = new Date(o.createdAt || (o as any).created_at);
      const isToday =
        orderDate.getFullYear() === todayY &&
        orderDate.getMonth() === todayM &&
        orderDate.getDate() === todayD;

      return isToday;
    });
  }, [allMobileOrders]);

  const readyOrders = useMemo(() => {
    return allMobileOrders.filter((o) => {
      const isPaid = o.paymentStatus === 'PAID' || (o as any).payment_status === 'PAID';
      const isCancelled = o.orderStatus === OrderStatus.CANCELLED || (o as any).order_status === 'CANCELLED';
      const hasKot = Boolean((o as any).hasKotPrinted || (o as any).has_kot_printed || (o as any).kot_printed);
      return isPaid && !isCancelled && !hasKot;
    });
  }, [allMobileOrders]);

  const confirmedOrders = useMemo(() => {
    return allMobileOrders.filter((o) => {
      const isCancelled = o.orderStatus === OrderStatus.CANCELLED || (o as any).order_status === 'CANCELLED';
      const hasToken = !!(o.tokenNumber || (o as any).token_number);
      const hasKot = Boolean((o as any).hasKotPrinted || (o as any).has_kot_printed || (o as any).kot_printed);
      return hasToken && !isCancelled && hasKot;
    });
  }, [allMobileOrders]);

  // Confirm payment mutation
  const confirmPaymentMutation = useMutation({
    mutationFn: ({ orderId, payload }: { orderId: string; payload: ConfirmPaymentPayload }) =>
      mobileOrdersApi.confirmMobileOrderPayment(orderId, payload),
    onSuccess: (updated) => {
      toast.success(`Payment confirmed! Token #${updated.tokenNumber || updated.orderNumber} issued & printed.`);
      setPaymentModalOrder(null);
      setPaymentReference('');
      setAmountReceived('');
      setConfirmedTokenOrder(updated);
      updateOrderInCache(updated);
      queryClient.invalidateQueries({ queryKey: ['mobileOrders'] });
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Payment confirmation failed';
      toast.error(msg);
    },
  });

  // Print KOT mutation (for prepaid orders that already have assigned token)
  const printKOTMutation = useMutation({
    mutationFn: (orderId: string) => mobileOrdersApi.printKOT(orderId),
    onSuccess: (updated) => {
      toast.success(`KOT Printed for Token #${updated.tokenNumber || updated.orderNumber}!`);
      updateOrderInCache(updated);
      queryClient.invalidateQueries({ queryKey: ['mobileOrders'] });
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to print KOT';
      toast.error(msg);
    },
  });

  // Reprint mutation
  const reprintMutation = useMutation({
    mutationFn: ({ orderId, docType }: { orderId: string; docType?: DocumentType }) =>
      printJobsApi.reprintOrder(orderId, docType),
    onSuccess: () => {
      toast.success('Reprint job queued for thermal printer');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to trigger reprint');
    },
  });

  // Cancel order mutation
  const cancelOrderMutation = useMutation({
    mutationFn: (orderId: string) => mobileOrdersApi.cancelMobileOrder(orderId, 'Cancelled at counter'),
    onSuccess: (_, orderId) => {
      toast.success('Order cancelled');
      queryClient.setQueryData<Order[]>(['mobileOrders'], (old = []) =>
        old.filter((o) => o.id !== orderId)
      );
      queryClient.invalidateQueries({ queryKey: ['mobileOrders'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to cancel order');
    },
  });

  const handleOpenPaymentModal = (order: Order) => {
    setPaymentModalOrder(order);
    setSelectedPaymentMethod(PaymentMethod.CASH);
    setPaymentReference('');
    const total = Number(order.grandTotal ?? (order as any).total_amount ?? 0);
    setAmountReceived(total > 0 ? total.toFixed(2) : '');
  };

  const handleConfirmPayment = () => {
    if (!paymentModalOrder) return;
    confirmPaymentMutation.mutate({
      orderId: paymentModalOrder.id,
      payload: {
        paymentMethod: selectedPaymentMethod,
        transactionReference: paymentReference || undefined,
        amountReceived: amountReceived ? parseFloat(amountReceived) : undefined,
      },
    });
  };

  const filterOrders = (orders: Order[]) => {
    if (!searchQuery.trim()) return orders;
    const q = searchQuery.toLowerCase().trim();
    return orders.filter((o) => {
      const num = (o.orderNumber || (o as any).order_number || '').toLowerCase();
      const token = (o.tokenNumber || (o as any).token_number || '').toLowerCase();
      const table = (o.table?.tableName || (o.table as any)?.table_name || '').toLowerCase();
      return num.includes(q) || token.includes(q) || table.includes(q);
    });
  };

  const filteredPending = filterOrders(pendingOrders);
  const filteredReady = filterOrders(readyOrders);
  const filteredConfirmed = filterOrders(confirmedOrders);

  return (
    <div className="h-full flex flex-col bg-[#F8EFE6] overflow-hidden">
      {/* Page Title & Tabs Navigation */}
      <div className="bg-[#FDF6EC] border-b border-[#EAD8C0] px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-xl font-extrabold text-[#3A0A0F] tracking-tight">Mobile QR Orders</h2>
          <p className="text-xs text-[#6B4F48]">Manage customer self-service QR submissions</p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Quick Search for 4-digit reference code or table */}
          <div className="relative min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#6B4F48]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 4-digit code (e.g. 5304)..."
              className="w-full pl-9 pr-7 py-2 text-xs rounded-xl bg-[#FAF4F2] border border-[#EAD8C0] text-[#3A0A0F] placeholder:text-[#6B4F48]/60 focus:outline-none focus:border-[#3A0A0F] focus:ring-1 focus:ring-[#3A0A0F]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#6B4F48] hover:text-[#3A0A0F] font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* 3-Tab Selector */}
          <div className="flex items-center gap-2 bg-[#FAF4F2] border border-[#EAD8C0] p-1.5 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('pending')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all min-h-[40px] ${
                activeTab === 'pending'
                  ? 'bg-[#3A0A0F] text-white shadow-md shadow-[#3A0A0F]/20'
                  : 'text-[#6B4F48] hover:text-[#3A0A0F]'
              }`}
            >
              <span>Pending Payment</span>
              {pendingOrders.length > 0 && (
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold ${
                  activeTab === 'pending' ? 'bg-[#5B0F1B] text-white border border-white/20' : 'bg-[#EAD8C0] text-[#3A0A0F]'
                }`}>
                  {pendingOrders.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ready')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all min-h-[40px] relative ${
                activeTab === 'ready'
                  ? 'bg-[#3A0A0F] text-white shadow-md shadow-[#3A0A0F]/20'
                  : 'text-[#6B4F48] hover:text-[#3A0A0F]'
              }`}
            >
              <span>Ready for Token</span>
              {readyOrders.length > 0 && (
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold ${
                  activeTab === 'ready' ? 'bg-[#5B0F1B] text-white border border-white/20' : 'bg-[#EAD8C0] text-[#3A0A0F]'
                }`}>
                  {readyOrders.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('confirmed')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all min-h-[40px] ${
                activeTab === 'confirmed'
                  ? 'bg-[#3A0A0F] text-white shadow-md shadow-[#3A0A0F]/20'
                  : 'text-[#6B4F48] hover:text-[#3A0A0F]'
              }`}
            >
              <span>Confirmed</span>
              {confirmedOrders.length > 0 && (
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold ${
                  activeTab === 'confirmed' ? 'bg-[#5B0F1B] text-white border border-white/20' : 'bg-[#EAD8C0] text-[#3A0A0F]'
                }`}>
                  {confirmedOrders.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* ================= TAB 1: PENDING PAYMENT ================= */}
        {activeTab === 'pending' && (
          <div>
            {isLoading && allMobileOrders.length === 0 ? (
              <div className="py-20 flex justify-center">
                <Spinner label="Loading pending orders..." />
              </div>
            ) : filteredPending.length === 0 ? (
              <EmptyState
                icon={<Clock className="w-8 h-8 text-[#5B0F1B]" />}
                title={searchQuery ? `No orders matching "${searchQuery}"` : "No Pending Orders"}
                description={searchQuery ? "Try searching by another 4-digit code or table." : "When customers place 'Pay at Counter' orders via QR, they will appear here."}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredPending.map((order) => (
                  <div
                    key={order.id}
                    className="bg-[#FDF6EC] rounded-2xl border-2 border-[#EAD8C0] shadow-sm p-5 flex flex-col justify-between transition-all hover:border-[#3A0A0F] hover:shadow-md"
                  >
                    <div className="space-y-3">
                      {/* Top Badges */}
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm font-extrabold text-[#3A0A0F]">
                          #{order.orderNumber || (order as any).order_number || '-'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="bg-[#EAD8C0] text-[#3A0A0F] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                            Pay At Counter
                          </span>
                          <span className="text-xs text-[#6B4F48] flex items-center gap-1 font-mono">
                            <Clock className="w-3.5 h-3.5" />
                            {formatTime(order.createdAt || (order as any).created_at)}
                          </span>
                        </div>
                      </div>

                      {/* Dine-In / Takeaway & Table Info */}
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        {(order.orderType === OrderType.DINE_IN || (order as any).order_type === 'DINE_IN') ? (
                          <span className="flex items-center gap-1 bg-[#DDF0E4] text-[#1F5A34] px-2.5 py-1 rounded-lg border border-[#BCE1C7]">
                            <Utensils className="w-3.5 h-3.5" />
                            Dine-In {(order.table?.tableName || (order.table as any)?.table_name) ? `(${order.table?.tableName || (order.table as any)?.table_name})` : ''}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 bg-[#EAD8C0] text-[#3A0A0F] px-2.5 py-1 rounded-lg border border-[#EAD8C0]">
                            <ShoppingBag className="w-3.5 h-3.5" />
                            Takeaway
                          </span>
                        )}
                      </div>

                      {/* Items List */}
                      <div className="bg-[#FAF4F2] rounded-xl p-3 divide-y divide-[#EAD8C0]/60 text-xs">
                        {(order.items || []).map((item: any, idx) => {
                          const itemName = item.name || item.item_name_snapshot || 'Item';
                          const itemTotal = Number(item.totalPrice ?? item.line_total ?? (Number(item.unitPrice ?? item.unit_price_snapshot ?? 0) * (item.quantity || 1)));
                          return (
                            <div key={idx} className="py-1.5 flex justify-between">
                              <span className="font-medium text-[#3A0A0F]">
                                {item.quantity} × {itemName}
                              </span>
                              <span className="font-semibold text-[#3A0A0F] font-mono">
                                {formatCurrency(itemTotal)}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {order.specialInstructions && (
                        <p className="text-xs text-amber-900 bg-amber-50 p-2 rounded-lg border border-amber-200 italic">
                          "{order.specialInstructions}"
                        </p>
                      )}
                    </div>

                    {/* Total & Action Buttons */}
                    <div className="pt-4 mt-3 border-t border-[#EAD8C0] flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] text-[#6B4F48] uppercase font-semibold">Payable</p>
                        <p className="text-lg font-bold text-[#3A0A0F] font-mono">
                          {formatCurrency(Number(order.grandTotal ?? (order as any).total_amount ?? 0))}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => cancelOrderMutation.mutate(order.id)}
                          isLoading={cancelOrderMutation.isPending && cancelOrderMutation.variables === order.id}
                          disabled={cancelOrderMutation.isPending}
                          className="text-red-700 hover:bg-red-50"
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="primary"
                          size="md"
                          onClick={() => handleOpenPaymentModal(order)}
                          className="bg-[#3A0A0F] hover:bg-[#5B0F1B] font-bold"
                        >
                          Confirm Payment
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: READY TO ISSUE TOKEN ================= */}
        {activeTab === 'ready' && (
          <div>
            {isLoading && allMobileOrders.length === 0 ? (
              <div className="py-20 flex justify-center">
                <Spinner label="Loading ready orders..." />
              </div>
            ) : filteredReady.length === 0 ? (
              <EmptyState
                icon={<CreditCard className="w-8 h-8 text-[#1F5A34]" />}
                title={searchQuery ? `No orders matching "${searchQuery}"` : "No Prepaid Orders Waiting"}
                description={searchQuery ? "Try searching by another 4-digit code or table." : "Prepaid online PhonePe orders ready for KOT printing will show up here."}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredReady.map((order) => (
                  <div
                    key={order.id}
                    className="bg-[#FDF6EC] rounded-2xl border-2 border-[#EAD8C0] shadow-sm p-5 flex flex-col justify-between transition-all hover:border-[#3A0A0F] hover:shadow-md"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="font-mono text-xl font-black text-[#3A0A0F] tracking-tight">
                            {order.tokenNumber
                              ? (order.tokenNumber.toString().startsWith('#')
                                  ? order.tokenNumber
                                  : `#${order.tokenNumber}`)
                              : ((order as any).token_number
                                  ? `#${(order as any).token_number}`
                                  : `#${order.orderNumber || (order as any).order_number || '-'}`)}
                          </span>
                          <span className="font-mono text-[11px] text-[#6B4F48]">
                            Ref: #{order.orderNumber || (order as any).order_number || '-'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="bg-[#DDF0E4] text-[#1F5A34] text-[10px] font-bold px-2 py-0.5 rounded-full border border-[#BCE1C7] uppercase">
                            Paid Online (UPI)
                          </span>
                          <span className="text-xs text-[#6B4F48] flex items-center gap-1 font-mono">
                            <Clock className="w-3.5 h-3.5" />
                            {formatTime(order.createdAt || (order as any).created_at)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs font-semibold">
                        {(order.orderType === OrderType.DINE_IN || (order as any).order_type === 'DINE_IN') ? (
                          <span className="flex items-center gap-1 bg-[#DDF0E4] text-[#1F5A34] px-2.5 py-1 rounded-lg border border-[#BCE1C7]">
                            <Utensils className="w-3.5 h-3.5" />
                            Dine-In {(order.table?.tableName || (order.table as any)?.table_name) ? `(${order.table?.tableName || (order.table as any)?.table_name})` : ''}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 bg-[#EAD8C0] text-[#3A0A0F] px-2.5 py-1 rounded-lg border border-[#EAD8C0]">
                            <ShoppingBag className="w-3.5 h-3.5" />
                            Takeaway
                          </span>
                        )}
                      </div>

                      {/* Items List */}
                      <div className="bg-[#FAF4F2] rounded-xl p-3 divide-y divide-[#EAD8C0]/60 text-xs">
                        {(order.items || []).map((item: any, idx) => {
                          const itemName = item.name || item.item_name_snapshot || 'Item';
                          const itemTotal = Number(item.totalPrice ?? item.line_total ?? (Number(item.unitPrice ?? item.unit_price_snapshot ?? 0) * (item.quantity || 1)));
                          return (
                            <div key={idx} className="py-1.5 flex justify-between">
                              <span className="font-medium text-[#3A0A0F]">
                                {item.quantity} × {itemName}
                              </span>
                              <span className="font-semibold text-[#3A0A0F] font-mono">
                                {formatCurrency(itemTotal)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="pt-4 mt-3 border-t border-[#EAD8C0] flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] text-[#6B4F48] uppercase font-semibold">Total Paid</p>
                        <p className="text-lg font-bold text-[#1F5A34] font-mono">
                          {formatCurrency(Number(order.grandTotal ?? (order as any).total_amount ?? 0))}
                        </p>
                      </div>

                      <Button
                        variant="primary"
                        size="md"
                        leftIcon={<Printer className="w-4 h-4" />}
                        onClick={() => printKOTMutation.mutate(order.id)}
                        isLoading={printKOTMutation.isPending && printKOTMutation.variables === order.id}
                        disabled={printKOTMutation.isPending}
                        className="bg-[#3A0A0F] hover:bg-[#5B0F1B] font-bold"
                      >
                        Print KOT
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: CONFIRMED ================= */}
        {activeTab === 'confirmed' && (
          <div>
            {isLoading && allMobileOrders.length === 0 ? (
              <div className="py-20 flex justify-center">
                <Spinner label="Loading confirmed orders..." />
              </div>
            ) : filteredConfirmed.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="w-8 h-8 text-[#3A0A0F]" />}
                title={searchQuery ? `No orders matching "${searchQuery}"` : "No Confirmed Orders"}
                description={searchQuery ? "Try searching by another 4-digit code or table." : "Orders with tokens issued will appear here for reprint and tracking."}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredConfirmed.map((order) => (
                  <div
                    key={order.id}
                    className="bg-[#FDF6EC] rounded-2xl border border-[#EAD8C0] shadow-sm p-5 flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="bg-[#3A0A0F] text-white font-mono font-bold text-sm px-2.5 py-0.5 rounded-lg shadow-sm">
                            Token #{order.tokenNumber || (order as any).token_number || '-'}
                          </span>
                          <span className="text-xs text-[#6B4F48] font-mono">
                            #{order.orderNumber || (order as any).order_number || ''}
                          </span>
                        </div>
                        <span className="text-xs text-[#6B4F48] font-mono">
                          {formatTime(order.confirmedAt || (order as any).confirmed_at || order.createdAt || (order as any).created_at)}
                        </span>
                      </div>

                      <div className="text-xs text-[#6B4F48] flex items-center gap-2">
                        <span className="font-semibold capitalize text-[#3A0A0F]">
                          {(order.orderType || (order as any).order_type || 'DINE_IN').replace('_', ' ')}
                        </span>
                        <span>•</span>
                        <span>{(order.items || []).length} item(s)</span>
                        <span>•</span>
                        <span className="font-bold text-[#3A0A0F] font-mono">
                          {formatCurrency(Number(order.grandTotal ?? (order as any).total_amount ?? 0))}
                        </span>
                      </div>

                      <div className="bg-[#FAF4F2] rounded-lg p-2.5 text-xs text-[#3A0A0F] max-h-24 overflow-y-auto divide-y divide-[#EAD8C0]/60">
                        {(order.items || []).map((i: any, idx) => {
                          const itemName = i.name || i.item_name_snapshot || 'Item';
                          const itemTotal = Number(i.totalPrice ?? i.line_total ?? (Number(i.unitPrice ?? i.unit_price_snapshot ?? 0) * (i.quantity || 1)));
                          return (
                            <div key={idx} className="py-1 flex justify-between">
                              <span>
                                {i.quantity}x {itemName}
                              </span>
                              <span className="font-semibold font-mono">{formatCurrency(itemTotal)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="pt-3 mt-3 border-t border-[#EAD8C0] flex items-center justify-between gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<Printer className="w-3.5 h-3.5" />}
                        onClick={() => reprintMutation.mutate({ orderId: order.id, docType: DocumentType.CUSTOMER_RECEIPT })}
                        className="text-xs border-[#EAD8C0] text-[#3A0A0F] hover:bg-[#EAD8C0]/40"
                      >
                        Slip
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                        onClick={() => reprintMutation.mutate({ orderId: order.id, docType: DocumentType.KOT })}
                        className="text-xs border-[#EAD8C0] text-[#3A0A0F] hover:bg-[#EAD8C0]/40"
                      >
                        KOT
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<Printer className="w-3.5 h-3.5" />}
                        onClick={() => reprintMutation.mutate({ orderId: order.id })}
                        className="text-xs bg-[#EAD8C0] text-[#3A0A0F] hover:bg-[#dfcbaf]"
                      >
                        Reprint Both
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Payment Confirmation Modal for Pay-at-Counter Orders */}
      <Modal
        isOpen={!!paymentModalOrder}
        onClose={() => setPaymentModalOrder(null)}
        title={`Confirm Payment for Order #${paymentModalOrder?.orderNumber || (paymentModalOrder as any)?.order_number || ''}`}
        description="Verify and record the customer's payment before issuing the token"
        maxWidth="md"
      >
        <div className="space-y-4 pt-2">
          <div className="p-4 bg-[#FAF4F2] rounded-xl border border-[#EAD8C0] flex items-center justify-between">
            <span className="text-sm font-semibold text-[#6B4F48]">Total Payable Amount</span>
            <span className="text-2xl font-black text-[#3A0A0F] font-mono">
              {formatCurrency(Number(paymentModalOrder?.grandTotal ?? (paymentModalOrder as any)?.total_amount ?? 0))}
            </span>
          </div>

          {/* Side-by-side Payment Method Blocks */}
          <div>
            <label className="block text-xs font-bold text-[#3A0A0F] mb-2 uppercase tracking-wide">
              Payment Method Received <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedPaymentMethod(PaymentMethod.CASH)}
                className={`relative flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer text-center select-none ${
                  selectedPaymentMethod === PaymentMethod.CASH
                    ? 'border-[#3A0A0F] bg-[#3A0A0F] text-white shadow-md shadow-[#3A0A0F]/20 ring-2 ring-[#3A0A0F]/20'
                    : 'border-[#EAD8C0] bg-[#FAF4F2] text-[#3A0A0F] hover:border-[#5B0F1B]/40 hover:bg-[#FDF6EC]'
                }`}
              >
                <div className="text-3xl mb-1.5">💵</div>
                <div className="font-extrabold text-sm tracking-tight">Cash Received</div>
                <div className={`text-[11px] mt-0.5 font-medium ${selectedPaymentMethod === PaymentMethod.CASH ? 'text-white/80' : 'text-[#6B4F48]'}`}>
                  Physical Cash
                </div>
                {selectedPaymentMethod === PaymentMethod.CASH && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white text-[#3A0A0F] flex items-center justify-center text-xs font-black shadow-xs">
                    ✓
                  </div>
                )}
              </button>

              <button
                type="button"
                onClick={() => setSelectedPaymentMethod(PaymentMethod.UPI)}
                className={`relative flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer text-center select-none ${
                  selectedPaymentMethod === PaymentMethod.UPI
                    ? 'border-[#3A0A0F] bg-[#3A0A0F] text-white shadow-md shadow-[#3A0A0F]/20 ring-2 ring-[#3A0A0F]/20'
                    : 'border-[#EAD8C0] bg-[#FAF4F2] text-[#3A0A0F] hover:border-[#5B0F1B]/40 hover:bg-[#FDF6EC]'
                }`}
              >
                <div className="text-3xl mb-1.5">📱</div>
                <div className="font-extrabold text-sm tracking-tight">Counter UPI QR</div>
                <div className={`text-[11px] mt-0.5 font-medium ${selectedPaymentMethod === PaymentMethod.UPI ? 'text-white/80' : 'text-[#6B4F48]'}`}>
                  GPay / PhonePe / Paytm
                </div>
                {selectedPaymentMethod === PaymentMethod.UPI && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white text-[#3A0A0F] flex items-center justify-center text-xs font-black shadow-xs">
                    ✓
                  </div>
                )}
              </button>
            </div>
          </div>

          {selectedPaymentMethod === PaymentMethod.CASH && (
            <div className="space-y-2">
              <Input
                label="Cash Amount Received (₹)"
                type="number"
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
                placeholder="e.g. 500"
              />
              {(() => {
                const total = Number(paymentModalOrder?.grandTotal ?? (paymentModalOrder as any)?.total_amount ?? 0);
                const received = parseFloat(amountReceived);
                if (!isNaN(received) && received > total) {
                  return (
                    <div className="p-3 bg-[#DDF0E4] border border-[#BCE1C7] rounded-xl flex items-center justify-between text-xs animate-in fade-in duration-200">
                      <span className="font-bold text-[#1F5A34]">Change to Return:</span>
                      <span className="font-mono font-extrabold text-sm text-[#1F5A34]">
                        {formatCurrency(received - total)}
                      </span>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}

          {selectedPaymentMethod === PaymentMethod.UPI && (
            <Input
              label="UPI Transaction Reference / UTR (Optional)"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="e.g. 4029104829"
            />
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#EAD8C0]">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPaymentModalOrder(null)}
              disabled={confirmPaymentMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="lg"
              onClick={handleConfirmPayment}
              isLoading={confirmPaymentMutation.isPending}
              className="font-bold"
            >
              Confirm & Issue Token
            </Button>
          </div>
        </div>
      </Modal>

      {/* Order / Token Success Dialog (Matching POS Order Success) */}
      <Modal
        isOpen={!!confirmedTokenOrder}
        onClose={() => setConfirmedTokenOrder(null)}
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
              {(() => {
                const t =
                  confirmedTokenOrder?.tokenNumber ||
                  (confirmedTokenOrder as any)?.token_number ||
                  confirmedTokenOrder?.orderNumber ||
                  '';
                if (!t) return '';
                return t.startsWith('#') ? t : `#${t}`;
              })()}
            </p>
            <div className="pt-2 text-xs text-[#6B4F48] font-medium">
              Order #{confirmedTokenOrder?.orderNumber || (confirmedTokenOrder as any)?.order_number} •{' '}
              {(() => {
                const isDineIn = String(
                  confirmedTokenOrder?.orderType || (confirmedTokenOrder as any)?.order_type
                )
                  .toUpperCase()
                  .includes('DINE');
                const tableName =
                  confirmedTokenOrder?.table?.tableName ||
                  (confirmedTokenOrder?.table as any)?.table_name;
                if (isDineIn) {
                  return tableName ? `Dine-In (${tableName})` : 'Dine-In';
                }
                return 'Takeaway';
              })()}
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
            onClick={() => setConfirmedTokenOrder(null)}
          >
            Start Next Order
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default MobileOrdersPage;
