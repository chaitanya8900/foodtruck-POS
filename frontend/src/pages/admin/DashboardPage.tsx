import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DollarSign,
  ShoppingBag,
  CreditCard,
  Banknote,
  Printer,
  TrendingUp,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

import reportsApi from '@/api/reports';
import ordersApi from '@/api/orders';
import printJobsApi from '@/api/print-jobs';
import { formatCurrency, formatTime, formatDate } from '@/lib/utils';
import StatCard from '@/components/ui/StatCard';
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card';
import { OrderStatusBadge, OrderTypeBadge } from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';

export const DashboardPage: React.FC = () => {
  // Fetch daily sales report
  const { data: dailySales = [], isLoading: loadingSales } = useQuery({
    queryKey: ['dailySales'],
    queryFn: () => reportsApi.getDailySales(),
    staleTime: 60 * 1000,
  });

  // Fetch payment summary
  const { data: paymentSummary } = useQuery({
    queryKey: ['paymentSummary'],
    queryFn: () => reportsApi.getPaymentSummary(),
    staleTime: 60 * 1000,
  });

  // Fetch top items
  const { data: topItems = [] } = useQuery({
    queryKey: ['topItems'],
    queryFn: () => reportsApi.getTopItems({ limit: 5 }),
    staleTime: 60 * 1000,
  });

  // Fetch recent orders
  const { data: ordersData } = useQuery({
    queryKey: ['recentOrders'],
    queryFn: () => ordersApi.getOrders({ limit: 10 }),
    staleTime: 30 * 1000,
  });

  // Fetch printer status
  const { data: printerStatus } = useQuery({
    queryKey: ['printerStatus'],
    queryFn: () => printJobsApi.getPrinterStatus(),
    staleTime: 30 * 1000,
    refetchInterval: 15000,
  });

  const recentOrders = ordersData?.orders || [];

  // Summary Metrics (today)
  const todaySales = dailySales[dailySales.length - 1] || {
    grossSales: 0,
    totalOrders: 0,
    cashCollections: 0,
    upiCollections: 0,
  };

  // 7-day sales chart data
  const chartData = dailySales.slice(-7).map((d) => ({
    date: formatDate(d.date, 'dd MMM'),
    revenue: d.grossSales,
    orders: d.totalOrders,
  }));

  // Pie chart data: Counter vs QR
  const pieData = [
    { name: 'Counter POS', value: todaySales.counterOrdersCount || 0, color: '#3A0A0F' },
    { name: 'Customer QR', value: todaySales.qrOrdersCount || 0, color: '#EAD8C0' },
  ];

  if (loadingSales && dailySales.length === 0) {
    return (
      <div className="py-24 flex items-center justify-center">
        <Spinner size="lg" label="Loading dashboard metrics..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Printer Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#3A0A0F] tracking-tight">Executive Dashboard</h1>
          <p className="text-sm text-[#6B4F48] mt-0.5">Live operational overview for today</p>
        </div>

        {/* Printer Status Pill */}
        <div className="flex items-center gap-2 bg-[#FDF6EC] px-4 py-2 rounded-xl border border-[#EAD8C0] shadow-xs text-xs">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              printerStatus?.connected ? 'bg-[#1F5A34] animate-pulse' : 'bg-red-500'
            }`}
          />
          <Printer className="w-4 h-4 text-[#6B4F48]" />
          <span className="font-semibold text-[#3A0A0F]">Thermal Printer:</span>
          <span
            className={`font-bold ${
              printerStatus?.connected ? 'text-[#1F5A34]' : 'text-red-700'
            }`}
          >
            {printerStatus?.connected ? 'Connected' : 'Offline / Standby'}
          </span>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Today's Revenue"
          value={formatCurrency(todaySales.grossSales || 0)}
          icon={<DollarSign className="w-6 h-6" />}
          color="teal"
        />
        <StatCard
          label="Today's Orders"
          value={todaySales.totalOrders || 0}
          icon={<ShoppingBag className="w-6 h-6" />}
          color="slate"
        />
        <StatCard
          label="Cash Collections"
          value={formatCurrency(paymentSummary?.cashTotal || todaySales.cashCollections || 0)}
          icon={<Banknote className="w-6 h-6" />}
          color="teal"
        />
        <StatCard
          label="UPI Collections"
          value={formatCurrency(paymentSummary?.upiTotal || todaySales.upiCollections || 0)}
          icon={<CreditCard className="w-6 h-6" />}
          color="slate"
        />
      </div>

      {/* Charts Section: Revenue 7 Days + Order Source Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue BarChart (2 cols) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Sales Trend (Last 7 Days)</CardTitle>
              <p className="text-xs text-[#6B4F48]">Daily gross revenue in INR</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[#1F5A34] font-semibold bg-[#DDF0E4] border border-[#BCE1C7] px-2.5 py-1 rounded-lg">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Healthy Growth</span>
            </div>
          </CardHeader>
          <CardBody>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAD8C0" opacity={0.6} />
                  <XAxis dataKey="date" stroke="#6B4F48" fontSize={11} tickLine={false} />
                  <YAxis stroke="#6B4F48" fontSize={11} tickLine={false} />
                  <Tooltip
                    formatter={(value: any) => [formatCurrency(Number(value)), 'Revenue']}
                    contentStyle={{ borderRadius: '14px', border: '1px solid #EAD8C0', backgroundColor: '#FDF6EC', color: '#3A0A0F', boxShadow: '0 4px 12px -2px rgba(58, 10, 15, 0.08)' }}
                  />
                  <Bar dataKey="revenue" fill="#3A0A0F" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        {/* Order Source PieChart (1 col) */}
        <Card>
          <CardHeader>
            <CardTitle>Order Sources</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="h-48 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Recent Orders & Popular Items */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders Table (2 cols) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
            <span className="text-xs text-slate-400">Last 10 transactions</span>
          </CardHeader>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
                  <tr>
                    <th className="py-3 px-4">Order #</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Items</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400">
                        No orders recorded yet today
                      </td>
                    </tr>
                  ) : (
                    recentOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          #{order.tokenNumber || order.orderNumber}
                        </td>
                        <td className="py-3 px-4">
                          <OrderTypeBadge type={order.orderType} />
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {order.items.length} item{order.items.length > 1 ? 's' : ''}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {formatCurrency(order.grandTotal)}
                        </td>
                        <td className="py-3 px-4">
                          <OrderStatusBadge status={order.orderStatus} />
                        </td>
                        <td className="py-3 px-4 text-slate-400 font-mono">
                          {formatTime(order.createdAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        {/* Popular Items List (1 col) */}
        <Card>
          <CardHeader>
            <CardTitle>Top Selling Items</CardTitle>
          </CardHeader>
          <CardBody className="p-4 space-y-3">
            {topItems.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">No item sales recorded</p>
            ) : (
              topItems.map((item, idx) => (
                <div
                  key={item.menuItemId || idx}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[#FAF4F2] border border-[#EAD8C0]"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-lg bg-[#EAD8C0] text-[#3A0A0F] flex items-center justify-center font-bold text-xs">
                      #{idx + 1}
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-[#3A0A0F] leading-snug">{item.name}</h4>
                      <p className="text-[10px] text-[#6B4F48]">{item.categoryName || 'Food Item'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-[#3A0A0F]">{item.quantitySold} sold</p>
                    <p className="text-[10px] text-[#3A0A0F] font-semibold">{formatCurrency(item.revenue)}</p>
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;
