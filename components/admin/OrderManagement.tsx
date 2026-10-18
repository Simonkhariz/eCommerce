'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Download } from 'lucide-react';
import { adminDownloadExport, adminGetOrders, errorMessage } from '@/lib/admin-api';
import { ORDER_STATUS, formatDate, formatPrice, gatewayLabel, num, orderStatus, paymentStatus } from '@/lib/admin-format';
import {
  Button,
  DataState,
  FilterSelect,
  PageHeader,
  Pagination,
  Panel,
  SearchInput,
  StatusPill,
  Table,
  Toolbar,
  redirectIfSignedOut,
  useAdminData,
  useDebouncedValue,
  useToast,
  useUrlFilters,
} from '@/components/admin/ui';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All orders' },
  { value: 'attention', label: 'Needs attention' },
  ...Object.entries(ORDER_STATUS).map(([value, s]) => ({ value, label: s.label })),
];

/**
 * All orders, newest first. Filters live in the URL (/admin/orders?status=attention).
 * Status changes, shipping and payments are handled on the order detail page.
 */
export function OrderManagement() {
  const toast = useToast();
  const [filters, setFilters] = useUrlFilters({ status: 'all', search: '', page: '1' });
  const [searchText, setSearchText] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchText, 350);
  const [exporting, setExporting] = useState(false);

  // Keep the box in sync when the URL changes (back/forward).
  useEffect(() => {
    setSearchText(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (debouncedSearch.trim() !== filters.search) setFilters({ search: debouncedSearch.trim() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const page = Math.max(1, parseInt(filters.page, 10) || 1);
  const { data, loading, error, reload } = useAdminData(
    () => adminGetOrders({ status: filters.status, search: filters.search, page, per_page: 20 }),
    [filters.status, filters.search, page]
  );

  const exportCsv = async () => {
    setExporting(true);
    try {
      await adminDownloadExport('/admin/orders/export', `orders-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      if (!redirectIfSignedOut(err)) toast.error(errorMessage(err, 'The export could not be generated.'));
    } finally {
      setExporting(false);
    }
  };

  const items = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Every order placed in the store. Open an order to ship it, record a payment or change its status."
        actions={
          <Button onClick={exportCsv} loading={exporting}>
            <Download className="size-3.5" aria-hidden="true" />
            Export CSV
          </Button>
        }
      />

      <Toolbar>
        <SearchInput
          label="Search orders"
          value={searchText}
          onChange={setSearchText}
          placeholder="Order number, email, name or tracking no."
        />
        <FilterSelect label="Order status" value={filters.status} onChange={(status) => setFilters({ status })} options={STATUS_OPTIONS} />
      </Toolbar>

      <Panel>
        <DataState
          loading={loading}
          error={error}
          onRetry={reload}
          hasData={!!data}
          empty={items.length === 0}
          emptyTitle={filters.status === 'attention' ? 'No orders need attention' : 'No orders found'}
          emptyDescription={
            filters.search || filters.status !== 'all' ? 'Try a different search or status.' : 'Orders appear here as soon as customers check out.'
          }
        >
          <Table minWidth={960}>
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Customer</th>
                <th scope="col">Placed</th>
                <th scope="col" className="text-right">
                  Items
                </th>
                <th scope="col" className="text-right">
                  Total
                </th>
                <th scope="col">Order status</th>
                <th scope="col">Payment</th>
                <th scope="col">Method</th>
              </tr>
            </thead>
            <tbody>
              {items.map((o) => {
                const os = orderStatus(o.order_status);
                const ps = paymentStatus(o.payment_status);
                const name = o.shipping_address_snapshot?.full_name?.trim();
                return (
                  <tr key={o.id} className="hover:bg-[#fafafa]">
                    <td>
                      <Link
                        href={`/admin/orders/${encodeURIComponent(o.order_number)}`}
                        className="font-semibold text-[#111827] underline-offset-2 hover:underline"
                      >
                        {o.order_number}
                      </Link>
                      {o.requires_attention && (
                        <span className="mt-1 flex max-w-[240px] items-start gap-1 text-xs font-medium text-red-700">
                          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                          <span>Needs attention{o.attention_reason ? `: ${o.attention_reason}` : ''}</span>
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="block text-[#111827]">{name || '—'}</span>
                      <span className="block text-xs text-[#6b7280]">{o.customer_email || o.guest_email || ''}</span>
                    </td>
                    <td className="whitespace-nowrap text-[#4b5563]">{formatDate(o.created_at)}</td>
                    <td className="text-right tabular-nums">{num(o.total_quantity) || num(o.items_count)}</td>
                    <td className="whitespace-nowrap text-right font-medium tabular-nums">{formatPrice(num(o.grand_total))}</td>
                    <td>
                      <StatusPill label={os.label} tone={os.tone} />
                    </td>
                    <td>
                      <StatusPill label={ps.label} tone={ps.tone} />
                    </td>
                    <td className="whitespace-nowrap text-[#4b5563]">{o.payment_provider ? gatewayLabel(o.payment_provider) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <Pagination meta={data?.pagination} onPage={(p) => setFilters({ page: String(p) })} />
        </DataState>
      </Panel>
    </div>
  );
}
