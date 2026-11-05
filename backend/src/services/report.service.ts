import { PaymentStatus, OrderStatus, Prisma } from '@prisma/client';
import prisma from '../prisma';
import { DateRangeFilter } from '../types';

function buildDateFilter(range: DateRangeFilter): Prisma.DateTimeFilter | undefined {
  if (!range.startDate && !range.endDate) {
    return undefined;
  }

  const filter: Prisma.DateTimeFilter = {};
  if (range.startDate) {
    filter.gte = new Date(range.startDate);
  }
  if (range.endDate) {
    const end = new Date(range.endDate);
    end.setHours(23, 59, 59, 999);
    filter.lte = end;
  }
  return filter;
}

/**
 * Daily sales report: total orders, total revenue, cash vs UPI breakdown.
 */
export async function getDailySales(businessId: string, filter: DateRangeFilter) {
  const dateFilter = buildDateFilter(filter);

  const where: Prisma.OrderWhereInput = {
    business_id: businessId,
    ...(dateFilter ? { created_at: dateFilter } : {})
  };

  const allOrders = await prisma.order.findMany({
    where,
    select: {
      id: true,
      order_number: true,
      token_number: true,
      order_status: true,
      payment_status: true,
      payment_method: true,
      total_amount: true,
      tax_amount: true,
      discount: true,
      source: true,
      order_type: true,
      created_at: true
    }
  });

  const paidOrders = allOrders.filter(
    (o) => o.payment_status === PaymentStatus.PAID && o.order_status !== OrderStatus.CANCELLED
  );

  const totalRevenue = paidOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const totalTax = paidOrders.reduce((sum, o) => sum + Number(o.tax_amount), 0);
  const totalDiscount = paidOrders.reduce((sum, o) => sum + Number(o.discount), 0);

  const cashOrders = paidOrders.filter((o) => o.payment_method === 'CASH');
  const cashRevenue = cashOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);

  const upiOrders = paidOrders.filter((o) => o.payment_method === 'UPI');
  const upiRevenue = upiOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);

  const phonepeOrders = paidOrders.filter((o) => o.payment_method === 'PHONEPE');
  const phonepeRevenue = phonepeOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);

  const cancelledOrders = allOrders.filter((o) => o.order_status === OrderStatus.CANCELLED);
  const pendingOrders = allOrders.filter(
    (o) => o.order_status === OrderStatus.PENDING_PAYMENT || o.payment_status === PaymentStatus.PENDING
  );

  // Group by day if spanning multiple days
  const dailyBreakdown: Record<string, any> = {};
  for (const o of allOrders) {
    const day = o.created_at.toISOString().split('T')[0];
    if (!dailyBreakdown[day]) {
      dailyBreakdown[day] = {
        date: day,
        orders: 0,
        totalOrders: 0,
        confirmedOrders: 0,
        cancelledOrders: 0,
        grossSales: 0,
        revenue: 0,
        netSales: 0,
        totalTax: 0,
        totalDiscount: 0,
        cashCollections: 0,
        upiCollections: 0,
        counterOrdersCount: 0,
        qrOrdersCount: 0,
        dineInOrdersCount: 0,
        takeawayOrdersCount: 0
      };
    }

    const d = dailyBreakdown[day];
    d.totalOrders += 1;
    d.orders += 1;

    if (o.order_status === OrderStatus.CANCELLED) {
      d.cancelledOrders += 1;
    } else if (o.payment_status === PaymentStatus.PAID) {
      d.confirmedOrders += 1;
      const amt = Number(o.total_amount);
      const tax = Number(o.tax_amount);
      const disc = Number(o.discount);
      d.grossSales += amt;
      d.revenue += amt;
      d.netSales += amt - tax;
      d.totalTax += tax;
      d.totalDiscount += disc;

      if (o.payment_method === 'CASH') {
        d.cashCollections += amt;
      } else {
        d.upiCollections += amt;
      }
    }

    if (o.source === 'POS') d.counterOrdersCount += 1;
    else d.qrOrdersCount += 1;

    if (o.order_type === 'DINE_IN') d.dineInOrdersCount += 1;
    else d.takeawayOrdersCount += 1;
  }

  return {
    totalOrders: paidOrders.length,
    allOrdersCount: allOrders.length,
    cancelledOrdersCount: cancelledOrders.length,
    pendingOrdersCount: pendingOrders.length,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalTax: Math.round(totalTax * 100) / 100,
    totalDiscount: Math.round(totalDiscount * 100) / 100,
    averageOrderValue:
      paidOrders.length > 0 ? Math.round((totalRevenue / paidOrders.length) * 100) / 100 : 0,
    paymentBreakdown: {
      cash: { count: cashOrders.length, amount: Math.round(cashRevenue * 100) / 100 },
      upi: { count: upiOrders.length, amount: Math.round(upiRevenue * 100) / 100 },
      phonepe: { count: phonepeOrders.length, amount: Math.round(phonepeRevenue * 100) / 100 }
    },
    dailyTimeline: Object.values(dailyBreakdown)
  };
}

/**
 * Payment summary grouped by payment method and status.
 */
export async function getPaymentSummary(businessId: string, filter: DateRangeFilter) {
  const dateFilter = buildDateFilter(filter);

  const payments = await prisma.payment.findMany({
    where: {
      order: {
        business_id: businessId,
        ...(dateFilter ? { created_at: dateFilter } : {})
      }
    },
    select: {
      id: true,
      payment_method: true,
      payment_status: true,
      amount: true,
      created_at: true
    }
  });

  const byMethod: Record<string, { count: number; totalAmount: number }> = {
    CASH: { count: 0, totalAmount: 0 },
    UPI: { count: 0, totalAmount: 0 },
    PHONEPE: { count: 0, totalAmount: 0 }
  };

  const byStatus: Record<string, { count: number; totalAmount: number }> = {
    PAID: { count: 0, totalAmount: 0 },
    PENDING: { count: 0, totalAmount: 0 },
    FAILED: { count: 0, totalAmount: 0 },
    REFUNDED: { count: 0, totalAmount: 0 }
  };

  let totalCollected = 0;

  for (const p of payments) {
    const amt = Number(p.amount);
    if (byMethod[p.payment_method]) {
      byMethod[p.payment_method].count += 1;
      if (p.payment_status === PaymentStatus.PAID) {
        byMethod[p.payment_method].totalAmount += amt;
      }
    }

    if (byStatus[p.payment_status]) {
      byStatus[p.payment_status].count += 1;
      byStatus[p.payment_status].totalAmount += amt;
    }

    if (p.payment_status === PaymentStatus.PAID) {
      totalCollected += amt;
    }
  }

  // Round amounts
  for (const k in byMethod) {
    byMethod[k].totalAmount = Math.round(byMethod[k].totalAmount * 100) / 100;
  }
  for (const k in byStatus) {
    byStatus[k].totalAmount = Math.round(byStatus[k].totalAmount * 100) / 100;
  }

  return {
    totalTransactions: payments.length,
    totalCollected: Math.round(totalCollected * 100) / 100,
    byMethod,
    byStatus
  };
}

/**
 * Order summary broken down by source (POS vs QR) and type (DINE_IN vs TAKEAWAY).
 */
export async function getOrderSummary(businessId: string, filter: DateRangeFilter) {
  const dateFilter = buildDateFilter(filter);

  const orders = await prisma.order.findMany({
    where: {
      business_id: businessId,
      ...(dateFilter ? { created_at: dateFilter } : {})
    },
    select: {
      source: true,
      order_type: true,
      order_status: true,
      total_amount: true,
      payment_status: true
    }
  });

  const bySource: Record<string, { count: number; revenue: number }> = {
    POS: { count: 0, revenue: 0 },
    QR: { count: 0, revenue: 0 }
  };

  const byType: Record<string, { count: number; revenue: number }> = {
    DINE_IN: { count: 0, revenue: 0 },
    TAKEAWAY: { count: 0, revenue: 0 }
  };

  const byStatus: Record<string, number> = {};

  for (const o of orders) {
    const amt = o.payment_status === PaymentStatus.PAID ? Number(o.total_amount) : 0;

    if (bySource[o.source]) {
      bySource[o.source].count += 1;
      bySource[o.source].revenue += amt;
    }

    if (byType[o.order_type]) {
      byType[o.order_type].count += 1;
      byType[o.order_type].revenue += amt;
    }

    byStatus[o.order_status] = (byStatus[o.order_status] || 0) + 1;
  }

  for (const k in bySource) {
    bySource[k].revenue = Math.round(bySource[k].revenue * 100) / 100;
  }
  for (const k in byType) {
    byType[k].revenue = Math.round(byType[k].revenue * 100) / 100;
  }

  return {
    totalOrders: orders.length,
    bySource,
    byType,
    byStatus
  };
}

/**
 * Top selling items sorted by quantity and revenue.
 */
export async function getTopItems(
  businessId: string,
  filter: DateRangeFilter,
  limit: number = 10
) {
  const dateFilter = buildDateFilter(filter);

  const orderItems = await prisma.orderItem.findMany({
    where: {
      order: {
        business_id: businessId,
        payment_status: PaymentStatus.PAID,
        order_status: { not: OrderStatus.CANCELLED },
        ...(dateFilter ? { created_at: dateFilter } : {})
      }
    },
    select: {
      menu_item_id: true,
      item_name_snapshot: true,
      quantity: true,
      line_total: true
    }
  });

  const itemAggregates: Record<
    string,
    { id: string | null; name: string; quantity: number; revenue: number }
  > = {};

  for (const oi of orderItems) {
    const key = oi.menu_item_id || oi.item_name_snapshot;
    if (!itemAggregates[key]) {
      itemAggregates[key] = {
        id: oi.menu_item_id,
        name: oi.item_name_snapshot,
        quantity: 0,
        revenue: 0
      };
    }
    itemAggregates[key].quantity += oi.quantity;
    itemAggregates[key].revenue += Number(oi.line_total);
  }

  const sorted = Object.values(itemAggregates)
    .map((item) => ({
      ...item,
      menuItemId: item.id,
      quantitySold: item.quantity,
      totalSales: Math.round(item.revenue * 100) / 100,
      revenue: Math.round(item.revenue * 100) / 100
    }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, limit);

  return sorted;
}
