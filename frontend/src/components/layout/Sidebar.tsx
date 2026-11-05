import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderTree,
  UtensilsCrossed,
  QrCode,
  ClipboardList,
  BarChart3,
  Users,
  Settings,
  Store,
  ChevronRight,
  LogOut,
  Smartphone,
  ChefHat,
  Monitor,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import useAuth from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import mobileOrdersApi from '@/api/mobile-orders';

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { user, business, logout } = useAuth();

  const { data: readyOrders = [] } = useQuery({
    queryKey: ['mobileOrders', 'ready'],
    queryFn: () => mobileOrdersApi.getMobileOrders('ready_for_token'),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });
  const readyOrdersCount = readyOrders.length;

  const navigationItems = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'POS Counter', href: '/pos', icon: Monitor },
    { name: 'Mobile Orders', href: '/mobile-orders', icon: Smartphone },
    { name: 'Kitchen KOT', href: '/kitchen', icon: ChefHat },
    { name: 'Menu Categories', href: '/admin/categories', icon: FolderTree },
    { name: 'Menu Items', href: '/admin/items', icon: UtensilsCrossed },
    { name: 'Tables & QRs', href: '/admin/tables', icon: QrCode },
    { name: 'Order History', href: '/admin/orders', icon: ClipboardList },
    { name: 'Reports', href: '/admin/reports', icon: BarChart3 },
    { name: 'Users & Staff', href: '/admin/users', icon: Users },
    { name: 'Settings', href: '/admin/settings', icon: Settings },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 lg:hidden backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Sidebar sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-[#3A0A0F] text-white flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 shadow-2xl border-r border-[#4A0D15]',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand header */}
        <div className="flex items-center gap-3 px-6 h-16 border-b border-[#4A0D15] shrink-0">
          <div className="w-9 h-9 rounded-xl bg-[#5B0F1B] border border-[#7A1B28]/60 flex items-center justify-center text-white font-bold shadow-sm">
            <Store className="w-5 h-5 text-white" />
          </div>
          <div className="overflow-hidden">
            <h1 className="font-bold text-sm tracking-wide text-white truncate">
              {business?.name || 'The Rolling Gourmet'}
            </h1>
            <p className="text-[11px] text-white font-bold tracking-wider uppercase opacity-95">Management</p>
          </div>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.name}
                to={item.href}
                end={item.href === '/admin'}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    'flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-bold tracking-wide transition-all group',
                    isActive
                      ? 'bg-[#EAD8C0] text-[#3A0A0F] shadow-sm'
                      : 'text-white hover:bg-[#5B0F1B] hover:text-white'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-3">
                      <Icon className={cn('w-4 h-4 shrink-0 transition-transform stroke-[2.2] group-hover:scale-110', isActive ? 'text-[#3A0A0F]' : 'text-white group-hover:text-white')} />
                      <span>{item.name}</span>
                    </div>
                    {item.href === '/mobile-orders' && readyOrdersCount > 0 ? (
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.9)]" />
                    ) : (
                      <ChevronRight className={cn('w-3.5 h-3.5 stroke-[2.2] transition-all', isActive ? 'text-[#3A0A0F]' : 'text-white/70 group-hover:text-white group-hover:opacity-100 group-hover:translate-x-0.5')} />
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User profile footer */}
        <div className="p-4 border-t border-[#4A0D15] bg-[#2D070B] shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-[#5B0F1B] border border-[#7A1B28]/50 flex items-center justify-center text-xs font-bold text-white shrink-0">
                {user?.name?.charAt(0).toUpperCase() || 'T'}
              </div>
              <div className="overflow-hidden text-left">
                <p className="text-xs font-bold text-white truncate">{user?.name || 'Truck Admin'}</p>
                <p className="text-[10px] text-white/90 font-bold font-mono capitalize truncate">{user?.role?.toLowerCase() || 'admin'}</p>
              </div>
            </div>
            <button
              onClick={() => logout()}
              title="Logout"
              className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-[#5B0F1B] transition-colors"
            >
              <LogOut className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
