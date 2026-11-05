import apiClient from './client';
import { Table } from '@/types';

export const tablesApi = {
  getTables: async (): Promise<Table[]> => {
    const response = await apiClient.get<Table[]>('/tables');
    return response.data;
  },

  createTable: async (data: { tableNumber: string; tableName: string; isActive?: boolean }): Promise<Table> => {
    const response = await apiClient.post<Table>('/tables', data);
    return response.data;
  },

  updateTable: async (id: string, data: Partial<Table>): Promise<Table> => {
    const response = await apiClient.put<Table>(`/tables/${id}`, data);
    return response.data;
  },

  deleteTable: async (id: string): Promise<void> => {
    await apiClient.delete(`/tables/${id}`);
  },

  generateQR: async (id: string): Promise<{ qrToken: string; qrCodeUrl: string }> => {
    const response = await apiClient.post<{ qrToken: string; qrCodeUrl: string }>(`/tables/${id}/generate-qr`);
    return response.data;
  },
};

export default tablesApi;
