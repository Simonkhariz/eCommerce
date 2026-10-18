'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus } from 'lucide-react';
import {
  ShippingZone,
  ShippingZoneInput,
  adminDeleteShippingZone,
  adminGetShippingZones,
  adminSaveShippingZone,
  errorMessage,
  fieldErrors,
} from '@/lib/admin-api';
import { formatPrice } from '@/lib/admin-format';
import {
  Button,
  Checkbox,
  DataState,
  Field,
  Modal,
  Notice,
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

const FALLBACK = '*';

const EMPTY_ZONE: ShippingZoneInput = {
  name: '',
  code: '',
  description: '',
  states_covered: [],
  fee: 0,
  estimated_days: '',
  is_active: true,
};

function stateLabel(state: string): string {
  return state === FALLBACK ? 'All other states' : state;
}

/**
 * Delivery zones: which states each fee applies to. Checkout picks the active zone that lists
 * the customer's state; a '*' zone catches every state not listed elsewhere.
 */
export function AdminShippingZones() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useAdminData(() => adminGetShippingZones(), []);
  const [editing, setEditing] = useState<{ id: number | null; zone: ShippingZoneInput } | null>(null);

  const zones = data?.zones ?? [];
  const states = data?.states ?? [];

  // States that no active zone covers (when there is no active fallback zone).
  const activeZones = zones.filter((z) => z.is_active);
  const hasFallback = activeZones.some((z) => z.states_covered.includes(FALLBACK));
  const covered = new Set(activeZones.flatMap((z) => z.states_covered));
  const uncovered = hasFallback ? [] : states.filter((s) => !covered.has(s));

  const remove = async (zone: ShippingZone) => {
    const ok = await confirm({
      title: `Delete "${zone.name}"?`,
      tone: 'danger',
      confirmLabel: 'Delete zone',
      message: 'Customers in these states will no longer be offered this delivery fee. Past orders keep the fee they were charged.',
    });
    if (!ok) return;
    try {
      await adminDeleteShippingZone(zone.id);
      toast.success('Delivery zone deleted.');
      reload();
    } catch (err) {
      if (!redirectIfSignedOut(err)) toast.error(errorMessage(err));
    }
  };

  return (
    <div>
      <Link href="/admin/shipping" className="inline-flex items-center gap-1 text-xs font-medium text-[#6b7280] hover:text-[#111827]">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Shipping queue
      </Link>
      <div className="mt-2">
        <PageHeader
          title="Delivery zones"
          description="Set the delivery fee and estimate for each group of states."
          actions={
            <Button variant="primary" onClick={() => setEditing({ id: null, zone: { ...EMPTY_ZONE } })}>
              <Plus className="size-3.5" aria-hidden="true" />
              Add zone
            </Button>
          }
        />
      </div>

      <div className="mb-4 flex flex-col gap-2">
        <Notice>
          At checkout the customer picks their state and pays the fee of the active zone that lists it. A zone set to &quot;All other states&quot;
          covers every state not listed in another zone. If no zone matches, checkout tells the customer you don&apos;t deliver there yet.
        </Notice>
        {data && uncovered.length > 0 && (
          <Notice tone="warning">
            Customers in these states cannot check out because no active zone covers them: {uncovered.join(', ')}.
          </Notice>
        )}
      </div>

      <Panel>
        <DataState
          loading={loading}
          error={error}
          onRetry={reload}
          hasData={!!data}
          empty={zones.length === 0}
          emptyTitle="No delivery zones yet"
          emptyDescription="Add at least one zone so customers can check out."
        >
          <Table minWidth={820}>
            <thead>
              <tr>
                <th scope="col">Zone</th>
                <th scope="col" className="text-right">
                  Fee
                </th>
                <th scope="col">Estimate</th>
                <th scope="col">States</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.id}>
                  <td>
                    <span className="block font-semibold text-[#111827]">{z.name}</span>
                    <span className="block text-xs text-[#6b7280]">{z.code}</span>
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">{formatPrice(z.fee)}</td>
                  <td className="whitespace-nowrap text-[#4b5563]">{z.estimated_days || '—'}</td>
                  <td>
                    <div className="flex max-w-md flex-wrap gap-1">
                      {z.states_covered.length === 0 ? (
                        <span className="text-xs text-[#6b7280]">No states</span>
                      ) : (
                        z.states_covered.map((s) => (
                          <span key={s} className="rounded-md bg-[#f3f4f6] px-1.5 py-0.5 text-xs text-[#374151]">
                            {stateLabel(s)}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td>
                    <StatusPill label={z.is_active ? 'Active' : 'Inactive'} tone={z.is_active ? 'green' : 'neutral'} />
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <div className="inline-flex gap-1.5">
                      <Button
                        size="sm"
                        onClick={() =>
                          setEditing({
                            id: z.id,
                            zone: {
                              name: z.name,
                              code: z.code,
                              description: z.description ?? '',
                              states_covered: z.states_covered,
                              fee: z.fee,
                              estimated_days: z.estimated_days,
                              is_active: z.is_active,
                            },
                          })
                        }
                      >
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-700" onClick={() => remove(z)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </DataState>
      </Panel>

      <ZoneModal
        editing={editing}
        states={states}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
    </div>
  );
}

function ZoneModal({
  editing,
  states,
  onClose,
  onSaved,
}: {
  editing: { id: number | null; zone: ShippingZoneInput } | null;
  states: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<ShippingZoneInput>(EMPTY_ZONE);
  const [feeText, setFeeText] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [lastEditing, setLastEditing] = useState<typeof editing>(null);

  // Reset the form whenever a different zone is opened.
  if (editing !== lastEditing) {
    setLastEditing(editing);
    if (editing) {
      setForm(editing.zone);
      setFeeText(editing.id ? String(editing.zone.fee) : '');
      setErrors({});
    }
  }

  const toggleState = (state: string, on: boolean) =>
    setForm((f) => ({
      ...f,
      states_covered: on ? Array.from(new Set([...f.states_covered, state])) : f.states_covered.filter((s) => s !== state),
    }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const local: Record<string, string> = {};
    const fee = Number(feeText);
    if (!form.name.trim()) local.name = 'Name is required.';
    if (!/^[A-Z0-9_-]{2,30}$/.test(form.code)) local.code = 'Use 2-30 letters, numbers, dashes or underscores.';
    if (feeText.trim() === '' || !Number.isFinite(fee) || fee < 0) local.fee = 'Enter a delivery fee of 0 or more.';
    if (!form.estimated_days.trim()) local.estimated_days = 'Give customers a delivery estimate, e.g. "2-4 business days".';
    if (form.states_covered.length === 0) local.states_covered = 'Pick at least one state.';
    setErrors(local);
    if (Object.keys(local).length) return;

    setSaving(true);
    try {
      await adminSaveShippingZone(editing.id, {
        ...form,
        name: form.name.trim(),
        description: (form.description ?? '').trim(),
        estimated_days: form.estimated_days.trim(),
        fee,
      });
      toast.success(editing.id ? 'Delivery zone updated.' : 'Delivery zone created.');
      onSaved();
    } catch (err) {
      if (redirectIfSignedOut(err)) return;
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const allSelected = states.length > 0 && states.every((s) => form.states_covered.includes(s));

  return (
    <Modal
      open={!!editing}
      onClose={onClose}
      busy={saving}
      size="lg"
      title={editing?.id ? `Edit ${editing.zone.name}` : 'Add delivery zone'}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="zone-form" variant="primary" loading={saving}>
            {editing?.id ? 'Save changes' : 'Create zone'}
          </Button>
        </>
      }
    >
      <form id="zone-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Name" required error={errors.name}>
          {(p) => <TextInput {...p} data-autofocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. South East" />}
        </Field>
        <Field label="Code" required error={errors.code} hint="Short unique code, e.g. SOUTH_EAST.">
          {(p) => <TextInput {...p} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/\s+/g, '_') }))} />}
        </Field>
        <Field label="Delivery fee (₦)" required error={errors.fee}>
          {(p) => <TextInput {...p} type="number" min={0} step="50" inputMode="decimal" value={feeText} onChange={(e) => setFeeText(e.target.value)} />}
        </Field>
        <Field label="Delivery estimate" required error={errors.estimated_days} hint="Shown at checkout.">
          {(p) => (
            <TextInput {...p} value={form.estimated_days} onChange={(e) => setForm((f) => ({ ...f, estimated_days: e.target.value }))} placeholder="2-4 business days" />
          )}
        </Field>
        <Field label="Description" className="sm:col-span-2" hint="Optional, for your own reference.">
          {(p) => <TextArea {...p} value={form.description ?? ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />}
        </Field>
        <div className="sm:col-span-2">
          <Checkbox
            label="Active"
            hint="Inactive zones are never offered at checkout."
            checked={form.is_active}
            onChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
          />
        </div>

        <fieldset className="sm:col-span-2" aria-describedby={errors.states_covered ? 'zone-states-error' : undefined}>
          <legend className="text-xs font-semibold text-[#374151]">
            States covered<span className="text-red-600"> *</span>
          </legend>
          <div className="mb-2 mt-1 flex flex-wrap items-center justify-end gap-2">
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setForm((f) => ({ ...f, states_covered: Array.from(new Set([...f.states_covered, ...states])) }))}
                disabled={allSelected}
              >
                Select all states
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setForm((f) => ({ ...f, states_covered: [] }))} disabled={form.states_covered.length === 0}>
                Clear
              </Button>
            </div>
          </div>
          {errors.states_covered && (
            <p id="zone-states-error" className="mb-2 text-xs text-red-600">
              {errors.states_covered}
            </p>
          )}
          <div className="mb-3 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2">
            <Checkbox
              label="All other states (fallback)"
              hint="Applies to any state not listed in another active zone."
              checked={form.states_covered.includes(FALLBACK)}
              onChange={(v) => toggleState(FALLBACK, v)}
            />
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
            {states.map((s) => (
              <Checkbox key={s} label={s} checked={form.states_covered.includes(s)} onChange={(v) => toggleState(s, v)} />
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
