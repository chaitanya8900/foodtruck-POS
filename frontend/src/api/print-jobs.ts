import apiClient from './client';
import { DocumentType, PrintJob, PrintJobStatus } from '@/types';

export interface PrinterStatusInfo {
  connected: boolean;
  printerName: string;
  lastHeartbeat?: string;
  pendingJobsCount: number;
}

export const printJobsApi = {
  getPendingJobs: async (): Promise<PrintJob[]> => {
    const response = await apiClient.get<PrintJob[]>('/print-jobs/pending');
    return response.data;
  },

  updateJobStatus: async (jobId: string, status: PrintJobStatus, failureReason?: string): Promise<PrintJob> => {
    const response = await apiClient.patch<PrintJob>(`/print-jobs/${jobId}/status`, {
      status,
      failureReason,
    });
    return response.data;
  },

  retryJob: async (jobId: string): Promise<PrintJob> => {
    const response = await apiClient.post<PrintJob>(`/print-jobs/${jobId}/retry`);
    return response.data;
  },

  reprintOrder: async (orderId: string, documentType?: DocumentType): Promise<PrintJob[]> => {
    const response = await apiClient.post<PrintJob[]>(`/orders/${orderId}/reprint`, {
      documentType,
    });
    return response.data;
  },

  getPrinterStatus: async (): Promise<PrinterStatusInfo> => {
    const response = await apiClient.get<PrinterStatusInfo>('/print-jobs/status');
    return response.data;
  },
};

export default printJobsApi;
