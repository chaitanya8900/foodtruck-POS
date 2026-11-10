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

function isTokenValid(token: string | null): boolean {
  if (!token) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

let storedToken = localStorage.getItem('token') || null;
let storedUser: User | null = null;
let storedBusiness: Business | null = null;

if (storedToken && !isTokenValid(storedToken)) {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('business');
  storedToken = null;
}

try {
  const userJson = localStorage.getItem('user');
  if (userJson) {
    const parsed = JSON.parse(userJson);
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
  isAuthenticated: Boolean(storedToken && storedUser && isTokenValid(storedToken)),

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
