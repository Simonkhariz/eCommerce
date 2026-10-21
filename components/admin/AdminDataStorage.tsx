'use client';

import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  type DataOverview,
  type DataSettingKey,
  type DataSettings,
  type HealthLevel,
  type StorageHealthReport,
  adminGetDataOverview,
  adminRunCleanup,
  adminUpdateDataSettings,
  errorMessage,
  fieldErrors,
} from '@/lib/admin-api';
import { formatDateTime } from '@/lib/admin-format';
import {
  Button,
  DataState,
  Field,
  Notice,
  PageHeader,
  Panel,
  Select,
  StatusPill,
  Table,
  redirectIfSignedOut,
  useAdminData,
  useConfirm,
  useToast,
} from '@/components/admin/ui';

const LEVEL_PILL: Record<HealthLevel, { label: string; tone: 'green' | 'amber' | 'red' }> = {
  ok: { label: 'Healthy', tone: 'green' },
  warning: { label: 'Needs attention', tone: 'amber' },
  critical: { label: 'Problem', tone: 'red' },
};

/** The retention settings in the order shown, with what each one does. */
const SETTINGS: Array<{ key: DataSettingKey; label: string; keep?: string; hint: React.ReactNode }> = [
  {
    key: 'retention_customer_days',
    label: 'Customer records',
    keep: 'Keep (never remove)',
    hint: (
      <>
        A customer with no sign-in and no order for this long has their account, saved addresses, cart and wishlist deleted, and their name, phone,
        email and street address removed from their finished orders. Anyone with an unpaid, undelivered or flagged order, or a refund in progress, is
        skipped.
      </>
    ),
  },
  {
    key: 'retention_unpaid_days',
    label: 'Unfinished checkouts',
    hint: 'Cancelled orders that were never paid, and carts that visitors left without signing in.',
  },
  {
    key: 'retention_message_days',
    label: 'Emails and payment notifications',
    hint: 'Copies of sent and failed emails (they contain names and addresses) and raw notifications from Kora and Monnify. Emails are never kept longer than customer records.',
  },
  {
    key: 'retention_activity_days',
    label: 'Admin activity and stock history',
    keep: 'Keep forever',
    hint: 'The audit log of admin changes and the record of every stock adjustment. Keep at least a year so you can look back at mistakes or disputes.',
  },
  {
    key: 'storage_alert_mb',
    label: 'Warn me when the database is bigger than',
    hint: 'You get a warning in the admin bell at 80% of this and an email from the daily check. Set it to what your hosting plan allows.',
  },
];

/** Friendly names for the tables most likely to grow. */
const TABLE_NAMES: Record<string, string> = {
  orders: 'Orders',
  order_items: 'Order items',
  order_status_history: 'Order status history',
  payments: 'Payments',
  refunds: 'Refunds',
  shipments: 'Shipments',
  payment_webhook_events: 'Payment notifications',
  email_outbox: 'Emails',
  admin_audit_logs: 'Admin activity log',
  inventory_logs: 'Stock history',
  sessions: 'Sign-in sessions',
  rate_limits: 'Rate-limit counters',
  users: 'Accounts',
  addresses: 'Saved addresses',
  carts: 'Carts',
  cart_items: 'Cart items',
  products: 'Products',
  product_variants: 'Product variants',
  product_images: 'Product images',
  reviews: 'Reviews',
  newsletter_subscribers: 'Newsletter subscribers',
  api_slow_requests: 'Slow-request records',
};

function optionLabel(key: DataSettingKey, value: number, keep?: string): string {
  if (key === 'storage_alert_mb') return value >= 1000 ? `${value / 1000} GB` : `${value} MB`;
  if (value === 0) return keep ?? 'Keep';
  if (value % 365 === 0) return value === 365 ? '1 year' : `${value / 365} years`;
  if (value >= 90 && value % 30 === 0) return `${value / 30} months`;
  return `${value} days`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function daysAgo(days: number | null): string {
  if (days === null) return 'Never';
  if (days === 0) return 'Today';
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}

/**
 * Admin → Data & storage: how long customer data and logs are kept, database size and speed
 * (with the problems behind the alert bell), and a clean-up the admin can run by hand.
 */
export function AdminDataStorage() {
  const { data, loading, error, reload } = useAdminData<DataOverview>(() => adminGetDataOverview(), []);

  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="Data & storage"
        description="How long customer data is kept, how big and fast the database is, and clean-ups."
        actions={
          <Button onClick={reload} loading={loading && !!data}>
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Refresh
          </Button>
        }
      />
      <DataState loading={loading} error={error} empty={false} onRetry={reload} hasData={!!data}>
        {data && (
          <div className="flex flex-col gap-4">
            <HealthPanel health={data.health} />
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <RetentionPanel data={data} onSaved={reload} />
              <CleanupPanel data={data} onDone={reload} />
            </div>
            <div className="grid items-start gap-4 xl:grid-cols-2">
              <TablesPanel health={data.health} />
              <SlowPanel health={data.health} />
            </div>
          </div>
        )}
      </DataState>
    </div>
  );
}

function Stat({ label, value, sub, children }: { label: string; value: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="text-xs font-medium text-[#6b7280]">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-[#111827]">{value}</p>
      {children}
      {sub && <p className="mt-0.5 text-xs text-[#6b7280]">{sub}</p>}
    </div>
  );
}

function HealthPanel({ health }: { health: StorageHealthReport }) {
  const pill = LEVEL_PILL[health.level];
  const used = Math.min(100, health.database.used_percent);
  const barTone = health.database.used_percent >= 100 ? 'bg-red-500' : health.database.used_percent >= 80 ? 'bg-amber-500' : 'bg-[#1f2937]';
  const lastRun = health.cleanup.last_run;
  const thresholdSec = health.slow_requests.threshold_ms / 1000;

  return (
    <Panel
      title="Database health"
      actions={
        <span className="flex items-center gap-2 text-xs text-[#6b7280]">
          <StatusPill label={pill.label} tone={pill.tone} />
          checked {formatDateTime(health.checked_at)}
        </span>
      }
    >
      {health.issues.length > 0 && (
        <div className="flex flex-col gap-2 border-b border-[#f3f4f6] p-3">
          {health.issues.map((issue) => (
            <Notice key={issue.code} tone={issue.level === 'critical' ? 'danger' : 'warning'}>
              <strong>{issue.title}.</strong> {issue.detail}
            </Notice>
          ))}
        </div>
      )}
      <div className="grid divide-y divide-[#f3f4f6] sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
        <Stat label="Database size" value={formatBytes(health.database.size_bytes)} sub={`${health.database.used_percent}% of your ${optionLabel('storage_alert_mb', health.database.alert_mb)} limit`}>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#f3f4f6]"
            role="meter"
            aria-label="Database size against your limit"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={used}
          >
            <div className={`h-full rounded-full ${barTone}`} style={{ width: `${Math.max(used, 1)}%` }} />
          </div>
        </Stat>
        <Stat
          label="Slow requests (24 hours)"
          value={health.slow_requests.threshold_ms > 0 ? health.slow_requests.last_24h.toLocaleString() : 'Off'}
          sub={
            health.slow_requests.threshold_ms > 0
              ? health.slow_requests.last_24h > 0
                ? `took over ${thresholdSec} s · slowest ${(health.slow_requests.slowest_ms / 1000).toFixed(1)} s`
                : `none took over ${thresholdSec} s`
              : 'SLOW_REQUEST_MS=0 in backend/.env'
          }
        />
        <Stat
          label="Typical query time"
          value={health.queries ? `${health.queries.typical_ms} ms` : '—'}
          sub={health.queries && health.queries.typical_ms < 100 ? 'fast' : 'normally under 50 ms'}
        />
        <Stat
          label="Last clean-up"
          value={daysAgo(health.cleanup.days_since)}
          sub={lastRun ? `${formatDateTime(lastRun.at)} · ${lastRun.source === 'admin' ? 'run by an admin' : 'scheduled'}` : 'the daily task is not set up yet'}
        />
      </div>
    </Panel>
  );
}

function RetentionPanel({ data, onSaved }: { data: DataOverview; onSaved: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [values, setValues] = useState<DataSettings>(data.settings);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // The form starts from the saved settings each time they (re)load.
  const [valuesFor, setValuesFor] = useState(data.settings);
  if (data.settings !== valuesFor) {
    setValuesFor(data.settings);
    setValues(data.settings);
  }

  const changed = SETTINGS.map((s) => s.key).filter((key) => values[key] !== data.settings[key]);
  const shorterCustomerPeriod =
    values.retention_customer_days > 0 &&
    (data.settings.retention_customer_days === 0 || values.retention_customer_days < data.settings.retention_customer_days);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (changed.length === 0) return;
    if (shorterCustomerPeriod) {
      const period = optionLabel('retention_customer_days', values.retention_customer_days);
      const ok = await confirm({
        title: `Remove customers inactive for ${period}?`,
        message: (
          <>
            From the next clean-up (daily, or when you press “Clean up now”), customers with no sign-in and no order for {period} lose their account
            and the personal details on their orders. This can&apos;t be undone. Order totals and payments are kept.
          </>
        ),
        confirmLabel: 'Save',
        tone: 'danger',
      });
      if (!ok) return;
    }

    const payload: Partial<DataSettings> = {};
    changed.forEach((key) => {
      payload[key] = values[key];
    });
    setSaving(true);
    setErrors({});
    try {
      await adminUpdateDataSettings(payload);
      toast.success('Data settings saved.');
      onSaved();
    } catch (err) {
      if (redirectIfSignedOut(err)) return;
      const fields = fieldErrors(err);
      setErrors(fields);
      toast.error(Object.keys(fields).length ? 'Please fix the highlighted settings.' : errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="How long to keep data" bodyClassName="p-4">
      <form onSubmit={save} className="flex flex-col gap-4" noValidate>
        {data.settings.retention_customer_days === 0 && (
          <Notice>
            Customer records are kept for ever at the moment. Choose a period so personal data of people who stopped shopping with you isn&apos;t
            kept longer than needed (the Nigeria Data Protection Act asks for this). 1 year is a common choice.
          </Notice>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {SETTINGS.map((s) => (
            <Field key={s.key} label={s.label} hint={s.hint} error={errors[s.key]} className={s.key === 'retention_customer_days' ? 'sm:col-span-2' : ''}>
              {(p) => (
                <Select {...p} value={values[s.key]} onChange={(e) => setValues((v) => ({ ...v, [s.key]: Number(e.target.value) }))}>
                  {data.options[s.key].map((option) => (
                    <option key={option} value={option}>
                      {optionLabel(s.key, option, s.keep)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-[#6b7280]">
          Never removed: order totals and items, payments and refunds (tax rules require you to keep business records for six years), orders that need
          your attention, and active newsletter subscriptions.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" loading={saving} disabled={changed.length === 0}>
            Save changes
          </Button>
          {changed.length > 0 && (
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setValues(data.settings);
                setErrors({});
              }}
            >
              Discard
            </Button>
          )}
        </div>
      </form>
    </Panel>
  );
}

function CleanupPanel({ data, onDone }: { data: DataOverview; onDone: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [running, setRunning] = useState(false);
  const waiting = data.health.cleanup.waiting ?? {};
  // In the order of the labels, so the customer rows stay together under their heading row.
  const order = Object.keys(data.labels);
  const rows = Object.entries(waiting)
    .filter(([key, count]) => count > 0 && key !== 'inactive_customers')
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
  const customers = waiting.inactive_customers ?? 0;
  const total = rows.reduce((sum, [, count]) => sum + count, 0);

  const run = async () => {
    const ok = await confirm({
      title: 'Clean up now?',
      message: (
        <>
          {total.toLocaleString()} old {total === 1 ? 'record is' : 'records are'} removed for good
          {customers > 0 && (
            <>
              , including the personal details of <strong>{customers.toLocaleString()} inactive {customers === 1 ? 'customer' : 'customers'}</strong>
            </>
          )}
          . This can&apos;t be undone.
        </>
      ),
      confirmLabel: 'Clean up',
      tone: 'danger',
    });
    if (!ok) return;
    setRunning(true);
    try {
      const { removed } = await adminRunCleanup(customers);
      const count = Object.entries(removed)
        .filter(([key]) => key !== 'inactive_customers')
        .reduce((sum, [, n]) => sum + n, 0);
      toast.success(count > 0 ? `Clean-up finished: ${count.toLocaleString()} old records removed.` : 'Clean-up finished: nothing to remove.');
      onDone();
    } catch (err) {
      if (redirectIfSignedOut(err)) return;
      toast.error(errorMessage(err, 'The clean-up could not run.'));
      onDone();
    } finally {
      setRunning(false);
    }
  };

  return (
    <Panel title="Clean up now" bodyClassName="p-0">
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-[#6b7280]">Nothing to clean up right now: everything is within your keep periods.</p>
      ) : (
        <ul className="divide-y divide-[#f3f4f6]">
          {customers > 0 && (
            <li className="flex items-center justify-between gap-3 bg-amber-50/60 px-4 py-2.5 text-[13px]">
              <span className="font-medium text-[#111827]">{data.labels.inactive_customers}</span>
              <span className="font-semibold tabular-nums text-[#111827]">{customers.toLocaleString()}</span>
            </li>
          )}
          {rows.map(([key, count]) => (
            <li key={key} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
              <span className="text-[#374151]">{data.labels[key] ?? key}</span>
              <span className="font-semibold tabular-nums text-[#111827]">{count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-3 border-t border-[#f3f4f6] px-4 py-3">
        <Button variant="danger" onClick={run} loading={running} disabled={rows.length === 0} className="self-start">
          Clean up now
        </Button>
        <p className="text-xs leading-relaxed text-[#6b7280]">
          Runs by itself every day once <code className="font-mono">backend/scripts/cleanup_database.php</code> is scheduled (Task Scheduler or cron, see
          backend/README.md). The daily run also emails you when the database needs attention.
        </p>
      </div>
    </Panel>
  );
}

function TablesPanel({ health }: { health: StorageHealthReport }) {
  return (
    <Panel title="Biggest tables" bodyClassName="p-0">
      <Table minWidth={420}>
        <thead>
          <tr>
            <th scope="col">Table</th>
            <th scope="col" className="text-right">
              Rows (about)
            </th>
            <th scope="col" className="text-right">
              Size
            </th>
          </tr>
        </thead>
        <tbody>
          {health.database.tables.map((t) => (
            <tr key={t.name}>
              <td>
                <span className="font-medium text-[#111827]">{TABLE_NAMES[t.name] ?? t.name}</span>
                {TABLE_NAMES[t.name] && <span className="ml-2 font-mono text-xs text-[#9ca3af]">{t.name}</span>}
              </td>
              <td className="text-right tabular-nums">{t.rows.toLocaleString()}</td>
              <td className="text-right tabular-nums">{formatBytes(t.bytes)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Panel>
  );
}

function SlowPanel({ health }: { health: StorageHealthReport }) {
  const routes = health.slow_requests.routes;
  return (
    <Panel title="Slowest requests (24 hours)" bodyClassName="p-0">
      {routes.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-[#6b7280]">
          {health.slow_requests.threshold_ms > 0
            ? `No request took longer than ${health.slow_requests.threshold_ms / 1000} s. The site is responding quickly.`
            : 'Slow-request tracking is off (SLOW_REQUEST_MS=0 in backend/.env).'}
        </p>
      ) : (
        <Table minWidth={460}>
          <thead>
            <tr>
              <th scope="col">Request</th>
              <th scope="col" className="text-right">
                Times
              </th>
              <th scope="col" className="text-right">
                Average
              </th>
              <th scope="col" className="text-right">
                Slowest
              </th>
            </tr>
          </thead>
          <tbody>
            {routes.map((r) => (
              <tr key={`${r.method} ${r.route}`}>
                <td className="font-mono text-xs">
                  {r.method} {r.route.replace(/^\/api\/v1/, '')}
                </td>
                <td className="text-right tabular-nums">{r.hits.toLocaleString()}</td>
                <td className="text-right tabular-nums">{(r.avg_ms / 1000).toFixed(1)} s</td>
                <td className="text-right tabular-nums">{(r.max_ms / 1000).toFixed(1)} s</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Panel>
  );
}
