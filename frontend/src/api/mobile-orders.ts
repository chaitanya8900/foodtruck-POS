import apiClient from './client';
import { Order, PaymentMethod } from '@/types';

export interface ConfirmPaymentPayload {
  paymentMethod: PaymentMethod;
  transactionReference?: string;
  amountReceived?: number;
}

export function normalizeOrder(raw: any): Order {
  if (!raw) return raw;
  const grandTotal = Number(raw.grandTotal ?? raw.total_amount ?? 0);
  const items = Array.isArray(raw.items)
    ? raw.items.map((i: any) => {
        const unitPrice = Number(i.unitPrice ?? i.unit_price_snapshot ?? 0);
        const totalPrice = Number(i.totalPrice ?? i.line_total ?? (unitPrice * (i.quantity || 1)));
        return {
          ...i,
          name: i.name || i.item_name_snapshot || 'Item',
          unitPrice,
          totalPrice,
          quantity: Number(i.quantity) || 1,
          customizations: i.customizations || i.customization_snapshot || [],
          specialInstructions: i.specialInstructions || i.special_instructions
        };
      })
    : [];

  return {
    ...raw,
    orderNumber: raw.orderNumber || raw.order_number || '',
    tokenNumber: raw.tokenNumber !== undefined ? raw.tokenNumber : raw.token_number,
    orderType: (raw.orderType || raw.order_type || '').toString().toUpperCase().includes('DINE') ? ('DINE_IN' as any) : ('TAKEAWAY' as any),
    orderStatus: raw.orderStatus || raw.order_status,
    paymentStatus: raw.paymentStatus || raw.payment_status,
    paymentMethod: raw.paymentMethod || raw.payment_method,
    subtotal: Number(raw.subtotal ?? 0),
    discount: Number(raw.discount ?? 0),
    tax: Number(raw.tax ?? raw.tax_amount ?? 0),
    grandTotal,
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
    confirmedAt: raw.confirmedAt || raw.confirmed_at,
    table: raw.table
      ? {
          ...raw.table,
          tableName: raw.table.tableName || raw.table.table_name || '',
          tableNumber: raw.table.tableNumber || raw.table.table_number || '',
          qrToken: raw.table.qrToken || raw.table.qr_token || ''
        }
      : null,
    hasKotPrinted: Boolean(
      raw.hasKotPrinted ||
      raw.has_kot_printed ||
      (Array.isArray(raw.printJobs || raw.print_jobs) &&
        (raw.printJobs || raw.print_jobs).some((pj: any) => pj.documentType === 'KOT' || pj.document_type === 'KOT'))
    ),
    items
  };
}

export const mobileOrdersApi = {
  getMobileOrders: async (filter?: 'pending_payment' | 'ready_for_token' | 'confirmed'): Promise<Order[]> => {
    const response = await apiClient.get<Order[]>('/mobile-orders', {
      params: { ...(filter ? { filter } : {}), limit: 100 },
    });
    const rawData = response.data;
    const data = Array.isArray(rawData)
      ? rawData
      : Array.isArray((rawData as any)?.data)
      ? (rawData as any).data
      : Array.isArray((rawData as any)?.orders)
      ? (rawData as any).orders
      : [];
    return data.map(normalizeOrder);
  },

  getOrderById: async (orderId: string): Promise<Order> => {
    const response = await apiClient.get<Order>(`/mobile-orders/${orderId}`);
    return normalizeOrder(response.data);
  },

  confirmMobileOrderPayment: async (orderId: string, payload: ConfirmPaymentPayload): Promise<Order> => {
    const response = await apiClient.post<Order>(`/mobile-orders/${orderId}/confirm-payment`, payload);
    return normalizeOrder(response.data);
  },

  issueToken: async (orderId: string): Promise<Order> => {
    const response = await apiClient.post<Order>(`/mobile-orders/${orderId}/issue-token`);
    return normalizeOrder(response.data);
  },

  printKOT: async (orderId: string): Promise<Order> => {
    const response = await apiClient.post<Order>(`/mobile-orders/${orderId}/print-kot`);
    return normalizeOrder(response.data);
  },

  cancelMobileOrder: async (orderId: string, reason?: string): Promise<Order> => {
    const response = await apiClient.post<Order>(`/mobile-orders/${orderId}/cancel`, { reason });
    return normalizeOrder(response.data);
  },
};

export default mobileOrdersApi;
