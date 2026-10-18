'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ImageOff, Plus, Trash2, Upload } from 'lucide-react';
import {
  AdminProduct,
  PRODUCT_IMAGE_PLACEHOLDER,
  apiCreateAdminProduct,
  apiDeleteAdminProduct,
  apiGetAdminProducts,
  apiUpdateAdminProduct,
  apiUpdateAdminProductStatus,
  apiUploadProductImage,
} from '@/lib/api-client';
import { adminGetCategories, errorMessage, fieldErrors } from '@/lib/admin-api';
import { formatPrice, num } from '@/lib/admin-format';
import { slugify } from '@/components/admin/AdminCategories';
import {
  Button,
  Checkbox,
  DataState,
  Field,
  FilterSelect,
  Modal,
  Notice,
  PageHeader,
  Pagination,
  Panel,
  SearchInput,
  Select,
  StatusPill,
  Table,
  TextArea,
  TextInput,
  Toolbar,
  inputClass,
  redirectIfSignedOut,
  useAdminData,
  useConfirm,
  useDebouncedValue,
  useToast,
  useUrlFilters,
} from '@/components/admin/ui';

type ProductStatus = 'draft' | 'published' | 'archived';

const DRESS_STYLES = ['Casual', 'Formal', 'Party', 'Gym'];
const SIZES = ['XX-Small', 'X-Small', 'Small', 'Medium', 'Large', 'X-Large', 'XX-Large', '3X-Large', 'One Size'];

const STATUS_LABELS: Record<ProductStatus, { label: string; tone: 'green' | 'amber' | 'neutral' }> = {
  published: { label: 'Published', tone: 'green' },
  draft: { label: 'Draft', tone: 'amber' },
  archived: { label: 'Archived', tone: 'neutral' },
};

interface VariantForm {
  /** Set for variants that already exist (their stock is changed on the Inventory page). */
  id?: number;
  sku: string;
  size: string;
  color_name: string;
  color_hex: string;
  price_override: string;
  stock_quantity: string;
  low_stock_threshold: string;
}

interface ImageForm {
  image_url: string;
  alt_text: string;
  is_primary: boolean;
}

interface ProductForm {
  name: string;
  slug: string;
  category_id: string;
  dress_style: string;
  description: string;
  base_price: string;
  original_price: string;
  sku: string;
  status: ProductStatus;
  is_featured: boolean;
  is_flash_deal: boolean;
  images: ImageForm[];
  variants: VariantForm[];
}

const NEW_VARIANT: VariantForm = {
  sku: '',
  size: '',
  color_name: '',
  color_hex: '#000000',
  price_override: '',
  stock_quantity: '0',
  low_stock_threshold: '5',
};

const EMPTY_FORM: ProductForm = {
  name: '',
  slug: '',
  category_id: '',
  dress_style: '',
  description: '',
  base_price: '',
  original_price: '',
  sku: '',
  status: 'draft',
  is_featured: false,
  is_flash_deal: false,
  images: [],
  variants: [{ ...NEW_VARIANT }],
};

function productToForm(p: AdminProduct): ProductForm {
  const images: ImageForm[] =
    p.images && p.images.length > 0
      ? p.images.map((img) => ({ image_url: img.image_url, alt_text: img.alt_text || '', is_primary: Boolean(img.is_primary) }))
      : p.primary_image
        ? [{ image_url: p.primary_image, alt_text: p.name, is_primary: true }]
        : [];
  if (images.length > 0 && !images.some((i) => i.is_primary)) images[0].is_primary = true;

  return {
    name: p.name,
    slug: p.slug,
    category_id: p.category_id ? String(p.category_id) : '',
    dress_style: p.dress_style || '',
    description: p.description || '',
    base_price: String(num(p.base_price)),
    original_price: p.original_price ? String(num(p.original_price)) : '',
    sku: p.sku,
    status: p.status,
    is_featured: Boolean(p.is_featured),
    is_flash_deal: Boolean(p.is_flash_deal),
    images,
    variants: (p.variants ?? []).map((v) => ({
      id: v.id,
      sku: v.sku,
      size: v.size,
      color_name: v.color_name,
      color_hex: v.color_hex || '#000000',
      price_override: v.price_override ? String(num(v.price_override)) : '',
      stock_quantity: String(num(v.stock_quantity)),
      low_stock_threshold: String(v.low_stock_threshold ?? 5),
    })),
  };
}

function stockPill(p: AdminProduct) {
  const total = num(p.total_stock);
  if (total <= 0) return <StatusPill label="Out of stock" tone="red" />;
  if (p.is_low_stock) return <StatusPill label="Low stock" tone="amber" />;
  return <StatusPill label="In stock" tone="green" />;
}

export function ProductManagement() {
  const toast = useToast();
  const confirm = useConfirm();

  const [filters, setFilters] = useUrlFilters({ search: '', category: 'all', status: 'all', inventory: 'all', page: '1' });
  const page = Number(filters.page) || 1;

  const [searchText, setSearchText] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchText, 300);
  useEffect(() => {
    if (debouncedSearch !== filters.search) setFilters({ search: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const { data, loading, error, reload } = useAdminData(
    () =>
      apiGetAdminProducts({
        page,
        per_page: 15,
        search: filters.search || undefined,
        category: filters.category !== 'all' ? filters.category : undefined,
        status: filters.status !== 'all' ? filters.status : undefined,
        inventory: filters.inventory !== 'all' ? filters.inventory : undefined,
      }),
    [page, filters.search, filters.category, filters.status, filters.inventory]
  );
  const products = data?.items ?? [];

  const categoriesData = useAdminData(() => adminGetCategories(), []);
  const categories = categoriesData.data ?? [];

  const [busyId, setBusyId] = useState<number | null>(null);

  // ---------------------------------------------------------------------------
  // Editor
  // ---------------------------------------------------------------------------
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const update = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const updateVariant = (index: number, changes: Partial<VariantForm>) =>
    setForm((f) => ({ ...f, variants: f.variants.map((v, i) => (i === index ? { ...v, ...changes } : v)) }));

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, variants: [{ ...NEW_VARIANT }] });
    setSlugTouched(false);
    setErrors({});
    setFormError(null);
    setNewImageUrl('');
    setEditorOpen(true);
  };

  const openEdit = (p: AdminProduct) => {
    setEditingId(p.id);
    setForm(productToForm(p));
    setSlugTouched(true);
    setErrors({});
    setFormError(null);
    setNewImageUrl('');
    setEditorOpen(true);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const results = await Promise.all(files.map((f) => apiUploadProductImage(f)));
      setForm((f) => {
        const hasPrimary = f.images.some((i) => i.is_primary);
        return {
          ...f,
          images: [
            ...f.images,
            ...results.map((r, i) => ({ image_url: r.image_url, alt_text: '', is_primary: !hasPrimary && i === 0 })),
          ],
        };
      });
      toast.success(results.length === 1 ? 'Photo uploaded.' : `${results.length} photos uploaded.`);
    } catch (err) {
      if (!redirectIfSignedOut(err)) toast.error(errorMessage(err, 'The photo could not be uploaded.'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const addImageUrl = () => {
    const url = newImageUrl.trim();
    if (!/^(\/(?!\/)|https:\/\/)/.test(url)) {
      setErrors((e) => ({ ...e, new_image: 'Use a store path (/uploads/…) or an https:// address.' }));
      return;
    }
    setErrors(({ new_image: _ignored, ...rest }) => rest);
    setForm((f) => ({ ...f, images: [...f.images, { image_url: url, alt_text: '', is_primary: !f.images.some((i) => i.is_primary) }] }));
    setNewImageUrl('');
  };

  const removeImage = (index: number) =>
    setForm((f) => {
      const images = f.images.filter((_, i) => i !== index);
      if (images.length > 0 && !images.some((i) => i.is_primary)) images[0] = { ...images[0], is_primary: true };
      return { ...f, images };
    });

  const removeVariant = async (index: number) => {
    const v = form.variants[index];
    if (v.id) {
      const ok = await confirm({
        title: `Remove ${v.size} / ${v.color_name}?`,
        message: 'It stops being sold once you save. Past orders keep their record of it.',
        confirmLabel: 'Remove variant',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setForm((f) => ({ ...f, variants: f.variants.filter((_, i) => i !== index) }));
  };

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 3) e.name = 'Use at least 3 characters.';
    if (!/^[a-z0-9-]+$/.test(form.slug.trim())) e.slug = 'Lowercase letters, numbers and dashes only.';
    const base = parseFloat(form.base_price);
    if (!(base > 0)) e.base_price = 'Enter a price above 0.';
    if (form.original_price.trim() !== '' && !(parseFloat(form.original_price) > base)) {
      e.original_price = 'Must be higher than the price (it is shown crossed out).';
    }
    if (editingId && form.sku.trim().length < 3) e.sku = 'Use at least 3 characters.';
    if (form.variants.length === 0) e.variants = 'Add at least one size and colour.';
    const seen = new Set<string>();
    form.variants.forEach((v, i) => {
      if (!v.size.trim() || !v.color_name.trim()) {
        e[`variant_${i}`] = 'Choose a size and enter a colour.';
        return;
      }
      const key = `${v.size.trim().toLowerCase()}|${v.color_name.trim().toLowerCase()}`;
      if (seen.has(key)) e[`variant_${i}`] = 'This size and colour is listed twice.';
      seen.add(key);
      if (!v.id && !(Number.isInteger(Number(v.stock_quantity)) && Number(v.stock_quantity) >= 0)) {
        e[`variant_${i}`] = 'Starting stock must be 0 or more.';
      }
      if (v.price_override.trim() !== '' && !(parseFloat(v.price_override) > 0)) e[`variant_${i}`] = 'Variant price must be above 0.';
    });
    return e;
  };

  const handleSave = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const local = validate();
    setErrors(local);
    setFormError(Object.keys(local).length ? 'Please fix the highlighted fields.' : null);
    if (Object.keys(local).length) return;

    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      category_id: form.category_id ? Number(form.category_id) : null,
      product_type: 'physical',
      status: form.status,
      dress_style: form.dress_style || null,
      base_price: Number(form.base_price),
      original_price: form.original_price.trim() ? Number(form.original_price) : null,
      // Blank SKU on a new product: the server generates one from the category and name.
      sku: form.sku.trim(),
      description: form.description.trim(),
      is_featured: form.is_featured ? 1 : 0,
      is_flash_deal: form.is_flash_deal ? 1 : 0,
      images: form.images.map((img, idx) => ({
        image_url: img.image_url,
        alt_text: img.alt_text.trim() || form.name.trim(),
        is_primary: img.is_primary ? 1 : 0,
        display_order: idx,
      })),
      variants: form.variants.map((v) => ({
        ...(v.id ? { id: v.id } : { stock_quantity: Math.max(0, parseInt(v.stock_quantity, 10) || 0) }),
        sku: v.sku.trim(),
        size: v.size.trim(),
        color_name: v.color_name.trim(),
        color_hex: v.color_hex,
        price_override: v.price_override.trim() ? Number(v.price_override) : null,
        low_stock_threshold: Math.max(0, parseInt(v.low_stock_threshold, 10) || 0),
      })),
    };

    setSaving(true);
    try {
      if (editingId) {
        await apiUpdateAdminProduct(editingId, payload);
        toast.success('Product saved.');
      } else {
        await apiCreateAdminProduct(payload);
        toast.success('Product created.');
      }
      setEditorOpen(false);
      reload();
    } catch (err) {
      if (redirectIfSignedOut(err)) return;
      const fields = fieldErrors(err);
      setErrors(fields);
      setFormError(Object.keys(fields).length ? 'Please fix the highlighted fields.' : errorMessage(err, 'The product could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Row actions
  // ---------------------------------------------------------------------------
  const changeStatus = async (p: AdminProduct, status: ProductStatus) => {
    if (status === p.status) return;
    if (status === 'archived') {
      const ok = await confirm({
        title: `Archive "${p.name}"?`,
        message: 'It disappears from the store and can no longer be ordered. Past orders are not affected. You can publish it again later.',
        confirmLabel: 'Archive',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setBusyId(p.id);
    try {
      if (status === 'archived') await apiDeleteAdminProduct(p.id);
      else await apiUpdateAdminProductStatus(p.id, status);
      toast.success(`"${p.name}" is now ${STATUS_LABELS[status].label.toLowerCase()}.`);
      reload();
    } catch (err) {
      if (!redirectIfSignedOut(err)) toast.error(errorMessage(err, 'The status could not be changed.'));
    } finally {
      setBusyId(null);
    }
  };

  const hasFilters = !!filters.search || filters.category !== 'all' || filters.status !== 'all' || filters.inventory !== 'all';
  const categoryOptionsForForm =
    form.category_id && !categories.some((c) => String(c.id) === form.category_id)
      ? [...categories, { id: Number(form.category_id), name: `Category #${form.category_id}`, is_active: false }]
      : categories;
  const dressStyles = form.dress_style && !DRESS_STYLES.includes(form.dress_style) ? [...DRESS_STYLES, form.dress_style] : DRESS_STYLES;

  return (
    <div className="flex w-full flex-col">
      <PageHeader
        title="Products"
        description="Catalogue, prices, photos and the sizes and colours you sell."
        actions={
          <Button variant="primary" onClick={openCreate}>
            <Plus className="size-4" aria-hidden="true" />
            New product
          </Button>
        }
      />

      <Toolbar>
        <SearchInput label="Search products" placeholder="Search name, SKU or description" value={searchText} onChange={setSearchText} />
        <FilterSelect
          label="Category"
          value={filters.category}
          onChange={(v) => setFilters({ category: v })}
          options={[
            { value: 'all', label: 'All categories' },
            ...categories.map((c) => ({ value: String(c.id), label: c.is_active ? c.name : `${c.name} (hidden)` })),
          ]}
        />
        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={(v) => setFilters({ status: v })}
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'published', label: 'Published' },
            { value: 'draft', label: 'Draft' },
            { value: 'archived', label: 'Archived' },
          ]}
        />
        <FilterSelect
          label="Stock"
          value={filters.inventory}
          onChange={(v) => setFilters({ inventory: v })}
          options={[
            { value: 'all', label: 'Any stock' },
            { value: 'in_stock', label: 'In stock' },
            { value: 'low_stock', label: 'Low stock' },
            { value: 'out_of_stock', label: 'Out of stock' },
          ]}
        />
      </Toolbar>

      <Panel>
        <DataState
          loading={loading}
          error={error}
          onRetry={reload}
          hasData={!!data}
          empty={products.length === 0}
          emptyTitle={hasFilters ? 'No products match these filters' : 'No products yet'}
          emptyDescription={hasFilters ? 'Try a different search or filter.' : 'Create your first product to start selling.'}
        >
          <Table minWidth={900}>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                <th className="text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const price = num(p.base_price);
                const original = p.original_price ? num(p.original_price) : 0;
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <img
                          src={p.primary_image || PRODUCT_IMAGE_PLACEHOLDER}
                          alt=""
                          className="size-11 shrink-0 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] object-cover"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = PRODUCT_IMAGE_PLACEHOLDER;
                          }}
                        />
                        <div className="min-w-0">
                          <p className="max-w-[260px] truncate font-medium text-[#111827]" title={p.name}>
                            {p.name}
                          </p>
                          <p className="text-xs text-[#6b7280]">
                            <span className="font-mono">{p.sku}</span>
                            {p.variants_count > 0 && ` · ${p.variants_count} variant${p.variants_count === 1 ? '' : 's'}`}
                            {Boolean(p.is_featured) && ' · Featured'}
                            {Boolean(p.is_flash_deal) && ' · Flash deal'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>
                      {p.category_name || <span className="text-[#6b7280]">No category</span>}
                      {p.dress_style && <span className="block text-xs text-[#6b7280]">{p.dress_style}</span>}
                    </td>
                    <td className="whitespace-nowrap tabular-nums">
                      <span className="font-semibold">{formatPrice(price)}</span>
                      {original > price && <span className="ml-1.5 text-xs text-[#6b7280] line-through">{formatPrice(original)}</span>}
                    </td>
                    <td className="whitespace-nowrap">
                      <Link
                        href={`/admin/inventory?search=${encodeURIComponent(p.name)}`}
                        className="inline-flex items-center gap-2 rounded outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-[#9ca3af]/40"
                        title="Manage stock on the Inventory page"
                      >
                        <span className="tabular-nums">{num(p.total_stock)}</span>
                        {stockPill(p)}
                      </Link>
                    </td>
                    <td>
                      <label htmlFor={`status-${p.id}`} className="sr-only">
                        Status of {p.name}
                      </label>
                      <select
                        id={`status-${p.id}`}
                        value={p.status}
                        disabled={busyId === p.id}
                        onChange={(e) => changeStatus(p, e.target.value as ProductStatus)}
                        className="h-8 rounded-lg border border-[#d1d5db] bg-white px-2 pr-7 text-xs font-medium text-[#111827] outline-none focus:border-[#6b7280] disabled:opacity-50"
                      >
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                        <option value="archived">Archived</option>
                      </select>
                    </td>
                    <td className="text-right">
                      <Button size="sm" onClick={() => openEdit(p)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <Pagination meta={data?.pagination} onPage={(n) => setFilters({ page: String(n) })} />
        </DataState>
      </Panel>

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        busy={saving}
        size="lg"
        title={editingId ? `Edit ${form.name || 'product'}` : 'New product'}
        description="Physical products only. Prices are in naira."
        footer={
          <>
            <Button onClick={() => setEditorOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="product-form" loading={saving}>
              {editingId ? 'Save product' : 'Create product'}
            </Button>
          </>
        }
      >
        <form id="product-form" onSubmit={handleSave} className="space-y-6" noValidate>
          {formError && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
              {formError}
            </p>
          )}

          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-[13px] font-semibold text-[#111827]">Details</legend>
            <Field label="Name" required error={errors.name}>
              {(p) => (
                <TextInput
                  {...p}
                  data-autofocus
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }));
                  }}
                />
              )}
            </Field>
            <Field label="Slug" required error={errors.slug} hint="Used in the product's web address.">
              {(p) => (
                <TextInput
                  {...p}
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    update('slug', e.target.value.toLowerCase());
                  }}
                />
              )}
            </Field>
            <Field label="Category" error={errors.category_id}>
              {(p) => (
                <Select {...p} value={form.category_id} onChange={(e) => update('category_id', e.target.value)}>
                  <option value="">No category</option>
                  {categoryOptionsForForm.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.is_active ? c.name : `${c.name} (hidden)`}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Dress style" error={errors.dress_style}>
              {(p) => (
                <Select {...p} value={form.dress_style} onChange={(e) => update('dress_style', e.target.value)}>
                  <option value="">Not set</option>
                  {dressStyles.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Description" error={errors.description} className="sm:col-span-2">
              {(p) => (
                <TextArea
                  {...p}
                  rows={4}
                  placeholder="Fabric, fit, care instructions…"
                  value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                />
              )}
            </Field>
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-3">
            <legend className="mb-2 text-[13px] font-semibold text-[#111827]">Price and status</legend>
            <Field label="Price (₦)" required error={errors.base_price}>
              {(p) => <TextInput {...p} type="number" min={0} step="0.01" value={form.base_price} onChange={(e) => update('base_price', e.target.value)} />}
            </Field>
            <Field label="Was price (₦)" error={errors.original_price} hint="Optional. Shown crossed out.">
              {(p) => (
                <TextInput {...p} type="number" min={0} step="0.01" value={form.original_price} onChange={(e) => update('original_price', e.target.value)} />
              )}
            </Field>
            <Field label="SKU" required={!!editingId} error={errors.sku} hint={editingId ? undefined : 'Leave blank to generate one.'}>
              {(p) => <TextInput {...p} className="font-mono" value={form.sku} onChange={(e) => update('sku', e.target.value.toUpperCase())} />}
            </Field>
            <Field label="Status" error={errors.status}>
              {(p) => (
                <Select {...p} value={form.status} onChange={(e) => update('status', e.target.value as ProductStatus)}>
                  <option value="draft">Draft (not in the store)</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </Select>
              )}
            </Field>
            <div className="flex flex-col justify-end gap-2 pb-1 sm:col-span-2">
              <Checkbox label="Featured on the home page" checked={form.is_featured} onChange={(v) => update('is_featured', v)} />
              <Checkbox label="Show in flash deals" checked={form.is_flash_deal} onChange={(v) => update('is_flash_deal', v)} />
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-2 text-[13px] font-semibold text-[#111827]">Photos ({form.images.length})</legend>
            <div className="flex flex-wrap items-start gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={handleUpload}
                aria-hidden="true"
                tabIndex={-1}
              />
              <Button size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
                <Upload className="size-3.5" aria-hidden="true" />
                Upload photos
              </Button>
              <div className="min-w-[220px] flex-1">
                <label htmlFor="product-image-url" className="sr-only">
                  Image address
                </label>
                <div className="flex gap-2">
                  <input
                    id="product-image-url"
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addImageUrl();
                      }
                    }}
                    placeholder="Or paste an image address (/uploads/… or https://…)"
                    aria-invalid={errors.new_image ? true : undefined}
                    aria-describedby={errors.new_image ? 'product-image-url-error' : undefined}
                    className={`${inputClass} h-8 py-1`}
                  />
                  <Button size="sm" onClick={addImageUrl} disabled={!newImageUrl.trim()}>
                    Add
                  </Button>
                </div>
                {errors.new_image && (
                  <p id="product-image-url-error" className="mt-1 text-xs text-red-600">
                    {errors.new_image}
                  </p>
                )}
              </div>
            </div>
            <p className="text-xs text-[#6b7280]">JPG, PNG or WebP. The main photo is shown on product cards.</p>

            {form.images.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-[#d1d5db] px-3 py-4 text-[13px] text-[#6b7280]">
                <ImageOff className="size-4" aria-hidden="true" />
                No photos yet. Products without photos show a neutral placeholder.
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {form.images.map((img, idx) => (
                  <li
                    key={`${img.image_url}-${idx}`}
                    className={`flex flex-col gap-1.5 rounded-lg border p-1.5 ${img.is_primary ? 'border-[#111827]' : 'border-[#e5e7eb]'}`}
                  >
                    <img
                      src={img.image_url}
                      alt={img.alt_text || `Photo ${idx + 1}`}
                      className="aspect-square w-full rounded-md bg-[#f9fafb] object-cover"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = PRODUCT_IMAGE_PLACEHOLDER;
                      }}
                    />
                    <div className="flex items-center justify-between gap-1">
                      <label className="flex items-center gap-1.5 text-xs text-[#374151]">
                        <input
                          type="radio"
                          name="primary-image"
                          checked={img.is_primary}
                          onChange={() => update('images', form.images.map((it, i) => ({ ...it, is_primary: i === idx })))}
                          className="accent-[#111827]"
                        />
                        Main photo
                      </label>
                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        aria-label={`Remove photo ${idx + 1}`}
                        className="rounded p-1 text-[#6b7280] outline-none hover:bg-red-50 hover:text-red-600 focus-visible:ring-[3px] focus-visible:ring-[#9ca3af]/40"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <fieldset className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <legend className="text-[13px] font-semibold text-[#111827]">Sizes and colours ({form.variants.length})</legend>
              <Button size="sm" onClick={() => update('variants', [...form.variants, { ...NEW_VARIANT }])}>
                <Plus className="size-3.5" aria-hidden="true" />
                Add variant
              </Button>
            </div>
            {errors.variants && <Notice tone="danger">{errors.variants}</Notice>}
            {editingId && (
              <p className="text-xs text-[#6b7280]">
                Stock on existing variants is changed on the{' '}
                <Link href={`/admin/inventory?search=${encodeURIComponent(form.name)}`} className="font-medium text-[#111827] underline">
                  Inventory page
                </Link>{' '}
                (every change is logged with a reason). Enter starting stock for new variants here.
              </p>
            )}

            <div className="overflow-x-auto rounded-lg border border-[#e5e7eb]">
              <table className="w-full min-w-[820px] text-left text-[13px]">
                <thead className="bg-[#fafafa] text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">
                  <tr>
                    <th className="px-2 py-2">Size</th>
                    <th className="px-2 py-2">Colour</th>
                    <th className="px-2 py-2">Swatch</th>
                    <th className="px-2 py-2">SKU</th>
                    <th className="px-2 py-2">Variant price (₦)</th>
                    <th className="px-2 py-2">Stock</th>
                    <th className="px-2 py-2">Low-stock alert</th>
                    <th className="px-2 py-2">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {form.variants.map((v, idx) => {
                    const rowError = errors[`variant_${idx}`];
                    const label = `Variant ${idx + 1}`;
                    const sizes = v.size && !SIZES.includes(v.size) ? [...SIZES, v.size] : SIZES;
                    return (
                      <React.Fragment key={v.id ?? `new-${idx}`}>
                        <tr className="border-t border-[#f3f4f6] align-middle">
                          <td className="p-2">
                            <select
                              aria-label={`${label} size`}
                              value={v.size}
                              onChange={(e) => updateVariant(idx, { size: e.target.value })}
                              className={`${inputClass} h-8 w-32 py-1`}
                              aria-invalid={rowError ? true : undefined}
                            >
                              <option value="">Choose…</option>
                              {sizes.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              aria-label={`${label} colour name`}
                              value={v.color_name}
                              onChange={(e) => updateVariant(idx, { color_name: e.target.value })}
                              placeholder="e.g. Navy"
                              className={`${inputClass} h-8 w-28 py-1`}
                              aria-invalid={rowError ? true : undefined}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="color"
                              aria-label={`${label} colour swatch`}
                              value={v.color_hex}
                              onChange={(e) => updateVariant(idx, { color_hex: e.target.value })}
                              className="h-8 w-10 cursor-pointer rounded border border-[#d1d5db] bg-white p-0.5"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              aria-label={`${label} SKU`}
                              value={v.sku}
                              onChange={(e) => updateVariant(idx, { sku: e.target.value.toUpperCase() })}
                              placeholder="Auto"
                              className={`${inputClass} h-8 w-36 py-1 font-mono`}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              aria-label={`${label} price`}
                              value={v.price_override}
                              onChange={(e) => updateVariant(idx, { price_override: e.target.value })}
                              placeholder="Product price"
                              className={`${inputClass} h-8 w-28 py-1`}
                            />
                          </td>
                          <td className="p-2">
                            {v.id ? (
                              <span className="inline-block w-16 tabular-nums font-semibold" title="Change stock on the Inventory page">
                                {v.stock_quantity}
                              </span>
                            ) : (
                              <input
                                type="number"
                                min={0}
                                step={1}
                                aria-label={`${label} starting stock`}
                                value={v.stock_quantity}
                                onChange={(e) => updateVariant(idx, { stock_quantity: e.target.value })}
                                className={`${inputClass} h-8 w-20 py-1`}
                              />
                            )}
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              aria-label={`${label} low-stock alert level`}
                              value={v.low_stock_threshold}
                              onChange={(e) => updateVariant(idx, { low_stock_threshold: e.target.value })}
                              className={`${inputClass} h-8 w-20 py-1`}
                            />
                          </td>
                          <td className="p-2 text-right">
                            <button
                              type="button"
                              onClick={() => removeVariant(idx)}
                              disabled={form.variants.length === 1}
                              aria-label={`Remove ${label.toLowerCase()}`}
                              title={form.variants.length === 1 ? 'A product needs at least one variant' : 'Remove variant'}
                              className="rounded p-1.5 text-[#6b7280] outline-none hover:bg-red-50 hover:text-red-600 focus-visible:ring-[3px] focus-visible:ring-[#9ca3af]/40 disabled:opacity-30"
                            >
                              <Trash2 className="size-3.5" aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                        {rowError && (
                          <tr>
                            <td colSpan={8} className="px-2 pb-2 text-xs text-red-600">
                              {rowError}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-[#6b7280]">Variant price is optional; leave it blank to use the product price.</p>
          </fieldset>
        </form>
      </Modal>
    </div>
  );
}
