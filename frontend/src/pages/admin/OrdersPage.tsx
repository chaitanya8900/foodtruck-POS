import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Printer, RotateCcw, Eye, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

import ordersApi from '@/api/orders';
import printJobsApi from '@/api/print-jobs';
import { Order, OrderSource, OrderType, OrderStatus, DocumentType } from '@/types';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import DataTable, { Column } from '@/components/ui/DataTable';
import { OrderStatusBadge, PaymentStatusBadge, OrderTypeBadge, OrderSourceBadge } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';

export const OrdersPage: React.FC = () => {
  const queryClient = useQueryClient();

  // Filters
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Selected Order for Detail Modal
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Fetch orders
  const { data, isLoading } = useQuery({
    queryKey: ['ordersHistory', sourceFilter, typeFilter, statusFilter],
    queryFn: () =>
      ordersApi.getOrders({
        source: sourceFilter || undefined,
        orderType: typeFilter || undefined,
        orderStatus: statusFilter || undefined,
        limit: 100,
      }),
    staleTime: 30 * 1000,
  });

  const orders: Order[] = data?.orders || [];

  // Client-side search filter
  const filteredOrders = orders.filter((o) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const orderNo = (o.orderNumber || (o as any).order_number || '').toLowerCase();
    const tokenNo = (o.tokenNumber || (o as any).token_number || '').toLowerCase();
    const tableName = (o.table?.tableName || (o.table as any)?.table_name || '').toLowerCase();
    const matchesItems = Array.isArray(o.items) && o.items.some((i) => {
      const name = (i.name || (i as any).itemName || (i as any).item_name_snapshot || '').toLowerCase();
      return name.includes(q);
    });

    return orderNo.includes(q) || tokenNo.includes(q) || tableName.includes(q) || matchesItems;
  });

  // Reprint Mutation
  const reprintMutation = useMutation({
    mutationFn: ({ orderId, docType }: { orderId: string; docType?: DocumentType }) =>
      printJobsApi.reprintOrder(orderId, docType),
    onSuccess: () => {
      toast.success('Reprint command dispatched to thermal printer');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Reprint failed');
    },
  });

  // Cancel order mutation
  const cancelMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      ordersApi.cancelOrder(orderId, reason),
    onSuccess: (updated) => {
      toast.success(`Order #${updated.orderNumber} cancelled`);
      setSelectedOrder(null);
      queryClient.invalidateQueries({ queryKey: ['ordersHistory'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Cancellation failed');
    },
  });

  // Define table columns
  const columns: Column<Order>[] = [
    {
      key: 'orderNumber',
      header: 'Token / Order',
      render: (order) => (
        <div>
          <div className="font-mono font-bold text-[#3A0A0F]">
            {order.tokenNumber ? `#${order.tokenNumber}` : '—'}
          </div>
          <div className="text-xs text-[#6B4F48] font-mono">#{order.orderNumber}</div>
        </div>
      ),
      sortable: true,
    },
    {
      key: 'createdAt',
      header: 'Date & Time',
      render: (order) => (
        <span className="text-xs text-[#6B4F48]">{formatDateTime(order.createdAt)}</span>
      ),
      sortable: true,
    },
    {
      key: 'source',
      header: 'Source',
      render: (order) => <OrderSourceBadge source={order.source} />,
    },
    {
      key: 'orderType',
      header: 'Type',
      render: (order) => <OrderTypeBadge type={order.orderType} />,
    },
    {
      key: 'grandTotal',
      header: 'Total',
      render: (order) => (
        <span className="font-extrabold text-[#3A0A0F]">{formatCurrency(order.grandTotal)}</span>
      ),
      sortable: true,
    },
    {
      key: 'paymentStatus',
      header: 'Payment',
      render: (order) => <PaymentStatusBadge status={order.paymentStatus} />,
    },
    {
      key: 'orderStatus',
      header: 'Status',
      render: (order) => <OrderStatusBadge status={order.orderStatus} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (order) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedOrder(order);
            }}
            className="p-1.5 rounded-lg text-[#3A0A0F] hover:text-[#5B0F1B] hover:bg-[#EAD8C0]/40 transition-colors"
            title="View Details"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              reprintMutation.mutate({ orderId: order.id });
            }}
            className="p-1.5 rounded-lg text-[#3A0A0F] hover:text-[#5B0F1B] hover:bg-[#EAD8C0]/40 transition-colors"
            title="Reprint Slips"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-[#3A0A0F] tracking-tight">Order History</h1>
        <p className="text-xs text-[#6B4F48]">
          Complete audit trail of all counter POS and QR customer transactions
        </p>
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#FDF6EC] p-4 rounded-2xl border border-[#EAD8C0]">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B4F48]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, token, items..."
            className="w-full pl-10 pr-4 py-2 bg-[#FAF4F2] text-[#3A0A0F] placeholder-[#6B4F48]/60 rounded-xl text-sm border border-[#EAD8C0] focus:outline-none focus:ring-2 focus:ring-[#3A0A0F]/15 transition-all min-h-[44px]"
          />
        </div>

        <Select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          options={[
            { value: '', label: 'All Sources' },
            { value: OrderSource.POS, label: 'Counter POS' },
            { value: OrderSource.QR, label: 'Customer QR' },
          ]}
        />

        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={[
            { value: '', label: 'All Service Types' },
            { value: OrderType.DINE_IN, label: 'Dine-In' },
            { value: OrderType.TAKEAWAY, label: 'Takeaway' },
          ]}
        />

        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: '', label: 'All Statuses' },
            { value: OrderStatus.CONFIRMED, label: 'Confirmed' },
            { value: OrderStatus.PREPARING, label: 'Preparing' },
            { value: OrderStatus.READY, label: 'Ready' },
            { value: OrderStatus.COMPLETED, label: 'Completed' },
            { value: OrderStatus.CANCELLED, label: 'Cancelled' },
          ]}
        />
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns as any}
        data={filteredOrders as any}
        isLoading={isLoading && orders.length === 0}
        emptyMessage="No orders match your filter criteria"
        onRowClick={(order) => setSelectedOrder(order as unknown as Order)}
        pageSize={15}
      />

      {/* Order Detail Modal */}
      <Modal
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        title={
          selectedOrder
            ? `Order #${selectedOrder.orderNumber} ${
                selectedOrder.tokenNumber ? `(Token #${selectedOrder.tokenNumber})` : ''
              }`
            : 'Order Details'
        }
        description="Comprehensive order, payment, and printing details"
        maxWidth="2xl"
      >
        {selectedOrder && (
          <div className="space-y-5 pt-2 max-h-[75vh] overflow-y-auto pr-1">
            {/* Metadata Chips */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <OrderSourceBadge source={selectedOrder.source} />
              <OrderTypeBadge type={selectedOrder.orderType} />
              <OrderStatusBadge status={selectedOrder.orderStatus} />
              <PaymentStatusBadge status={selectedOrder.paymentStatus} />
              <span className="text-slate-500 font-mono">
                {formatDateTime(selectedOrder.createdAt)}
              </span>
            </div>

            {/* Items Table */}
            <div className="bg-[#FAF4F2] rounded-2xl p-4 border border-[#EAD8C0] space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#3A0A0F]">
                Ordered Items
              </h4>
              <div className="divide-y divide-[#EAD8C0]/60 text-xs">
                {selectedOrder.items.map((item, idx) => (
                  <div key={idx} className="py-2 flex items-start justify-between">
                    <div>
                      <p className="font-bold text-[#3A0A0F]">
                        {item.quantity} × {item.name}
                      </p>
                      {item.customizations && item.customizations.length > 0 && (
                        <p className="text-[11px] text-[#6B4F48] pl-4 mt-0.5">
                          {item.customizations.map((c) => c.optionName).join(', ')}
                        </p>
                      )}
                      {item.specialInstructions && (
                        <p className="text-[11px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded pl-4 mt-0.5 border border-amber-200">
                          Note: {item.specialInstructions}
                        </p>
                      )}
                    </div>
                    <span className="font-bold text-[#3A0A0F]">
                      {formatCurrency(item.totalPrice)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Financial Breakdown */}
              <div className="pt-3 border-t border-[#EAD8C0] space-y-1.5 text-xs text-[#6B4F48]">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold text-[#3A0A0F]">
                    {formatCurrency(selectedOrder.subtotal)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>GST / Tax</span>
                  <span className="font-semibold text-[#3A0A0F]">
                    {formatCurrency(selectedOrder.tax)}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-[#EAD8C0] text-sm font-black text-[#3A0A0F]">
                  <span>Grand Total</span>
                  <span className="text-[#3A0A0F] font-extrabold">
                    {formatCurrency(selectedOrder.grandTotal)}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="pt-4 border-t border-[#EAD8C0] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  leftIcon={<Printer className="w-3.5 h-3.5" />}
                  onClick={() =>
                    reprintMutation.mutate({
                      orderId: selectedOrder.id,
                      docType: DocumentType.CUSTOMER_RECEIPT,
                    })
                  }
                  className="border-[#EAD8C0] text-[#3A0A0F] hover:bg-[#EAD8C0]/40"
                >
                  Reprint Slip
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                  onClick={() =>
                    reprintMutation.mutate({
                      orderId: selectedOrder.id,
                      docType: DocumentType.KOT,
                    })
                  }
                  className="border-[#EAD8C0] text-[#3A0A0F] hover:bg-[#EAD8C0]/40"
                >
                  Reprint KOT
                </Button>
              </div>

              {selectedOrder.orderStatus !== OrderStatus.CANCELLED && (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  leftIcon={<XCircle className="w-3.5 h-3.5" />}
                  onClick={() =>
                    cancelMutation.mutate({
                      orderId: selectedOrder.id,
                      reason: 'Cancelled by administrator',
                    })
                  }
                  isLoading={cancelMutation.isPending}
                >
                  Cancel Order
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default OrdersPage;
