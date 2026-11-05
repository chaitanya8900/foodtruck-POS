import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Calendar,
  CreditCard,
  ShoppingBag,
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
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card';
import StatCard from '@/components/ui/StatCard';

export const ReportsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'sales' | 'payments' | 'orders' | 'items'>('sales');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Fetch queries
  const { data: dailySales = [] } = useQuery({
    queryKey: ['reportDailySales', startDate, endDate],
    queryFn: () => reportsApi.getDailySales({ startDate: startDate || undefined, endDate: endDate || undefined }),
    staleTime: 60 * 1000,
  });

  const { data: paymentSummary } = useQuery({
    queryKey: ['reportPaymentSummary', startDate, endDate],
    queryFn: () => reportsApi.getPaymentSummary({ startDate: startDate || undefined, endDate: endDate || undefined }),
    staleTime: 60 * 1000,
  });

  const { data: orderSummary } = useQuery({
    queryKey: ['reportOrderSummary', startDate, endDate],
    queryFn: () => reportsApi.getOrderSummary({ startDate: startDate || undefined, endDate: endDate || undefined }),
    staleTime: 60 * 1000,
  });

  const { data: topItems = [] } = useQuery({
    queryKey: ['reportTopItems', startDate, endDate],
    queryFn: () => reportsApi.getTopItems({ startDate: startDate || undefined, endDate: endDate || undefined, limit: 10 }),
    staleTime: 60 * 1000,
  });

  // Calculate totals
  const totalRevenue = dailySales.reduce((sum, d) => sum + d.grossSales, 0);
  const totalOrders = dailySales.reduce((sum, d) => sum + d.totalOrders, 0);
  const totalTax = dailySales.reduce((sum, d) => sum + d.totalTax, 0);

  const salesChartData = dailySales.map((d) => ({
    date: formatDate(d.date, 'dd MMM'),
    sales: d.grossSales,
    orders: d.totalOrders,
  }));

  const paymentPieData = [
    { name: 'Cash', value: paymentSummary?.cashTotal || 0, color: '#3A0A0F' },
    { name: 'UPI', value: paymentSummary?.upiTotal || 0, color: '#5B0F1B' },
  ];

  // Quick Presets
  const setPreset = (preset: 'today' | 'yesterday' | 'last7' | 'last30') => {
    const today = new Date();
    const formatDateStr = (d: Date) => d.toISOString().split('T')[0];

    if (preset === 'today') {
      const d = formatDateStr(today);
      setStartDate(d);
      setEndDate(d);
    } else if (preset === 'yesterday') {
      const y = new Date(today);
      y.setDate(today.getDate() - 1);
      const d = formatDateStr(y);
      setStartDate(d);
      setEndDate(d);
    } else if (preset === 'last7') {
      const past = new Date(today);
      past.setDate(today.getDate() - 7);
      setStartDate(formatDateStr(past));
      setEndDate(formatDateStr(today));
    } else if (preset === 'last30') {
      const past = new Date(today);
      past.setDate(today.getDate() - 30);
      setStartDate(formatDateStr(past));
      setEndDate(formatDateStr(today));
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    const filename = `report_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`;

    if (activeTab === 'sales') {
      csvContent += 'Date,Total Orders,Confirmed Orders,Cancelled Orders,Gross Sales,Total Tax,Net Sales\n';
      dailySales.forEach((d) => {
        csvContent += `"${d.date}",${d.totalOrders},${d.confirmedOrders},${d.cancelledOrders},${d.grossSales},${d.totalTax},${d.netSales}\n`;
      });
    } else if (activeTab === 'payments') {
      csvContent += 'Metric,Count,Total Amount\n';
      csvContent += `Cash,${paymentSummary?.cashCount || 0},${paymentSummary?.cashTotal || 0}\n`;
      csvContent += `UPI,${paymentSummary?.upiCount || 0},${paymentSummary?.upiTotal || 0}\n`;
      csvContent += `Pending,${paymentSummary?.pendingCount || 0},${paymentSummary?.pendingTotal || 0}\n`;
    } else if (activeTab === 'orders') {
      csvContent += 'Channel,Orders\n';
      csvContent += `Counter POS,${orderSummary?.posOrders || 0}\n`;
      csvContent += `QR Orders,${orderSummary?.qrOrders || 0}\n`;
      csvContent += `Dine-In,${orderSummary?.dineInOrders || 0}\n`;
      csvContent += `Takeaway,${orderSummary?.takeawayOrders || 0}\n`;
    } else if (activeTab === 'items') {
      csvContent += 'Rank,Item Name,Category,Quantity Sold,Total Revenue\n';
      topItems.forEach((item, idx) => {
        csvContent += `${idx + 1},"${item.name}","${item.categoryName || ''}",${item.quantitySold},${item.revenue}\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header, Quick Date Filters & Export */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#3A0A0F] tracking-tight">Financial & Sales Analytics</h1>
          <p className="text-xs text-[#6B4F48]">Business performance breakdowns, payment audits, and item metrics</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Presets */}
          <div className="flex items-center gap-1 bg-[#FDF6EC] p-1 rounded-xl border border-[#EAD8C0] text-xs">
            <button
              onClick={() => setPreset('today')}
              className="px-2.5 py-1 rounded-lg text-[#6B4F48] hover:bg-[#FAF4F2] hover:text-[#3A0A0F] font-medium transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => setPreset('yesterday')}
              className="px-2.5 py-1 rounded-lg text-[#6B4F48] hover:bg-[#FAF4F2] hover:text-[#3A0A0F] font-medium transition-colors"
            >
              Yesterday
            </button>
            <button
              onClick={() => setPreset('last7')}
              className="px-2.5 py-1 rounded-lg text-[#6B4F48] hover:bg-[#FAF4F2] hover:text-[#3A0A0F] font-medium transition-colors"
            >
              7 Days
            </button>
            <button
              onClick={() => setPreset('last30')}
              className="px-2.5 py-1 rounded-lg text-[#6B4F48] hover:bg-[#FAF4F2] hover:text-[#3A0A0F] font-medium transition-colors"
            >
              30 Days
            </button>
          </div>

          {/* Date Filter Inputs */}
          <div className="flex items-center gap-2 bg-[#FDF6EC] p-2 rounded-2xl border border-[#EAD8C0] shadow-xs text-xs">
            <Calendar className="w-4 h-4 text-[#6B4F48] ml-1" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="p-1.5 border border-[#EAD8C0] bg-[#FAF4F2] text-[#3A0A0F] rounded-lg text-xs"
            />
            <span className="text-[#6B4F48]">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="p-1.5 border border-[#EAD8C0] bg-[#FAF4F2] text-[#3A0A0F] rounded-lg text-xs"
            />
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="text-xs text-[#5B0F1B] font-semibold px-2 hover:underline"
              >
                Reset
              </button>
            )}
          </div>

          {/* Export to CSV Button */}
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#3A0A0F] text-white rounded-xl text-xs font-bold hover:bg-[#5B0F1B] transition-colors shadow-xs"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[#EAD8C0] pb-2">
        <button
          onClick={() => setActiveTab('sales')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'sales'
              ? 'bg-[#3A0A0F] text-white shadow-md shadow-[#3A0A0F]/20'
              : 'text-[#6B4F48] hover:bg-[#FDF6EC]'
          }`}
        >
          Daily Sales & Revenue
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'payments'
              ? 'bg-[#3A0A0F] text-white shadow-md shadow-[#3A0A0F]/20'
              : 'text-[#6B4F48] hover:bg-[#FDF6EC]'
          }`}
        >
          Payment Collections
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'orders'
              ? 'bg-[#3A0A0F] text-white shadow-md shadow-[#3A0A0F]/20'
              : 'text-[#6B4F48] hover:bg-[#FDF6EC]'
          }`}
        >
          Order Channel Breakdown
        </button>
        <button
          onClick={() => setActiveTab('items')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'items'
              ? 'bg-[#3A0A0F] text-white shadow-md shadow-[#3A0A0F]/20'
              : 'text-[#6B4F48] hover:bg-[#FDF6EC]'
          }`}
        >
          Popular Items
        </button>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Gross Revenue"
          value={formatCurrency(totalRevenue)}
          icon={<TrendingUp className="w-6 h-6" />}
          color="emerald"
        />
        <StatCard
          label="Orders Processed"
          value={totalOrders}
          icon={<ShoppingBag className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          label="Total GST / Tax Collected"
          value={formatCurrency(totalTax)}
          icon={<CreditCard className="w-6 h-6" />}
          color="slate"
        />
        <StatCard
          label="Average Ticket Size"
          value={formatCurrency(totalOrders > 0 ? totalRevenue / totalOrders : 0)}
          icon={<BarChart3 className="w-6 h-6" />}
          color="teal"
        />
      </div>

      {/* Tab Specific Content */}
      {activeTab === 'sales' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Daily Gross Revenue Trend</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} />
                    <Tooltip formatter={(val: any) => [formatCurrency(Number(val)), 'Sales']} />
                    <Bar dataKey="sales" fill="#3A0A0F" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>

          {/* Daily Table */}
          <Card>
            <CardHeader>
              <CardTitle>Daily Sales Summary Table</CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF4F2] border-b border-[#EAD8C0] text-[#3A0A0F] uppercase font-bold">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Orders</th>
                      <th className="py-3 px-4">Gross Sales</th>
                      <th className="py-3 px-4">Discounts</th>
                      <th className="py-3 px-4">Tax</th>
                      <th className="py-3 px-4">Net Collections</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EAD8C0]/60">
                    {dailySales.map((d, idx) => (
                      <tr key={idx} className="hover:bg-[#FAF4F2]">
                        <td className="py-3 px-4 font-semibold text-[#3A0A0F]">{formatDate(d.date)}</td>
                        <td className="py-3 px-4 text-[#3A0A0F]">{d.totalOrders}</td>
                        <td className="py-3 px-4 font-bold text-[#3A0A0F]">{formatCurrency(d.grossSales)}</td>
                        <td className="py-3 px-4 text-[#6B4F48]">{formatCurrency(d.totalDiscount)}</td>
                        <td className="py-3 px-4 text-[#6B4F48]">{formatCurrency(d.totalTax)}</td>
                        <td className="py-3 px-4 font-bold text-[#3A0A0F]">{formatCurrency(d.netSales)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Payment Method Distribution</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="h-64 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={85}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {paymentPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: any) => [formatCurrency(Number(val)), 'Amount']} />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Collection Summary</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="p-4 bg-[#FAF4F2] rounded-2xl border border-[#EAD8C0] flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[#3A0A0F] uppercase">Cash Collected at Counter</p>
                  <p className="text-2xl font-black text-[#3A0A0F]">
                    {formatCurrency(paymentSummary?.cashTotal || 0)}
                  </p>
                </div>
                <span className="text-xs font-semibold text-[#3A0A0F] bg-[#EAD8C0] px-2 py-1 rounded-lg">
                  {paymentSummary?.cashCount || 0} txn(s)
                </span>
              </div>

              <div className="p-4 bg-[#FDF6EC] rounded-2xl border border-[#EAD8C0] flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[#3A0A0F] uppercase">UPI / Online Gateway (PhonePe)</p>
                  <p className="text-2xl font-black text-[#5B0F1B]">
                    {formatCurrency(paymentSummary?.upiTotal || 0)}
                  </p>
                </div>
                <span className="text-xs font-semibold text-[#5B0F1B] bg-[#EAD8C0]/60 px-2 py-1 rounded-lg">
                  {paymentSummary?.upiCount || 0} txn(s)
                </span>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {activeTab === 'orders' && (
        <Card>
          <CardHeader>
            <CardTitle>Order Channels & Fulfillment Mode</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-[#FAF4F2] border border-[#EAD8C0] text-center">
                <p className="text-xs text-[#6B4F48] font-semibold uppercase">Counter POS</p>
                <p className="text-2xl font-black text-[#3A0A0F] mt-1">{orderSummary?.posOrders || 0}</p>
              </div>
              <div className="p-4 rounded-xl bg-[#FAF4F2] border border-[#EAD8C0] text-center">
                <p className="text-xs text-[#6B4F48] font-semibold uppercase">Customer QR</p>
                <p className="text-2xl font-black text-[#3A0A0F] mt-1">{orderSummary?.qrOrders || 0}</p>
              </div>
              <div className="p-4 rounded-xl bg-[#FAF4F2] border border-[#EAD8C0] text-center">
                <p className="text-xs text-[#6B4F48] font-semibold uppercase">Dine-In Orders</p>
                <p className="text-2xl font-black text-[#3A0A0F] mt-1">{orderSummary?.dineInOrders || 0}</p>
              </div>
              <div className="p-4 rounded-xl bg-[#FAF4F2] border border-[#EAD8C0] text-center">
                <p className="text-xs text-[#6B4F48] font-semibold uppercase">Takeaway Orders</p>
                <p className="text-2xl font-black text-[#3A0A0F] mt-1">{orderSummary?.takeawayOrders || 0}</p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {activeTab === 'items' && (
        <Card>
          <CardHeader>
            <CardTitle>Product Sales Performance</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF4F2] border-b border-[#EAD8C0] text-[#3A0A0F] uppercase font-bold">
                  <tr>
                    <th className="py-3 px-4">Rank</th>
                    <th className="py-3 px-4">Item Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Quantity Sold</th>
                    <th className="py-3 px-4">Total Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAD8C0]/60">
                  {topItems.map((item, idx) => (
                    <tr key={item.menuItemId || idx} className="hover:bg-[#FAF4F2]">
                      <td className="py-3 px-4 font-bold text-[#6B4F48]">#{idx + 1}</td>
                      <td className="py-3 px-4 font-bold text-[#3A0A0F]">{item.name}</td>
                      <td className="py-3 px-4 text-[#6B4F48]">{item.categoryName}</td>
                      <td className="py-3 px-4 font-semibold text-[#3A0A0F]">{item.quantitySold}</td>
                      <td className="py-3 px-4 font-extrabold text-[#3A0A0F]">
                        {formatCurrency(item.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
};

export default ReportsPage;
