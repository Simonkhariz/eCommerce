'use client';

import React from 'react';
import { formatPrice } from '@/lib/currency';
import { useStoreInfo } from '@/lib/use-store-info';

/** Live delivery zones and fees, exactly as checkout uses them. */
export function DeliveryZonesTable() {
  const { zones, loaded, error, reload } = useStoreInfo();

  if (!loaded) {
    return (
      <p role="status" className="mt-6 text-sm text-neutral-600">
        Loading delivery fees…
      </p>
    );
  }

  if (error) {
    return (
      <div role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p>We could not load the delivery fees right now. The exact fee is always shown at checkout.</p>
        <button type="button" onClick={reload} className="mt-2 font-semibold underline">
          Try again
        </button>
      </div>
    );
  }

  const active = zones.filter((z) => z.is_active !== false).sort((a, b) => Number(a.fee) - Number(b.fee));

  if (active.length === 0) {
    return <p className="mt-6 text-sm text-neutral-700">Delivery zones have not been set up yet. Please contact us before ordering.</p>;
  }

  const statesLabel = (states: string[]) => {
    const named = states.filter((s) => s !== '*');
    const rest = states.includes('*') ? 'All other states' : '';
    return [named.join(', '), rest].filter(Boolean).join(' · ') || '—';
  };

  return (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-neutral-200">
      <table className="w-full min-w-[520px] text-left text-sm">
        <caption className="sr-only">Delivery fees by zone</caption>
        <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-700">
          <tr>
            <th scope="col" className="px-4 py-3">
              Zone
            </th>
            <th scope="col" className="px-4 py-3">
              States
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              Fee
            </th>
            <th scope="col" className="px-4 py-3">
              Estimated delivery
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {active.map((zone) => (
            <tr key={zone.id}>
              <th scope="row" className="px-4 py-3 font-semibold text-black">
                {zone.name}
              </th>
              <td className="px-4 py-3 text-neutral-700">{statesLabel(zone.states_covered ?? [])}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-black">{formatPrice(Number(zone.fee))}</td>
              <td className="px-4 py-3 text-neutral-700">{zone.estimated_days || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
