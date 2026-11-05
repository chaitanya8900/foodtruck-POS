import apiClient from './client';
import { CreateOrderRequest, Order, OrderStatus } from '@/types';

export interface GetOrdersParams {
  source?: string;
  orderType?: string;
  orderStatus?: string;
  paymentStatus?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export const ordersApi = {
  createCounterOrder: async (orderData: CreateOrderRequest): Promise<Order> => {
    const response = await apiClient.post<Order>('/orders/counter', orderData);
    return response.data;
  },

  getOrders: async (params?: GetOrdersParams): Promise<{ orders: Order[]; total: number }> => {
    const response = await apiClient.get<{ orders: Order[]; total: number }>('/orders', { params });
    // In case the API returns just Order[] or { orders, total }
    if (Array.isArray(response.data)) {
      return { orders: response.data, total: response.data.length };
    }
    return response.data;
  },

  getOrderById: async (id: string): Promise<Order> => {
    const response = await apiClient.get<Order>(`/orders/${id}`);
    return response.data;
  },

  updateOrderStatus: async (id: string, status: OrderStatus): Promise<Order> => {
    const response = await apiClient.patch<Order>(`/orders/${id}/status`, { status });
    return response.data;
  },

  cancelOrder: async (id: string, reason?: string): Promise<Order> => {
    const response = await apiClient.post<Order>(`/orders/${id}/cancel`, { reason });
    return response.data;
  },
};

export default ordersApi;
