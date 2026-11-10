import React, { useRef, useState, useEffect } from 'react';
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
  const topBarRef = useRef<HTMLDivElement>(null);
  const [topBarHeight, setTopBarHeight] = useState<number>(57);

  useEffect(() => {
    if (!topBarRef.current) return;

    const updateHeight = () => {
      if (topBarRef.current) {
        setTopBarHeight(topBarRef.current.offsetHeight);
      }
    };

    updateHeight();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateHeight();
      });
      resizeObserver.observe(topBarRef.current);
    }

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [orderingStatus, businessName, tableName]);

  return (
    <div
      className="min-h-screen bg-[#F8EFE6] flex flex-col max-w-md mx-auto shadow-2xl relative font-sans"
      style={{ '--customer-top-offset': `${topBarHeight}px` } as React.CSSProperties}
    >
      {/* Top Mobile Sticky Container: Branding Header + Operating Status Alert Banner */}
      <div ref={topBarRef} className="sticky top-0 z-30 shadow-md">
        {/* Top Mobile Branding Header */}
        <header className="bg-[#3A0A0F] border-b border-[#5B0F1B] px-4 py-3 flex items-center justify-between">
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

        {/* Operating Status Alert Banner (Always visible at top of screen, never scrolls off) */}
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
      </div>

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
