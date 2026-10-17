'use client';

import React, { useState, useEffect } from 'react';
import { Send, X, RefreshCw } from 'lucide-react';
import { apiAdminGetMarketingAudience, apiAdminSendMarketingBroadcast } from '@/lib/api-client';

export const AdminMarketing: React.FC = () => {
  const [audience, setAudience] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'subscribers' | 'customers'>('subscribers');

  // Broadcast modal state
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [target, setTarget] = useState<'subscribers' | 'customers' | 'all'>('subscribers');
  const [broadcasting, setBroadcasting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchAudience = async () => {
    setLoading(true);
    try {
      const res = await apiAdminGetMarketingAudience();
      setAudience(res?.data ?? res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudience();
  }, []);

  const handleBroadcastSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !content.trim()) {
      setError('Subject and message content are required.');
      return;
    }

    setBroadcasting(true);
    setError(null);
    try {
      const res = await apiAdminSendMarketingBroadcast({
        subject: subject.trim(),
        content: content.trim(),
        target,
      });
      setFeedback(res.message || 'Broadcast campaign successfully queued in Email Outbox.');
      setIsBroadcastModalOpen(false);
      setSubject('');
      setContent('');
    } catch (err: any) {
      setError(err?.message || 'Failed to dispatch broadcast campaign.');
    } finally {
      setBroadcasting(false);
    }
  };

  const subscribers = audience?.subscribers || [];
  const registeredUsers = audience?.registered_users || [];
  const counts = audience?.counts || { subscribers: 0, registered_users: 0 };

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e5e7eb] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
            Email Marketing &amp; Audience
          </h1>
          <p className="text-xs text-[#6b7280]">
            Manage storefront newsletter subscribers, registered customer email lists, and dispatch marketing broadcasts.
          </p>
        </div>

        <button
          onClick={() => {
            setError(null);
            setIsBroadcastModalOpen(true);
          }}
          className="flex items-center gap-1.5 rounded-lg bg-black px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-neutral-800"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Send Marketing Broadcast</span>
        </button>
      </div>

      {feedback && (
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="p-0.5 text-emerald-700 hover:text-emerald-900"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Audience Stats Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
          <span className="text-xs text-[#6b7280]">Newsletter Subscribers</span>
          <p className="mt-1 text-2xl font-bold text-[#111827]">{counts.subscribers}</p>
          <p className="mt-0.5 text-[11px] text-[#6b7280]">Storefront footer &amp; checkout opt-ins</p>
        </div>

        <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
          <span className="text-xs text-[#6b7280]">Registered Customer Accounts</span>
          <p className="mt-1 text-2xl font-bold text-[#111827]">{counts.registered_users}</p>
          <p className="mt-0.5 text-[11px] text-[#6b7280]">Verified storefront shoppers</p>
        </div>

        <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
          <span className="text-xs text-[#6b7280]">Combined Reachable Audience</span>
          <p className="mt-1 text-2xl font-bold text-emerald-700">
            {counts.subscribers + counts.registered_users} recipients
          </p>
          <p className="mt-0.5 text-[11px] text-[#6b7280]">Ready for promotions and campaigns</p>
        </div>
      </div>

      {/* Audience Tabs & Table */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center rounded-lg border border-[#e5e7eb] bg-white p-1 shadow-sm w-fit">
          <button
            onClick={() => setActiveTab('subscribers')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === 'subscribers'
                ? 'bg-black text-white'
                : 'text-[#4b5563] hover:text-[#111827]'
            }`}
          >
            Newsletter Subscribers ({subscribers.length})
          </button>
          <button
            onClick={() => setActiveTab('customers')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === 'customers'
                ? 'bg-black text-white'
                : 'text-[#4b5563] hover:text-[#111827]'
            }`}
          >
            Registered Shoppers ({registeredUsers.length})
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#f3f4f6] bg-[#fafafa] text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af]">
              {activeTab === 'subscribers' ? (
                <tr>
                  <th className="px-4 py-3">Subscriber Email</th>
                  <th className="px-4 py-3">Subscription Source</th>
                  <th className="px-4 py-3">Subscribed Date</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-4 py-3">Customer Full Name</th>
                  <th className="px-4 py-3">Email Address</th>
                  <th className="px-4 py-3">Account Created</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-[#f9fafb]">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-xs text-[#6b7280]">
                    Loading marketing audience...
                  </td>
                </tr>
              ) : activeTab === 'subscribers' ? (
                subscribers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-xs text-[#9ca3af]">
                      No newsletter subscribers recorded yet.
                    </td>
                  </tr>
                ) : (
                  subscribers.map((s: any) => (
                    <tr key={s.id} className="transition-colors hover:bg-[#fbfbfb]">
                      <td className="px-4 py-3 font-medium text-[#111827]">{s.email}</td>
                      <td className="px-4 py-3 text-[#6b7280]">
                        <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-[10px]">
                          {s.source}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#6b7280]">
                        {s.subscribed_at ? s.subscribed_at.slice(0, 16) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            s.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-neutral-100 text-neutral-600'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )
              ) : registeredUsers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-12 text-center text-xs text-[#9ca3af]">
                    No registered customers found.
                  </td>
                </tr>
              ) : (
                registeredUsers.map((u: any) => (
                  <tr key={u.id} className="transition-colors hover:bg-[#fbfbfb]">
                    <td className="px-4 py-3 font-semibold text-[#111827]">{u.full_name}</td>
                    <td className="px-4 py-3 text-[#4b5563]">{u.email}</td>
                    <td className="px-4 py-3 text-[#6b7280]">
                      {u.created_at ? u.created_at.slice(0, 10) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Broadcast Modal */}
      {isBroadcastModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl animate-fade">
            <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-3">
              <h3 className="text-base font-bold text-[#111827]">Compose Email Campaign</h3>
              <button
                onClick={() => setIsBroadcastModalOpen(false)}
                className="rounded-lg p-1 text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-black"
                aria-label="Close dialog"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleBroadcastSubmit} className="mt-4 flex flex-col gap-4">
              {error && (
                <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-800">{error}</div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#374151]">Target Audience</label>
                <select
                  value={target}
                  onChange={(e: any) => setTarget(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-xs outline-none focus:border-black"
                >
                  <option value="subscribers">Newsletter Subscribers ({counts.subscribers})</option>
                  <option value="customers">Registered Shoppers ({counts.registered_users})</option>
                  <option value="all">
                    All Audience ({counts.subscribers + counts.registered_users})
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#374151]">Email Subject</label>
                <input
                  type="text"
                  placeholder="e.g. Exclusive Weekend Drop: Up to 40% Off Premium Shirts"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-xs font-semibold outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#374151]">Campaign Body Content</label>
                <textarea
                  rows={6}
                  placeholder="Dear Shopper, check out our newly restocked fashion collections..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-[#e5e7eb] p-3 text-xs outline-none focus:border-black"
                />
              </div>

              <div className="mt-2 flex items-center justify-end gap-2 border-t border-[#e5e7eb] pt-4">
                <button
                  type="button"
                  onClick={() => setIsBroadcastModalOpen(false)}
                  className="rounded-lg border border-[#e5e7eb] px-4 py-2 text-xs font-medium text-[#4b5563] hover:bg-[#f9fafb]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={broadcasting}
                  className="rounded-lg bg-black px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-neutral-800 disabled:opacity-50"
                >
                  {broadcasting ? 'Queueing Broadcast...' : 'Queue to Email Outbox'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
