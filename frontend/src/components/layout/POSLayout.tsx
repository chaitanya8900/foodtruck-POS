import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useAuth from '@/hooks/useAuth';
import useSocketStore from '@/store/socket';
import { format } from 'date-fns';
import {
  LogOut,
  Smartphone,
  ChefHat,
  LayoutDashboard,
  Wifi,
  WifiOff,
  Store,
} from 'lucide-react';
import { UserRole, Order } from '@/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import mobileOrdersApi, { normalizeOrder } from '@/api/mobile-orders';
import { useSocket, useSocketEvent } from '@/hooks/useSocket';
import { playNotificationSound } from '@/lib/sound';

export const POSLayout: React.FC = () => {
  const { user, business, logout } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const isConnected = useSocketStore((state) => state.isConnected);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Ensure socket is active and connected
  useSocket();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Shared in-memory mobile orders query with 60s cache
  const { data: allMobileOrders = [] } = useQuery({
    queryKey: ['mobileOrders'],
    queryFn: () => mobileOrdersApi.getMobileOrders(),
    staleTime: 60 * 1000,
    refetchInterval: 15 * 1000,
  });

  const hasReadyOrders = allMobileOrders.some((o) => {
    const isPaid = o.paymentStatus === 'PAID' || (o as any).payment_status === 'PAID';
    const isCancelled = o.orderStatus === 'CANCELLED' || (o as any).order_status === 'CANCELLED';
    const hasKot = Boolean((o as any).hasKotPrinted || (o as any).has_kot_printed || (o as any).kot_printed);
    return isPaid && !isCancelled && !hasKot;
  });

  const isMobileQROrder = (order: any): boolean => {
    if (!order) return false;
    const source = (order.source || order.order_source || '').toString().toUpperCase();
    const orderNumber = (order.orderNumber || order.order_number || '').toString().toUpperCase();

    // Explicitly reject any POS counter orders
    if (source === 'POS' || orderNumber.startsWith('POS-')) {
      return false;
    }

    // Must originate from mobile QR
    return (
      source === 'QR' ||
      source === 'MOBILE' ||
      orderNumber.startsWith('QR-') ||
      Boolean(order.qrToken) ||
      Boolean(order.qr_token_id)
    );
  };

  const handleIncomingMobileOrder = (order: any, type: 'new' | 'paid') => {
    if (!isMobileQROrder(order)) {
      return;
    }

    // 1. Immediately inject incoming order directly into React Query cache (0ms instant UI update)
    if (order && order.id) {
      const incoming = normalizeOrder(order);
      queryClient.setQueryData<Order[]>(['mobileOrders'], (old = []) => {
        const idx = old.findIndex((o) => o.id === incoming.id);
        if (idx >= 0) {
          const copy = [...old];
          copy[idx] = { ...copy[idx], ...incoming };
          return copy;
        }
        return [incoming, ...old];
      });
      queryClient.invalidateQueries({ queryKey: ['mobileOrders'] });
    }

    const isPaid = type === 'paid' || order?.paymentStatus === 'PAID' || order?.payment_status === 'PAID';

    // Strictly popup and chime ONLY for prepaid (PAID) orders from Mobile QR!
    // No popup and no chime for Pay at Counter orders (both Dine-In and Takeaway).
    if (!isPaid) {
      return;
    }

    // 2. Play chime (strictly for verified prepaid orders)
    playNotificationSound();

    // 3. Extract order details safely
    const tokenNo = order?.tokenNumber || order?.token_number;
    const orderNumber = order?.orderNumber || order?.order_number || 'QR Order';
    const isDineIn = (order?.orderType || order?.order_type || '').toString().toUpperCase().includes('DINE');
    const tableName = order?.table?.tableName || order?.table?.table_name || (order?.table_id ? 'Table' : '');
    const totalAmount = Number(order?.grandTotal ?? order?.total_amount ?? 0);

    // 4. Instant Top-Right POS Popup Toast
    toast.custom(
      (t) => (
        <div
          className={`${
            t.visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          } max-w-sm w-full bg-[#3A0A0F] text-white shadow-2xl rounded-2xl pointer-events-auto border-2 border-[#EAD8C0] p-4 flex flex-col gap-2.5 transition-all duration-300`}
          style={{
            boxShadow: '0 20px 25px -5px rgba(58, 10, 15, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <span className="text-[11px] font-black uppercase tracking-wider text-[#EAD8C0]">
                {isPaid ? 'Prepaid Mobile Order (Paid)' : 'New Mobile QR Order'}
              </span>
            </div>
            <button
              onClick={() => toast.dismiss(t.id)}
              className="text-[#EAD8C0]/70 hover:text-white text-sm font-bold p-1 leading-none transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Details */}
          <div className="flex items-baseline justify-between">
            <div>
              <p className="font-mono text-lg font-black text-white tracking-wide">
                {tokenNo ? `Token #${tokenNo}` : `#${orderNumber}`}
              </p>
              {tokenNo && (
                <p className="text-[11px] font-mono text-[#EAD8C0]/80">
                  Ref: #{orderNumber}
                </p>
              )}
              <p className="text-xs text-[#EAD8C0] font-semibold mt-0.5">
                {isDineIn ? `Dine-In ${tableName ? `(${tableName})` : ''}` : 'Takeaway'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-mono font-black text-emerald-400">
                ₹{totalAmount.toFixed(2)}
              </p>
              <span
                className={`inline-block text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                  isPaid
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : 'bg-[#5B0F1B] text-[#EAD8C0]'
                }`}
              >
                {isPaid ? 'Ready for KOT' : 'Pay at Counter'}
              </span>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={() => {
              toast.dismiss(t.id);
              navigate('/mobile-orders');
            }}
            className="w-full bg-[#EAD8C0] hover:bg-[#FAF4F2] text-[#3A0A0F] font-bold text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-sm cursor-pointer"
          >
            <span>View in Mobile Orders</span>
            <span>→</span>
          </button>
        </div>
      ),
      {
        id: `mobile-order-${order?.id || Date.now()}`,
        duration: 8000,
        position: 'top-right',
      }
    );
  };

  // Real-time socket updates & top-right popup (Strictly for mobile QR orders)
  useSocketEvent('new_mobile_order', (order: any) => {
    if (isMobileQROrder(order)) {
      handleIncomingMobileOrder(order, 'new');
    }
  });

  useSocketEvent('new_order', (order: any) => {
    if (isMobileQROrder(order)) {
      handleIncomingMobileOrder(order, 'new');
    } else {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['posOrders'] });
    }
  });

  useSocketEvent('order_payment_received', (order: any) => {
    if (isMobileQROrder(order)) {
      handleIncomingMobileOrder(order, 'paid');
    }
  });

  useSocketEvent('order_updated', () => {
    queryClient.invalidateQueries({ queryKey: ['mobileOrders'] });
    queryClient.invalidateQueries({ queryKey: ['mobileOrders', 'ready'] });
    queryClient.invalidateQueries({ queryKey: ['orders'] });
  });

  const isAdmin = user?.role === UserRole.ADMIN;

  return (
    <div className="flex flex-col h-screen bg-[#F8EFE6] overflow-hidden select-none">
      {/* Top POS Header */}
      <header className="h-14 bg-[#3A0A0F] text-white px-4 flex items-center justify-between shrink-0 shadow-md border-b border-[#4A0D15] z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#5B0F1B] border border-[#7A1B28]/60 flex items-center justify-center text-white font-bold shadow-xs">
              <Store className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-sm leading-tight text-white">{business?.name || 'The Rolling Gourmet'}</h1>
              <p className="text-[10px] text-white/95 font-bold tracking-wider uppercase">Counter Terminal</p>
            </div>
          </div>

          {/* Quick Module Navigation Tabs */}
          <div className="hidden md:flex items-center gap-1.5 ml-4 bg-[#2D070B] p-1 rounded-xl text-xs border border-[#4A0D15]">
            <Link
              to="/pos"
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                location.pathname === '/pos'
                  ? 'bg-[#EAD8C0] text-[#3A0A0F] shadow-xs'
                  : 'text-white hover:text-white hover:bg-[#5B0F1B]'
              }`}
            >
              POS
            </Link>
            <Link
              to="/mobile-orders"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all relative border-2 ${
                hasReadyOrders
                  ? 'animate-blink-1s text-white font-black'
                  : location.pathname === '/mobile-orders'
                  ? 'bg-[#EAD8C0] text-[#3A0A0F] border-transparent shadow-xs'
                  : 'text-white border-transparent hover:text-white hover:bg-[#5B0F1B]'
              }`}
            >
              <Smartphone className={`w-3.5 h-3.5 ${hasReadyOrders ? 'animate-bounce' : ''}`} />
              <span>Mobile Orders</span>
            </Link>
            <Link
              to="/kitchen"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${
                location.pathname === '/kitchen'
                  ? 'bg-[#EAD8C0] text-[#3A0A0F] shadow-xs'
                  : 'text-white hover:text-white hover:bg-[#5B0F1B]'
              }`}
            >
              <ChefHat className="w-3.5 h-3.5" />
              <span>Kitchen</span>
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-white hover:text-white hover:bg-[#5B0F1B] transition-all"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Admin</span>
              </Link>
            )}
          </div>
        </div>

        {/* Center Clock */}
        <div className="flex items-center gap-3 text-center">
          <div className="font-mono text-sm tracking-wider font-bold text-white">
            {format(currentTime, 'hh:mm:ss a')}
          </div>
          <span className="text-xs text-white/90 font-medium hidden sm:inline">
            {format(currentTime, 'EEE, dd MMM')}
          </span>
        </div>

        {/* Right Info and Actions */}
        <div className="flex items-center gap-3">
          <div
            title={isConnected ? 'Online' : 'Offline'}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
              isConnected
                ? 'bg-[#DDF0E4] text-[#1F5A34] border-[#BCE1C7]'
                : 'bg-[#FAF4F2] text-[#9B1C1C] border-[#EAD8C0]'
            }`}
          >
            {isConnected ? <Wifi className="w-3 h-3 text-[#1F5A34]" /> : <WifiOff className="w-3 h-3 text-[#9B1C1C]" />}
            <span className="hidden sm:inline">{isConnected ? 'Online' : 'Offline'}</span>
          </div>

          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-white leading-tight">{user?.name}</p>
            <p className="text-[10px] text-white/90 font-bold uppercase tracking-wider">{user?.role}</p>
          </div>

          <button
            onClick={() => logout()}
            title="Sign Out"
            className="flex items-center gap-1.5 bg-[#5B0F1B] hover:bg-rose-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-colors min-h-[36px]"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Main Full-Height POS Workspace */}
      <main className="flex-1 min-h-0 overflow-hidden bg-[#F8EFE6]">
        <Outlet />
      </main>
    </div>
  );
};

export default POSLayout;
