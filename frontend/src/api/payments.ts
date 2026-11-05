import apiClient from './client';
import { Payment } from '@/types';

export interface InitiatePaymentRequest {
  orderId: string;
  amount: number;
  paymentMethod: 'upi' | 'phonepe';
  redirectUrl?: string;
}

export interface InitiatePaymentResponse {
  paymentId: string;
  paymentUrl?: string;
  status: string;
}

export const paymentsApi = {
  initiatePayment: async (data: InitiatePaymentRequest): Promise<InitiatePaymentResponse> => {
    const response = await apiClient.post<InitiatePaymentResponse>('/payments/initiate', data);
    return response.data;
  },

  getPaymentStatus: async (paymentId: string): Promise<Payment> => {
    const response = await apiClient.get<Payment>(`/payments/${paymentId}/status`);
    return response.data;
  },
};

export default paymentsApi;
