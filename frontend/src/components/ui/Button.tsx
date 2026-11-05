import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading = false, leftIcon, rightIcon, children, disabled, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] select-none';

    const variants = {
      primary: 'bg-[#3A0A0F] hover:bg-[#5B0F1B] text-white shadow-sm shadow-[#3A0A0F]/25 focus:ring-[#5B0F1B]',
      secondary: 'bg-[#EAD8C0] hover:bg-[#DFC9AF] text-[#3A0A0F] font-bold shadow-xs focus:ring-[#3A0A0F]',
      danger: 'bg-[#9B1C1C] hover:bg-[#771D1D] text-white shadow-sm focus:ring-[#9B1C1C]',
      ghost: 'bg-transparent hover:bg-[#EAD8C0]/40 text-[#3A0A0F] focus:ring-[#3A0A0F]',
      outline: 'bg-transparent border border-[#EAD8C0] hover:bg-[#FDF6EC] text-[#3A0A0F] focus:ring-[#3A0A0F]',
    };

    const sizes = {
      sm: 'text-xs px-2.5 py-1.5 h-8 gap-1.5',
      md: 'text-sm px-4 py-2.5 h-11 min-h-[44px] gap-2',
      lg: 'text-base px-6 py-3.5 h-14 min-h-[48px] gap-2.5 font-semibold',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        ) : leftIcon ? (
          <span className="shrink-0">{leftIcon}</span>
        ) : null}
        <span>{children}</span>
        {!isLoading && rightIcon ? <span className="shrink-0">{rightIcon}</span> : null}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;
