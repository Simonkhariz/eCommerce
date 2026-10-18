'use client';

import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { ApiError } from '@/lib/api-client';
import { adminGetSubscribers, adminSendBroadcast, errorMessage } from '@/lib/admin-api';
import { formatDate, humanize } from '@/lib/admin-format';
import {
  Button,
  DataState,
  Field,
  FilterSelect,
  Notice,
  PageHeader,
  Pagination,
  Panel,
  StatusPill,
  Table,
  TextArea,
  TextInput,
  Toolbar,
  redirectIfSignedOut,
  useAdminData,
  useConfirm,
  useToast,
  useUrlFilters,
} from '@/components/admin/ui';

const SUBJECT_MAX = 150;

/**
 * Newsletter: people who subscribed in the store footer, and broadcasts to the active ones.
 * Every email carries a personal unsubscribe link (added by the backend).
 */
export function AdminMarketing() {
  const toast = useToast();
  const confirm = useConfirm();
  const [filters, setFilters] = useUrlFilters({ status: 'active', page: '1' });
  const page = Math.max(1, parseInt(filters.page, 10) || 1);

  const { data, loading, error, reload } = useAdminData(
    () => adminGetSubscribers({ status: filters.status, page, per_page: 25 }),
    [filters.status, page]
  );

  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [logOnlyNotice, setLogOnlyNotice] = useState(false);

  const activeCount = data?.counts.active ?? 0;
  const canSend = !!data && activeCount > 0 && subject.trim() !== '' && content.trim() !== '' && subject.length <= SUBJECT_MAX;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    const ok = await confirm({
      title: `Send to ${activeCount.toLocaleString()} subscriber${activeCount === 1 ? '' : 's'}?`,
      message: (
        <>
          <p>
            Subject: <strong>{subject.trim()}</strong>
          </p>
          <p className="mt-2">Each subscriber gets their own copy with an unsubscribe link. This cannot be recalled once queued.</p>
        </>
      ),
      confirmLabel: 'Queue broadcast',
    });
    if (!ok) return;

    setSending(true);
    try {
      const res = await adminSendBroadcast({ subject: subject.trim(), content: content.trim(), confirm_recipients: activeCount });
      toast.success(`Queued for ${res.queued_count.toLocaleString()} subscriber${res.queued_count === 1 ? '' : 's'}.`);
      setLogOnlyNotice(res.mail_mode === 'log_only');
      setSubject('');
      setContent('');
    } catch (err) {
      if (redirectIfSignedOut(err)) return;
      if (err instanceof ApiError && err.errorCode === 'RECIPIENTS_CHANGED') {
        reload();
      }
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Newsletter"
        description="Only people who subscribed in the store receive these emails. Customers are never added automatically."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[#e5e7eb] bg-white px-4 py-3">
          <p className="text-xs text-[#6b7280]">Active subscribers</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-[#111827]">{data ? activeCount.toLocaleString() : '—'}</p>
        </div>
        <div className="rounded-xl border border-[#e5e7eb] bg-white px-4 py-3">
          <p className="text-xs text-[#6b7280]">Unsubscribed</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-[#111827]">{data ? data.counts.unsubscribed.toLocaleString() : '—'}</p>
        </div>
      </div>

      <Panel title="Write a broadcast" bodyClassName="p-4">
        <form onSubmit={handleSend} className="flex flex-col gap-4" noValidate>
          <Field
            label="Subject"
            required
            hint={`${subject.length}/${SUBJECT_MAX} characters`}
            error={subject.length > SUBJECT_MAX ? `Keep the subject under ${SUBJECT_MAX} characters.` : undefined}
          >
            {(p) => <TextInput {...p} value={subject} onChange={(e) => setSubject(e.target.value)} />}
          </Field>
          <Field label="Message" required>
            {(p) => <TextArea {...p} rows={8} value={content} onChange={(e) => setContent(e.target.value)} />}
          </Field>

          {data && activeCount === 0 ? (
            <Notice tone="warning">There are no active subscribers yet, so there is no one to send to.</Notice>
          ) : (
            <p className="text-xs text-[#6b7280]">
              Goes to {data ? activeCount.toLocaleString() : '…'} active subscriber{activeCount === 1 ? '' : 's'}; every email includes an
              unsubscribe link. Emails are queued and sent in batches by the email worker (or “Send queued now” on the Email outbox page).
            </p>
          )}

          {logOnlyNotice && (
            <Notice tone="warning">
              Email delivery is in log-only mode: queued messages are written to the server mail log, not sent, until SMTP is configured
              in backend/.env.
            </Notice>
          )}

          <div>
            <Button type="submit" variant="primary" loading={sending} disabled={!canSend}>
              <Send className="size-3.5" aria-hidden="true" />
              Review and send
            </Button>
          </div>
        </form>
      </Panel>

      <Panel title="Subscribers">
        <div className="px-4 pt-3">
          <Toolbar>
            <FilterSelect
              label="Subscriber status"
              value={filters.status}
              onChange={(status) => setFilters({ status })}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'unsubscribed', label: 'Unsubscribed' },
                { value: 'all', label: 'Everyone' },
              ]}
            />
          </Toolbar>
        </div>
        <DataState
          loading={loading}
          error={error}
          onRetry={reload}
          hasData={!!data}
          empty={items.length === 0}
          emptyTitle="No subscribers here"
          emptyDescription="People join from the newsletter form in the store footer."
        >
          <Table minWidth={620}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Source</th>
                <th>Subscribed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td className="max-w-[280px] truncate text-[#111827]">{s.email}</td>
                  <td className="text-[#6b7280]">{humanize(s.source)}</td>
                  <td className="whitespace-nowrap text-[#6b7280]">{formatDate(s.subscribed_at)}</td>
                  <td>
                    {s.status === 'active' ? (
                      <StatusPill label="Active" tone="green" />
                    ) : (
                      <span className="inline-flex flex-col gap-0.5">
                        <StatusPill label="Unsubscribed" tone="neutral" />
                        {s.unsubscribed_at && <span className="text-xs text-[#6b7280]">{formatDate(s.unsubscribed_at)}</span>}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination meta={data?.pagination} onPage={(p) => setFilters({ page: String(p) })} />
        </DataState>
      </Panel>
    </div>
  );
}
