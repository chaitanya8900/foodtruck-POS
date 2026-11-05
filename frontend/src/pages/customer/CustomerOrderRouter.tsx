import React from 'react';
import { useParams, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import publicApi from '@/api/public';
import CustomerLayout from '@/components/layout/CustomerLayout';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';

export const CustomerOrderRouter: React.FC = () => {
  const { qrToken } = useParams<{ qrToken: string }>();

  // Fetch table and business info
  const { data: tableData, isLoading, error } = useQuery({
    queryKey: ['publicTable', qrToken],
    queryFn: () => (qrToken ? publicApi.getTableByQR(qrToken) : Promise.reject('No token')),
    enabled: !!qrToken,
    retry: 1,
  });

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
  };

  return (
    <div className="bg-[#F8EFE6] min-h-screen">
      <CustomerLayout
        businessName={businessName}
        tableName={tableName}
      >
        <Outlet context={contextValue} />
      </CustomerLayout>
    </div>
  );
};

export default CustomerOrderRouter;
