'use client';

import React, { useState, useEffect } from 'react';
import { Plus, X, RefreshCw } from 'lucide-react';
import {
  apiAdminGetPromotions,
  apiAdminCreatePromotion,
  apiAdminUpdatePromotion,
  apiAdminDeletePromotion,
} from '@/lib/api-client';
import { AdminIcon } from './AdminIcon';

export const AdminPromotions: React.FC = () => {
  const [promotions, setPromotions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [discountPercent, setDiscountPercent] = useState<number>(10);
  const [maxUses, setMaxUses] = useState<number>(500);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchPromotions = async () => {
    setLoading(true);
    try {
      const res = await apiAdminGetPromotions();
      const list = Array.isArray(res) ? res : (res as any)?.items || (res as any)?.data || [];
      setPromotions(list);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPromotions();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setCode('');
    setDescription('');
    setDiscountPercent(10);
    setMaxUses(500);
    setIsActive(true);
    setExpiresAt('');
    setError(null);
  };

  const handleOpenEdit = (p: any) => {
    setEditingId(p.id);
    setCode(p.code);
    setDescription(p.description);
    setDiscountPercent(p.discount_percent);
    setMaxUses(p.max_uses);
    setIsActive(Boolean(p.is_active));
    setExpiresAt(p.expires_at ? p.expires_at.slice(0, 10) : '');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || discountPercent <= 0 || discountPercent > 100) {
      setError('Please provide a valid code and discount between 1% and 100%.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (editingId) {
        await apiAdminUpdatePromotion(editingId, {
          code: code.trim().toUpperCase(),
          description: description.trim(),
          discount_percent: discountPercent,
          max_uses: maxUses,
          is_active: isActive ? 1 : 0,
          expires_at: expiresAt || null,
        });
        setFeedback(`Promotion ${code} updated successfully.`);
      } else {
        await apiAdminCreatePromotion({
          code: code.trim().toUpperCase(),
          description: description.trim(),
          discount_percent: discountPercent,
          max_uses: maxUses,
          is_active: isActive ? 1 : 0,
          expires_at: expiresAt || null,
        });
        setFeedback(`Promotion ${code} created successfully.`);
      }
      setIsModalOpen(false);
      resetForm();
      fetchPromotions();
    } catch (err: any) {
      setError(err?.message || 'Failed to save promotion.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number, promoCode: string) => {
    if (!confirm(`Are you sure you want to permanently delete coupon ${promoCode}?`)) return;
    try {
      await apiAdminDeletePromotion(id);
      setFeedback(`Coupon ${promoCode} deleted.`);
      fetchPromotions();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete coupon');
    }
  };

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e5e7eb] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
            Promotions & Coupons
          </h1>
          <p className="text-xs text-[#6b7280]">
            Manage promotional discount codes, validity windows, and checkout redemption limits.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchPromotions}
            className="flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-medium text-[#374151] shadow-xs hover:bg-[#f9fafb]"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-black px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800"
          >
            <Plus className="size-3.5" />
            <span>Add Coupon</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="p-0.5 hover:opacity-75" aria-label="Dismiss">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Promotions Table */}
      <div className="overflow-x-auto rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[#f3f4f6] bg-[#fafafa] text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af]">
            <tr>
              <th className="px-4 py-3">Coupon Code</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Discount</th>
              <th className="px-4 py-3">Usage (Used / Max)</th>
              <th className="px-4 py-3">Expires At</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f9fafb]">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-xs text-[#6b7280]">
                  Loading promotional codes...
                </td>
              </tr>
            ) : promotions.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-xs text-[#9ca3af]">
                  No promotional coupons created yet.
                </td>
              </tr>
            ) : (
              promotions.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-[#fbfbfb]">
                  <td className="px-4 py-3 font-mono font-bold text-[#111827]">{p.code}</td>
                  <td className="px-4 py-3 text-[#4b5563]">{p.description}</td>
                  <td className="px-4 py-3 font-bold text-emerald-700">
                    {p.discount_percent}% OFF
                  </td>
                  <td className="px-4 py-3 text-[#374151]">
                    {p.used_count || 0} / {p.max_uses}
                  </td>
                  <td className="px-4 py-3 text-[#6b7280]">
                    {p.expires_at ? p.expires_at.slice(0, 10) : 'Never'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                        p.is_active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                          : 'bg-neutral-50 text-neutral-600 border-neutral-200/60'
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full shrink-0 ${
                          p.is_active ? 'bg-emerald-600' : 'bg-neutral-400'
                        }`}
                      />
                      <span>{p.is_active ? 'Active' : 'Disabled'}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleOpenEdit(p)}
                        className="inline-flex items-center justify-center h-7 px-2.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-xs font-medium text-neutral-700 shadow-xs transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(p.id, p.code)}
                        className="inline-flex items-center justify-center h-7 px-2.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-fade">
            <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-3">
              <h3 className="text-base font-bold text-[#111827]">
                {editingId ? 'Edit Promotion' : 'Create New Promotion'}
              </h3>
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
                  Coupon Code (uppercase)
                </label>
                <input
                  type="text"
                  placeholder="e.g. FLASH30"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  required
                  className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 font-mono text-sm font-bold uppercase outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#374151]">Description</label>
                <input
                  type="text"
                  placeholder="e.g. 30% off weekend flash deals"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-xs outline-none focus:border-black"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#374151]">Discount (%)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(parseInt(e.target.value, 10) || 10)}
                    required
                    className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-xs font-semibold outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#374151]">Max Uses</label>
                  <input
                    type="number"
                    min="1"
                    value={maxUses}
                    onChange={(e) => setMaxUses(parseInt(e.target.value, 10) || 100)}
                    required
                    className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-xs outline-none focus:border-black"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#374151]">
                  Expiration Date (optional)
                </label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-xs outline-none focus:border-black"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="promoActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="size-4 rounded border-gray-300 text-black focus:ring-black"
                />
                <label htmlFor="promoActive" className="text-xs font-semibold text-[#374151]">
                  Enable this promotion immediately
                </label>
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
                  {submitting ? 'Saving...' : editingId ? 'Update Promotion' : 'Create Promotion'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
