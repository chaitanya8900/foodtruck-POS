import { useQuery } from '@tanstack/react-query';
import useAuthStore from '@/store/auth';
import authApi from '@/api/auth';
import { UserRole } from '@/types';

export function useAuth() {
  const { user, business, token, isAuthenticated, login, logout, setUser, setBusiness } = useAuthStore();

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ['authProfile', token],
    queryFn: async () => {
      if (!token) return null;
      try {
        const fetchedUser = await authApi.getProfile();
        setUser(fetchedUser);
        return fetchedUser;
      } catch (err) {
        logout();
        throw err;
      }
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const currentUser = profile || user;

  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const isCashier = currentUser?.role === UserRole.CASHIER || isAdmin;
  const isKitchenStaff = currentUser?.role === UserRole.KITCHEN_STAFF || isAdmin;

  return {
    user: currentUser,
    business,
    token,
    isAuthenticated,
    isLoading,
    isError,
    isAdmin,
    isCashier,
    isKitchenStaff,
    login,
    logout,
    setUser,
    setBusiness,
  };
}

export default useAuth;
