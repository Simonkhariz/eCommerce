/**
 * The unpaid order created from the current cart, remembered on this device so that
 * reopening checkout resumes it (instead of reserving stock for a duplicate order) and the
 * payment return page knows when it is safe to empty the cart.
 */
import type { CartItem } from '@/types';

const KEY = 'shopco_pending_order';

export interface PendingOrder {
  orderNumber: string;
  /** Cart contents the order was created from (variant:quantity list). */
  cartSignature: string;
  expiresAt: string | null;
  createdAt: string;
}

export function cartSignature(items: CartItem[]): string {
  return items
    .map((i) => `${i.variantId ?? i.id}:${i.quantity}`)
    .sort()
    .join('|');
}

export function savePendingOrder(order: PendingOrder): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(order));
  } catch {
    // Storage unavailable: checkout still works, it just won't resume.
  }
}

export function readPendingOrder(): PendingOrder | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingOrder;
    if (parsed.expiresAt && new Date(parsed.expiresAt.replace(' ', 'T')).getTime() <= Date.now()) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingOrder(orderNumber?: string): void {
  try {
    if (orderNumber) {
      const current = readPendingOrder();
      if (current && current.orderNumber !== orderNumber) return;
    }
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** Guest access tokens are kept per order on this device only (never in URLs). */
export function saveGuestToken(orderNumber: string, token: string): void {
  try {
    localStorage.setItem(`shopco_guest_token_${orderNumber}`, token);
    localStorage.setItem('shopco_latest_order_number', orderNumber);
  } catch {
    // ignore
  }
}

export function readGuestToken(orderNumber: string): string | undefined {
  try {
    return localStorage.getItem(`shopco_guest_token_${orderNumber}`) || undefined;
  } catch {
    return undefined;
  }
}
