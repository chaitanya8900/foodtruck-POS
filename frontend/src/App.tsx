import React from 'react';
import { Routes, Route, Navigate, useSearchParams, useParams } from 'react-router-dom';

// Layouts
import AdminLayout from '@/components/layout/AdminLayout';
import POSLayout from '@/components/layout/POSLayout';

// Auth Pages
import LoginPage from '@/pages/LoginPage';

// POS & Staff Pages
import POSPage from '@/pages/pos/POSPage';
import MobileOrdersPage from '@/pages/mobile-orders/MobileOrdersPage';
import KitchenPage from '@/pages/kitchen/KitchenPage';

// Admin Pages
import DashboardPage from '@/pages/admin/DashboardPage';
import CategoriesPage from '@/pages/admin/CategoriesPage';
import MenuItemsPage from '@/pages/admin/MenuItemsPage';
import TablesPage from '@/pages/admin/TablesPage';
import OrdersPage from '@/pages/admin/OrdersPage';
import ReportsPage from '@/pages/admin/ReportsPage';
import UsersPage from '@/pages/admin/UsersPage';
import SettingsPage from '@/pages/admin/SettingsPage';

// Customer Flow
import CustomerOrderRouter from '@/pages/customer/CustomerOrderRouter';
import CustomerMenuPage from '@/pages/customer/CustomerMenuPage';
import CustomerCartPage from '@/pages/customer/CustomerCartPage';
import OrderTypeSelectPage from '@/pages/customer/OrderTypeSelectPage';
import PaymentSelectPage from '@/pages/customer/PaymentSelectPage';
import OrderConfirmationPage from '@/pages/customer/OrderConfirmationPage';

import PhonePeCheckoutPage from '@/pages/customer/PhonePeCheckoutPage';
import ScrollToTop from '@/components/common/ScrollToTop';

import useAuth from '@/hooks/useAuth';
import { useLocation } from 'react-router-dom';

const RootRedirect: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role === 'ADMIN') return <Navigate to="/admin" replace />;
  if (user.role === 'KITCHEN_STAFF') return <Navigate to="/kitchen" replace />;
  return <Navigate to="/pos" replace />;
};

const QrRedirect: React.FC = () => {
  const [searchParams] = useSearchParams();
  const qr = searchParams.get('qr') || searchParams.get('token');
  if (qr) {
    return <Navigate to={`/order/t/${qr}`} replace />;
  }
  return <Navigate to="/" replace />;
};

interface ProtectedRouteProps {
  allowedRoles?: string[];
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles, children }) => {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (user.role === 'CASHIER') return <Navigate to="/pos" replace />;
    if (user.role === 'KITCHEN_STAFF') return <Navigate to="/kitchen" replace />;
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
};

const LegacyConfirmationRedirect: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  return <Navigate to={`/order/t/main/confirmation/${orderId}`} replace />;
};

export const App: React.FC = () => {
  return (
    <>
      <ScrollToTop />
      <Routes>
      {/* Root redirect based on role */}
      <Route path="/" element={<RootRedirect />} />

      {/* QR Query Redirect */}
      <Route path="/order" element={<QrRedirect />} />
      <Route path="/order/main" element={<Navigate to="/order/t/main" replace />} />

      {/* PhonePe UPI Simulation Checkout */}
      <Route path="/checkout/pay" element={<PhonePeCheckoutPage />} />
      <Route path="/order/confirmation/:orderId" element={<LegacyConfirmationRedirect />} />
      <Route path="/order/:orderId/status" element={<LegacyConfirmationRedirect />} />

      {/* Login */}
      <Route path="/login" element={<LoginPage />} />

      {/* Customer QR Ordering Routes (Public) */}
      <Route path="/order/t/:qrToken" element={<CustomerOrderRouter />}>
        <Route index element={<CustomerMenuPage />} />
        <Route path="cart" element={<CustomerCartPage />} />
        <Route path="order-type" element={<OrderTypeSelectPage />} />
        <Route path="payment" element={<PaymentSelectPage />} />
        <Route path="confirmation/:orderId" element={<OrderConfirmationPage />} />
      </Route>

      {/* Staff Counter POS (Protected: Cashier, Admin & Kitchen) */}
      <Route
        element={
          <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER', 'KITCHEN_STAFF']}>
            <POSLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/pos" element={<POSPage />} />
        <Route path="/mobile-orders" element={<MobileOrdersPage />} />
        <Route path="/kitchen" element={<KitchenPage />} />
      </Route>

      {/* Admin Management (Protected: Admin Only) */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="items" element={<MenuItemsPage />} />
        <Route path="tables" element={<TablesPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      {/* Catch-all Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
};

export default App;
