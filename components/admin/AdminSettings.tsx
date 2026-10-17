'use client';

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { apiAdminGetSettings, apiAdminUpdateSettings, apiGetAdminShippingZones } from '@/lib/api-client';

export const AdminSettings: React.FC = () => {
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Form Fields
  const [storeName, setStoreName] = useState('');
  const [storeEmail, setStoreEmail] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [currency, setCurrency] = useState('NGN');
  const [timezone, setTimezone] = useState('Africa/Lagos');
  const [koraMode, setKoraMode] = useState('sandbox');
  const [monnifyMode, setMonnifyMode] = useState('sandbox');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [taxRate, setTaxRate] = useState('7.5');
  const [freeShippingThreshold, setFreeShippingThreshold] = useState('100000');
  const [originAddress, setOriginAddress] = useState('12 Okpara Avenue, Independence Layout, Enugu, Nigeria');

  // Zones
  const [zones, setZones] = useState<any[]>([]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await apiAdminGetSettings();
      const s = res?.data ?? res ?? {};
      setSettings(s);
      setStoreName(s.store_name || 'SHOP.CO Nigeria');
      setStoreEmail(s.store_email || 'support@shop.co.ng');
      setStorePhone(s.store_phone || '+234 812 345 6789');
      setCurrency(s.currency || 'NGN');
      setTimezone(s.timezone || 'Africa/Lagos');
      setKoraMode(s.kora_mode || 'sandbox');
      setMonnifyMode(s.monnify_mode || 'sandbox');
      setWhatsappPhone(s.whatsapp_phone || '+234 812 345 6789');
      setTaxRate(s.tax_rate_percent || '7.5');
      setFreeShippingThreshold(s.shipping_free_threshold || '100000');
      setOriginAddress(s.store_origin_address || '12 Okpara Avenue, Independence Layout, Enugu, Nigeria');

      // Also fetch zones
      const zList = await apiGetAdminShippingZones();
      setZones(Array.isArray(zList) ? zList : []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await apiAdminUpdateSettings({
        store_name: storeName,
        store_email: storeEmail,
        store_phone: storePhone,
        currency,
        timezone,
        kora_mode: koraMode,
        monnify_mode: monnifyMode,
        whatsapp_phone: whatsappPhone,
        tax_rate_percent: taxRate,
        shipping_free_threshold: freeShippingThreshold,
        store_origin_address: originAddress,
      });
      setFeedback('Store operational settings and gateway configurations successfully saved.');
    } catch (err: any) {
      alert(err?.message || 'Failed to update store settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 w-full flex-col items-center justify-center gap-3">
        <div className="size-8 animate-spin rounded-full border-2 border-black border-t-transparent" />
        <span className="text-xs text-[#6b7280]">Loading store settings...</span>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e5e7eb] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">Store Settings</h1>
          <p className="text-xs text-[#6b7280]">
            Configure store identity, financial currency, fulfillment zones, tax rules, and gateway operating modes.
          </p>
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

      <form onSubmit={handleSave} className="flex flex-col gap-6">
        {/* Store Identity */}
        <div className="rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-[#111827]">Store Identity & Contact</h2>
          <p className="text-xs text-[#6b7280]">Official details printed on receipts and packing slips</p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-[#374151]">Store Name</label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                required
                className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-xs font-semibold outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#374151]">Official Email</label>
              <input
                type="email"
                value={storeEmail}
                onChange={(e) => setStoreEmail(e.target.value)}
                required
                className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-xs outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#374151]">Support Phone</label>
              <input
                type="text"
                value={storePhone}
                onChange={(e) => setStorePhone(e.target.value)}
                required
                className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-xs outline-none focus:border-black"
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="block text-xs font-semibold text-[#374151]">Origin Warehouse / Shipping Address</label>
            <input
              type="text"
              value={originAddress}
              onChange={(e) => setOriginAddress(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-xs outline-none focus:border-black"
            />
          </div>
        </div>

        {/* Currency & Tax */}
        <div className="rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-[#111827]">Currency &amp; Taxes</h2>
          <p className="text-xs text-[#6b7280]">Storefront pricing currency and VAT rate settings</p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold text-[#374151]">Base Currency</label>
              <input
                type="text"
                value={currency}
                disabled
                className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-3 font-mono text-xs font-bold text-[#374151] outline-none"
              />
              <span className="text-[10px] text-[#9ca3af]">Locked to NGN (₦) for Nigerian market</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#374151]">Store Timezone</label>
              <input
                type="text"
                value={timezone}
                disabled
                className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-3 text-xs font-semibold text-[#374151] outline-none"
              />
              <span className="text-[10px] text-[#9ca3af]">Africa/Lagos (WAT)</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#374151]">VAT / Tax Rate (%)</label>
              <input
                type="number"
                step="0.1"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-xs font-semibold outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#374151]">Free Delivery Minimum (NGN)</label>
              <input
                type="number"
                value={freeShippingThreshold}
                onChange={(e) => setFreeShippingThreshold(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-xs font-semibold outline-none focus:border-black"
              />
            </div>
          </div>
        </div>

        {/* Payment Gateways Config (No Secrets Displayed) */}
        <div className="rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-[#111827]">Payment Gateway Operating Modes</h2>
          <p className="text-xs text-[#6b7280]">
            Toggle between live production and test sandbox. Note: API secret keys are securely stored server-side and never exposed.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Kora */}
            <div className="rounded-lg border border-[#e5e7eb] p-3 text-xs">
              <span className="font-bold text-[#111827]">Kora Hosted Checkout</span>
              <div className="mt-2">
                <label className="block text-[11px] text-[#6b7280]">Mode</label>
                <select
                  value={koraMode}
                  onChange={(e) => setKoraMode(e.target.value)}
                  className="mt-1 h-8 w-full rounded border border-[#e5e7eb] bg-white px-2 text-xs outline-none"
                >
                  <option value="sandbox">Sandbox (Testing)</option>
                  <option value="live">Live (Production)</option>
                </select>
              </div>
              <div className="mt-2 text-[10px] text-[#9ca3af]">
                Secret Key: <span className="font-mono">••••••••••••••••</span>
              </div>
            </div>

            {/* Monnify */}
            <div className="rounded-lg border border-[#e5e7eb] p-3 text-xs">
              <span className="font-bold text-[#111827]">Monnify Switch</span>
              <div className="mt-2">
                <label className="block text-[11px] text-[#6b7280]">Mode</label>
                <select
                  value={monnifyMode}
                  onChange={(e) => setMonnifyMode(e.target.value)}
                  className="mt-1 h-8 w-full rounded border border-[#e5e7eb] bg-white px-2 text-xs outline-none"
                >
                  <option value="sandbox">Sandbox (Testing)</option>
                  <option value="live">Live (Production)</option>
                </select>
              </div>
              <div className="mt-2 text-[10px] text-[#9ca3af]">
                Secret Key: <span className="font-mono">••••••••••••••••</span>
              </div>
            </div>

            {/* WhatsApp */}
            <div className="rounded-lg border border-[#e5e7eb] p-3 text-xs">
              <span className="font-bold text-[#111827]">WhatsApp Agent Settlement</span>
              <div className="mt-2">
                <label className="block text-[11px] text-[#6b7280]">Support Phone</label>
                <input
                  type="text"
                  value={whatsappPhone}
                  onChange={(e) => setWhatsappPhone(e.target.value)}
                  className="mt-1 h-8 w-full rounded border border-[#e5e7eb] px-2 text-xs outline-none"
                />
              </div>
              <div className="mt-2 text-[10px] text-[#9ca3af]">
                Routing customers to WhatsApp agent for manual bank payments
              </div>
            </div>
          </div>
        </div>

        {/* Destination Shipping Zones Overview */}
        <div className="rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#f3f4f6] pb-3">
            <div>
              <h2 className="text-sm font-bold text-[#111827]">Destination Shipping Zones & Rates</h2>
              <p className="text-xs text-[#6b7280]">
                Configured physical parcel fulfillment delivery zones and rates applied during checkout.
              </p>
            </div>
            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-[#374151]">
              {zones.length} active zones
            </span>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#f3f4f6] text-[11px] uppercase tracking-wider text-[#9ca3af]">
                <tr>
                  <th className="py-2.5">Zone Name</th>
                  <th className="py-2.5">Code</th>
                  <th className="py-2.5">Standard Rate</th>
                  <th className="py-2.5">Estimated Duration</th>
                  <th className="py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f9fafb]">
                {zones.map((z) => (
                  <tr key={z.id}>
                    <td className="py-2 font-semibold text-[#111827]">{z.name}</td>
                    <td className="py-2 font-mono text-[#6b7280]">{z.code}</td>
                    <td className="py-2 font-bold text-[#111827]">
                      ₦{Number(z.base_fee).toLocaleString()}
                    </td>
                    <td className="py-2 text-[#4b5563]">{z.estimated_days}</td>
                    <td className="py-2">
                      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        {z.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end pb-8">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-black px-6 py-2.5 text-xs font-semibold text-white shadow hover:bg-neutral-800 disabled:opacity-50"
          >
            {saving ? 'Saving Settings...' : 'Save Settings Changes'}
          </button>
        </div>
      </form>
    </div>
  );
};
