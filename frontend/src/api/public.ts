import apiClient from './client';
import { CreateQROrderRequest, MenuCategory, Order, Table, OrderingStatus } from '@/types';

export interface PublicTableInfo {
  id?: string;
  table?: Table;
  table_name?: string;
  table_number?: string;
  qr_token?: string;
  is_main_qr?: boolean;
  businessName?: string;
  business?: {
    id: string;
    name: string;
    currency: string;
    tax_rate?: number;
    taxRate?: number;
    is_dine_in_enabled?: boolean;
    is_takeaway_enabled?: boolean;
    operatingHours?: any;
    orderingStatus?: OrderingStatus;
  };
}

export interface PublicMenuResponse {
  categories: MenuCategory[];
  business: {
    id: string;
    name: string;
    address?: string;
    phone?: string;
    taxRate: number;
    dineInEnabled: boolean;
    takeawayEnabled: boolean;
    operatingHours?: any;
    orderingStatus?: OrderingStatus;
  };
}

export interface CreateQROrderResponse {
  order: Order;
  paymentUrl?: string; // If online PhonePe payment initiated
  paymentTransactionId?: string;
}

import { normalizeOrder } from './mobile-orders';

export const publicApi = {
  getPublicMenu: async (qrToken?: string): Promise<PublicMenuResponse> => {
    const response = await apiClient.get<PublicMenuResponse>('/public/menu', {
      params: qrToken ? { qrToken } : undefined,
    });
    return response.data;
  },

  getTableByQR: async (qrToken: string): Promise<PublicTableInfo> => {
    const response = await apiClient.get<PublicTableInfo>(`/public/table/${qrToken}`);
    return response.data;
  },

  createQROrder: async (orderData: CreateQROrderRequest): Promise<CreateQROrderResponse> => {
    const response = await apiClient.post<CreateQROrderResponse>('/public/orders', orderData);
    const data = response.data;
    return {
      ...data,
      order: normalizeOrder(data.order),
    };
  },

  getOrderStatus: async (orderId: string): Promise<Order> => {
    const response = await apiClient.get<Order>(`/public/orders/${orderId}/status`);
    return normalizeOrder(response.data);
  },

  switchToCounter: async (orderId: string): Promise<Order> => {
    const response = await apiClient.post<Order>(`/public/orders/${orderId}/switch-to-counter`);
    return normalizeOrder(response.data);
  },

  cancelPublicOrder: async (orderId: string): Promise<Order | null> => {
    try {
      const response = await apiClient.post<Order>(`/public/orders/${orderId}/cancel`);
      return normalizeOrder(response.data);
    } catch {
      return null;
    }
  },
};

export default publicApi;
