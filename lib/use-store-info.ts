'use client';

import { useEffect, useState } from 'react';
import { ApiCategory, apiGetShippingZones, CatalogFacets, getCatalogFacets, ShippingZone, StoreOrigin } from '@/lib/api-client';
import { useStoreSeed } from '@/components/layout/StoreDataProvider';
import { normalizePhoneDigits } from '@/lib/whatsapp';

export type { StoreOrigin };

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

function infoFrom(res: { zones?: ShippingZone[]; origin?: StoreOrigin | null } | null | undefined): StoreInfo {
  return { zones: res?.zones ?? [], origin: res?.origin ?? null, loaded: true, error: null };
}

function navFrom(f: CatalogFacets | null | undefined): StoreNav {
  return {
    categories: (f?.categories ?? []).filter((c) => (c.product_count ?? 0) > 0),
    dressStyles: f?.dress_styles ?? [],
    loaded: true,
  };
}

function loadInfo(): Promise<StoreInfo> {
  if (!infoCache) {
    infoCache = apiGetShippingZones()
      .then(infoFrom)
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
      .then(navFrom)
      .catch(() => {
        navCache = null;
        return { categories: [], dressStyles: [], loaded: true };
      });
  }
  return navCache;
}

/**
 * Live delivery zones and store contact details: with the page when the server fetched them,
 * otherwise loaded once per page session and shared.
 */
export function useStoreInfo(): StoreInfo & { reload: () => void } {
  const seeded = useStoreSeed()?.shipping;
  const [state, setState] = useState<StoreInfo>(() =>
    seeded ? infoFrom(seeded) : { zones: [], origin: null, loaded: false, error: null }
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (seeded && attempt === 0) {
      infoCache ??= Promise.resolve(infoFrom(seeded));
      return;
    }
    let active = true;
    loadInfo().then((value) => active && setState(value));
    return () => {
      active = false;
    };
  }, [attempt, seeded]);

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
  const seeded = useStoreSeed()?.facets;
  const [state, setState] = useState<StoreNav>(() =>
    seeded ? navFrom(seeded) : { categories: [], dressStyles: [], loaded: false }
  );

  useEffect(() => {
    if (seeded) {
      navCache ??= Promise.resolve(navFrom(seeded));
      return;
    }
    let active = true;
    loadNav().then((value) => active && setState(value));
    return () => {
      active = false;
    };
  }, [seeded]);

  return state;
}

/** wa.me link for a configured phone number, or null when none is set. */
export function whatsAppLink(phone: string | null | undefined, message?: string): string | null {
  const intl = normalizePhoneDigits(phone);
  if (!intl) return null;
  return `https://wa.me/${intl}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}
