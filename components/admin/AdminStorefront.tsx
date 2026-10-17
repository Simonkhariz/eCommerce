'use client';

import React, { useState, useEffect } from 'react';
import {
  apiAdminGetBanners,
  apiAdminCreateBanner,
  apiAdminUpdateBanner,
  apiAdminDeleteBanner,
  apiAdminGetReviews,
  apiAdminUpdateReviewStatus,
} from '@/lib/api-client';
import { AdminIcon } from './AdminIcon';
import { Star, X } from 'lucide-react';

export const AdminStorefront: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'banners' | 'reviews'>('banners');
  const [banners, setBanners] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Banner Modal
  const [isBannerModalOpen, setIsBannerModalOpen] = useState(false);
  const [editingBannerId, setEditingBannerId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [ctaText, setCtaText] = useState('Shop Now');
  const [ctaUrl, setCtaUrl] = useState('/category');
  const [imageUrl, setImageUrl] = useState('/images/hero/african_models_hero.webp');
  const [isActive, setIsActive] = useState(true);
  const [displayOrder, setDisplayOrder] = useState(1);
  const [bannerSubmitting, setBannerSubmitting] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);

  // Review Filter
  const [reviewStatusFilter, setReviewStatusFilter] = useState('all');

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'banners') {
        const res = await apiAdminGetBanners();
        const list = Array.isArray(res) ? res : (res as any)?.items || (res as any)?.data || [];
        setBanners(list);
      } else {
        const res = await apiAdminGetReviews(reviewStatusFilter);
        const list = Array.isArray(res) ? res : (res as any)?.items || (res as any)?.data || [];
        setReviews(list);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab, reviewStatusFilter]);

  const resetBannerForm = () => {
    setEditingBannerId(null);
    setTitle('');
    setSubtitle('');
    setCtaText('Shop Now');
    setCtaUrl('/category');
    setImageUrl('/images/hero/african_models_hero.webp');
    setIsActive(true);
    setDisplayOrder(1);
    setBannerError(null);
  };

  const handleOpenEditBanner = (b: any) => {
    setEditingBannerId(b.id);
    setTitle(b.title);
    setSubtitle(b.subtitle || '');
    setCtaText(b.cta_text || 'Shop Now');
    setCtaUrl(b.cta_url || '/category');
    setImageUrl(b.image_url);
    setIsActive(Boolean(b.is_active));
    setDisplayOrder(b.display_order || 1);
    setIsBannerModalOpen(true);
  };

  const handleBannerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !imageUrl.trim()) {
      setBannerError('Title and image URL are required.');
      return;
    }

    setBannerSubmitting(true);
    setBannerError(null);
    try {
      if (editingBannerId) {
        await apiAdminUpdateBanner(editingBannerId, {
          title: title.trim(),
          subtitle: subtitle.trim(),
          cta_text: ctaText.trim(),
          cta_url: ctaUrl.trim(),
          image_url: imageUrl.trim(),
          is_active: isActive ? 1 : 0,
          display_order: displayOrder,
        });
        setFeedback('Banner updated successfully.');
      } else {
        await apiAdminCreateBanner({
          title: title.trim(),
          subtitle: subtitle.trim(),
          cta_text: ctaText.trim(),
          cta_url: ctaUrl.trim(),
          image_url: imageUrl.trim(),
          is_active: isActive ? 1 : 0,
          display_order: displayOrder,
        });
        setFeedback('Banner created successfully.');
      }
      setIsBannerModalOpen(false);
      resetBannerForm();
      fetchData();
    } catch (err: any) {
      setBannerError(err?.message || 'Failed to save banner.');
    } finally {
      setBannerSubmitting(false);
    }
  };

  const handleDeleteBanner = async (id: number) => {
    if (!confirm('Are you sure you want to delete this storefront banner?')) return;
    try {
      await apiAdminDeleteBanner(id);
      setFeedback('Banner deleted.');
      fetchData();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete banner');
    }
  };

  const handleReviewStatus = async (id: number, status: string) => {
    try {
      await apiAdminUpdateReviewStatus(id, status);
      setFeedback(`Review marked as ${status}.`);
      fetchData();
    } catch (err: any) {
      alert(err?.message || 'Failed to update review status');
    }
  };

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e5e7eb] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
            Storefront & Content Management
          </h1>
          <p className="text-xs text-[#6b7280]">
            Customize homepage promotional banners and moderate real customer reviews before public display.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-[#e5e7eb] bg-white p-1 shadow-sm">
            <button
              onClick={() => setActiveTab('banners')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'banners'
                  ? 'bg-black text-white'
                  : 'text-[#4b5563] hover:text-[#111827]'
              }`}
            >
              Homepage Banners
            </button>
            <button
              onClick={() => setActiveTab('reviews')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'reviews'
                  ? 'bg-black text-white'
                  : 'text-[#4b5563] hover:text-[#111827]'
              }`}
            >
              Review Moderation
            </button>
          </div>

          {activeTab === 'banners' && (
            <button
              onClick={() => {
                resetBannerForm();
                setIsBannerModalOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-neutral-800"
            >
              <span>+ Add Banner</span>
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="p-0.5 text-emerald-700 hover:text-emerald-900"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Banners Tab */}
      {activeTab === 'banners' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {loading ? (
            <div className="col-span-2 py-12 text-center text-xs text-[#6b7280]">
              Loading homepage banners...
            </div>
          ) : banners.length === 0 ? (
            <div className="col-span-2 py-12 text-center text-xs text-[#9ca3af]">
              No banners created yet. Click &quot;+ Add Banner&quot; to create one.
            </div>
          ) : (
            banners.map((b) => (
              <div
                key={b.id}
                className="flex flex-col justify-between overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="relative h-44 w-full bg-neutral-100">
                  <img
                    src={b.image_url}
                    alt={b.title}
                    className="size-full object-cover"
                    onError={(e: any) => {
                      e.target.src = '/images/categories/casual.jpg';
                    }}
                  />
                  <span
                    className={`absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      b.is_active
                        ? 'bg-emerald-600 text-white'
                        : 'bg-neutral-600 text-white'
                    }`}
                  >
                    {b.is_active ? 'Active' : 'Disabled'}
                  </span>
                </div>

                <div className="p-4">
                  <div className="flex items-center justify-between text-[11px] text-[#6b7280]">
                    <span>Order: #{b.display_order}</span>
                    <span>CTA: {b.cta_text} ({b.cta_url})</span>
                  </div>
                  <h3 className="mt-1 text-sm font-bold text-[#111827]">{b.title}</h3>
                  <p className="mt-1 text-xs text-[#6b7280] line-clamp-2">{b.subtitle}</p>

                  <div className="mt-4 flex items-center justify-end gap-2 border-t border-[#f3f4f6] pt-3">
                    <button
                      onClick={() => handleOpenEditBanner(b)}
                      className="rounded border border-[#e5e7eb] px-2.5 py-1 text-xs font-semibold text-[#374151] hover:bg-[#f9fafb]"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteBanner(b.id)}
                      className="rounded px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Reviews Moderation Tab */}
      {activeTab === 'reviews' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <select
              value={reviewStatusFilter}
              onChange={(e) => setReviewStatusFilter(e.target.value)}
              className="h-8 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-xs text-[#374151] outline-none"
            >
              <option value="all">All Reviews</option>
              <option value="pending">Pending Moderation</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#f3f4f6] bg-[#fafafa] text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af]">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Author</th>
                  <th className="px-4 py-3">Rating</th>
                  <th className="px-4 py-3">Review Title & Comment</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Moderation Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f9fafb]">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-xs text-[#6b7280]">
                      Loading reviews...
                    </td>
                  </tr>
                ) : reviews.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-xs text-[#9ca3af]">
                      No reviews found.
                    </td>
                  </tr>
                ) : (
                  reviews.map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-[#fbfbfb]">
                      <td className="px-4 py-3 font-semibold text-[#111827]">
                        {r.product_name}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#111827]">{r.author_name}</div>
                        <div className="text-[11px] text-[#9ca3af]">{r.author_email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`w-3.5 h-3.5 ${
                                i < Number(r.rating)
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'fill-neutral-200 text-neutral-200'
                              }`}
                            />
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {r.title && <p className="font-semibold text-[#111827]">{r.title}</p>}
                        <p className="text-[#4b5563] line-clamp-2">{r.comment}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            r.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : r.status === 'pending'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#6b7280]">
                        {r.created_at ? r.created_at.slice(0, 10) : ''}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                          {r.status !== 'approved' && (
                            <button
                              onClick={() => handleReviewStatus(r.id, 'approved')}
                              title="Approve customer review for public display"
                              aria-label="Approve Review"
                              className="rounded bg-emerald-600 px-2 sm:px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                            >
                              Approve
                            </button>
                          )}
                          {r.status !== 'rejected' && (
                            <button
                              onClick={() => handleReviewStatus(r.id, 'rejected')}
                              title="Reject and hide review"
                              aria-label="Reject Review"
                              className="rounded bg-red-600 px-2 sm:px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
                            >
                              Reject
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Banner Create / Edit Modal */}
      {isBannerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-fade">
            <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-3">
              <h3 className="text-base font-bold text-[#111827]">
                {editingBannerId ? 'Edit Banner' : 'Create Homepage Banner'}
              </h3>
              <button
                onClick={() => setIsBannerModalOpen(false)}
                className="rounded-lg p-1 text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-black"
                aria-label="Close dialog"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleBannerSubmit} className="mt-4 flex flex-col gap-4">
              {bannerError && (
                <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-800">
                  {bannerError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#374151]">Headline Title</label>
                <input
                  type="text"
                  placeholder="e.g. FIND CLOTHES THAT MATCH YOUR STYLE"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-xs font-semibold outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#374151]">Subtitle</label>
                <textarea
                  rows={2}
                  placeholder="Brief descriptive copy"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#e5e7eb] p-2 text-xs outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#374151]">Image URL</label>
                <input
                  type="text"
                  placeholder="/images/hero/african_models_hero.webp"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  required
                  className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 font-mono text-xs outline-none focus:border-black"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#374151]">Button Text</label>
                  <input
                    type="text"
                    value={ctaText}
                    onChange={(e) => setCtaText(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-xs outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#374151]">Button Link</label>
                  <input
                    type="text"
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-xs outline-none focus:border-black"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#374151]">
                    Display Order
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={displayOrder}
                    onChange={(e) => setDisplayOrder(parseInt(e.target.value, 10) || 1)}
                    className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-xs outline-none focus:border-black"
                  />
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <input
                    type="checkbox"
                    id="bannerActive"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="size-4 rounded border-gray-300 text-black focus:ring-black"
                  />
                  <label htmlFor="bannerActive" className="text-xs font-semibold text-[#374151]">
                    Active on Storefront
                  </label>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-end gap-2 border-t border-[#e5e7eb] pt-4">
                <button
                  type="button"
                  onClick={() => setIsBannerModalOpen(false)}
                  className="rounded-lg border border-[#e5e7eb] px-4 py-2 text-xs font-medium text-[#4b5563] hover:bg-[#f9fafb]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bannerSubmitting}
                  className="rounded-lg bg-black px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-neutral-800 disabled:opacity-50"
                >
                  {bannerSubmitting ? 'Saving...' : 'Save Banner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
