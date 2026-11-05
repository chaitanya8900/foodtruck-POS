import apiClient from './client';
import { Business } from '@/types';

export const settingsApi = {
  getSettings: async (): Promise<Business> => {
    const response = await apiClient.get<Business>('/settings');
    return response.data;
  },

  updateSettings: async (data: Partial<Business>): Promise<Business> => {
    const response = await apiClient.put<Business>('/settings', data);
    return response.data;
  },
};

export default settingsApi;
