'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CartItem, Product, ProductVariant, PromoCode } from '@/types';
import {
  ApiSavedCartItem,
  PRODUCT_IMAGE_PLACEHOLDER,
  apiCheckCartLines,
  apiGetSavedCart,
  apiSaveCart,
  apiValidatePromotion,
  apiVerifyPayment,
  getProductDetail,
} from '@/lib/api-client';
import { useAuth } from '@/context/AuthContext';
import { clearPendingOrder, readGuestToken, readPendingOrder } from '@/lib/pending-order';

interface ToastMessage {
  id: string;
  title: string;
  message: string;
  image?: string;
  /** Show the "View cart" action (only for cart additions). */
  showCartAction?: boolean;
}

/** Per-line maximum, matching the server's checkout limit. */
export const MAX_QUANTITY_PER_LINE = 20;

interface CartContextType {
  items: CartItem[];
  addToCart: (product: Product, variant: ProductVariant, quantity?: number) => void;
  removeFromCart: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  restoreItems: (newItems: CartItem[]) => void;
  appliedPromo: PromoCode | null;
  applyPromoCode: (code: string) => Promise<{ success: boolean; message: string }>;
  removePromoCode: () => void;
  /** Re-check every line against live price, stock and availability. */
  revalidateCart: () => Promise<void>;
  isRevalidating: boolean;
  /** Human-readable changes found during the last re-check (price changes, stock limits...). */
  cartNotices: string[];
  dismissCartNotices: () => void;
  subtotal: number;
  discountAmount: number;
  /** Subtotal minus discount. Delivery is calculated at checkout from the delivery address. */
  total: number;
  totalQuantity: number;
  toast: ToastMessage | null;
  hideToast: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const PROMO_STORAGE_KEY = 'shopco_promo_code';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // Storage unavailable (private mode / quota): the cart still works for this visit.
  }
}

function lineKey(variantId: number): string {
  return String(variantId);
}

function fromSavedLine(line: ApiSavedCartItem): CartItem {
  return {
    id: lineKey(line.variant_id),
    productId: String(line.product_id),
    variantId: line.variant_id,
    sku: line.sku,
    name: line.product_name,
    slug: line.product_slug,
    price: line.unit_price,
    originalPrice: line.original_price ?? undefined,
    image: line.image_url || PRODUCT_IMAGE_PLACEHOLDER,
    size: line.size,
    color: { name: line.color_name, hex: line.color_hex || '#000000' },
    quantity: Math.min(line.quantity, MAX_QUANTITY_PER_LINE),
    maxStock: line.stock_quantity,
  };
}

/** Union of two carts by variant; the larger quantity wins so logging in never doubles a line. */
function mergeCarts(a: CartItem[], b: CartItem[]): CartItem[] {
  const map = new Map<string, CartItem>();
  for (const item of [...a, ...b]) {
    const existing = map.get(item.id);
    map.set(item.id, existing ? { ...existing, quantity: Math.max(existing.quantity, item.quantity) } : item);
  }
  return Array.from(map.values());
}

/** Take the lines of a paid order (its "variant:quantity" cart signature) out of the cart. */
function removeOrderedLines(items: CartItem[], signature: string): CartItem[] {
  const ordered = new Map<string, number>();
  for (const part of signature.split('|')) {
    const at = part.lastIndexOf(':');
    if (at > 0) ordered.set(part.slice(0, at), (ordered.get(part.slice(0, at)) ?? 0) + (parseInt(part.slice(at + 1), 10) || 0));
  }
  return items
    .map((item) => {
      const key = String(item.variantId ?? item.id);
      const paid = ordered.get(key) ?? 0;
      return paid > 0 ? { ...item, quantity: item.quantity - paid } : item;
    })
    .filter((item) => item.quantity > 0);
}

/** Don't ask the server about the same unpaid order more than once a minute. */
const PENDING_CHECK_INTERVAL_MS = 60_000;

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading: authLoading } = useAuth();
  const isCustomer = !!user && user.role === 'customer';
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<PromoCode | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [cartNotices, setCartNotices] = useState<string[]>([]);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const serverSyncReady = useRef(false);
  const itemsRef = useRef<CartItem[]>([]);
  itemsRef.current = items;

  const cartStorageKey = isCustomer ? `shopco_cart_user_${user!.id}` : 'shopco_cart_guest';

  const showToast = useCallback((title: string, message: string, image?: string, showCartAction = false) => {
    const id = Date.now().toString();
    setToast({ id, title, message, image, showCartAction });
    setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 2800);
  }, []);

  const hideToast = () => setToast(null);

  // Load the cart for the current identity. Signed-in customers get their saved server cart,
  // merged with anything they added as a guest on this device.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    serverSyncReady.current = false;
    setIsLoaded(false);

    (async () => {
      writeStorage('shopco_cart', null); // legacy key from the mock build
      const local = readJson<CartItem[]>(cartStorageKey, []);
      let next = Array.isArray(local) ? local : [];

      if (isCustomer) {
        const guest = readJson<CartItem[]>('shopco_cart_guest', []);
        next = mergeCarts(next, Array.isArray(guest) ? guest : []);
        try {
          const saved = await apiGetSavedCart();
          next = mergeCarts(saved.map(fromSavedLine), next);
          writeStorage('shopco_cart_guest', null);
          serverSyncReady.current = true;
        } catch {
          // Offline / API down: keep the local cart; it syncs on the next successful change.
        }
      }

      if (!cancelled) {
        setItems(next);
        setIsLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, isCustomer, cartStorageKey]);

  // Persist locally on every change; for customers also save to the account (debounced).
  useEffect(() => {
    if (!isLoaded) return;
    writeStorage(cartStorageKey, JSON.stringify(items));

    // Only write to the account once its saved cart was read, so an offline device never
    // overwrites a fuller cart saved from another device.
    if (!isCustomer || !serverSyncReady.current) return;
    const timer = setTimeout(() => {
      const lines = items
        .filter((i) => typeof i.variantId === 'number')
        .map((i) => ({ variant_id: i.variantId as number, quantity: i.quantity }));
      apiSaveCart(lines)
        .then(() => {
          serverSyncReady.current = true;
        })
        .catch(() => {
          // Saved locally; the next change retries.
        });
    }, 800);
    return () => clearTimeout(timer);
  }, [items, isLoaded, isCustomer, cartStorageKey]);

  // Restore a previously applied promo code (validated again before use).
  useEffect(() => {
    const code = readJson<string | null>(PROMO_STORAGE_KEY, null);
    if (code) {
      setAppliedPromo({ code, discountPercent: 0, description: '' });
    }
  }, []);

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.price * item.quantity, 0), [items]);

  // Re-validate the promo whenever the cart total changes; drop it with a notice if it no longer applies.
  const promoCode = appliedPromo?.code ?? null;
  useEffect(() => {
    if (!promoCode || !isLoaded) return;
    if (items.length === 0) return;
    const timer = setTimeout(async () => {
      try {
        const res = await apiValidatePromotion(promoCode, subtotal);
        if (res?.valid) {
          setAppliedPromo({
            code: res.code,
            discountPercent: res.discount_percent,
            description: res.description || `${res.discount_percent}% off`,
          });
        } else {
          throw new Error('Coupon is no longer valid.');
        }
      } catch (err: any) {
        setAppliedPromo(null);
        writeStorage(PROMO_STORAGE_KEY, null);
        setCartNotices((prev) => [...prev, `Promo code ${promoCode} was removed: ${err?.message || 'it is no longer valid.'}`]);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [promoCode, subtotal, isLoaded, items.length]);

  const addToCart = (product: Product, variant: ProductVariant, quantity: number = 1) => {
    const id = lineKey(variant.id);
    const cap = Math.min(MAX_QUANTITY_PER_LINE, variant.stock);
    if (cap <= 0) {
      showToast('Out of stock', `${product.name} (${variant.size} / ${variant.color.name}) is sold out.`);
      return;
    }

    const existing = itemsRef.current.find((i) => i.id === id);
    const newQuantity = Math.min(cap, (existing?.quantity ?? 0) + quantity);

    setItems((prev) => {
      const index = prev.findIndex((i) => i.id === id);
      const line: CartItem = {
        id,
        productId: product.id,
        variantId: variant.id,
        sku: variant.sku,
        name: product.name,
        slug: product.slug,
        price: variant.price,
        originalPrice: product.originalPrice,
        image: product.images[0] || PRODUCT_IMAGE_PLACEHOLDER,
        size: variant.size,
        color: variant.color,
        quantity: newQuantity,
        maxStock: variant.stock,
      };
      if (index > -1) {
        const updated = [...prev];
        updated[index] = { ...prev[index], ...line };
        return updated;
      }
      return [...prev, line];
    });

    const capped = (existing?.quantity ?? 0) + quantity > cap;
    showToast(
      capped ? 'Quantity limited' : 'Added to cart',
      capped
        ? `Only ${cap} of ${product.name} (${variant.size}) can be ordered.`
        : `${product.name} (${variant.size} / ${variant.color.name})`,
      product.images[0],
      true
    );
  };

  const removeFromCart = (cartItemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== cartItemId));
  };

  const updateQuantity = (cartItemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(cartItemId);
      return;
    }
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== cartItemId) return item;
        const cap = Math.min(MAX_QUANTITY_PER_LINE, item.maxStock ?? MAX_QUANTITY_PER_LINE);
        return { ...item, quantity: Math.max(1, Math.min(quantity, cap)) };
      })
    );
  };

  const clearCart = () => {
    setItems([]);
    setAppliedPromo(null);
    writeStorage(PROMO_STORAGE_KEY, null);
  };

  // An order placed from this cart can be paid away from the payment return page: a WhatsApp
  // transfer the store confirms later, or a gateway tab closed before it redirected back.
  // When this device sees that order paid, its items leave the cart (anything added since stays).
  const lastPendingCheck = useRef(0);
  const checkPendingOrder = useCallback(async () => {
    const pending = readPendingOrder();
    if (!pending || Date.now() - lastPendingCheck.current < PENDING_CHECK_INTERVAL_MS) return;
    lastPendingCheck.current = Date.now();
    try {
      const res = await apiVerifyPayment(pending.orderNumber, readGuestToken(pending.orderNumber));
      const orderStatus = String(res.order_status || '');
      if (res.status === 'successful' && orderStatus !== 'cancelled') {
        const remaining = removeOrderedLines(itemsRef.current, pending.cartSignature);
        setItems(remaining);
        if (remaining.length === 0) {
          setAppliedPromo(null);
          writeStorage(PROMO_STORAGE_KEY, null);
        }
        clearPendingOrder(pending.orderNumber);
      } else if (orderStatus === 'cancelled') {
        clearPendingOrder(pending.orderNumber);
      }
    } catch {
      // Offline or no access from this device: try again on the next visit.
    }
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    checkPendingOrder();
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkPendingOrder();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [isLoaded, checkPendingOrder]);

  const restoreItems = (newItems: CartItem[]) => {
    if (!Array.isArray(newItems) || newItems.length === 0) return;
    setItems((prev) => mergeCarts(prev, newItems));
  };

  const revalidateCart = useCallback(async () => {
    const current = itemsRef.current;
    if (current.length === 0) return;
    setIsRevalidating(true);
    const notices: string[] = [];

    try {
      // Legacy lines saved before variants were tracked: resolve the exact variant or drop them.
      const resolved: CartItem[] = [];
      for (const item of current) {
        if (typeof item.variantId === 'number') {
          resolved.push(item);
          continue;
        }
        try {
          const detail = await getProductDetail(item.productId);
          const match = detail.variants.find(
            (v) =>
              v.size.toLowerCase() === String(item.size).toLowerCase() &&
              v.color_name.toLowerCase() === item.color.name.toLowerCase()
          );
          if (match) {
            resolved.push({ ...item, id: lineKey(match.id), variantId: match.id, sku: match.sku });
          } else {
            notices.push(`${item.name} (${item.size} / ${item.color.name}) is no longer offered and was removed. Please choose another option.`);
          }
        } catch {
          notices.push(`${item.name} is no longer available and was removed from your cart.`);
        }
      }

      const { lines } = await apiCheckCartLines(resolved.map((i) => i.variantId as number));
      const byVariant = new Map(lines.map((l) => [l.variant_id, l]));

      const next: CartItem[] = [];
      for (const item of resolved) {
        const live = byVariant.get(item.variantId as number);
        if (!live || !live.available) {
          notices.push(`${item.name} (${item.size}) is no longer available and was removed.`);
          continue;
        }
        if (live.stock_quantity <= 0) {
          notices.push(`${item.name} (${item.size} / ${item.color.name}) sold out and was removed.`);
          continue;
        }
        let quantity = item.quantity;
        if (quantity > live.stock_quantity) {
          quantity = live.stock_quantity;
          notices.push(`Only ${live.stock_quantity} left of ${item.name} (${item.size}); quantity updated.`);
        }
        if (Math.abs(live.unit_price - item.price) >= 0.01) {
          notices.push(
            `${item.name} price ${live.unit_price > item.price ? 'increased' : 'dropped'} to ₦${live.unit_price.toLocaleString('en-NG')}.`
          );
        }
        next.push({
          ...item,
          name: live.product_name,
          slug: live.product_slug,
          price: live.unit_price,
          originalPrice: live.original_price ?? undefined,
          quantity: Math.min(quantity, MAX_QUANTITY_PER_LINE),
          maxStock: live.stock_quantity,
        });
      }

      setItems(mergeCarts([], next));
      if (notices.length > 0) {
        setCartNotices(notices);
      }
    } catch {
      // Network problem: keep the cart as-is; checkout still re-verifies everything server-side.
    } finally {
      setIsRevalidating(false);
    }
  }, []);

  // Check prices and stock once the cart has loaded.
  const revalidatedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!isLoaded || revalidatedFor.current === cartStorageKey) return;
    revalidatedFor.current = cartStorageKey;
    revalidateCart();
  }, [isLoaded, cartStorageKey, revalidateCart]);

  const applyPromoCode = async (code: string): Promise<{ success: boolean; message: string }> => {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      return { success: false, message: 'Please enter a coupon code.' };
    }

    try {
      const res = await apiValidatePromotion(cleanCode, subtotal);
      if (res && res.valid) {
        setAppliedPromo({
          code: res.code,
          discountPercent: res.discount_percent,
          description: res.description || `${res.discount_percent}% off`,
        });
        writeStorage(PROMO_STORAGE_KEY, JSON.stringify(res.code));
        showToast('Coupon applied', `${res.code} · ${res.discount_percent}% off`);
        return { success: true, message: `Promo code ${res.code} applied! (-${res.discount_percent}%)` };
      }
      return { success: false, message: 'Coupon code is invalid or deactivated.' };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Invalid or expired coupon code.' };
    }
  };

  const removePromoCode = () => {
    setAppliedPromo(null);
    writeStorage(PROMO_STORAGE_KEY, null);
  };

  const discountPercent = appliedPromo ? appliedPromo.discountPercent : 0;
  const discountAmount = subtotal > 0 ? Math.round((subtotal * discountPercent) / 100) : 0;
  const total = Math.max(0, subtotal - discountAmount);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        restoreItems,
        appliedPromo,
        applyPromoCode,
        removePromoCode,
        revalidateCart,
        isRevalidating,
        cartNotices,
        dismissCartNotices: () => setCartNotices([]),
        subtotal,
        discountAmount,
        total,
        totalQuantity,
        toast,
        hideToast,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
