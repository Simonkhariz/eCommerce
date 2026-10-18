'use client';

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  adminDeletePromotion,
  adminGetPromotions,
  adminSavePromotion,
  errorMessage,
  fieldErrors,
  type Promotion,
  type PromotionInput,
} from '@/lib/admin-api';
import { formatDate } from '@/lib/admin-format';
import type { StatusTone } from '@/lib/order-status';
import {
  Button,
  Checkbox,
  DataState,
  Field,
  Modal,
  PageHeader,
  Pagination,
  Panel,
  StatusPill,
  Table,
  TextInput,
  redirectIfSignedOut,
  useAdminData,
  useConfirm,
  useToast,
  useUrlFilters,
} from '@/components/admin/ui';

function toTime(value: string | null): number | null {
  if (!value) return null;
  const t = new Date(value.replace(' ', 'T')).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Whether a customer could use the code right now, and why not. */
function promotionState(p: Promotion): { label: string; tone: StatusTone } {
  const now = Date.now();
  const starts = toTime(p.starts_at);
  const ends = toTime(p.expires_at);
  if (!p.is_active) return { label: 'Paused', tone: 'neutral' };
  if (ends !== null && ends < now) return { label: 'Expired', tone: 'neutral' };
  if (p.max_uses > 0 && p.used_count >= p.max_uses) return { label: 'Used up', tone: 'neutral' };
  if (starts !== null && starts > now) return { label: 'Scheduled', tone: 'blue' };
  return { label: 'Live', tone: 'green' };
}

/** 'YYYY-MM-DD HH:MM:SS' → 'YYYY-MM-DD' for date inputs. */
function dateOnly(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

interface FormState {
  code: string;
  description: string;
  discount_percent: string;
  max_uses: string;
  starts_at: string;
  expires_at: string;
  is_active: boolean;
}

const EMPTY_FORM: FormState = {
  code: '',
  description: '',
  discount_percent: '10',
  max_uses: '0',
  starts_at: '',
  expires_at: '',
  is_active: true,
};

export function AdminPromotions() {
  const toast = useToast();
  const confirm = useConfirm();
  const [filters, setFilters] = useUrlFilters({ page: '1' });
  const page = Math.max(1, parseInt(filters.page, 10) || 1);
  const { data, loading, error, reload } = useAdminData(() => adminGetPromotions({ page, per_page: 20 }), [page]);
  const [editing, setEditing] = useState<Promotion | 'new' | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const promotions = data?.items ?? [];

  const toInput = (p: Promotion, changes: Partial<PromotionInput> = {}): PromotionInput => ({
    code: p.code,
    description: p.description,
    discount_percent: p.discount_percent,
    max_uses: p.max_uses,
    is_active: p.is_active,
    starts_at: dateOnly(p.starts_at) || null,
    expires_at: dateOnly(p.expires_at) || null,
    ...changes,
  });

  const toggleActive = async (p: Promotion) => {
    setBusyId(p.id);
    try {
      await adminSavePromotion(p.id, toInput(p, { is_active: !p.is_active }));
      toast.success(p.is_active ? `${p.code} paused.` : `${p.code} switched on.`);
      reload();
    } catch (err) {
      if (redirectIfSignedOut(err)) return;
      toast.error(errorMessage(err, 'Could not update this code.'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (p: Promotion) => {
    const used = p.used_count > 0;
    const ok = await confirm({
      title: `Delete ${p.code}?`,
      message: used
        ? 'This code has been used on orders, so it will be switched off instead of deleted (order history keeps it).'
        : 'Customers will no longer be able to use this code.',
      confirmLabel: used ? 'Switch off' : 'Delete code',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(p.id);
    try {
      const res = await adminDeletePromotion(p.id);
      toast.success(res.message || 'Promotion deleted.');
      reload();
    } catch (err) {
      if (redirectIfSignedOut(err)) return;
      toast.error(errorMessage(err, 'Could not delete this code.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Promo codes"
        description="Percentage discounts customers enter at checkout. The server checks dates, limits and status on every order."
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden="true" />
            New code
          </Button>
        }
      />

      <Panel>
        <DataState
          loading={loading}
          error={error}
          onRetry={reload}
          hasData={!!data}
          empty={promotions.length === 0}
          emptyTitle="No promo codes yet"
          emptyDescription="Create a code to offer a percentage off at checkout."
        >
          <Table minWidth={900}>
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Discount</th>
                <th scope="col">Uses</th>
                <th scope="col">Runs</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {promotions.map((p) => {
                const state = promotionState(p);
                return (
                  <tr key={p.id}>
                    <td>
                      <span className="block font-mono text-[13px] font-semibold text-[#111827]">{p.code}</span>
                      {p.description && <span className="block max-w-[280px] truncate text-xs text-[#6b7280]">{p.description}</span>}
                    </td>
                    <td className="tabular-nums">{p.discount_percent}% off</td>
                    <td className="whitespace-nowrap tabular-nums">
                      {p.used_count} / {p.max_uses > 0 ? p.max_uses : 'Unlimited'}
                    </td>
                    <td className="whitespace-nowrap text-xs text-[#374151]">
                      <span className="block">From {p.starts_at ? formatDate(p.starts_at) : 'creation'}</span>
                      <span className="block">Until {p.expires_at ? `end of ${formatDate(p.expires_at)}` : 'no end date'}</span>
                    </td>
                    <td>
                      <StatusPill {...state} />
                    </td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" disabled={busyId === p.id} onClick={() => setEditing(p)}>
                          Edit
                        </Button>
                        <Button size="sm" loading={busyId === p.id} onClick={() => toggleActive(p)}>
                          {p.is_active ? 'Pause' : 'Switch on'}
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-700" disabled={busyId === p.id} onClick={() => remove(p)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <Pagination meta={data?.pagination} onPage={(p) => setFilters({ page: String(p) })} />
        </DataState>
      </Panel>

      <PromotionModal
        promotion={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
    </div>
  );
}

function PromotionModal({ promotion, onClose, onSaved }: { promotion: Promotion | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const existing = promotion && promotion !== 'new' ? promotion : null;

  React.useEffect(() => {
    setErrors({});
    if (!promotion) return;
    setForm(
      promotion === 'new'
        ? EMPTY_FORM
        : {
            code: promotion.code,
            description: promotion.description ?? '',
            discount_percent: String(promotion.discount_percent),
            max_uses: String(promotion.max_uses),
            starts_at: dateOnly(promotion.starts_at),
            expires_at: dateOnly(promotion.expires_at),
            is_active: promotion.is_active,
          }
    );
  }, [promotion]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = form.code.trim().toUpperCase();
    const percent = parseInt(form.discount_percent, 10);
    const maxUses = parseInt(form.max_uses || '0', 10);
    const local: Record<string, string> = {};
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) local.code = 'Use 3-30 letters, numbers, dashes or underscores.';
    if (!Number.isFinite(percent) || percent < 1 || percent > 90) local.discount_percent = 'Discount must be between 1% and 90%.';
    if (!Number.isFinite(maxUses) || maxUses < 0) local.max_uses = 'Use 0 for unlimited, or a positive limit.';
    if (form.starts_at && form.expires_at && form.expires_at < form.starts_at) local.expires_at = 'The end date must be on or after the start date.';
    setErrors(local);
    if (Object.keys(local).length) return;

    setSaving(true);
    try {
      await adminSavePromotion(existing?.id ?? null, {
        code,
        description: form.description.trim(),
        discount_percent: percent,
        max_uses: maxUses,
        is_active: form.is_active,
        starts_at: form.starts_at || null,
        expires_at: form.expires_at || null,
      });
      toast.success(existing ? `${code} updated.` : `${code} created.`);
      onSaved();
    } catch (err) {
      if (redirectIfSignedOut(err)) return;
      const fields = fieldErrors(err);
      setErrors(fields);
      if (!Object.keys(fields).length) toast.error(errorMessage(err, 'Could not save this code.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!promotion}
      onClose={onClose}
      busy={saving}
      title={existing ? `Edit ${existing.code}` : 'New promo code'}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="promotion-form" variant="primary" loading={saving}>
            {existing ? 'Save changes' : 'Create code'}
          </Button>
        </>
      }
    >
      <form id="promotion-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Code" required error={errors.code} hint="What customers type at checkout.">
          {(p) => (
            <TextInput
              {...p}
              data-autofocus
              value={form.code}
              onChange={(e) => set('code', e.target.value.toUpperCase())}
              className="font-mono uppercase"
              maxLength={30}
              autoComplete="off"
            />
          )}
        </Field>
        <Field label="Discount (%)" required error={errors.discount_percent} hint="1% to 90%.">
          {(p) => (
            <TextInput {...p} type="number" min={1} max={90} step={1} value={form.discount_percent} onChange={(e) => set('discount_percent', e.target.value)} />
          )}
        </Field>
        <Field label="Description" error={errors.description} className="sm:col-span-2" hint="Shown to customers when the code is applied.">
          {(p) => <TextInput {...p} value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={255} />}
        </Field>
        <Field label="Maximum uses" error={errors.max_uses} hint="0 means unlimited.">
          {(p) => <TextInput {...p} type="number" min={0} step={1} value={form.max_uses} onChange={(e) => set('max_uses', e.target.value)} />}
        </Field>
        <div className="hidden sm:block" aria-hidden="true" />
        <Field label="Start date" error={errors.starts_at} hint="Leave empty to start now.">
          {(p) => <TextInput {...p} type="date" value={form.starts_at} onChange={(e) => set('starts_at', e.target.value)} />}
        </Field>
        <Field label="End date" error={errors.expires_at} hint="The code works until the end of this day. Leave empty for no end.">
          {(p) => <TextInput {...p} type="date" value={form.expires_at} min={form.starts_at || undefined} onChange={(e) => set('expires_at', e.target.value)} />}
        </Field>
        <div className="sm:col-span-2">
          <Checkbox label="Active" hint="Paused codes are refused at checkout." checked={form.is_active} onChange={(v) => set('is_active', v)} />
        </div>
        {existing && existing.used_count > 0 && (
          <p className="text-xs text-[#6b7280] sm:col-span-2">
            Used {existing.used_count} time{existing.used_count === 1 ? '' : 's'}. Changing the discount only affects new orders.
          </p>
        )}
      </form>
    </Modal>
  );
}
