import React from 'react';
import { cn } from '@/lib/utils';
import { OrderStatus, PaymentStatus, PrintJobStatus, OrderType, OrderSource } from '@/types';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'orange';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'default',
  size = 'md',
  children,
  ...props
}) => {
  const variants = {
    default: 'bg-[#EAD8C0] text-[#3A0A0F] border-[#DFC9AF]',
    success: 'bg-[#DDF0E4] text-[#1F5A34] border-[#BCE1C7]',
    warning: 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]',
    danger: 'bg-[#FDE8E8] text-[#9B1C1C] border-[#F8B4B4]',
    info: 'bg-[#E0F2FE] text-[#0369A1] border-[#BAE6FD]',
    purple: 'bg-[#F3E8FF] text-[#6B21A8] border-[#E9D5FF]',
    teal: 'bg-[#DDF0E4] text-[#1F5A34] border-[#BCE1C7]',
    orange: 'bg-[#EAD8C0] text-[#3A0A0F] border-[#DFC9AF]',
    maroon: 'bg-[#F5E8E5] text-[#3A0A0F] border-[#EAD8C0]',
  };

  const sizes = {
    sm: 'text-xs px-2 py-0.5 rounded-md font-medium',
    md: 'text-xs px-2.5 py-1 rounded-full font-semibold',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 border shrink-0',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
};

// Specialized Status Badges
export const OrderStatusBadge: React.FC<{ status: OrderStatus | string }> = ({ status }) => {
  const s = (status || '').toString().toUpperCase();
  switch (s) {
    case 'CONFIRMED':
      return <Badge variant="info">Confirmed</Badge>;
    case 'PREPARING':
      return <Badge variant="purple">Preparing</Badge>;
    case 'READY':
      return <Badge variant="warning">Ready</Badge>;
    case 'COMPLETED':
      return <Badge variant="success">Completed</Badge>;
    case 'CANCELLED':
      return <Badge variant="danger">Cancelled</Badge>;
    case 'PENDING_PAYMENT':
      return <Badge variant="warning">Pending Payment</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

export const PaymentStatusBadge: React.FC<{ status: PaymentStatus | string }> = ({ status }) => {
  const s = (status || '').toString().toUpperCase();
  switch (s) {
    case 'PAID':
      return <Badge variant="success">Paid</Badge>;
    case 'PENDING':
      return <Badge variant="warning">Pending</Badge>;
    case 'FAILED':
      return <Badge variant="danger">Failed</Badge>;
    case 'REFUNDED':
    case 'PARTIALLY_REFUNDED':
      return <Badge variant="purple">Refunded</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

export const PrintStatusBadge: React.FC<{ status: PrintJobStatus | string }> = ({ status }) => {
  const s = (status || '').toString().toUpperCase();
  switch (s) {
    case 'PRINTED':
      return <Badge variant="success">Printed</Badge>;
    case 'PRINTING':
      return <Badge variant="purple">Printing</Badge>;
    case 'PENDING':
      return <Badge variant="warning">Pending</Badge>;
    case 'FAILED':
      return <Badge variant="danger">Print Failed</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

export const OrderTypeBadge: React.FC<{ type: OrderType | string }> = ({ type }) => {
  const upper = (type || '').toString().toUpperCase();
  if (upper === 'DINE_IN' || upper.includes('DINE')) {
    return <Badge variant="success">Dine-In</Badge>;
  }
  return <Badge variant="info">Takeaway</Badge>;
};

export const OrderSourceBadge: React.FC<{ source: OrderSource | string }> = ({ source }) => {
  const upper = (source || '').toString().toUpperCase();
  if (upper === 'QR') {
    return <Badge variant="purple">QR Order</Badge>;
  }
  return <Badge variant="default">Counter POS</Badge>;
};

export default Badge;
