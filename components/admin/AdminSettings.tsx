'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  type PaymentMethodId,
  type StoreSettings,
  adminGetSettings,
  adminUpdatePaymentMethods,
  adminUpdateSettings,
  errorMessage,
  fieldErrors,
} from '@/lib/admin-api';
import { NIGERIAN_STATES } from '@/lib/nigeria';
import {
  Button,
  DataState,
  DetailList,
  Field,
  Notice,
  PageHeader,
  Panel,
  Select,
  StatusPill,
  TextInput,
  redirectIfSignedOut,
  useAdminData,
  useToast,
} from '@/components/admin/ui';
import { DevModePanel } from '@/components/admin/AdminDevMode';
import { DEVELOPER } from '@/lib/developer';

const LABELS: Record<string, string> = {
  store_name: 'Store name',
  store_contact_email: 'Support email',
  store_contact_phone: 'Support phone',
  store_whatsapp_phone: 'WhatsApp number',
  store_origin_address: 'Dispatch address',
  store_origin_city: 'Dispatch city',
  store_origin_state: 'Dispatch state',
  storefront_brands: 'Homepage brand strip',
};

const INPUT_TYPES: Record<string, string> = {
  store_contact_email: 'email',
  store_contact_phone: 'tel',
  store_whatsapp_phone: 'tel',
};

const WIDE_KEYS = new Set(['store_name', 'store_origin_address', 'storefront_brands']);

function gatewayMode(mode: string) {
  if (mode === 'live') return <StatusPill label="Live" tone="green" />;
  if (mode === 'sandbox') return <StatusPill label="Sandbox (test)" tone="amber" />;
  return <StatusPill label="Not configured" tone="neutral" />;
}

const METHODS: Array<{ id: PaymentMethodId; name: string; description: string }> = [
  { id: 'monnify', name: 'Monnify', description: 'Card and bank transfer. Confirmed automatically.' },
  { id: 'kora', name: 'Kora', description: 'Card and bank transfer. Confirmed automatically.' },
  { id: 'whatsapp', name: 'Pay via WhatsApp', description: 'Customer sends the invoice on WhatsApp and pays by transfer; you confirm it in Orders.' },
];

/**
 * On/off switches for the payment methods offered at checkout. Saves immediately.
 */
function PaymentMethodsPanel({ settings, onSaved }: { settings: StoreSettings['readonly']; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [busy, setBusy] = useState<PaymentMethodId | null>(null);

  const mode = (id: PaymentMethodId) =>
    id === 'kora' ? gatewayMode(settings.kora_mode) : id === 'monnify' ? gatewayMode(settings.monnify_mode) : null;

  const choosePrimary = async (gateway: 'monnify' | 'kora') => {
    setBusy(gateway);
    try {
      await adminUpdatePaymentMethods({ primary_gateway: gateway });
      toast.success(`"Pay now" now uses ${gateway === 'kora' ? 'Kora' : 'Monnify'}.`);
      await onSaved();
    } catch (err) {
      if (!redirectIfSignedOut(err)) toast.error(errorMessage(err, 'The change could not be saved.'));
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (id: PaymentMethodId, on: boolean) => {
    setBusy(id);
    try {
      await adminUpdatePaymentMethods({ [id]: on });
      toast.success(`${METHODS.find((m) => m.id === id)?.name} is now ${on ? 'on' : 'off'} at checkout.`);
      await onSaved();
    } catch (err) {
      if (!redirectIfSignedOut(err)) toast.error(errorMessage(err, 'The change could not be saved.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel title="Payment methods at checkout" bodyClassName="p-0">
      <div className="border-b border-[#f3f4f6] px-4 py-3">
        <p id="pm-primary" className="text-sm font-semibold text-[#111827]">&quot;Pay now&quot; uses</p>
        <p className="mt-0.5 text-xs text-[#6b7280]">
          Customers see one &quot;Pay now&quot; button (card or bank transfer) plus &quot;Pay via WhatsApp&quot;. If the gateway chosen here is off, the
          other one is used.
        </p>
        <div role="radiogroup" aria-labelledby="pm-primary" className="mt-2 inline-flex rounded-lg border border-[#e5e7eb] p-0.5">
          {(['monnify', 'kora'] as const).map((g) => (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={settings.primary_gateway === g}
              disabled={busy !== null}
              onClick={() => settings.primary_gateway !== g && void choosePrimary(g)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${
                settings.primary_gateway === g ? 'bg-[#1f2937] text-white' : 'text-[#374151] hover:bg-[#f3f4f6]'
              }`}
            >
              {g === 'kora' ? 'Kora' : 'Monnify'}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-[#6b7280]">
          Right now: {settings.pay_now_gateway ? (settings.pay_now_gateway === 'kora' ? 'Kora' : 'Monnify') : 'no gateway is on, so customers can only pay via WhatsApp'}.
        </p>
      </div>
      <ul className="divide-y divide-[#f3f4f6]">
        {METHODS.map((m) => {
          const s = settings.payment_methods[m.id];
          const labelId = `pm-${m.id}`;
          return (
            <li key={m.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p id={labelId} className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#111827]">
                  {m.name}
                  {mode(m.id)}
                </p>
                <p className="mt-0.5 text-xs text-[#6b7280]">{m.description}</p>
                {!s.server_allows && (
                  <p className="mt-1 text-xs font-medium text-amber-700">
                    Turned off in backend/.env (PAYMENT_{m.id.toUpperCase()}_ENABLED), so customers can&apos;t use it even when this is on.
                  </p>
                )}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={s.admin_on}
                aria-labelledby={labelId}
                disabled={busy !== null}
                onClick={() => toggle(m.id, !s.admin_on)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[#9ca3af]/50 disabled:opacity-60 ${
                  s.admin_on ? 'bg-[#1f2937]' : 'bg-[#d1d5db]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${s.admin_on ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/**
 * Store details the admin can edit (only settings the store actually uses), plus a read-only
 * view of server configuration from backend/.env (never secrets).
 */
export function AdminSettings() {
  const toast = useToast();
  const { data, setData, loading, error, reload } = useAdminData(() => adminGetSettings(), []);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const saved: Record<string, string> = {};
  (data?.editable ?? []).forEach((s) => {
    saved[s.key] = s.value ?? '';
  });

  // The form starts from the saved settings each time they (re)load.
  const [valuesFor, setValuesFor] = useState<StoreSettings['editable'] | null>(null);
  if (data && data.editable !== valuesFor) {
    setValuesFor(data.editable);
    setValues(saved);
  }

  const changed = Object.keys(values).filter((key) => values[key] !== saved[key]);

  // A payment switch only changes the read-only half, so details being typed above stay as they are.
  const refreshPaymentMethods = async () => {
    try {
      const fresh = await adminGetSettings();
      setData((current) => (current ? { ...current, readonly: fresh.readonly } : fresh));
    } catch (err) {
      if (!redirectIfSignedOut(err)) toast.error('The change was saved, but this page could not refresh. Reload to see the switches as they are now.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (changed.length === 0) return;
    const payload: Record<string, string> = {};
    changed.forEach((key) => {
      payload[key] = values[key].trim();
    });

    setSaving(true);
    setErrors({});
    try {
      await adminUpdateSettings(payload);
      toast.success('Settings saved.');
      reload();
    } catch (err) {
      if (redirectIfSignedOut(err)) return;
      const fields = fieldErrors(err);
      setErrors(fields);
      toast.error(Object.keys(fields).length ? 'Please fix the highlighted settings.' : errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const ro = data?.readonly;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Store settings" description="Details customers see at checkout, in emails and on receipts." />

      <DataState loading={loading} error={error} onRetry={reload} hasData={!!data} empty={false}>
        {data && ro && (
          <div className="flex flex-col gap-4">
            <Panel title="Store details" bodyClassName="p-4">
              <form onSubmit={handleSave} className="flex flex-col gap-4" noValidate>
                <div className="grid gap-4 sm:grid-cols-2">
                  {data.editable.map((setting) => (
                    <Field
                      key={setting.key}
                      label={LABELS[setting.key] ?? setting.key}
                      hint={setting.help}
                      error={errors[setting.key]}
                      className={WIDE_KEYS.has(setting.key) ? 'sm:col-span-2' : ''}
                    >
                      {(p) =>
                        setting.key === 'store_origin_state' ? (
                          <Select {...p} value={values[setting.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [setting.key]: e.target.value }))}>
                            <option value="">Not set</option>
                            {/* Keep a stored value that is not in the list visible rather than silently dropping it. */}
                            {values[setting.key] && !NIGERIAN_STATES.includes(values[setting.key]) && (
                              <option value={values[setting.key]}>{values[setting.key]}</option>
                            )}
                            {NIGERIAN_STATES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <TextInput
                            {...p}
                            type={INPUT_TYPES[setting.key] ?? 'text'}
                            maxLength={255}
                            value={values[setting.key] ?? ''}
                            onChange={(e) => setValues((v) => ({ ...v, [setting.key]: e.target.value }))}
                          />
                        )
                      }
                    </Field>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" variant="primary" loading={saving} disabled={changed.length === 0}>
                    Save changes
                  </Button>
                  {changed.length > 0 && (
                    <Button
                      variant="ghost"
                      disabled={saving}
                      onClick={() => {
                        setValues(saved);
                        setErrors({});
                      }}
                    >
                      Discard
                    </Button>
                  )}
                  <p className="text-xs text-[#6b7280]">
                    Delivery fees are set per zone in{' '}
                    <Link href="/admin/shipping/zones" className="font-semibold text-[#111827] underline-offset-2 hover:underline">
                      Delivery zones
                    </Link>
                    .
                  </p>
                </div>
              </form>
            </Panel>

            <PaymentMethodsPanel settings={ro} onSaved={refreshPaymentMethods} />

            <DevModePanel />

            <Panel title="Contact developer" bodyClassName="p-4">
              <p className="text-sm text-[#374151]">
                Built and maintained by <strong className="text-[#111827]">{DEVELOPER.name}</strong>. For help with the shop, changes or new
                features, get in touch:
              </p>
              <a
                href={DEVELOPER.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#1f2937] px-3 py-2 text-xs font-semibold text-white hover:bg-[#111827]"
              >
                Contact {DEVELOPER.name}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </Panel>

            <Panel title="Configured on the server" bodyClassName="p-4">
              <div className="flex flex-col gap-4">
                <Notice>
                  These come from backend/.env and can only be changed there (then restart the API). Secret keys are never shown here.
                </Notice>
                <DetailList
                  items={[
                    { label: 'Currency', value: ro.currency },
                    { label: 'Timezone', value: ro.timezone },
                    { label: 'Kora', value: gatewayMode(ro.kora_mode) },
                    { label: 'Monnify', value: gatewayMode(ro.monnify_mode) },
                    {
                      label: 'Email delivery',
                      value:
                        ro.mail_mode === 'resend' ? (
                          <StatusPill label="Resend" tone="green" />
                        ) : ro.mail_mode === 'smtp' ? (
                          <StatusPill label="SMTP" tone="green" />
                        ) : (
                          <StatusPill label="Log only (not sent)" tone="amber" />
                        ),
                    },
                    { label: 'Card / transfer payment window', value: `${ro.order_payment_window_minutes} minutes` },
                    { label: 'WhatsApp / manual payment window', value: `${ro.manual_payment_window_hours} hours` },
                  ]}
                />
              </div>
            </Panel>
          </div>
        )}
      </DataState>
    </div>
  );
}
