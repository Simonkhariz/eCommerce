'use client';

import { useEffect, useState } from 'react';
import { apiGetPaymentMethods, PaymentMethodItem, PaymentMethodsResponse } from '@/lib/api-client';
import { useStoreSeed } from '@/components/layout/StoreDataProvider';

interface StoreSupport {
  supportPhone: string | null;
  paymentMethods: PaymentMethodItem[];
  loaded: boolean;
}

let cache: Promise<StoreSupport> | null = null;

function fromResponse(res: PaymentMethodsResponse | null | undefined): StoreSupport {
  return { supportPhone: res?.support_phone || null, paymentMethods: res?.methods || [], loaded: true };
}

function load(): Promise<StoreSupport> {
  if (!cache) {
    cache = apiGetPaymentMethods()
      .then(fromResponse)
      .catch(() => {
        cache = null; // retry on the next mount
        return { supportPhone: null, paymentMethods: [], loaded: true };
      });
  }
  return cache;
}

/**
 * Store support WhatsApp number and enabled payment methods, as configured on the backend.
 * Comes with the page when the server fetched it; otherwise loaded once per page session and
 * shared by every component that needs it.
 */
export function useStoreSupport(): StoreSupport {
  const seeded = useStoreSeed()?.payments;
  const [state, setState] = useState<StoreSupport>(() =>
    seeded ? fromResponse(seeded) : { supportPhone: null, paymentMethods: [], loaded: false }
  );

  useEffect(() => {
    if (seeded) {
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
  }, [seeded]);

  return state;
}
