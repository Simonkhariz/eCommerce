'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGetPaymentMethods, PaymentMethodItem, PaymentMethodsResponse } from '@/lib/api-client';
import { useStoreSeed } from '@/components/layout/StoreDataProvider';
import { DEFAULT_PAYMENT_WINDOWS, PaymentWindows, paymentWindowsFrom } from '@/lib/site-content';

interface StoreSupport {
  supportPhone: string | null;
  paymentMethods: PaymentMethodItem[];
  /** How long an unpaid order holds its items (the backend's defaults until loaded). */
  paymentWindows: PaymentWindows;
  /** The payment return page may open the live status stream (SSE_ENABLED on the server). */
  livePaymentStatus: boolean;
  loaded: boolean;
}

let cache: Promise<StoreSupport> | null = null;

function fromResponse(res: PaymentMethodsResponse | null | undefined): StoreSupport {
  return { supportPhone: res?.support_phone || null, paymentMethods: res?.methods || [], paymentWindows: paymentWindowsFrom(res), livePaymentStatus: res?.live_payment_status === true, loaded: true };
}

function load(): Promise<StoreSupport> {
  if (!cache) {
    cache = apiGetPaymentMethods()
      .then(fromResponse)
      .catch(() => {
        cache = null; // retry on the next mount
        return { supportPhone: null, paymentMethods: [], paymentWindows: DEFAULT_PAYMENT_WINDOWS, livePaymentStatus: false, loaded: true };
      });
  }
  return cache;
}

/**
 * Store support WhatsApp number and enabled payment methods, as configured on the backend.
 * Comes with the page when the server fetched it; otherwise loaded once per page session and
 * shared by every component that needs it.
 */
export function useStoreSupport(): StoreSupport & { retry: () => void } {
  const seeded = useStoreSeed()?.payments;
  const [state, setState] = useState<StoreSupport>(() =>
    seeded ? fromResponse(seeded) : { supportPhone: null, paymentMethods: [], paymentWindows: DEFAULT_PAYMENT_WINDOWS, livePaymentStatus: false, loaded: false }
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (seeded && attempt === 0) {
      cache ??= Promise.resolve(fromResponse(seeded));
      return;
    }
    let active = true;
    load().then((value) => {
      if (active) setState(value);
    });
    return () => {
      active = false;
    };
  }, [seeded, attempt]);

  /** Ask the server again (after a failed load, or to pick up methods switched back on). */
  const retry = useCallback(() => {
    cache = null;
    setState((s) => ({ ...s, loaded: false }));
    setAttempt((a) => a + 1);
  }, []);

  return { ...state, retry };
}
