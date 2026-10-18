'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminGetSettings, adminUpdateSettings, errorMessage, fieldErrors } from '@/lib/admin-api';
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

const LABELS: Record<string, string> = {
  store_name: 'Store name',
  store_contact_email: 'Support email',
  store_contact_phone: 'Support phone',
  store_whatsapp_phone: 'WhatsApp number',
  store_origin_address: 'Dispatch address',
  store_origin_city: 'Dispatch city',
  store_origin_state: 'Dispatch state',
};

const INPUT_TYPES: Record<string, string> = {
  store_contact_email: 'email',
  store_contact_phone: 'tel',
  store_whatsapp_phone: 'tel',
};

const WIDE_KEYS = new Set(['store_name', 'store_origin_address']);

function gatewayMode(mode: string) {
  if (mode === 'live') return <StatusPill label="Live" tone="green" />;
  if (mode === 'sandbox') return <StatusPill label="Sandbox (test)" tone="amber" />;
  return <StatusPill label="Not configured" tone="neutral" />;
}

function enabled(on: boolean) {
  return on ? <StatusPill label="On" tone="green" /> : <StatusPill label="Off" tone="neutral" />;
}

/**
 * Store details the admin can edit (only settings the store actually uses), plus a read-only
 * view of server configuration from backend/.env (never secrets).
 */
export function AdminSettings() {
  const toast = useToast();
  const { data, loading, error, reload } = useAdminData(() => adminGetSettings(), []);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const saved: Record<string, string> = {};
  (data?.editable ?? []).forEach((s) => {
    saved[s.key] = s.value ?? '';
  });

  useEffect(() => {
    if (!data) return;
    const initial: Record<string, string> = {};
    data.editable.forEach((s) => {
      initial[s.key] = s.value ?? '';
    });
    setValues(initial);
  }, [data]);

  const changed = Object.keys(values).filter((key) => values[key] !== saved[key]);

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
                      label: 'Payment methods at checkout',
                      value: (
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="inline-flex items-center gap-1">Monnify {enabled(ro.payment_methods.monnify)}</span>
                          <span className="inline-flex items-center gap-1">Kora {enabled(ro.payment_methods.kora)}</span>
                          <span className="inline-flex items-center gap-1">WhatsApp {enabled(ro.payment_methods.whatsapp)}</span>
                        </span>
                      ),
                    },
                    {
                      label: 'Email delivery',
                      value: ro.mail_mode === 'smtp' ? <StatusPill label="SMTP" tone="green" /> : <StatusPill label="Log only (not sent)" tone="amber" />,
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
