'use client';

import { useEffect, useState } from 'react';
import { apiGetPaymentMethods, PaymentMethodItem } from '@/lib/api-client';

interface StoreSupport {
  supportPhone: string | null;
  paymentMethods: PaymentMethodItem[];
  loaded: boolean;
}

let cache: Promise<StoreSupport> | null = null;

function load(): Promise<StoreSupport> {
  if (!cache) {
    cache = apiGetPaymentMethods()
      .then((res) => ({
        supportPhone: res?.support_phone || null,
        paymentMethods: res?.methods || [],
        loaded: true,
      }))
      .catch(() => {
        cache = null; // retry on the next mount
        return { supportPhone: null, paymentMethods: [], loaded: true };
      });
  }
  return cache;
}

/**
 * Store support WhatsApp number and enabled payment methods, as configured on the backend.
 * Loaded once per page session and shared by every component that needs it.
 */
export function useStoreSupport(): StoreSupport {
  const [state, setState] = useState<StoreSupport>({ supportPhone: null, paymentMethods: [], loaded: false });

  useEffect(() => {
    let active = true;
    load().then((value) => {
      if (active) setState(value);
    });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
