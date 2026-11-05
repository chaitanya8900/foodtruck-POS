import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Clock,
  ChefHat,
  ArrowRight,
  Utensils,
  ShoppingBag,
} from 'lucide-react';

import ordersApi from '@/api/orders';
import { useSocketEvent } from '@/hooks/useSocket';
import { Order, OrderStatus, OrderType } from '@/types';
import { formatTime } from '@/lib/utils';
import { playNotificationSound } from '@/lib/sound';
import Spinner from '@/components/ui/Spinner';
import Button from '@/components/ui/Button';

export const KitchenPage: React.FC = () => {
  const queryClient = useQueryClient();

  // Fetch all active kitchen orders with 60s in-memory caching for instant page transitions
  const { data, isLoading } = useQuery({
    queryKey: ['kitchenOrders'],
    queryFn: () => ordersApi.getOrders({ limit: 100 }),
    staleTime: 60 * 1000,
    refetchInterval: 15 * 1000,
  });

  const orders: Order[] = data?.orders || [];

  // Listen to live socket events
  useSocketEvent('order_confirmed', () => {
    toast('New kitchen order ticket received!', { icon: '🍳' });
    playNotificationSound();
    queryClient.invalidateQueries({ queryKey: ['kitchenOrders'] });
  });

  useSocketEvent('new_order', () => {
    queryClient.invalidateQueries({ queryKey: ['kitchenOrders'] });
  });

  useSocketEvent('order_updated', () => {
    queryClient.invalidateQueries({ queryKey: ['kitchenOrders'] });
  });

  // Status update mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: OrderStatus }) =>
      ordersApi.updateOrderStatus(orderId, status),
    onSuccess: (updated) => {
      toast.success(`Token #${updated.tokenNumber || updated.orderNumber} updated to ${updated.orderStatus}`);
      queryClient.invalidateQueries({ queryKey: ['kitchenOrders'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to update order status');
    },
  });

  // Filter columns
  const confirmedOrders = orders.filter((o) => o.orderStatus === OrderStatus.CONFIRMED);
  const preparingOrders = orders.filter((o) => o.orderStatus === OrderStatus.PREPARING);
  const readyOrders = orders.filter((o) => o.orderStatus === OrderStatus.READY);

  const handleAdvanceStatus = (order: Order) => {
    if (order.orderStatus === OrderStatus.CONFIRMED) {
      updateStatusMutation.mutate({ orderId: order.id, status: OrderStatus.PREPARING });
    } else if (order.orderStatus === OrderStatus.PREPARING) {
      updateStatusMutation.mutate({ orderId: order.id, status: OrderStatus.READY });
    } else if (order.orderStatus === OrderStatus.READY) {
      updateStatusMutation.mutate({ orderId: order.id, status: OrderStatus.COMPLETED });
    }
  };

  const renderOrderCard = (order: Order, nextStatusLabel: string, nextStatusColor: string) => {
    return (
      <div
        key={order.id}
        className="bg-white rounded-2xl border-2 border-[#EAD8C0] shadow-sm p-4 flex flex-col justify-between transition-all hover:border-[#3A0A0F] hover:shadow-md space-y-3"
      >
        <div className="space-y-2.5">
          {/* Header with Token and Time */}
          <div className="flex items-center justify-between">
            <span className="text-2xl font-black font-mono text-[#3A0A0F] tracking-tight bg-[#FAF4F2] border border-[#EAD8C0] px-3 py-1 rounded-xl">
              #{order.tokenNumber || order.orderNumber}
            </span>
            <div className="flex items-center gap-1.5 text-xs text-[#6B4F48] font-mono">
              <Clock className="w-3.5 h-3.5" />
              <span>{formatTime(order.confirmedAt || order.createdAt)}</span>
            </div>
          </div>

          {/* Dine-In or Takeaway badge */}
          <div className="flex items-center gap-2">
            {(order.orderType === OrderType.DINE_IN || String(order.orderType || (order as any).order_type).toUpperCase().includes('DINE')) ? (
              <span className="flex items-center gap-1 text-xs font-bold text-[#1F5A34] bg-[#DDF0E4] px-2.5 py-0.5 rounded-lg border border-[#BCE1C7]">
                <Utensils className="w-3 h-3" />
                Dine-In {order.table?.tableName ? `(${order.table.tableName})` : ''}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs font-bold text-[#3A0A0F] bg-[#EAD8C0] px-2.5 py-0.5 rounded-lg border border-[#EAD8C0]">
                <ShoppingBag className="w-3 h-3" />
                Takeaway
              </span>
            )}
          </div>

          {/* Ordered Food Items */}
          <div className="bg-[#FAF4F2] rounded-xl p-3 space-y-2 border border-[#EAD8C0]/60 text-sm">
            {order.items.map((item, idx) => (
              <div key={idx} className="space-y-0.5">
                <div className="flex items-baseline justify-between font-bold text-[#3A0A0F]">
                  <span>
                    <span className="text-[#3A0A0F] font-black mr-1">{item.quantity}×</span> {item.name}
                  </span>
                </div>
                {item.customizations && item.customizations.length > 0 && (
                  <div className="text-xs text-[#6B4F48] pl-4">
                    {item.customizations.map((c) => c.optionName).join(', ')}
                  </div>
                )}
                {item.specialInstructions && (
                  <p className="text-xs text-amber-800 bg-amber-50 px-2 py-0.5 rounded font-medium border border-amber-200">
                    ⚠️ {item.specialInstructions}
                  </p>
                )}
              </div>
            ))}
          </div>

          {order.specialInstructions && (
            <p className="text-xs text-amber-900 font-semibold bg-amber-50 p-2 rounded-lg border border-amber-200">
              Note: {order.specialInstructions}
            </p>
          )}
        </div>

        {/* Touch Action Button */}
        <Button
          type="button"
          size="lg"
          variant="primary"
          onClick={() => handleAdvanceStatus(order)}
          isLoading={updateStatusMutation.isPending && updateStatusMutation.variables?.orderId === order.id}
          disabled={updateStatusMutation.isPending}
          className={`w-full font-bold flex items-center justify-center gap-2 ${nextStatusColor}`}
        >
          <span>{nextStatusLabel}</span>
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-[#F8EFE6] overflow-hidden font-sans">
      {/* Top Header */}
      <div className="bg-[#3A0A0F] text-white px-6 py-4 flex items-center justify-between shrink-0 shadow-md border-b border-[#5B0F1B]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#5B0F1B] flex items-center justify-center text-white shadow-sm">
            <ChefHat className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-white">Kitchen Order Management</h2>
            <p className="text-xs text-white/95 font-semibold">Touchscreen KOT Display & Status Progression</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-white/70" />
            <span className="text-white">Confirmed: {confirmedOrders.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="text-white">Preparing: {preparingOrders.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#BCE1C7]" />
            <span className="text-white">Ready: {readyOrders.length}</span>
          </div>
        </div>
      </div>

      {/* Kanban Board 3 Columns */}
      <div className="flex-1 overflow-x-auto p-4 sm:p-6">
        {isLoading && orders.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <Spinner label="Loading kitchen tickets..." />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full min-w-[900px]">
            {/* Column 1: Confirmed (New) */}
            <div className="flex flex-col bg-[#FDF6EC] rounded-2xl p-4 border border-[#EAD8C0] shadow-xs overflow-hidden">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#EAD8C0]">
                <div className="flex items-center gap-2 font-bold text-[#3A0A0F] text-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#3A0A0F]" />
                  <span>Confirmed Orders</span>
                </div>
                <span className="bg-[#EAD8C0] text-[#3A0A0F] text-xs font-bold px-2 py-0.5 rounded-full">
                  {confirmedOrders.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {confirmedOrders.length === 0 ? (
                  <p className="text-xs text-[#6B4F48] text-center py-12">No new orders waiting</p>
                ) : (
                  confirmedOrders.map((o) =>
                    renderOrderCard(o, 'Start Preparing', 'bg-[#3A0A0F] hover:bg-[#5B0F1B] text-white')
                  )
                )}
              </div>
            </div>

            {/* Column 2: Preparing */}
            <div className="flex flex-col bg-[#FDF6EC] rounded-2xl p-4 border border-[#EAD8C0] shadow-xs overflow-hidden">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#EAD8C0]">
                <div className="flex items-center gap-2 font-bold text-[#3A0A0F] text-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-600" />
                  <span>Preparing Now</span>
                </div>
                <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full">
                  {preparingOrders.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {preparingOrders.length === 0 ? (
                  <p className="text-xs text-[#6B4F48] text-center py-12">No orders being prepared</p>
                ) : (
                  preparingOrders.map((o) =>
                    renderOrderCard(o, 'Mark as Ready', 'bg-[#5B0F1B] hover:bg-[#7A1B28] text-white')
                  )
                )}
              </div>
            </div>

            {/* Column 3: Ready */}
            <div className="flex flex-col bg-[#FDF6EC] rounded-2xl p-4 border border-[#EAD8C0] shadow-xs overflow-hidden">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#EAD8C0]">
                <div className="flex items-center gap-2 font-bold text-[#3A0A0F] text-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#1F5A34]" />
                  <span>Ready for Pickup</span>
                </div>
                <span className="bg-[#DDF0E4] text-[#1F5A34] text-xs font-bold px-2 py-0.5 rounded-full border border-[#BCE1C7]">
                  {readyOrders.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {readyOrders.length === 0 ? (
                  <p className="text-xs text-[#6B4F48] text-center py-12">No ready orders</p>
                ) : (
                  readyOrders.map((o) =>
                    renderOrderCard(o, 'Handover (Complete)', 'bg-[#1F5A34] hover:bg-[#164326] text-white')
                  )
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default KitchenPage;
