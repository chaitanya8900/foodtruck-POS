import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Store, Lock, Mail, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

import authApi from '@/api/auth';
import useAuthStore from '@/store/auth';
import { UserRole } from '@/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(4, 'Password must be at least 4 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, user, isAuthenticated } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isAuthenticated && user) {
      const from = (location.state as any)?.from?.pathname;
      if (from) {
        navigate(from, { replace: true });
        return;
      }
      if (user.role === UserRole.ADMIN) navigate('/admin', { replace: true });
      else if (user.role === UserRole.KITCHEN_STAFF) navigate('/kitchen', { replace: true });
      else navigate('/pos', { replace: true });
    }
  }, [isAuthenticated, user, navigate, location]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null);
    try {
      const response = await authApi.login(data);
      login(response.user, response.token, response.business);
      toast.success(`Welcome back, ${response.user.name}!`);

      // Determine redirect location
      const from = (location.state as any)?.from?.pathname;
      if (from) {
        navigate(from, { replace: true });
        return;
      }

      switch (response.user.role) {
        case UserRole.ADMIN:
          navigate('/admin', { replace: true });
          break;
        case UserRole.KITCHEN_STAFF:
          navigate('/kitchen', { replace: true });
          break;
        case UserRole.CASHIER:
        default:
          navigate('/pos', { replace: true });
          break;
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Invalid email or password';
      setServerError(msg);
      toast.error(msg);
    }
  };

  return (
    <div className="min-h-screen bg-[#3A0A0F] flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background Subtle Warm Gradient Blobs */}
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-[#5B0F1B]/50 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-[#EAD8C0]/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-[#FDF6EC] rounded-3xl shadow-2xl p-8 sm:p-10 border border-[#EAD8C0] z-10">
        {/* Brand Header */}
        <div className="text-center space-y-2 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#3A0A0F] text-white flex items-center justify-center mx-auto shadow-xl shadow-[#3A0A0F]/30">
            <Store className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-[#3A0A0F] tracking-tight">Food Truck POS</h1>
          <p className="text-xs text-[#6B4F48]">
            Sign in to access counter terminal & management
          </p>
        </div>

        {/* Server Error Alert */}
        {serverError && (
          <div className="mb-6 p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
            {serverError}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Input
            label="Staff Email"
            type="email"
            placeholder="admin@foodtruck.com"
            leftIcon={<Mail className="w-4 h-4 text-[#6B4F48]" />}
            error={errors.email?.message}
            {...register('email')}
          />

          <div className="relative">
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              leftIcon={<Lock className="w-4 h-4 text-[#6B4F48]" />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[#6B4F48] hover:text-[#3A0A0F] focus:outline-none pointer-events-auto"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
              error={errors.password?.message}
              {...register('password')}
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isSubmitting}
            className="w-full font-bold shadow-lg shadow-[#3A0A0F]/20 text-base mt-2"
          >
            Sign In to Terminal
          </Button>
        </form>

        {/* Footer info */}
        <div className="mt-8 text-center text-[11px] text-[#6B4F48] border-t border-[#EAD8C0] pt-4">
          Food Truck POS & QR Self-Ordering Platform
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
