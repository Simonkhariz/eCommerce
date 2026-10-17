'use client';

import React, { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { apiGetCategories, apiAdminSaveCategory, apiAdminDeleteCategory } from '@/lib/api-client';

export const AdminCategories: React.FC = () => {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('/images/categories/casual.jpg');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const res = await apiGetCategories();
      setCategories(Array.isArray(res) ? res : (res as any)?.data || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setSlug('');
    setDescription('');
    setImageUrl('/images/categories/casual.jpg');
    setError(null);
  };

  const handleOpenEdit = (c: any) => {
    setEditingId(c.id);
    setName(c.name);
    setSlug(c.slug);
    setDescription(c.description || '');
    setImageUrl(c.image_url || '/images/categories/casual.jpg');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Category name is required.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const generatedSlug = slug.trim() || name.trim().toLowerCase().replace(/\s+/g, '-');
    const payload = {
      name: name.trim(),
      slug: generatedSlug,
      description: description.trim(),
      image_url: imageUrl.trim(),
    };

    try {
      await apiAdminSaveCategory(editingId, payload);

      setFeedback(`Category ${name} ${editingId ? 'updated' : 'created'} successfully.`);
      setIsModalOpen(false);
      resetForm();
      fetchCategories();
    } catch (err: any) {
      setError(err?.message || 'Failed to save category');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number, catName: string) => {
    if (!confirm(`Are you sure you want to delete category "${catName}"?`)) return;
    try {
      await apiAdminDeleteCategory(id);
      setFeedback(`Category "${catName}" deleted.`);
      fetchCategories();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete category');
    }
  };

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e5e7eb] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
            Category Management
          </h1>
          <p className="text-xs text-[#6b7280]">
            Organize catalog products into hierarchical browsing categories and storefront sections.
          </p>
        </div>

        <button
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          className="flex items-center gap-1.5 rounded-lg bg-black px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-neutral-800"
        >
          <Plus className="size-3.5" />
          <span>Add Category</span>
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

      {/* Categories Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          <div className="col-span-full py-12 text-center text-xs text-[#6b7280]">
            Loading categories...
          </div>
        ) : categories.length === 0 ? (
          <div className="col-span-full py-12 text-center text-xs text-[#9ca3af]">
            No categories defined. Click &quot;+ Add Category&quot; to create one.
          </div>
        ) : (
          categories.map((c) => (
            <div
              key={c.id}
              className="flex flex-col justify-between overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="relative h-32 w-full bg-neutral-100">
                <img
                  src={c.image_url || '/images/categories/casual.jpg'}
                  alt={c.name}
                  className="size-full object-cover"
                  onError={(e: any) => {
                    e.target.src = '/images/categories/casual.jpg';
                  }}
                />
                <span className="absolute bottom-2 right-2 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-semibold text-white">
                  {c.product_count || 0} products
                </span>
              </div>

              <div className="p-4">
                <h3 className="text-sm font-bold text-[#111827]">{c.name}</h3>
                <p className="font-mono text-[11px] text-[#6b7280]">/{c.slug}</p>
                <p className="mt-1 text-xs text-[#6b7280] line-clamp-2">{c.description || 'No description'}</p>

                <div className="mt-4 flex items-center justify-end gap-2 border-t border-[#f3f4f6] pt-3">
                  <button
                    onClick={() => handleOpenEdit(c)}
                    title={`Edit ${c.name} category`}
                    aria-label="Edit Category"
                    className="rounded border border-[#e5e7eb] px-2.5 py-1 text-xs font-semibold text-[#374151] hover:bg-[#f9fafb]"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(c.id, c.name)}
                    title={`Delete ${c.name} category`}
                    aria-label="Delete Category"
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

      {/* Category Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-fade">
            <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-3">
              <h3 className="text-base font-bold text-[#111827]">
                {editingId ? 'Edit Category' : 'Create New Category'}
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
                <label className="block text-xs font-semibold text-[#374151]">Category Name</label>
                <input
                  type="text"
                  placeholder="e.g. Shirts & Polos"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!editingId) {
                      setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'));
                    }
                  }}
                  required
                  className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-xs font-semibold outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#374151]">URL Slug</label>
                <input
                  type="text"
                  placeholder="e.g. shirts-polos"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  required
                  className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 font-mono text-xs outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#374151]">Description</label>
                <textarea
                  rows={2}
                  placeholder="Category overview copy"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#e5e7eb] p-2 text-xs outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#374151]">Image URL</label>
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 font-mono text-xs outline-none focus:border-black"
                />
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
                  {submitting ? 'Saving...' : editingId ? 'Update Category' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
