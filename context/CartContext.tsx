'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { CartItem, Product, ProductColor, PromoCode, SizeType } from '@/types';
import { PROMO_CODES } from '@/data/mockData';
import { apiValidatePromotion } from '@/lib/api-client';

interface ToastMessage {
  id: string;
  title: string;
  message: string;
  image?: string;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (product: Product, selectedColor: ProductColor, selectedSize: SizeType | string, quantity?: number) => void;
  removeFromCart: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  restoreItems: (newItems: CartItem[]) => void;
  appliedPromo: PromoCode | null;
  applyPromoCode: (code: string) => Promise<{ success: boolean; message: string }>;
  removePromoCode: () => void;
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  total: number;
  totalQuantity: number;
  toast: ToastMessage | null;
  hideToast: () => void;
}

import { useAuth } from '@/context/AuthContext';

const DEFAULT_ITEMS: CartItem[] = [];

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const [appliedPromo, setAppliedPromo] = useState<PromoCode | null>(null);

  const [toast, setToast] = useState<ToastMessage | null>(null);

  const cartStorageKey = user ? `shopco_cart_user_${user.id}` : 'shopco_cart_guest';

  // Load user-scoped cart from localStorage
  useEffect(() => {
    try {
      // Clean up legacy global mock cart key if still present
      localStorage.removeItem('shopco_cart');

      let saved = localStorage.getItem(cartStorageKey);

      // If user just logged in and has guest items, migrate them
      if (user) {
        const guestSaved = localStorage.getItem('shopco_cart_guest');
        if (guestSaved) {
          try {
            const guestItems = JSON.parse(guestSaved);
            if (Array.isArray(guestItems) && guestItems.length > 0) {
              const currentItems = saved ? JSON.parse(saved) : [];
              const combined = [...currentItems, ...guestItems];
              saved = JSON.stringify(combined);
              localStorage.setItem(cartStorageKey, saved);
              localStorage.removeItem('shopco_cart_guest');
            }
          } catch {
            // ignore JSON parse error
          }
        }
      }

      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setItems(parsed);
        } else {
          setItems([]);
        }
      } else {
        setItems([]);
      }
    } catch (e) {
      console.error('Failed to load cart from localStorage', e);
      setItems([]);
    } finally {
      setIsLoaded(true);
    }
  }, [cartStorageKey, user]);

  // Save to user-scoped localStorage whenever items change after initial load
  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem(cartStorageKey, JSON.stringify(items));
    } catch (e) {
      console.error('Failed to persist cart to localStorage', e);
    }
  }, [items, isLoaded, cartStorageKey]);

  const showToast = (title: string, message: string, image?: string) => {
    const id = Date.now().toString();
    setToast({ id, title, message, image });
    setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 2800);
  };

  const hideToast = () => setToast(null);

  const addToCart = (
    product: Product,
    selectedColor: ProductColor,
    selectedSize: SizeType | string,
    quantity: number = 1
  ) => {
    const cartItemId = `${product.id}-${selectedSize}-${selectedColor.name.replace(/\s+/g, '')}`;

    setItems((prevItems) => {
      const existingIndex = prevItems.findIndex((item) => item.id === cartItemId);
      if (existingIndex > -1) {
        const updated = [...prevItems];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + quantity,
        };
        return updated;
      } else {
        const newItem: CartItem = {
          id: cartItemId,
          productId: product.id,
          name: product.name,
          slug: product.slug,
          price: product.price,
          originalPrice: product.originalPrice,
          image: product.images[0],
          size: selectedSize,
          color: selectedColor,
          quantity,
        };
        return [...prevItems, newItem];
      }
    });

    showToast(
      'Added to cart',
      `${product.name} (${selectedSize})`,
      product.images[0]
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
      prev.map((item) => (item.id === cartItemId ? { ...item, quantity } : item))
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const restoreItems = (newItems: CartItem[]) => {
    if (!Array.isArray(newItems) || newItems.length === 0) return;
    setItems((prev) => {
      const existingMap = new Map(prev.map((i) => [i.id, i]));
      for (const it of newItems) {
        existingMap.set(it.id, it);
      }
      return Array.from(existingMap.values());
    });
  };

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discountPercent = appliedPromo ? appliedPromo.discountPercent : 0;
  const discountAmount = subtotal > 0 ? Math.round((subtotal * discountPercent) / 100) : 0;
  const deliveryFee = items.length > 0 ? 15 : 0;
  const total = Math.max(0, subtotal - discountAmount + deliveryFee);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  const applyPromoCode = async (code: string): Promise<{ success: boolean; message: string }> => {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      return { success: false, message: 'Please enter a coupon code.' };
    }

    try {
      const res = await apiValidatePromotion(cleanCode, subtotal);
      if (res && res.valid) {
        const promo: PromoCode = {
          code: res.code,
          discountPercent: res.discount_percent,
          description: res.description || `${res.discount_percent}% off`,
        };
        setAppliedPromo(promo);
        showToast('Coupon applied', `${res.code} · ${res.discount_percent}% off`);
        return { success: true, message: `Promo code ${res.code} applied! (-${res.discount_percent}%)` };
      } else {
        return { success: false, message: 'Coupon code is invalid or deactivated.' };
      }
    } catch (err: any) {
      return { success: false, message: err?.message || 'Invalid or expired coupon code.' };
    }
  };

  const removePromoCode = () => {
    setAppliedPromo(null);
  };

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
        subtotal,
        discountAmount,
        deliveryFee,
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
