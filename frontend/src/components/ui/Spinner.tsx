import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  label?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({
  className,
  size = 'md',
  label,
  ...props
}) => {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
  };

  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 text-[#6B4F48]', className)}
      {...props}
    >
      <Loader2 className={cn('animate-spin text-[#3A0A0F]', sizes[size])} />
      {label && <p className="text-sm font-medium text-[#3A0A0F]">{label}</p>}
    </div>
  );
};

export default Spinner;
