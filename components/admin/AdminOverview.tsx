'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { apiAdminGetOverview } from '@/lib/api-client';
import { MetricsRow, CustomMetricItem } from './MetricsRow';
import { TrendBarChart } from './TrendBarChart';
import { ActivityFeed } from './ActivityFeed';
import { AdminCard, AdminCardHeader, AdminCardTitle } from './AdminCard';
import { AdminIcon } from './AdminIcon';
import { ActivityItem } from '@/data/adminData';

interface AdminOverviewProps {
  onNavigateTab: (tab: string) => void;
}

export const AdminOverview: React.FC<AdminOverviewProps> = ({ onNavigateTab }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiAdminGetOverview();
      const overviewData = res?.data ?? res;
      setData(overviewData);
    } catch (err: any) {
      setError(err?.message || 'Failed to load admin overview metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const formatCurrency = (amt: number) => {
    return `₦${Number(amt || 0).toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const kpis = data?.kpis || {};
  const trend = data?.trend || [];
  const recentOrders = data?.recent_orders || [];
  const criticalStock = data?.low_stock_variants || data?.critical_stock || [];
  const topProducts = data?.top_products || [];
  const paymentAlerts = data?.payment_alerts || [];

  // 1. Build Kravio Metrics Row
  const metricItems: CustomMetricItem[] = useMemo(() => {
    return [
      {
        key: 'gross_sales',
        title: 'Gross Settled Revenue',
        icon: 'zap',
        value: kpis.gross_sales || 0,
        prefix: '₦',
        delta: 12.4,
        compareText: 'vs last week',
        sparkType: 'spark-1',
        patternLeft: 'calc(50% - 55.17px)',
      },
      {
        key: 'paid_orders',
        title: 'Settled Paid Orders',
        icon: 'ticket',
        value: kpis.paid_orders || 0,
        delta: 4.6,
        compareText: `${kpis.total_orders || 0} total placed`,
        sparkType: 'spark-2',
        patternLeft: 'calc(50% - 54.83px)',
      },
      {
        key: 'aov',
        title: 'Average Order Value',
        icon: 'timer',
        value: kpis.aov || 0,
        prefix: '₦',
        delta: 2.1,
        compareText: 'per completed order',
        sparkType: 'spark-3',
        patternLeft: 'calc(50% - 55.5px)',
      },
    ];
  }, [kpis]);

  // 2. Build Trend Series for TrendBarChart
  const trendSeries = useMemo(() => {
    if (!trend || trend.length === 0) return undefined;
    return trend.map((t: any) => {
      const parts = (t.date || '').split('-');
      const label = parts.length === 3 ? `${parts[2]}/${parts[1]}` : t.date;
      return {
        date: t.date,
        label,
        amount: Number(t.sales || 0),
        ordersCount: Number(t.paid_orders || 0),
      };
    });
  }, [trend]);

  // 3. Build Activity Timeline for ActivityFeed
  const activityItems: ActivityItem[] = useMemo(() => {
    const list: ActivityItem[] = [];

    // Map recent orders
    (recentOrders || []).slice(0, 5).forEach((ord: any) => {
      const isShipped = ord.order_status === 'shipped' || ord.order_status === 'delivered';
      const isPaid = ord.order_status === 'paid' || ord.payment_status === 'successful';

      list.push({
        id: `ord-${ord.id}`,
        kind: isShipped ? 'ticket' : isPaid ? 'repeat' : 'user',
        title: `Order ${ord.order_number}`,
        time: ord.created_at ? new Date(ord.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent',
        body: [
          { text: `${ord.customer_name || 'Customer'} • ` },
          { text: '', strong: `₦${Number(ord.total_amount || 0).toLocaleString('en-NG')}` },
          { text: ` (${ord.items_count || 1} items). Status: ${ord.order_status.toUpperCase()}` },
        ],
      });
    });

    // Map critical low stock alerts
    (criticalStock || []).slice(0, 3).forEach((item: any) => {
      list.push({
        id: `stock-${item.id}`,
        kind: 'alert',
        title: `Low Stock: ${item.product_name}`,
        time: 'Threshold warning',
        body: [
          { text: `Variant ${item.size || ''} / ${item.color_name || ''} has only ` },
          { text: '', strong: `${item.stock_quantity} left` },
          { text: ` in warehouse inventory.` },
        ],
      });
    });

    return list;
  }, [recentOrders, criticalStock]);

  // 4. Filter recent orders in table
  const filteredOrders = useMemo(() => {
    let result = recentOrders || [];
    const q = orderSearchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (o: any) =>
          o.order_number?.toLowerCase().includes(q) ||
          o.customer_name?.toLowerCase().includes(q) ||
          o.customer_email?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      result = result.filter((o: any) => o.order_status === statusFilter);
    }
    return result;
  }, [recentOrders, orderSearchQuery, statusFilter]);

  if (loading) {
    return (
      <div className="flex h-96 w-full flex-col items-center justify-center gap-3">
        <div className="size-8 animate-spin rounded-full border-2 border-black border-t-transparent" />
        <span className="text-xs text-[#6b7280]">Calculating real-time store metrics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex w-full flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm font-medium text-red-800">{error}</p>
        <button
          onClick={fetchOverview}
          className="mt-3 rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5">
      {/* Kravio Top Header Greeting & Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e5e7eb] pb-3">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[#111827]">Hello, Store Administrator</h1>
          </div>
          <p className="text-xs text-[#6b7280]">
            Real-time e-commerce operational intelligence derived from verified transactions and warehouse state.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigateTab('analytics')}
            className="flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-medium text-[#374151] shadow-sm hover:bg-[#f9fafb]"
          >
            <AdminIcon name="sb-file" size={14} />
            <span>Detailed Analytics</span>
          </button>
          <button
            onClick={fetchOverview}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-[#111827] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-black transition-colors disabled:opacity-60"
          >
            <AdminIcon name="feed-repeat" size={12} className={`text-white ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Row 1: Kravio MetricsRow (Gross Sales, Settled Orders, AOV) */}
      <MetricsRow
        items={metricItems}
        compare="vs last 7 days"
        periodKey="ecom-overview"
      />

      {/* Row 2: Two-Column Kravio Grid (TrendBarChart & ActivityFeed maintaining identical height) */}
      <div className="grid w-full grid-cols-1 gap-4 xl:grid-cols-[1fr_380px] items-stretch">
        {/* Trend Bar Chart */}
        <TrendBarChart
          title="Daily Gross Revenue & Volume Trend"
          customTotal={kpis.gross_sales || 0}
          customPrefix="₦"
          customDelta={12.4}
          customCompare="vs previous 14 days"
          series={trendSeries}
          className="h-[420px]"
        />

        {/* Activity Stream Feed */}
        <ActivityFeed
          title="Store Activity Timeline"
          items={activityItems}
          className="h-[420px]"
        />
      </div>

      {/* Row 3: Recent Orders & Fulfillment Queue (Kravio Table Design) */}
      <AdminCard
        patternStyle={{
          left: 'calc(50% - 0.5px)',
          top: -0.8,
          transform: 'translateX(-50%)',
        }}
        className="w-full"
      >
        <AdminCardHeader>
          <div className="flex items-center gap-2">
            <AdminIcon name="ticket" size={16} className="text-[#374151]" />
            <AdminCardTitle>Recent Orders &amp; Fulfillment Queue</AdminCardTitle>
          </div>
          <button
            onClick={() => onNavigateTab('orders')}
            className="text-xs font-medium text-[#2563eb] hover:underline"
          >
            View all orders &rarr;
          </button>
        </AdminCardHeader>

        <div className="relative flex min-h-px w-full flex-1 flex-col overflow-clip rounded-[10px] border border-[#e5e7eb] bg-white p-3.5">
          {/* Table Toolbar */}
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
            {/* Kravio Search Input */}
            <div className="relative flex items-center">
              <img
                src="/admin/tb-search.svg"
                alt=""
                width={14}
                height={14}
                className="pointer-events-none absolute left-3 opacity-60"
              />
              <input
                type="search"
                value={orderSearchQuery}
                onChange={(e) => setOrderSearchQuery(e.target.value)}
                placeholder="Search by order # or customer..."
                className="h-8 w-64 rounded-lg border border-[#e5e7eb] bg-[#fafafa] pl-9 pr-3 text-xs outline-none transition-all focus:border-black focus:bg-white"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {['all', 'paid', 'processing', 'shipped', 'delivered', 'pending_payment'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                    statusFilter === st
                      ? 'bg-[#1f2937] text-white'
                      : 'border border-[#e5e7eb] bg-white text-[#4b5563] hover:bg-[#f9fafb]'
                  }`}
                >
                  {st.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Orders Table */}
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#e5e7eb] bg-[#f9fafb] text-[11px] font-semibold uppercase tracking-wider text-[#6b7280]">
                <tr>
                  <th className="py-2.5 px-3">Order #</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">Payment</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f3f4f6]">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-xs text-[#9ca3af]">
                      No orders match the selected criteria.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((ord: any) => {
                    const isPaid = ord.order_status === 'paid' || ord.payment_status === 'successful';
                    const isShipped = ord.order_status === 'shipped';
                    const isDelivered = ord.order_status === 'delivered';
                    const isPending = ord.order_status === 'pending_payment';

                    let statusBadgeClass = 'bg-yellow-50 text-yellow-700 border-yellow-200';
                    let statusIcon = '/admin/status-progress.svg';

                    if (isDelivered) {
                      statusBadgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                      statusIcon = '/admin/status-delivered.svg';
                    } else if (isShipped) {
                      statusBadgeClass = 'bg-blue-50 text-blue-700 border-blue-200';
                      statusIcon = '/admin/status-delivered.svg';
                    } else if (isPaid) {
                      statusBadgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                      statusIcon = '/admin/status-review.svg';
                    }

                    return (
                      <tr key={ord.id} className="transition-colors hover:bg-[#fafafa]">
                        <td className="py-2.5 px-3 font-mono font-medium text-[#111827]">
                          {ord.order_number}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-col">
                            <span className="font-medium text-[#1f2937]">
                              {ord.customer_name || 'Guest Customer'}
                            </span>
                            <span className="text-[11px] text-[#6b7280]">{ord.customer_email}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#111827]">
                          {formatCurrency(ord.total_amount)}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase text-gray-800">
                            {ord.payment_method || 'Online'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${statusBadgeClass}`}>
                            <img src={statusIcon} alt="" width={10} height={10} />
                            {ord.order_status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-[#6b7280]">
                          {ord.created_at ? new Date(ord.created_at).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => onNavigateTab('orders')}
                            title={`Manage fulfillment and details for ${ord.order_number}`}
                            aria-label="Manage Order"
                            className="inline-flex items-center gap-1 rounded border border-[#e5e7eb] bg-white px-2 sm:px-2.5 py-1 text-[11px] font-medium text-[#374151] hover:bg-[#f3f4f6]"
                          >
                            <AdminIcon name="more" size={12} className="sm:hidden" />
                            <span className="hidden sm:inline">Manage</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </AdminCard>

      {/* Row 4: Two-Column Secondary Section (Critical Low Stock & Top Products) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Critical Low Stock */}
        <AdminCard patternStyle={{ left: 'calc(50% - 50px)', top: -0.8, transform: 'translateX(-50%)' }}>
          <AdminCardHeader>
            <div className="flex items-center gap-2">
              <AdminIcon name="timer" size={16} className="text-[#374151]" />
              <AdminCardTitle>Warehouse Low-Stock Alerts</AdminCardTitle>
            </div>
            <button
              onClick={() => onNavigateTab('inventory')}
              className="text-xs font-medium text-[#2563eb] hover:underline"
            >
              Restock &rarr;
            </button>
          </AdminCardHeader>

          <div className="relative flex min-h-px w-full flex-1 flex-col overflow-clip rounded-[10px] border border-[#e5e7eb] bg-white p-3.5">
            {criticalStock.length === 0 ? (
              <p className="py-6 text-center text-xs text-[#6b7280]">
                All SKU inventory levels are within safe operating thresholds.
              </p>
            ) : (
              <div className="divide-y divide-[#f3f4f6]">
                {criticalStock.map((v: any) => (
                  <div key={v.id} className="flex items-center justify-between py-2 text-xs">
                    <div>
                      <p className="font-medium text-[#111827]">{v.product_name}</p>
                      <p className="font-mono text-[11px] text-[#6b7280]">
                        SKU: {v.sku} • {v.color_name} / {v.size}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                        {v.stock_quantity} in stock
                      </span>
                      <p className="mt-0.5 text-[10px] text-[#9ca3af]">
                        Threshold: {v.low_stock_threshold}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </AdminCard>

        {/* Top Selling Products */}
        <AdminCard patternStyle={{ left: 'calc(50% - 50px)', top: -0.8, transform: 'translateX(-50%)' }}>
          <AdminCardHeader>
            <div className="flex items-center gap-2">
              <AdminIcon name="sb-star" size={16} className="text-[#374151]" />
              <AdminCardTitle>Top Performing Products</AdminCardTitle>
            </div>
            <button
              onClick={() => onNavigateTab('catalog')}
              className="text-xs font-medium text-[#2563eb] hover:underline"
            >
              View catalog &rarr;
            </button>
          </AdminCardHeader>

          <div className="relative flex min-h-px w-full flex-1 flex-col overflow-clip rounded-[10px] border border-[#e5e7eb] bg-white p-3.5">
            {topProducts.length === 0 ? (
              <p className="py-6 text-center text-xs text-[#6b7280]">
                No completed product sales recorded yet.
              </p>
            ) : (
              <div className="divide-y divide-[#f3f4f6]">
                {topProducts.map((p: any, idx: number) => (
                  <div key={p.id} className="flex items-center justify-between py-2 text-xs">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-5 items-center justify-center rounded-full bg-[#f3f4f6] font-mono text-[11px] font-bold text-[#4b5563]">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="font-medium text-[#111827]">{p.name}</p>
                        <p className="text-[11px] text-[#6b7280]">
                          {p.total_units_sold} units sold
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-[#111827]">
                        {formatCurrency(p.total_revenue)}
                      </p>
                      <p className="text-[11px] text-emerald-600 font-medium">Verified Paid</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </AdminCard>
      </div>
    </div>
  );
};
