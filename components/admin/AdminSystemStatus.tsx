'use client';

import React from 'react';
import Link from 'next/link';
import { CheckCircle2, RefreshCw, XCircle, AlertTriangle } from 'lucide-react';
import { adminGetSystemStatus, SystemStatus } from '@/lib/admin-api';
import { formatDateTime } from '@/lib/admin-format';
import { Button, DataState, Notice, PageHeader, Panel, StatusPill, useAdminData } from '@/components/admin/ui';

type CheckState = 'ok' | 'warn' | 'fail';

function CheckIcon({ state }: { state: CheckState }) {
  if (state === 'ok') return <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />;
  if (state === 'warn') return <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden="true" />;
  return <XCircle className="size-4 shrink-0 text-red-600" aria-hidden="true" />;
}

const STATE_TEXT: Record<CheckState, string> = { ok: 'OK', warn: 'Check', fail: 'Problem' };

function Row({ label, state, value, href, linkLabel }: { label: string; state: CheckState; value: React.ReactNode; href?: string; linkLabel?: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[13px]">
      <span className="flex items-center gap-2">
        <CheckIcon state={state} />
        <span className="sr-only">{STATE_TEXT[state]}:</span>
        <span className="font-medium text-[#111827]">{label}</span>
      </span>
      <span className="flex items-center gap-3 text-right text-[#374151]">
        {value}
        {href && (
          <Link href={href} className="text-xs font-semibold text-[#111827] hover:underline">
            {linkLabel ?? 'View'}
          </Link>
        )}
      </span>
    </li>
  );
}

function gatewayState(mode: string): { state: CheckState; text: string } {
  if (mode === 'live') return { state: 'ok', text: 'Live keys' };
  if (mode === 'sandbox') return { state: 'warn', text: 'Sandbox (test) keys' };
  return { state: 'fail', text: 'Not configured' };
}

/** Health of the pieces the store depends on, read live from the backend. */
export function AdminSystemStatus() {
  const { data, loading, error, reload } = useAdminData<SystemStatus>(() => adminGetSystemStatus(), []);

  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="System status"
        description="Live checks of the database, storage, payment gateways, email and order queues."
        actions={
          <Button onClick={reload} loading={loading && !!data}>
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      <DataState loading={loading} error={error} empty={false} onRetry={reload} hasData={!!data}>
        {data && <StatusBody data={data} />}
      </DataState>
    </div>
  );
}

function StatusBody({ data }: { data: SystemStatus }) {
  const kora = gatewayState(data.payments.kora);
  const monnify = gatewayState(data.payments.monnify);
  const healthy = data.system_health === 'healthy';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#e5e7eb] bg-white px-4 py-3">
        <StatusPill label={healthy ? 'Healthy' : 'Degraded'} tone={healthy ? 'green' : 'red'} />
        <span className="text-[13px] text-[#374151]">
          {data.environment === 'production' ? 'Production' : 'Development'} · server time {formatDateTime(data.server_time)}
        </span>
      </div>

      {data.mail.mode === 'log_only' && (
        <Notice tone="warning">
          Email is in log-only mode: messages are written to <code className="font-mono text-xs">backend/storage/logs/mail.log</code> and are not
          delivered to customers. Set MAIL_MAILER=smtp and the MAIL_* settings in backend/.env to send real email.
        </Notice>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Infrastructure">
          <ul className="divide-y divide-[#f3f4f6]">
            <Row
              label="Database"
              state={data.database.connected ? 'ok' : 'fail'}
              value={data.database.connected ? `Connected${data.database.latency_ms !== null ? ` · ${data.database.latency_ms} ms` : ''}` : 'Unreachable'}
            />
            <Row
              label="Migrations"
              state={data.migrations.applied > 0 ? 'ok' : 'warn'}
              value={
                <span>
                  {data.migrations.applied} applied
                  {data.migrations.latest && <span className="block text-xs text-[#6b7280]">latest {data.migrations.latest}</span>}
                </span>
              }
            />
            <Row
              label="Image uploads folder"
              state={data.storage.uploads_writable ? 'ok' : 'fail'}
              value={data.storage.uploads_writable ? 'Writable' : 'Not writable (product images cannot be uploaded)'}
            />
          </ul>
        </Panel>

        <Panel title="Payments & email">
          <ul className="divide-y divide-[#f3f4f6]">
            <Row label="Kora" state={kora.state} value={kora.text} />
            <Row label="Monnify" state={monnify.state} value={monnify.text} />
            <Row label="Email delivery" state={data.mail.mode === 'smtp' ? 'ok' : 'warn'} value={data.mail.mode === 'smtp' ? 'SMTP' : 'Log only'} />
            <Row
              label="Emails waiting to send"
              state={data.mail.outbox_pending > 0 ? 'warn' : 'ok'}
              value={data.mail.outbox_pending.toLocaleString()}
              href="/admin/notifications?status=pending"
            />
            <Row
              label="Emails that failed"
              state={data.mail.outbox_failed > 0 ? 'fail' : 'ok'}
              value={data.mail.outbox_failed.toLocaleString()}
              href="/admin/notifications?status=failed"
            />
          </ul>
        </Panel>
      </div>

      <Panel title="Order queues">
        <ul className="divide-y divide-[#f3f4f6]">
          <Row
            label="Orders needing attention"
            state={data.orders.needs_attention > 0 ? 'warn' : 'ok'}
            value={data.orders.needs_attention.toLocaleString()}
            href="/admin/orders?status=attention"
          />
          <Row
            label="Unpaid orders past their payment window"
            state={data.orders.unpaid_overdue > 0 ? 'warn' : 'ok'}
            value={
              <span>
                {data.orders.unpaid_overdue.toLocaleString()}
                {data.orders.unpaid_overdue > 0 && (
                  <span className="block text-xs text-[#6b7280]">Released automatically when the orders list loads or the expiry job runs</span>
                )}
              </span>
            }
            href="/admin/orders?status=pending_payment"
          />
          <Row
            label="Paid orders waiting to ship"
            state="ok"
            value={data.orders.awaiting_fulfilment.toLocaleString()}
            href="/admin/shipping"
          />
        </ul>
      </Panel>
    </div>
  );
}
