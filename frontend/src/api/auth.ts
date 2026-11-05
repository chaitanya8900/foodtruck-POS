import apiClient from './client';
import { LoginRequest, LoginResponse, User } from '@/types';
import { supabase } from '@/lib/supabaseClient';

export const authApi = {
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    const response = await apiClient.post<any>('/auth/login', credentials);
    const data = response.data?.data || response.data;

    // Synchronize client-side Supabase Auth session if configured
    try {
      if (supabase) {
        await supabase.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        });
      }
    } catch {
      // Non-blocking background sync
    }

    return data;
  },

  logout: async (): Promise<void> => {
    try {
      await apiClient.post('/auth/logout');
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch {
      // Ignore logout errors
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('business');
    }
  },

  getProfile: async (): Promise<User> => {
    const response = await apiClient.get<User>('/auth/me');
    return response.data;
  },
};

export default authApi;
