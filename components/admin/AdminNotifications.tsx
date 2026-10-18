'use client';

import React, { useState } from 'react';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { adminGetOutbox, adminRetryOutbox, errorMessage, OutboxRow } from '@/lib/admin-api';
import { formatDateTime, formatRelative, humanize } from '@/lib/admin-format';
import {
  Button,
  DataState,
  FilterSelect,
  PageHeader,
  Pagination,
  Panel,
  StatusPill,
  Table,
  Toolbar,
  redirectIfSignedOut,
  useAdminData,
  useToast,
  useUrlFilters,
} from '@/components/admin/ui';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All emails' },
  { value: 'pending', label: 'Waiting to send' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
];

const STATUS_PILL: Record<OutboxRow['status'], { label: string; tone: 'amber' | 'green' | 'red' }> = {
  pending: { label: 'Waiting', tone: 'amber' },
  sent: { label: 'Sent', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
};

/** Every email the store has queued: order confirmations, shipping updates, sign-in links, newsletters. */
export function AdminNotifications() {
  const toast = useToast();
  const [filters, setFilters] = useUrlFilters({ status: 'all', page: '1' });
  const page = Math.max(1, parseInt(filters.page, 10) || 1);
  const { data, loading, error, reload } = useAdminData(
    () => adminGetOutbox({ status: filters.status, page, per_page: 25 }),
    [filters.status, page]
  );
  const [retrying, setRetrying] = useState<number | null>(null);

  const retry = async (row: OutboxRow) => {
    setRetrying(row.id);
    try {
      await adminRetryOutbox(row.id);
      toast.success(`Email to ${row.recipient_email} re-sent.`);
      await reload();
    } catch (err) {
      if (redirectIfSignedOut(err)) return;
      toast.error(errorMessage(err, 'The email could not be re-sent.'));
    } finally {
      setRetrying(null);
    }
  };

  const rows = data?.items ?? [];

  return (
    <div className="flex w-full flex-col">
      <PageHeader
        title="Email outbox"
        description="Every email the store has queued. Message bodies are not shown here because they can contain customer details."
        actions={
          <Button onClick={reload} loading={loading && !!data}>
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Refresh
          </Button>
        }
      />
      <Toolbar>
        <FilterSelect label="Status" value={filters.status} onChange={(v) => setFilters({ status: v })} options={STATUS_OPTIONS} />
      </Toolbar>

      <Panel>
        <DataState
          loading={loading}
          error={error}
          onRetry={reload}
          hasData={!!data}
          empty={rows.length === 0}
          emptyTitle={filters.status === 'all' ? 'No emails yet' : `No ${STATUS_OPTIONS.find((o) => o.value === filters.status)?.label.toLowerCase()} emails`}
        >
          <Table minWidth={900}>
            <thead>
              <tr>
                <th scope="col">Recipient</th>
                <th scope="col">Subject</th>
                <th scope="col">Type</th>
                <th scope="col">Status</th>
                <th scope="col" className="text-right">Attempts</th>
                <th scope="col">Queued</th>
                <th scope="col">Sent</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const s = STATUS_PILL[row.status] ?? { label: humanize(row.status), tone: 'amber' as const };
                return (
                  <tr key={row.id}>
                    <td className="max-w-[220px]">
                      <span className="block truncate" title={row.recipient_email}>
                        {row.recipient_email}
                      </span>
                    </td>
                    <td className="max-w-[260px]">
                      <span className="block truncate" title={row.subject}>
                        {row.subject}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-xs text-[#374151]">{humanize(row.template)}</td>
                    <td>
                      <StatusPill label={s.label} tone={s.tone} />
                      {row.last_error && (
                        <span className="mt-1 block max-w-[240px] truncate text-xs text-red-700" title={row.last_error}>
                          {row.last_error}
                        </span>
                      )}
                    </td>
                    <td className="text-right tabular-nums">{row.attempt_count ?? 0}</td>
                    <td className="whitespace-nowrap text-xs text-[#6b7280]" title={formatDateTime(row.created_at)}>
                      {formatRelative(row.created_at)}
                    </td>
                    <td className="whitespace-nowrap text-xs text-[#6b7280]">{row.sent_at ? formatDateTime(row.sent_at) : '—'}</td>
                    <td className="text-right">
                      {row.status === 'failed' && (
                        <Button size="sm" onClick={() => retry(row)} loading={retrying === row.id} disabled={retrying !== null && retrying !== row.id}>
                          <RotateCcw className="size-3.5" aria-hidden="true" />
                          Retry
                        </Button>
                      )}
                    </td>
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
