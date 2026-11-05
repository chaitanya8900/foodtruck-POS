import React from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

export interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  change?: {
    value: string | number;
    isPositive?: boolean;
    label?: string;
  };
  color?: 'emerald' | 'teal' | 'blue' | 'purple' | 'slate' | 'amber';
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  change,
  color = 'emerald',
  className,
}) => {
  const iconColors = {
    emerald: 'bg-[#DDF0E4] text-[#1F5A34]',
    teal: 'bg-[#EAD8C0] text-[#3A0A0F]',
    blue: 'bg-[#E0F2FE] text-[#0369A1]',
    purple: 'bg-[#F3E8FF] text-[#6B21A8]',
    amber: 'bg-[#FEF3C7] text-[#92400E]',
    slate: 'bg-[#EAD8C0] text-[#3A0A0F]',
  };

  return (
    <div
      className={cn(
        'bg-[#FDF6EC] rounded-2xl border border-[#EAD8C0] p-5 sm:p-6 shadow-xs transition-all hover:border-[#3A0A0F] flex items-start justify-between gap-4',
        className
      )}
    >
      <div className="space-y-1.5">
        <p className="text-xs font-bold uppercase tracking-wider text-[#6B4F48]">{label}</p>
        <p className="text-2xl sm:text-3xl font-black text-[#3A0A0F] tracking-tight">{value}</p>
        {change && (
          <div className="flex items-center gap-1.5 text-xs">
            {change.isPositive ? (
              <span className="flex items-center gap-0.5 text-[#1F5A34] font-semibold">
                <TrendingUp className="w-3.5 h-3.5" />
                {change.value}
              </span>
            ) : (
              <span className="flex items-center gap-0.5 text-red-600 font-semibold">
                <TrendingDown className="w-3.5 h-3.5" />
                {change.value}
              </span>
            )}
            {change.label && <span className="text-[#6B4F48]">{change.label}</span>}
          </div>
        )}
      </div>
      <div className={cn('p-3 rounded-xl shrink-0', iconColors[color])}>
        {icon}
      </div>
    </div>
  );
};

export default StatCard;
