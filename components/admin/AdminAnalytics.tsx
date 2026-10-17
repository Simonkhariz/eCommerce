'use client';

import React, { useState, useEffect } from 'react';
import { Download, FileText, ChevronUp, ChevronDown } from 'lucide-react';
import { apiAdminGetAnalyticsReport, apiAdminDownloadExport } from '@/lib/api-client';
import { AdminIcon } from './AdminIcon';

type DateRange = 'today' | 'yesterday' | '7days' | '30days' | '90days' | 'year' | 'all' | 'custom';

export const AdminAnalytics: React.FC = () => {
  const [range, setRange] = useState<DateRange>('30days');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [exportingType, setExportingType] = useState<string | null>(null);
  const [showFormulas, setShowFormulas] = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params: any = { range };
      if (range === 'custom' && customStart && customEnd) {
        params.start_date = customStart;
        params.end_date = customEnd;
      }
      const res = await apiAdminGetAnalyticsReport(params);
      setReport(res?.data ?? res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (range !== 'custom') {
      fetchReport();
    }
  }, [range]);

  const handleApplyCustomDates = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customStart || !customEnd) return;
    setRange('custom');
    fetchReport();
  };

  const formatCurrency = (amt: number) => {
    return `₦${Number(amt || 0).toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const handleDownloadCsv = async (type: 'analytics' | 'orders') => {
    setExportingType(type);
    try {
      const queryParams = new URLSearchParams();
      queryParams.set('range', range);
      if (range === 'custom' && customStart && customEnd) {
        queryParams.set('start_date', customStart);
        queryParams.set('end_date', customEnd);
      }
      const endpoint =
        type === 'analytics'
          ? `/admin/analytics/export?${queryParams.toString()}`
          : `/admin/orders/export?${queryParams.toString()}`;
      const filename = `shopco-${type}-${range}-${Date.now()}.csv`;

      await apiAdminDownloadExport(endpoint, filename);
    } catch (err: any) {
      alert(`Export failed: ${err.message || 'Unauthorized or server error'}`);
    } finally {
      setExportingType(null);
    }
  };

  const summary = report?.summary || {};
  const daily = report?.daily_breakdown || [];
  const categories = report?.category_breakdown || [];
  const gateways = report?.gateway_breakdown || [];
  const formulas = report?.formulas || {};

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e5e7eb] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
            Analytics & Reports
          </h1>
          <p className="text-xs text-[#6b7280]">
            Audit verified database revenue, operational conversion rates, category trends, and download authorized CSV reports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Time range pills */}
          <div className="flex items-center rounded-lg border border-[#e5e7eb] bg-white p-1 shadow-sm">
            {(['today', 'yesterday', '7days', '30days', '90days', 'year', 'all'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold uppercase transition-colors ${
                  range === r ? 'bg-black text-white' : 'text-[#4b5563] hover:text-[#111827]'
                }`}
              >
                {r === '7days' ? '7D' : r === '30days' ? '30D' : r === '90days' ? '90D' : r}
              </button>
            ))}
          </div>

          {/* Export Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDownloadCsv('analytics')}
              disabled={loading || exportingType !== null}
              className="flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-semibold text-[#111827] shadow-sm hover:bg-[#f9fafb] disabled:opacity-50"
              title="Download authenticated financial and category CSV report"
            >
              <Download className="w-3.5 h-3.5 text-[#374151]" />
              <span>{exportingType === 'analytics' ? 'Exporting...' : 'Analytics CSV'}</span>
            </button>
            <button
              onClick={() => handleDownloadCsv('orders')}
              disabled={loading || exportingType !== null}
              className="flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-semibold text-[#111827] shadow-sm hover:bg-[#f9fafb] disabled:opacity-50"
              title="Download filtered orders CSV report with full details"
            >
              <FileText className="w-3.5 h-3.5 text-[#374151]" />
              <span>{exportingType === 'orders' ? 'Exporting...' : 'Orders CSV'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Custom Date Range Filter Form */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e5e7eb] bg-white p-3.5 shadow-sm text-xs">
        <form onSubmit={handleApplyCustomDates} className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-[#374151]">Custom Date Filter:</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[#6b7280]">From</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-lg border border-[#d1d5db] px-2.5 py-1 text-xs text-[#111827] focus:border-black focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[#6b7280]">To</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-lg border border-[#d1d5db] px-2.5 py-1 text-xs text-[#111827] focus:border-black focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-black px-3 py-1 font-semibold text-white hover:bg-neutral-800 transition-colors"
          >
            Apply Dates
          </button>
        </form>

        <button
          onClick={() => setShowFormulas(!showFormulas)}
          className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
        >
          <span>{showFormulas ? 'Hide Formulas' : 'View Documented Formulas'}</span>
          {showFormulas ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Documented Formulas Dropdown Card */}
      {showFormulas && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-xs space-y-2">
          <h3 className="font-bold text-blue-900 text-sm">
            Documented Financial Formulas & Reconciliation Rules
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-blue-950 pt-1">
            <div className="space-y-1 bg-white/70 p-3 rounded-lg border border-blue-100">
              <p><strong>Gross Sales:</strong> {formulas.gross_sales || 'SUM(grand_total) for verified paid orders.'}</p>
              <p><strong>Net Sales:</strong> {formulas.net_sales || 'Gross Sales minus completed refunds.'}</p>
              <p><strong>Total Refunded:</strong> {formulas.total_refunded || 'SUM(amount) from completed refunds records.'}</p>
            </div>
            <div className="space-y-1 bg-white/70 p-3 rounded-lg border border-blue-100">
              <p><strong>Average Order Value (AOV):</strong> {formulas.aov || 'Gross Sales / Paid Orders.'}</p>
              <p><strong>Order Conversion:</strong> {formulas.conversion_rate || '(Paid Orders / Total Orders) * 100.'}</p>
              <p><strong>Repeat Customer Rate:</strong> {formulas.repeat_customer_rate || 'Customers with 2+ paid orders / total paying customers.'}</p>
            </div>
          </div>
          <p className="text-[11px] text-blue-800 italic pt-1 border-t border-blue-200/50">
            Rule: {formulas.reconciliation_rule || 'Pending payments and abandoned checkouts are never counted as sales.'}
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex h-96 w-full flex-col items-center justify-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-black border-t-transparent" />
          <span className="text-xs text-[#6b7280]">Reconciling database records...</span>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
              <span className="text-xs font-medium text-[#6b7280]">Gross Revenue</span>
              <p className="mt-2 text-2xl font-bold text-[#111827]">
                {formatCurrency(summary.gross_sales)}
              </p>
              <p className="mt-1 text-[11px] text-[#6b7280]">
                Net (less refunds): {formatCurrency(summary.net_sales)}
              </p>
            </div>

            <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
              <span className="text-xs font-medium text-[#6b7280]">Average Order Value (AOV)</span>
              <p className="mt-2 text-2xl font-bold text-[#111827]">
                {formatCurrency(summary.aov)}
              </p>
              <p className="mt-1 text-[11px] text-[#6b7280]">
                From {summary.paid_orders} settled orders
              </p>
            </div>

            <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
              <span className="text-xs font-medium text-[#6b7280]">Units Sold & Fulfillment</span>
              <p className="mt-2 text-2xl font-bold text-[#111827]">
                {summary.total_units_sold} items
              </p>
              <p className="mt-1 text-[11px] text-amber-600 font-medium">
                {summary.pending_fulfillment} pending dispatch
              </p>
            </div>

            <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
              <span className="text-xs font-medium text-[#6b7280]">Repeat Customer Rate</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-emerald-700">
                  {summary.repeat_customer_rate ?? 0}%
                </span>
                <span className="text-xs text-[#9ca3af]">
                  ({summary.conversion_rate ?? 0}% checkout conversion)
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[#6b7280]">
                {summary.paid_orders} settled / {summary.total_orders} total checkout orders
              </p>
            </div>
          </div>

          {/* Daily Table */}
          <div className="rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-[#111827]">Daily Settlement Breakdown</h3>
            <p className="text-[11px] text-[#6b7280]">
              Day-by-day order counts and settled transaction volume directly from MySQL source records
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#f3f4f6] text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af]">
                  <tr>
                    <th className="py-2.5">Date</th>
                    <th className="py-2.5">Total Orders</th>
                    <th className="py-2.5">Paid Orders</th>
                    <th className="py-2.5">Conversion</th>
                    <th className="py-2.5 text-right">Settled Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f9fafb]">
                  {daily.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-[#9ca3af]">
                        No orders recorded in this date range.
                      </td>
                    </tr>
                  ) : (
                    daily.map((d: any) => (
                      <tr key={d.date}>
                        <td className="py-2 font-mono text-[#111827]">{d.date}</td>
                        <td className="py-2 text-[#4b5563]">{d.orders_count}</td>
                        <td className="py-2 font-semibold text-[#111827]">{d.paid_count}</td>
                        <td className="py-2">
                          <span className="rounded bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-[#374151]">
                            {d.orders_count > 0
                              ? `${Math.round((d.paid_count / d.orders_count) * 100)}%`
                              : '0%'}
                          </span>
                        </td>
                        <td className="py-2 text-right font-bold text-[#111827]">
                          {formatCurrency(d.sales)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Category & Payment Breakdown */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Category Breakdown */}
            <div className="rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
              <h3 className="text-sm font-bold text-[#111827]">Revenue by Category</h3>
              <p className="text-[11px] text-[#6b7280]">
                Product sales volume grouped by category
              </p>

              <div className="mt-4 flex flex-col divide-y divide-[#f9fafb]">
                {categories.length === 0 ? (
                  <p className="py-4 text-center text-xs text-[#9ca3af]">
                    No category sales data recorded.
                  </p>
                ) : (
                  categories.map((c: any) => (
                    <div key={c.category_name} className="flex items-center justify-between py-2.5 text-xs">
                      <div>
                        <p className="font-semibold text-[#111827]">{c.category_name}</p>
                        <p className="text-[11px] text-[#6b7280]">
                          {c.units_sold} units across {c.order_count} orders
                        </p>
                      </div>
                      <span className="font-bold text-[#111827]">
                        {formatCurrency(c.revenue)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Gateway Breakdown */}
            <div className="rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
              <h3 className="text-sm font-bold text-[#111827]">Gateway Volume Breakdown</h3>
              <p className="text-[11px] text-[#6b7280]">
                Volume and success rate across payment options
              </p>

              <div className="mt-4 flex flex-col divide-y divide-[#f9fafb]">
                {gateways.length === 0 ? (
                  <p className="py-4 text-center text-xs text-[#9ca3af]">
                    No gateway transactions recorded.
                  </p>
                ) : (
                  gateways.map((g: any) => (
                    <div key={g.provider_name} className="flex items-center justify-between py-2.5 text-xs">
                      <div>
                        <span className="rounded bg-neutral-100 px-2 py-0.5 text-[10px] font-bold uppercase text-[#374151]">
                          {g.provider_name}
                        </span>
                        <p className="mt-1 text-[11px] text-[#6b7280]">
                          {g.successful_count} successful / {g.total_attempts} attempts (
                          {g.total_attempts > 0
                            ? Math.round((g.successful_count / g.total_attempts) * 100)
                            : 0}
                          %)
                        </p>
                      </div>
                      <span className="font-bold text-[#111827]">
                        {formatCurrency(g.total_volume)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
