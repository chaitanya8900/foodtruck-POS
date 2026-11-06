import React from 'react';
import { Outlet } from 'react-router-dom';
import { Utensils, Clock, AlertCircle } from 'lucide-react';
import { OrderingStatus } from '@/types';

interface CustomerLayoutProps {
  businessName?: string;
  tableName?: string;
  orderingStatus?: OrderingStatus | null;
  children?: React.ReactNode;
}

export const CustomerLayout: React.FC<CustomerLayoutProps> = ({
  businessName = 'Food Truck Express',
  tableName,
  orderingStatus,
  children,
}) => {
  return (
    <div className="min-h-screen bg-[#F8EFE6] flex flex-col max-w-md mx-auto shadow-2xl relative font-sans">
      {/* Top Mobile Branding Header */}
      <header className="sticky top-0 z-30 bg-[#3A0A0F] border-b border-[#5B0F1B] px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#5B0F1B] text-white flex items-center justify-center shadow-md">
            <Utensils className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-sm text-white leading-tight truncate max-w-[190px]">
              {businessName}
            </h1>
            <p className="text-[11px] text-white/95 font-semibold">Self-Ordering Service</p>
          </div>
        </div>

        {tableName && (
          <div className="bg-[#EAD8C0] border border-[#EAD8C0] px-3 py-1 rounded-full text-xs font-bold text-[#3A0A0F] shadow-xs">
            {tableName}
          </div>
        )}
      </header>

      {/* Operating Status Alert Banner */}
      {orderingStatus && !orderingStatus.isOpen && (
        <div
          className={`px-4 py-2.5 text-xs font-medium flex items-center gap-2 border-b transition-all shadow-inner ${
            orderingStatus.reason === 'BEFORE_HOURS'
              ? 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]'
              : 'bg-[#FBE8E8] text-[#8C232C] border-[#F5C2C7]'
          }`}
        >
          {orderingStatus.reason === 'BEFORE_HOURS' ? (
            <Clock className="w-4 h-4 shrink-0 text-[#B45309]" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-[#8C232C]" />
          )}
          <span className="leading-snug">{orderingStatus.bannerText}</span>
        </div>
      )}

      {/* Main Screen Content */}
      <main className="flex-1 pb-20">
        {children || <Outlet />}
      </main>

      {/* Minimal Footer */}
      <footer className="text-center py-4 text-xs text-[#6B4F48] border-t border-[#EAD8C0] bg-[#FDF6EC]">
        <p>Powered by Food Truck Smart POS</p>
      </footer>
    </div>
  );
};

export default CustomerLayout;
