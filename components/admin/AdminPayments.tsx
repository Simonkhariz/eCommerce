'use client';

import React, { useState, useEffect } from 'react';
import { apiAdminGetPayments, apiAdminConfirmPayment } from '@/lib/api-client';
import { AdminIcon } from './AdminIcon';
import { RefreshCw, X } from 'lucide-react';

export const AdminPayments: React.FC = () => {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [gatewayFilter, setGatewayFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Settle WhatsApp payment modal state
  const [settleTarget, setSettleTarget] = useState<any | null>(null);
  const [settleNote, setSettleNote] = useState('');
  const [settleReference, setSettleReference] = useState('');
  const [settling, setSettling] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const res = await apiAdminGetPayments({
        gateway: gatewayFilter,
        status: statusFilter,
        search,
      });
      const list = Array.isArray(res) ? res : (res as any)?.items || (res as any)?.data || [];
      setPayments(list);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, [gatewayFilter, statusFilter, search]);

  const handleSettleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleTarget) return;

    setSettling(true);
    try {
      await apiAdminConfirmPayment(settleTarget.order_number, {
        reference: settleReference.trim(),
        note: settleNote.trim(),
      });
      setFeedback(`Payment for order ${settleTarget.order_number} confirmed and marked as successful.`);
      setSettleTarget(null);
      setSettleReference('');
      setSettleNote('');
      fetchPayments();
    } catch (err: any) {
      alert(err?.message || 'Failed to settle payment.');
    } finally {
      setSettling(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e5e7eb] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
            Payments & Transactions
          </h1>
          <p className="text-xs text-[#6b7280]">
            Audit incoming transactions across Kora Hosted Checkout, Monnify USSD/Transfer, and WhatsApp Bank Settlement.
          </p>
        </div>

        <button
          onClick={fetchPayments}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-medium text-[#374151] shadow-sm hover:bg-[#f9fafb] disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Transactions</span>
        </button>
      </div>

      {feedback && (
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="p-0.5 text-emerald-700 hover:text-emerald-900"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Filters & Search Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <input
            type="search"
            placeholder="Search reference, order, or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-72 rounded-lg border border-[#e5e7eb] px-3 text-xs outline-none focus:border-black"
          />
          <select
            value={gatewayFilter}
            onChange={(e) => setGatewayFilter(e.target.value)}
            className="h-8 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-xs text-[#374151] outline-none"
          >
            <option value="all">All Gateways</option>
            <option value="kora">Kora</option>
            <option value="monnify">Monnify</option>
            <option value="whatsapp">WhatsApp Transfer</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-xs text-[#374151] outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="successful">Successful</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <span className="text-xs text-[#6b7280]">
          Total Transactions: <strong>{payments.length}</strong>
        </span>
      </div>

      {/* Transactions Table */}
      <div className="overflow-x-auto rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[#f3f4f6] bg-[#fafafa] text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af]">
            <tr>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Gateway</th>
              <th className="px-4 py-3">Order Number</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Payment Status</th>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f9fafb]">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-xs text-[#6b7280]">
                  Loading payment transactions...
                </td>
              </tr>
            ) : payments.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-xs text-[#9ca3af]">
                  No payment records found matching query.
                </td>
              </tr>
            ) : (
              payments.map((p) => {
                const isSuccess = p.status === 'successful';
                const isPending = p.status === 'pending';
                const isFailed = p.status === 'failed';

                return (
                  <tr key={p.id} className="transition-colors hover:bg-[#fbfbfb]">
                    <td className="px-4 py-3 font-mono font-medium text-[#111827]">
                      {p.payment_reference || p.gateway_reference || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-[#374151]">
                        {p.gateway}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[#4b5563]">
                      {p.order_number || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#111827]">{p.customer_name}</div>
                      <div className="text-[11px] text-[#9ca3af]">{p.customer_email}</div>
                    </td>
                    <td className="px-4 py-3 font-bold text-[#111827]">
                      ₦{Number(p.amount || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border capitalize ${
                          isSuccess
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                            : isPending
                            ? 'bg-amber-50 text-amber-700 border-amber-200/60'
                            : 'bg-rose-50 text-rose-700 border-rose-200/60'
                        }`}
                      >
                        <span
                          className={`size-1.5 rounded-full shrink-0 ${
                            isSuccess
                              ? 'bg-emerald-600'
                              : isPending
                              ? 'bg-amber-500'
                              : 'bg-rose-600'
                          }`}
                        />
                        <span>{p.status}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#6b7280]">
                      {p.created_at ? p.created_at.slice(0, 16) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {isPending && p.order_number && (
                        <button
                          onClick={() => setSettleTarget(p)}
                          title="Confirm and verify payment settlement"
                          aria-label="Settle Payment"
                          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium shadow-xs transition-all"
                        >
                          <AdminIcon name="check-tick" size={12} className="brightness-200" />
                          <span>Settle</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Settle Payment Modal */}
      {settleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-fade">
            <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-3">
              <h3 className="text-base font-bold text-[#111827]">
                Settle & Confirm Payment
              </h3>
              <button
                onClick={() => setSettleTarget(null)}
                className="rounded-lg p-1 text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-black"
                aria-label="Close dialog"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSettleSubmit} className="mt-4 flex flex-col gap-4">
              <div className="rounded-lg bg-[#f9fafb] p-3 text-xs text-[#374151]">
                <p>
                  <strong>Order:</strong> {settleTarget.order_number}
                </p>
                <p>
                  <strong>Customer:</strong> {settleTarget.customer_name} ({settleTarget.customer_email})
                </p>
                <p>
                  <strong>Amount:</strong> ₦{Number(settleTarget.amount).toLocaleString()}
                </p>
                <p>
                  <strong>Gateway:</strong> {settleTarget.gateway}
                </p>
              </div>

              <div>
                <label htmlFor="settle-reference" className="block text-xs font-semibold text-[#374151]">
                  Bank transfer / receipt reference
                </label>
                <input
                  id="settle-reference"
                  type="text"
                  value={settleReference}
                  onChange={(e) => setSettleReference(e.target.value)}
                  required
                  minLength={4}
                  maxLength={80}
                  placeholder="As shown on your bank statement"
                  className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-xs outline-none focus:border-black"
                />
                <p className="mt-1 text-[11px] text-[#6b7280]">
                  Only confirm after the money has arrived in your account.
                </p>
              </div>

              <div>
                <label htmlFor="settle-note" className="block text-xs font-semibold text-[#374151]">
                  Note (optional)
                </label>
                <input
                  id="settle-note"
                  type="text"
                  value={settleNote}
                  onChange={(e) => setSettleNote(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-xs outline-none focus:border-black"
                />
              </div>

              <div className="mt-2 flex items-center justify-end gap-2 border-t border-[#e5e7eb] pt-4">
                <button
                  type="button"
                  onClick={() => setSettleTarget(null)}
                  className="rounded-lg border border-[#e5e7eb] px-4 py-2 text-xs font-medium text-[#4b5563] hover:bg-[#f9fafb]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settling}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  {settling ? 'Settling...' : 'Confirm Payment Settlement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
