import { Request } from 'express';
import { Role, OrderSource, OrderType, OrderStatus, PaymentStatus, PaymentMethod, DocumentType, PrintJobStatus } from '@prisma/client';

export interface JwtUserPayload {
  userId: string;
  businessId: string;
  role: Role;
  email: string;
  name: string;
}

export interface AuthRequest extends Request {
  user?: JwtUserPayload;
}

export interface ModifierSelection {
  group_id: string;
  group_name: string;
  option_id: string;
  option_name: string;
  price: number;
}

export interface CartItemInput {
  menu_item_id: string;
  quantity: number;
  modifiers?: ModifierSelection[];
  special_instructions?: string;
}

export interface CreateCounterOrderInput {
  order_type: OrderType;
  table_id?: string;
  items: CartItemInput[];
  discount?: number;
  special_instructions?: string;
  payment_method: PaymentMethod;
  transaction_reference?: string;
}

export interface CreateQROrderInput {
  qr_token: string;
  order_type: OrderType;
  items: CartItemInput[];
  special_instructions?: string;
  payment_method?: PaymentMethod;
}

export interface ConfirmPaymentInput {
  payment_method: PaymentMethod;
  transaction_reference?: string;
  amount?: number;
}

export interface IssueTokenInput {
  notes?: string;
}

export interface CancelOrderInput {
  reason: string;
}

export interface OrderQueryFilters {
  filter?: 'pending_payment' | 'ready_for_token' | 'confirmed';
  source?: OrderSource;
  order_type?: OrderType;
  order_status?: OrderStatus;
  payment_status?: PaymentStatus;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface DateRangeFilter {
  startDate?: string;
  endDate?: string;
}

export interface ReceiptItemData {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  modifiers?: { name: string; price: number }[];
}

export interface ReceiptData {
  business: {
    name: string;
    address: string | null;
    phone: string | null;
    gstin: string | null;
    fssai: string | null;
    header: string | null;
    footer: string | null;
  };
  order: {
    id: string;
    orderNumber: string;
    tokenNumber: string | null;
    orderType: OrderType;
    source: OrderSource;
    tableName?: string | null;
    createdAt: string;
    confirmedAt: string | null;
  };
  items: ReceiptItemData[];
  billing: {
    subtotal: number;
    discount: number;
    taxAmount: number;
    totalAmount: number;
    paymentMethod: PaymentMethod | null;
    paymentStatus: PaymentStatus;
  };
  reprint: boolean;
}

export interface KOTItemData {
  name: string;
  quantity: number;
  modifiers?: string[];
  specialInstructions?: string | null;
}

export interface KOTData {
  order: {
    id: string;
    orderNumber: string;
    tokenNumber: string | null;
    orderType: OrderType;
    source: OrderSource;
    tableName?: string | null;
    createdAt: string;
    confirmedAt: string | null;
    specialInstructions?: string | null;
  };
  items: KOTItemData[];
  reprint: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
    [key: string]: any;
  };
}
