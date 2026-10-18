'use client';

import { useEffect, useState } from 'react';
import { ApiCategory, apiGetShippingZones, getCatalogFacets, ShippingZone } from '@/lib/api-client';

/** Store details as configured in admin Settings. Empty strings mean "not set" — never invent them. */
export interface StoreOrigin {
  store_name: string;
  origin_city: string;
  origin_state: string;
  origin_address: string;
  contact_phone: string;
  contact_email: string;
  whatsapp_phone?: string;
}

interface StoreInfo {
  zones: ShippingZone[];
  origin: StoreOrigin | null;
  loaded: boolean;
  error: string | null;
}

interface StoreNav {
  categories: ApiCategory[];
  dressStyles: string[];
  loaded: boolean;
}

let infoCache: Promise<StoreInfo> | null = null;
let navCache: Promise<StoreNav> | null = null;

function loadInfo(): Promise<StoreInfo> {
  if (!infoCache) {
    infoCache = apiGetShippingZones()
      .then((res) => ({ zones: res?.zones ?? [], origin: (res?.origin as StoreOrigin) ?? null, loaded: true, error: null }))
      .catch((err: Error) => {
        infoCache = null; // retry on the next mount
        return { zones: [], origin: null, loaded: true, error: err?.message || 'Could not load store details.' };
      });
  }
  return infoCache;
}

function loadNav(): Promise<StoreNav> {
  if (!navCache) {
    navCache = getCatalogFacets()
      .then((f) => ({
        categories: (f?.categories ?? []).filter((c) => (c.product_count ?? 0) > 0),
        dressStyles: f?.dress_styles ?? [],
        loaded: true,
      }))
      .catch(() => {
        navCache = null;
        return { categories: [], dressStyles: [], loaded: true };
      });
  }
  return navCache;
}

/** Live delivery zones and store contact details (shared, loaded once per page session). */
export function useStoreInfo(): StoreInfo & { reload: () => void } {
  const [state, setState] = useState<StoreInfo>({ zones: [], origin: null, loaded: false, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    loadInfo().then((value) => active && setState(value));
    return () => {
      active = false;
    };
  }, [attempt]);

  return {
    ...state,
    reload: () => {
      setState((s) => ({ ...s, loaded: false, error: null }));
      setAttempt((n) => n + 1);
    },
  };
}

/** Categories that have published products, and dress styles that exist in the catalogue. */
export function useStoreNav(): StoreNav {
  const [state, setState] = useState<StoreNav>({ categories: [], dressStyles: [], loaded: false });

  useEffect(() => {
    let active = true;
    loadNav().then((value) => active && setState(value));
    return () => {
      active = false;
    };
  }, []);

  return state;
}

/** wa.me link for a configured phone number, or null when none is set. */
export function whatsAppLink(phone: string | null | undefined, message?: string): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const intl = digits.startsWith('0') && digits.length === 11 ? `234${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}
