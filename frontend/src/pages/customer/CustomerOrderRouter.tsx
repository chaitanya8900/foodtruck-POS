import React, { useEffect } from 'react';
import { useParams, Outlet, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import publicApi from '@/api/public';
import useCartStore from '@/store/cart';
import { useSocketEvent } from '@/hooks/useSocket';
import CustomerLayout from '@/components/layout/CustomerLayout';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';

export const CustomerOrderRouter: React.FC = () => {
  const { qrToken } = useParams<{ qrToken: string }>();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();

  // Instant real-time updates when admin turns ordering on/off or alters schedule
  useSocketEvent('ordering_status_changed', () => {
    queryClient.invalidateQueries({ queryKey: ['publicTable', qrToken] });
    queryClient.invalidateQueries({ queryKey: ['publicMenu', qrToken] });
  });

  // Ensure scroll is reset to the very top whenever customer navigates between order pages
  useEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    } catch {
      window.scrollTo(0, 0);
    }
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  }, [pathname]);

  // Fetch table and business info
  const { data: tableData, isLoading, error } = useQuery({
    queryKey: ['publicTable', qrToken],
    queryFn: () => (qrToken ? publicApi.getTableByQR(qrToken) : Promise.reject('No token')),
    enabled: !!qrToken,
    retry: 1,
  });

  // Fetch public menu to automatically prune any stale/migrated items from customer cart
  const { data: menuData } = useQuery({
    queryKey: ['publicMenu', qrToken],
    queryFn: () => (qrToken ? publicApi.getPublicMenu(qrToken) : Promise.reject('No token')),
    enabled: !!qrToken,
    staleTime: 60000,
  });

  useEffect(() => {
    if (!menuData) return;
    const rawCategories: any[] = Array.isArray(menuData)
      ? menuData
      : (menuData as any)?.categories || [];
    const allValidItems: any[] = rawCategories.flatMap((c) => c.items || []);
    if (allValidItems.length > 0) {
      const pruned = useCartStore.getState().revalidateCart(allValidItems);
      if (pruned) {
        toast('Some items in your cart were updated or are no longer on the menu.', {
          icon: 'ℹ️',
          duration: 4000,
        });
      }
    }
  }, [menuData]);

  if (isLoading && !tableData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8EFE6]">
        <Spinner size="lg" label="Setting up your dining experience..." />
      </div>
    );
  }

  if (error || !tableData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8EFE6] p-6">
        <EmptyState
          title="Invalid or Inactive QR Code"
          description="This QR code is either expired, inactive, or invalid. Please ask staff for assistance."
        />
      </div>
    );
  }

  const raw = tableData as any;
  const isMainQr = raw?.is_main_qr || qrToken === 'main' || qrToken === 'qr_main';
  const tableName = isMainQr
    ? ''
    : (raw?.table_name ||
       raw?.table?.tableName ||
       raw?.table?.table_name ||
       raw?.tableName ||
       '');
  const tableNumber = isMainQr
    ? ''
    : (raw?.table_number ||
       raw?.table?.tableNumber ||
       raw?.tableNumber ||
       '');
  const businessName =
    raw?.business?.name ||
    raw?.businessName ||
    'Food Truck Express';
  const taxRate =
    raw?.business?.taxRate ||
    raw?.business?.tax_rate ||
    5;

  const orderingStatus =
    raw?.business?.orderingStatus ||
    (menuData as any)?.business?.orderingStatus ||
    null;

  const contextValue = {
    qrToken,
    isMainQr,
    tableInfo: {
      tableName,
      tableNumber,
    },
    business: {
      name: businessName,
      taxRate: Number(taxRate) || 5,
    },
    orderingStatus,
  };

  return (
    <div className="bg-[#F8EFE6] min-h-screen">
      <CustomerLayout
        businessName={businessName}
        tableName={tableName}
        orderingStatus={orderingStatus}
      >
        <Outlet context={contextValue} />
      </CustomerLayout>
    </div>
  );
};

export default CustomerOrderRouter;
