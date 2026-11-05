import React from 'react';
import { cn } from '@/lib/utils';
import { Inbox } from 'lucide-react';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  className,
  icon,
  title,
  description,
  action,
  ...props
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 sm:p-12 text-center bg-[#FDF6EC] rounded-2xl border border-dashed border-[#EAD8C0]',
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[#EAD8C0] text-[#3A0A0F] border border-[#DFC9AF] mb-4 shadow-xs">
        {icon || <Inbox className="w-7 h-7" />}
      </div>
      <h4 className="text-lg font-black text-[#3A0A0F] tracking-tight">{title}</h4>
      {description && <p className="text-xs text-[#6B4F48] mt-1 max-w-sm leading-relaxed">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};

export default EmptyState;
