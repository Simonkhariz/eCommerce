'use client';

import React, { useRef, useState } from 'react';
import { Plus, Upload } from 'lucide-react';
import { apiUploadProductImage } from '@/lib/api-client';
import { AdminCategory, adminDeactivateCategory, adminGetCategories, adminSaveCategory, errorMessage, fieldErrors } from '@/lib/admin-api';
import {
  Button,
  Checkbox,
  DataState,
  Field,
  Modal,
  PageHeader,
  Panel,
  StatusPill,
  Table,
  TextArea,
  TextInput,
  redirectIfSignedOut,
  useAdminData,
  useConfirm,
  useToast,
} from '@/components/admin/ui';

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface CategoryForm {
  name: string;
  slug: string;
  description: string;
  image_url: string;
  display_order: string;
  is_active: boolean;
}

const EMPTY_FORM: CategoryForm = { name: '', slug: '', description: '', image_url: '', display_order: '0', is_active: true };

export function AdminCategories() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useAdminData(() => adminGetCategories(), []);
  const categories = data ?? [];

  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, display_order: String(categories.length + 1) });
    setSlugTouched(false);
    setErrors({});
    setOpen(true);
  };

  const openEdit = (cat: AdminCategory) => {
    setEditing(cat);
    setForm({
      name: cat.name,
      slug: cat.slug,
      description: cat.description ?? '',
      image_url: cat.image_url ?? '',
      display_order: String(cat.display_order),
      is_active: cat.is_active,
    });
    setSlugTouched(true);
    setErrors({});
    setOpen(true);
  };

  const setName = (name: string) =>
    setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }));

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await apiUploadProductImage(file);
      setForm((f) => ({ ...f, image_url: res.image_url }));
    } catch (err) {
      if (!redirectIfSignedOut(err)) toast.error(errorMessage(err, 'The image could not be uploaded.'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (form.name.trim().length < 2) local.name = 'Use at least 2 characters.';
    if (!/^[a-z0-9-]+$/.test(form.slug.trim())) local.slug = 'Lowercase letters, numbers and dashes only.';
    setErrors(local);
    if (Object.keys(local).length) return;

    setSaving(true);
    try {
      await adminSaveCategory(editing?.id ?? null, {
        name: form.name.trim(),
        slug: form.slug.trim(),
        description: form.description.trim(),
        image_url: form.image_url.trim(),
        display_order: parseInt(form.display_order, 10) || 0,
        is_active: form.is_active,
      });
      toast.success(editing ? 'Category updated.' : 'Category created.');
      setOpen(false);
      reload();
    } catch (err) {
      if (redirectIfSignedOut(err)) return;
      const fields = fieldErrors(err);
      setErrors(fields);
      if (!Object.keys(fields).length) toast.error(errorMessage(err, 'The category could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const handleHide = async (cat: AdminCategory) => {
    const ok = await confirm({
      title: `Hide "${cat.name}"?`,
      message: (
        <>
          The category disappears from the store menu and catalogue filters. Its {cat.product_count} product
          {cat.product_count === 1 ? '' : 's'} stay as they are and can still be found through search. You can restore it any time.
        </>
      ),
      confirmLabel: 'Hide category',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(cat.id);
    try {
      await adminDeactivateCategory(cat.id);
      toast.success(`"${cat.name}" is hidden from the store.`);
      reload();
    } catch (err) {
      if (!redirectIfSignedOut(err)) toast.error(errorMessage(err, 'The category could not be hidden.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleRestore = async (cat: AdminCategory) => {
    setBusyId(cat.id);
    try {
      await adminSaveCategory(cat.id, { is_active: true });
      toast.success(`"${cat.name}" is visible in the store again.`);
      reload();
    } catch (err) {
      if (!redirectIfSignedOut(err)) toast.error(errorMessage(err, 'The category could not be restored.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex w-full flex-col">
      <PageHeader
        title="Categories"
        description="Group products for the store menu and catalogue filters."
        actions={
          <Button variant="primary" onClick={openCreate}>
            <Plus className="size-4" aria-hidden="true" />
            New category
          </Button>
        }
      />

      <Panel>
        <DataState
          loading={loading}
          error={error}
          onRetry={reload}
          hasData={!!data}
          empty={categories.length === 0}
          emptyTitle="No categories yet"
          emptyDescription="Create a category so products can be grouped in the store."
        >
          <Table minWidth={680}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Products</th>
                <th>Order</th>
                <th>Status</th>
                <th className="text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      {cat.image_url ? (
                        <img src={cat.image_url} alt="" className="size-8 shrink-0 rounded-md border border-[#e5e7eb] object-cover" />
                      ) : (
                        <span className="size-8 shrink-0 rounded-md border border-dashed border-[#d1d5db] bg-[#f9fafb]" aria-hidden="true" />
                      )}
                      <span className="font-medium text-[#111827]">{cat.name}</span>
                    </div>
                  </td>
                  <td className="font-mono text-xs text-[#4b5563]">{cat.slug}</td>
                  <td className="tabular-nums">
                    {cat.published_count} published
                    {cat.product_count !== cat.published_count && <span className="text-[#6b7280]"> of {cat.product_count}</span>}
                  </td>
                  <td className="tabular-nums">{cat.display_order}</td>
                  <td>{cat.is_active ? <StatusPill label="Visible" tone="green" /> : <StatusPill label="Hidden" tone="neutral" />}</td>
                  <td className="text-right">
                    <div className="inline-flex gap-1.5">
                      <Button size="sm" onClick={() => openEdit(cat)}>
                        Edit
                      </Button>
                      {cat.is_active ? (
                        <Button size="sm" variant="ghost" loading={busyId === cat.id} onClick={() => handleHide(cat)}>
                          Hide
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" loading={busyId === cat.id} onClick={() => handleRestore(cat)}>
                          Restore
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </DataState>
      </Panel>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        busy={saving}
        title={editing ? `Edit ${editing.name}` : 'New category'}
        footer={
          <>
            <Button onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="category-form" loading={saving}>
              {editing ? 'Save changes' : 'Create category'}
            </Button>
          </>
        }
      >
        <form id="category-form" onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Name" required error={errors.name}>
            {(p) => <TextInput {...p} data-autofocus value={form.name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field label="Slug" required error={errors.slug} hint="Used in the store address, e.g. /category?cat=slug">
            {(p) => (
              <TextInput
                {...p}
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }));
                }}
              />
            )}
          </Field>
          <Field label="Description" error={errors.description} className="sm:col-span-2">
            {(p) => <TextArea {...p} rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />}
          </Field>
          <Field label="Image URL" error={errors.image_url} hint="Optional. Upload a JPG, PNG or WebP, or paste an image address." className="sm:col-span-2">
            {(p) => (
              <div className="flex flex-wrap items-center gap-2">
                <TextInput
                  {...p}
                  className="min-w-0 flex-1"
                  value={form.image_url}
                  onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                  placeholder="/uploads/… or https://…"
                />
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleUpload} aria-hidden="true" tabIndex={-1} />
                <Button size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
                  <Upload className="size-3.5" aria-hidden="true" />
                  Upload
                </Button>
                {form.image_url && <img src={form.image_url} alt="Category preview" className="size-9 rounded-md border border-[#e5e7eb] object-cover" />}
              </div>
            )}
          </Field>
          <Field label="Display order" error={errors.display_order} hint="Lower numbers appear first.">
            {(p) => (
              <TextInput {...p} type="number" min={0} value={form.display_order} onChange={(e) => setForm((f) => ({ ...f, display_order: e.target.value }))} />
            )}
          </Field>
          <div className="flex items-end pb-1">
            <Checkbox
              label="Visible in the store"
              checked={form.is_active}
              onChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
