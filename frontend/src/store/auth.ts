import { create } from 'zustand';
import { Business, User } from '@/types';

interface AuthState {
  user: User | null;
  business: Business | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: User, token: string, business?: Business) => void;
  logout: () => void;
  setUser: (user: User) => void;
  setBusiness: (business: Business) => void;
}

const storedToken = localStorage.getItem('token') || null;
let storedUser: User | null = null;
let storedBusiness: Business | null = null;

try {
  const userJson = localStorage.getItem('user');
  if (userJson) {
    const parsed = JSON.parse(userJson);
    // If no valid token, purge unauthenticated remnants
    if (!storedToken) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('business');
    } else {
      storedUser = parsed;
    }
  }
  const businessJson = localStorage.getItem('business');
  if (businessJson && storedUser) {
    storedBusiness = JSON.parse(businessJson);
  }
} catch {
  // Ignore parsing errors
}

export const useAuthStore = create<AuthState>((set) => ({
  user: storedUser,
  business: storedBusiness,
  token: storedToken,
  isAuthenticated: Boolean(storedToken && storedUser),

  login: (user: User, token: string, business?: Business) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    if (business) {
      localStorage.setItem('business', JSON.stringify(business));
    }
    set({
      user,
      token,
      business: business || null,
      isAuthenticated: true,
    });
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('business');
    set({
      user: null,
      business: null,
      token: null,
      isAuthenticated: false,
    });
  },

  setUser: (user: User) => {
    localStorage.setItem('user', JSON.stringify(user));
    set({ user });
  },

  setBusiness: (business: Business) => {
    localStorage.setItem('business', JSON.stringify(business));
    set({ business });
  },
}));

export default useAuthStore;
