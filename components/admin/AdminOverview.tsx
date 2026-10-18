'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { adminGetOverview, DashboardOverview } from '@/lib/admin-api';
import { formatDate, formatDateTime, formatPrice, formatRelative, gatewayLabel, humanize, num, orderStatus, paymentStatus } from '@/lib/admin-format';
import {
  Button,
  DataState,
  ErrorState,
  FilterSelect,
  LoadingState,
  PageHeader,
  Panel,
  StatusPill,
  Table,
  useAdminData,
  useUrlFilters,
} from '@/components/admin/ui';

const PERIODS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

type Period = 7 | 30 | 90;

function toPeriod(value: string): Period {
  return value === '7' ? 7 : value === '90' ? 90 : 30;
}

/**
 * Admin home: sales KPIs for the chosen period (with real period-over-period changes),
 * operational counts, a daily sales trend, and the lists that need action today.
 */
export function AdminOverview() {
  const [filters, setFilters] = useUrlFilters({ period: '30' });
  const period = toPeriod(filters.period);
  const { data, loading, error, reload } = useAdminData(() => adminGetOverview(period), [period]);

  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="Overview"
        description="Sales are payments verified in the period, minus refunds completed in the period. Stock and queue counts are live."
        actions={
          <>
            <FilterSelect label="Period" value={String(period)} onChange={(v) => setFilters({ period: v })} options={PERIODS} />
            <Button onClick={reload} loading={loading && !!data} aria-label="Refresh overview">
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Refresh
            </Button>
          </>
        }
      />

      {error && !data ? (
        <Panel>
          <ErrorState message={error} onRetry={reload} />
        </Panel>
      ) : !data ? (
        <Panel>
          <LoadingState label="Loading the overview…" />
        </Panel>
      ) : (
        <div className={`flex flex-col gap-4 ${loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}`}>
          <SalesKpis data={data} />
          <OperationalCards data={data} />
          <SalesTrend data={data} />
          <div className="grid gap-4 xl:grid-cols-2">
            <AttentionPanel data={data} />
            <PaymentAlertsPanel data={data} />
          </div>
          <RecentOrdersPanel data={data} />
          <div className="grid gap-4 xl:grid-cols-2">
            <LowStockPanel data={data} />
            <TopProductsPanel data={data} />
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// KPIs
// -----------------------------------------------------------------------------

function Delta({ value, days }: { value: number | null; days: number }) {
  if (value === null) {
    return <p className="text-xs text-[#6b7280]">No earlier data to compare</p>;
  }
  const up = value > 0;
  const flat = value === 0;
  return (
    <p className="text-xs text-[#6b7280]">
      <span className={`font-semibold ${flat ? 'text-[#374151]' : up ? 'text-emerald-700' : 'text-red-700'}`}>
        <span aria-hidden="true">{flat ? '' : up ? '▲ ' : '▼ '}</span>
        {up ? '+' : ''}
        {value.toLocaleString('en-NG', { maximumFractionDigits: 1 })}%
      </span>{' '}
      vs previous {days} days
    </p>
  );
}

function KpiCard({ label, value, delta, days, children }: { label: string; value: string; delta: number | null; days: number; children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-[#e5e7eb] bg-white p-4">
      <p className="text-xs font-medium text-[#6b7280]">{label}</p>
      <p className="truncate text-2xl font-semibold tabular-nums tracking-tight text-[#111827]" title={value}>
        {value}
      </p>
      {children}
      <Delta value={delta} days={days} />
    </div>
  );
}

function SalesKpis({ data }: { data: DashboardOverview }) {
  const { kpis, deltas, period } = data;
  const days = period.days;
  return (
    <section aria-label={`Sales in the last ${days} days`} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <KpiCard label="Net sales" value={formatPrice(num(kpis.net_sales))} delta={deltas.net_sales} days={days}>
        <p className="text-xs text-[#6b7280]">
          {formatPrice(num(kpis.gross_sales))} received · {formatPrice(num(kpis.total_refunded))} refunded
        </p>
      </KpiCard>
      <KpiCard label="Paid orders" value={num(kpis.paid_orders).toLocaleString()} delta={deltas.paid_orders} days={days} />
      <KpiCard label="Average order value" value={formatPrice(num(kpis.aov))} delta={deltas.aov} days={days} />
      <KpiCard label="Orders placed" value={num(kpis.total_orders).toLocaleString()} delta={deltas.total_orders} days={days}>
        <p className="text-xs text-[#6b7280]">Including unpaid and cancelled</p>
      </KpiCard>
      <KpiCard label="New customer accounts" value={num(kpis.new_customers).toLocaleString()} delta={deltas.new_customers} days={days}>
        <p className="text-xs text-[#6b7280]">{num(kpis.total_customers).toLocaleString()} in total</p>
      </KpiCard>
    </section>
  );
}

function OperationalCards({ data }: { data: DashboardOverview }) {
  const { kpis } = data;
  const cards = [
    {
      label: 'Needs attention',
      value: num(kpis.needs_attention),
      hint: 'Late, duplicate or mismatched payments',
      href: '/admin/orders?status=attention',
      urgent: num(kpis.needs_attention) > 0,
    },
    { label: 'To ship', value: num(kpis.pending_fulfillment), hint: 'Paid or processing orders', href: '/admin/shipping', urgent: false },
    {
      label: 'Awaiting payment',
      value: num(kpis.awaiting_payment),
      hint: 'Still within their payment window',
      href: '/admin/orders?status=pending_payment',
      urgent: false,
    },
    {
      label: 'Low / out of stock',
      value: num(kpis.low_stock_count) + num(kpis.out_of_stock_count),
      hint: `${num(kpis.low_stock_count)} low · ${num(kpis.out_of_stock_count)} sold out`,
      href: '/admin/inventory?filter=low_stock',
      urgent: num(kpis.out_of_stock_count) > 0,
    },
  ];

  return (
    <section aria-label="Current workload" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <Link
          key={c.label}
          href={c.href}
          className={`group flex flex-col gap-1 rounded-xl border p-4 outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[#9ca3af]/50 ${
            c.urgent ? 'border-amber-200 bg-amber-50 hover:bg-amber-100/60' : 'border-[#e5e7eb] bg-[#fafafa] hover:bg-white'
          }`}
        >
          <span className="text-xs font-medium text-[#6b7280]">{c.label}</span>
          <span className="text-2xl font-semibold tabular-nums text-[#111827]">{c.value.toLocaleString()}</span>
          <span className="text-xs text-[#6b7280]">{c.hint}</span>
          <span className="mt-1 text-xs font-semibold text-[#111827] group-hover:underline">View →</span>
        </Link>
      ))}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Trend chart
// -----------------------------------------------------------------------------

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const steps = [1, 2, 2.5, 5, 10];
  for (const s of steps) {
    if (s * magnitude >= value) return s * magnitude;
  }
  return 10 * magnitude;
}

function compactNaira(value: number): string {
  if (value >= 1_000_000) return `₦${(value / 1_000_000).toLocaleString('en-NG', { maximumFractionDigits: 1 })}m`;
  if (value >= 1_000) return `₦${(value / 1_000).toLocaleString('en-NG', { maximumFractionDigits: 1 })}k`;
  return `₦${Math.round(value).toLocaleString('en-NG')}`;
}

function shortDay(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

function SalesTrend({ data }: { data: DashboardOverview }) {
  const [showTable, setShowTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const points = data.trend;
  const total = points.reduce((sum, p) => sum + num(p.sales), 0);
  const maxSales = Math.max(0, ...points.map((p) => num(p.sales)));
  const top = niceMax(maxSales);
  const ticks = [0, top / 2, top];
  // Label roughly 7 dates across the axis whatever the period.
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));
  const best = points.reduce<(typeof points)[number] | null>((b, p) => (!b || num(p.sales) > num(b.sales) ? p : b), null);
  const summary =
    total > 0
      ? `Daily verified sales over the last ${data.period.days} days: ${formatPrice(total)} in total; best day ${best ? `${shortDay(best.date)} with ${formatPrice(num(best.sales))}` : ''}.`
      : `No verified sales in the last ${data.period.days} days.`;
  const hovered = hover !== null ? points[hover] : null;

  return (
    <Panel
      title={`Daily sales · last ${data.period.days} days`}
      actions={
        <Button size="sm" variant="ghost" aria-pressed={showTable} onClick={() => setShowTable((s) => !s)}>
          {showTable ? 'Show chart' : 'Show as table'}
        </Button>
      }
    >
      {total === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-[#6b7280]">No verified payments in this period yet.</p>
      ) : showTable ? (
        <div className="max-h-[360px] overflow-y-auto">
          <Table minWidth={420}>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col" className="text-right">Sales</th>
                <th scope="col" className="text-right">Paid orders</th>
                <th scope="col" className="text-right">Orders placed</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date}>
                  <td>{formatDate(p.date)}</td>
                  <td className="text-right tabular-nums">{formatPrice(num(p.sales))}</td>
                  <td className="text-right tabular-nums">{num(p.paid_orders)}</td>
                  <td className="text-right tabular-nums">{num(p.total_orders)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : (
        <figure className="px-4 pb-3 pt-4">
          <figcaption className="sr-only">{summary}</figcaption>
          <div className="mb-2 min-h-[34px] text-xs text-[#6b7280]" aria-live="polite">
            {hovered ? (
              <>
                <span className="font-semibold text-[#111827]">{formatDate(hovered.date)}</span> · {formatPrice(num(hovered.sales))} ·{' '}
                {num(hovered.paid_orders)} paid of {num(hovered.total_orders)} placed
              </>
            ) : (
              <>
                <span className="font-semibold text-[#111827]">{formatPrice(total)}</span> verified in this period. Hover or focus a bar for the day.
              </>
            )}
          </div>
          <div className="flex gap-2">
            {/* Y axis */}
            <div className="relative h-[180px] w-12 shrink-0 text-right text-[11px] tabular-nums text-[#6b7280]" aria-hidden="true">
              {ticks.map((t) => (
                <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / top) * 100}%` }}>
                  {compactNaira(t)}
                </span>
              ))}
            </div>
            <div className="min-w-0 flex-1 overflow-x-auto">
              <div style={{ minWidth: points.length * 8 }}>
                <div className="relative h-[180px]" onMouseLeave={() => setHover(null)}>
                  {/* Gridlines */}
                  {ticks.map((t) => (
                    <div
                      key={t}
                      aria-hidden="true"
                      className={`absolute inset-x-0 border-t ${t === 0 ? 'border-[#d1d5db]' : 'border-dashed border-[#f0f0f0]'}`}
                      style={{ top: `${100 - (t / top) * 100}%` }}
                    />
                  ))}
                  <ol className="absolute inset-0 flex items-end gap-[2px]" aria-label="Sales per day">
                    {points.map((p, i) => {
                      const v = num(p.sales);
                      const h = v > 0 ? Math.max(2, (v / top) * 100) : 0;
                      const label = `${formatDate(p.date)}: ${formatPrice(v)}, ${num(p.paid_orders)} paid orders`;
                      return (
                        <li key={p.date} className="flex h-full min-w-0 flex-1 items-end">
                          <button
                            type="button"
                            aria-label={label}
                            title={label}
                            onMouseEnter={() => setHover(i)}
                            onFocus={() => setHover(i)}
                            onBlur={() => setHover(null)}
                            className="group flex h-full w-full items-end justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[#9ca3af]"
                          >
                            <span
                              className={`block w-full max-w-[28px] rounded-t-[4px] transition-colors ${hover === i ? 'bg-[#111827]' : 'bg-[#4b5563]'}`}
                              style={{ height: `${h}%` }}
                            />
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
                {/* X axis labels */}
                <div className="mt-1.5 flex gap-[2px] text-[11px] text-[#6b7280]" aria-hidden="true">
                  {points.map((p, i) => (
                    <span key={p.date} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center">
                      {i % labelEvery === 0 ? shortDay(p.date) : ''}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </figure>
      )}
    </Panel>
  );
}

// -----------------------------------------------------------------------------
// Lists
// -----------------------------------------------------------------------------

function orderLink(orderNumber: string) {
  return (
    <Link href={`/admin/orders/${encodeURIComponent(orderNumber)}`} className="font-semibold text-[#111827] hover:underline">
      {orderNumber}
    </Link>
  );
}

function AttentionPanel({ data }: { data: DashboardOverview }) {
  const rows = data.attention_orders;
  const total = num(data.kpis.needs_attention);
  return (
    <Panel
      title="Needs attention"
      actions={
        total > rows.length ? (
          <Link href="/admin/orders?status=attention" className="text-xs font-semibold text-[#111827] hover:underline">
            View all {total}
          </Link>
        ) : undefined
      }
    >
      <DataState loading={false} error={null} empty={rows.length === 0} emptyTitle="Nothing needs attention" emptyDescription="Late, duplicate and mismatched payments show up here.">
        <ul className="divide-y divide-[#f3f4f6]">
          {rows.map((o) => {
            const s = orderStatus(o.order_status);
            return (
              <li key={o.order_number} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-[13px]">
                <div className="min-w-0">
                  {orderLink(o.order_number)}
                  <p className="mt-0.5 text-xs text-[#374151]">{o.attention_reason ? humanize(o.attention_reason) : 'Flagged for review'}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusPill label={s.label} tone={s.tone} />
                  <span className="text-xs text-[#6b7280]">{formatRelative(o.updated_at)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </DataState>
    </Panel>
  );
}

function PaymentAlertsPanel({ data }: { data: DashboardOverview }) {
  const rows = data.payment_alerts;
  return (
    <Panel
      title="Payment alerts"
      actions={
        <Link href="/admin/payments?status=failed" className="text-xs font-semibold text-[#111827] hover:underline">
          All failed payments
        </Link>
      }
    >
      <DataState
        loading={false}
        error={null}
        empty={rows.length === 0}
        emptyTitle="No payment alerts"
        emptyDescription="Failed attempts from the last day and gateway payments still unconfirmed after 30 minutes appear here."
      >
        <ul className="divide-y divide-[#f3f4f6]">
          {rows.map((p) => {
            const s = p.status === 'pending' ? { label: 'Unconfirmed', tone: 'amber' as const } : paymentStatus(p.status);
            return (
              <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-[13px]">
                <div className="min-w-0">
                  {orderLink(p.order_number)}
                  <p className="mt-0.5 truncate text-xs text-[#6b7280]" title={p.payment_reference}>
                    {gatewayLabel(p.gateway)} · {p.payment_reference}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusPill label={s.label} tone={s.tone} />
                  <span className="text-xs tabular-nums text-[#374151]">
                    {formatPrice(num(p.amount))} · {formatRelative(p.created_at)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </DataState>
    </Panel>
  );
}

function RecentOrdersPanel({ data }: { data: DashboardOverview }) {
  const rows = data.recent_orders;
  return (
    <Panel
      title="Recent orders"
      actions={
        <Link href="/admin/orders" className="text-xs font-semibold text-[#111827] hover:underline">
          All orders
        </Link>
      }
    >
      <DataState loading={false} error={null} empty={rows.length === 0} emptyTitle="No orders yet">
        <Table minWidth={680}>
          <thead>
            <tr>
              <th scope="col">Order</th>
              <th scope="col">Customer</th>
              <th scope="col">Status</th>
              <th scope="col">Payment</th>
              <th scope="col" className="text-right">Total</th>
              <th scope="col">Placed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const s = orderStatus(o.order_status);
              const p = paymentStatus(o.payment_status);
              return (
                <tr key={o.id}>
                  <td>
                    {orderLink(o.order_number)}
                    {!!num(o.requires_attention) && <span className="ml-1.5 text-xs font-semibold text-amber-700">· attention</span>}
                    <span className="block text-xs text-[#6b7280]">
                      {num(o.items_count)} item{num(o.items_count) === 1 ? '' : 's'}
                    </span>
                  </td>
                  <td className="max-w-[220px]">
                    <span className="block truncate">{o.customer_name || '—'}</span>
                    <span className="block truncate text-xs text-[#6b7280]">{o.customer_email || ''}</span>
                  </td>
                  <td>
                    <StatusPill label={s.label} tone={s.tone} />
                  </td>
                  <td>
                    <StatusPill label={p.label} tone={p.tone} />
                    {o.payment_method && <span className="block text-xs text-[#6b7280]">{gatewayLabel(o.payment_method)}</span>}
                  </td>
                  <td className="text-right tabular-nums">{formatPrice(num(o.total_amount))}</td>
                  <td className="whitespace-nowrap text-xs text-[#6b7280]" title={formatDateTime(o.created_at)}>
                    {formatRelative(o.created_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </DataState>
    </Panel>
  );
}

function LowStockPanel({ data }: { data: DashboardOverview }) {
  const rows = data.critical_stock;
  return (
    <Panel
      title="Low stock"
      actions={
        <Link href="/admin/inventory?filter=low_stock" className="text-xs font-semibold text-[#111827] hover:underline">
          Manage inventory
        </Link>
      }
    >
      <DataState loading={false} error={null} empty={rows.length === 0} emptyTitle="Stock levels are healthy" emptyDescription="Variants at or below their low-stock threshold appear here.">
        <ul className="divide-y divide-[#f3f4f6]">
          {rows.map((v) => {
            const stock = num(v.stock_quantity);
            return (
              <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3 text-[13px]">
                <div className="min-w-0">
                  <p className="truncate font-medium text-[#111827]">{v.product_name}</p>
                  <p className="truncate text-xs text-[#6b7280]">
                    {[v.size, v.color_name].filter(Boolean).join(' · ')} · {v.sku}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <StatusPill label={stock === 0 ? 'Sold out' : `${stock} left`} tone={stock === 0 ? 'red' : 'amber'} />
                  <p className="mt-1 text-xs text-[#6b7280]">Alert at {num(v.low_stock_threshold)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </DataState>
    </Panel>
  );
}

function TopProductsPanel({ data }: { data: DashboardOverview }) {
  const rows = data.top_products;
  const maxUnits = useMemo(() => Math.max(1, ...rows.map((r) => num(r.total_units_sold))), [rows]);
  return (
    <Panel title={`Top products · last ${data.period.days} days`}>
      <DataState loading={false} error={null} empty={rows.length === 0} emptyTitle="No paid sales in this period" emptyDescription="Products from orders with a verified payment are ranked by units sold.">
        <ol className="divide-y divide-[#f3f4f6]">
          {rows.map((p, i) => {
            const units = num(p.total_units_sold);
            return (
              <li key={p.id} className="px-4 py-3 text-[13px]">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate">
                    <span className="mr-2 text-xs tabular-nums text-[#6b7280]">{i + 1}.</span>
                    <span className="font-medium text-[#111827]">{p.name}</span>
                  </p>
                  <p className="shrink-0 text-right tabular-nums text-[#374151]">
                    {units} sold · {formatPrice(num(p.total_revenue))}
                  </p>
                </div>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-[#f3f4f6]" aria-hidden="true">
                  <div className="h-full rounded-full bg-[#4b5563]" style={{ width: `${(units / maxUnits) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
      </DataState>
    </Panel>
  );
}
