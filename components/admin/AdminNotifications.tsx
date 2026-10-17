'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { apiAdminGetOutbox, apiAdminRetryOutbox } from '@/lib/api-client';
import { AdminIcon } from './AdminIcon';

export const AdminNotifications: React.FC = () => {
  const [outbox, setOutbox] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchOutbox = async () => {
    setLoading(true);
    try {
      const res = await apiAdminGetOutbox(statusFilter);
      const list = Array.isArray(res) ? res : (res as any)?.items || (res as any)?.data || [];
      setOutbox(list);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOutbox();
  }, [statusFilter]);

  const handleRetry = async (id: number) => {
    setRetryingId(id);
    try {
      await apiAdminRetryOutbox(id);
      setFeedback(`Notification #${id} dispatched successfully.`);
      fetchOutbox();
    } catch (err: any) {
      alert(err?.message || 'Failed to dispatch email');
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e5e7eb] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
            Notifications &amp; Email Outbox
          </h1>
          <p className="text-xs text-[#6b7280]">
            Review transactional order receipts, shipment notifications, marketing broadcasts, and retry delivery.
          </p>
        </div>

        <button
          onClick={fetchOutbox}
          className="flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-medium text-[#374151] shadow-xs hover:bg-[#f9fafb]"
        >
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Outbox</span>
        </button>
      </div>

      {feedback && (
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="p-0.5 hover:opacity-75" aria-label="Dismiss">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-8 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-xs text-[#374151] outline-none"
        >
          <option value="all">All Delivery States</option>
          <option value="pending">Pending Queue</option>
          <option value="sent">Sent Successfully</option>
          <option value="failed">Failed Delivery</option>
        </select>
        <span className="text-xs text-[#6b7280]">
          Total Emails: <strong>{outbox.length}</strong>
        </span>
      </div>

      {/* Outbox Table */}
      <div className="overflow-x-auto rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[#f3f4f6] bg-[#fafafa] text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af]">
            <tr>
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Template</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Attempts</th>
              <th className="px-4 py-3">Sent / Queued At</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f9fafb]">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-xs text-[#6b7280]">
                  Loading email outbox queue...
                </td>
              </tr>
            ) : outbox.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-xs text-[#9ca3af]">
                  No outbound email notifications found.
                </td>
              </tr>
            ) : (
              outbox.map((mail) => (
                <tr key={mail.id} className="transition-colors hover:bg-[#fbfbfb]">
                  <td className="px-4 py-3 font-semibold text-[#111827]">
                    {mail.recipient_email}
                  </td>
                  <td className="px-4 py-3 font-medium text-[#374151]">{mail.subject}</td>
                  <td className="px-4 py-3 text-[#6b7280]">
                    <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-[10px]">
                      {mail.template}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border capitalize ${
                        mail.status === 'sent'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                          : mail.status === 'pending'
                          ? 'bg-amber-50 text-amber-700 border-amber-200/60'
                          : 'bg-rose-50 text-rose-700 border-rose-200/60'
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full shrink-0 ${
                          mail.status === 'sent'
                            ? 'bg-emerald-600'
                            : mail.status === 'pending'
                            ? 'bg-amber-500'
                            : 'bg-rose-600'
                        }`}
                      />
                      <span>{mail.status}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#4b5563]">{mail.attempt_count}</td>
                  <td className="px-4 py-3 text-[#6b7280]">
                    {mail.sent_at || mail.created_at || '—'}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {mail.status !== 'sent' && (
                      <button
                        onClick={() => handleRetry(mail.id)}
                        disabled={retryingId === mail.id}
                        title="Retry outbound email dispatch immediately"
                        aria-label="Dispatch Email"
                        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-neutral-900 hover:bg-black text-white text-xs font-medium transition-all shadow-xs disabled:opacity-50"
                      >
                        <AdminIcon name="zap" size={12} className="brightness-200" />
                        <span>{retryingId === mail.id ? 'Sending...' : 'Dispatch'}</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
