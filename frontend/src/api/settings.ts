import apiClient from './client';
import { Business, MobileOrderingSchedule, OrderingStatus } from '@/types';

export const settingsApi = {
  getSettings: async (): Promise<Business> => {
    const response = await apiClient.get<Business>('/settings');
    return response.data;
  },

  updateSettings: async (data: Partial<Business>): Promise<Business> => {
    const response = await apiClient.put<Business>('/settings', data);
    return response.data;
  },

  updateMobileOrderingStatus: async (payload: {
    manualClosed?: boolean;
    enabled?: boolean;
    days?: string[];
    openTime?: string;
    closeTime?: string;
    manualClosedMessage?: string;
  }): Promise<{ operatingHours: MobileOrderingSchedule; orderingStatus: OrderingStatus }> => {
    const response = await apiClient.patch<{ success: boolean; data: { operatingHours: MobileOrderingSchedule; orderingStatus: OrderingStatus } }>(
      '/settings/mobile-ordering-status',
      payload
    );
    return (response.data as any)?.data || response.data;
  },
};

export default settingsApi;
