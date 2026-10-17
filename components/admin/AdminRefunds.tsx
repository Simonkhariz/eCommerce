'use client';

import React, { useState, useEffect } from 'react';
import { CheckCircle2, X, Plus, RefreshCw } from 'lucide-react';
import { apiAdminGetRefunds, apiAdminCreateRefund } from '@/lib/api-client';
import { AdminIcon } from './AdminIcon';

export const AdminRefunds: React.FC = () => {
  const [refunds, setRefunds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [orderNumber, setOrderNumber] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [reason, setReason] = useState('Customer cancellation before dispatch');
  const [providerRef, setProviderRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchRefunds = async () => {
    setLoading(true);
    try {
      const res = await apiAdminGetRefunds();
      const list = Array.isArray(res) ? res : (res as any)?.items || (res as any)?.data || [];
      setRefunds(list);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRefunds();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim() || !amount || Number(amount) <= 0 || !reason.trim()) {
      setError('Please fill in all mandatory fields.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await apiAdminCreateRefund({
        order_number: orderNumber.trim(),
        amount: Number(amount),
        reason: reason.trim(),
        provider_refund_reference: providerRef.trim() || undefined,
      });
      setSuccess(`Refund successfully recorded and audited for ${orderNumber.trim()}.`);
      setIsModalOpen(false);
      setOrderNumber('');
      setAmount('');
      fetchRefunds();
    } catch (err: any) {
      setError(err?.message || 'Failed to process refund.');
    } finally {
      setSubmitting(false);
    }
  };

  const totalRefunded = refunds.reduce(
    (sum, r) => sum + (r.status === 'completed' ? Number(r.amount) : 0),
    0
  );

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e5e7eb] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">Refunds Management</h1>
          <p className="text-xs text-[#6b7280]">
            Review documented provider refunds or execute audited manual refunds for customer orders.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchRefunds}
            className="flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-medium text-[#374151] shadow-xs hover:bg-[#f9fafb]"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => {
              setIsModalOpen(true);
              setError(null);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-black px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800"
          >
            <Plus className="size-3.5" />
            <span>Record Refund</span>
          </button>
        </div>
      </div>

      {success && (
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="p-0.5 text-emerald-700 hover:text-emerald-900"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Summary KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
          <span className="text-xs text-[#6b7280]">Total Completed Refunds</span>
          <p className="mt-1 text-2xl font-bold text-[#111827]">
            ₦{totalRefunded.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
          <span className="text-xs text-[#6b7280]">Refund Cases Count</span>
          <p className="mt-1 text-2xl font-bold text-[#111827]">{refunds.length}</p>
        </div>
        <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
          <span className="text-xs text-[#6b7280]">Audit Status</span>
          <p className="mt-1 text-xs font-medium text-emerald-700 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>100% of recorded refunds logged to Security Audit Trail</span>
          </p>
        </div>
      </div>

      {/* Refunds Table */}
      <div className="overflow-x-auto rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[#f3f4f6] bg-[#fafafa] text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af]">
            <tr>
              <th className="px-4 py-3">Order Number</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Refund Amount</th>
              <th className="px-4 py-3">Provider Reference</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Processed By</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f9fafb]">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-xs text-[#6b7280]">
                  Loading refund records...
                </td>
              </tr>
            ) : refunds.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-xs text-[#9ca3af]">
                  No refunds have been processed on this store.
                </td>
              </tr>
            ) : (
              refunds.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-[#fbfbfb]">
                  <td className="px-4 py-3 font-mono font-medium text-[#111827]">
                    {r.order_number}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-[#111827]">{r.customer_name}</div>
                    <div className="text-[11px] text-[#9ca3af]">{r.customer_email}</div>
                  </td>
                  <td className="px-4 py-3 font-bold text-red-600">
                    ₦{Number(r.amount).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-[#6b7280]">
                    {r.provider_refund_reference || 'MANUAL'}
                  </td>
                  <td className="px-4 py-3 text-[#374151]">{r.reason}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border bg-emerald-50 text-emerald-700 border-emerald-200/60 capitalize">
                      <span className="size-1.5 rounded-full bg-emerald-600 shrink-0" />
                      <span>{r.status}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#6b7280]">
                    {r.processed_by_name || 'Admin'}
                  </td>
                  <td className="px-4 py-3 text-[#6b7280]">
                    {r.created_at ? r.created_at.slice(0, 16) : ''}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Record Refund Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-fade">
            <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-3">
              <h3 className="text-base font-bold text-[#111827]">Record & Audit Refund</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-black"
                aria-label="Close dialog"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
              {error && (
                <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-800">{error}</div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#374151]">
                  Order Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. ORD-20261017-D0C6B4"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  required
                  className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 font-mono text-xs outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#374151]">
                  Refund Amount (NGN)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 15000"
                  value={amount}
                  onChange={(e) =>
                    setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))
                  }
                  required
                  className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-sm font-semibold outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#374151]">
                  Provider / Bank Refund Reference
                </label>
                <input
                  type="text"
                  placeholder="Optional (defaults to generated reference)"
                  value={providerRef}
                  onChange={(e) => setProviderRef(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-xs outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#374151]">
                  Mandatory Refund Reason
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-xs outline-none focus:border-black"
                >
                  <option value="Customer cancellation before dispatch">
                    Customer cancellation before dispatch
                  </option>
                  <option value="Item out of stock / unable to fulfill">
                    Item out of stock / unable to fulfill
                  </option>
                  <option value="Damaged or defective goods delivered">
                    Damaged or defective goods delivered
                  </option>
                  <option value="Wrong size delivered / agreed exchange refund">
                    Wrong size delivered / agreed exchange refund
                  </option>
                  <option value="Duplicate payment settlement">Duplicate payment settlement</option>
                </select>
              </div>

              <div className="mt-2 flex items-center justify-end gap-2 border-t border-[#e5e7eb] pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-[#e5e7eb] px-4 py-2 text-xs font-medium text-[#4b5563] hover:bg-[#f9fafb]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-black px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-neutral-800 disabled:opacity-50"
                >
                  {submitting ? 'Auditing...' : 'Confirm Refund'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
