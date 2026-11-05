import apiClient from './client';
import { DailySalesReport, PaymentSummaryReport, TopItemReport } from '@/types';

export interface DateRangeFilter {
  startDate?: string;
  endDate?: string;
}

export interface OrderSummaryReport {
  totalOrders: number;
  dineInOrders: number;
  takeawayOrders: number;
  posOrders: number;
  qrOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  averageOrderValue: number;
}

export const reportsApi = {
  getDailySales: async (params?: DateRangeFilter): Promise<DailySalesReport[]> => {
    const response = await apiClient.get<any>('/reports/daily-sales', { params });
    const raw = response.data;
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.dailyTimeline)) return raw.dailyTimeline;
    return [];
  },

  getPaymentSummary: async (params?: DateRangeFilter): Promise<PaymentSummaryReport> => {
    const response = await apiClient.get<any>('/reports/payment-summary', { params });
    const raw = response.data;
    if (raw && raw.byMethod) {
      return {
        cashTotal: raw.byMethod.CASH?.totalAmount || 0,
        cashCount: raw.byMethod.CASH?.count || 0,
        upiTotal: (raw.byMethod.UPI?.totalAmount || 0) + (raw.byMethod.PHONEPE?.totalAmount || 0),
        upiCount: (raw.byMethod.UPI?.count || 0) + (raw.byMethod.PHONEPE?.count || 0),
        pendingTotal: raw.byStatus?.PENDING?.totalAmount || 0,
        pendingCount: raw.byStatus?.PENDING?.count || 0,
        refundedTotal: raw.byStatus?.REFUNDED?.totalAmount || 0,
      };
    }
    return raw;
  },

  getOrderSummary: async (params?: DateRangeFilter): Promise<OrderSummaryReport> => {
    const response = await apiClient.get<any>('/reports/order-summary', { params });
    const raw = response.data;
    if (raw && (raw.bySource || raw.byType)) {
      return {
        totalOrders: raw.totalOrders || 0,
        dineInOrders: raw.byType?.DINE_IN?.count || 0,
        takeawayOrders: raw.byType?.TAKEAWAY?.count || 0,
        posOrders: raw.bySource?.POS?.count || 0,
        qrOrders: raw.bySource?.QR?.count || 0,
        completedOrders: raw.byStatus?.COMPLETED || 0,
        cancelledOrders: raw.byStatus?.CANCELLED || 0,
        averageOrderValue: 0,
      };
    }
    return raw;
  },

  getTopItems: async (params?: DateRangeFilter & { limit?: number }): Promise<TopItemReport[]> => {
    const response = await apiClient.get<any>('/reports/top-items', { params });
    const raw = response.data;
    if (Array.isArray(raw)) {
      return raw.map((item: any) => ({
        menuItemId: item.menuItemId || item.id || '',
        name: item.name || '',
        categoryName: item.categoryName || 'General',
        quantitySold: item.quantitySold ?? item.quantity ?? 0,
        revenue: item.revenue ?? item.totalSales ?? 0,
      }));
    }
    return [];
  },
};

export default reportsApi;
