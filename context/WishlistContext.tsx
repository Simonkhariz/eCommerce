'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Product } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { apiGetSavedWishlist, apiSaveWishlist, mapApiProductToStorefront } from '@/lib/api-client';

interface WishlistContextType {
  wishlist: Product[];
  toggleWishlist: (product: Product) => void;
  isInWishlist: (productId: string) => boolean;
  removeFromWishlist: (productId: string) => void;
  clearWishlist: () => void;
  wishlistCount: number;
  isWishlistOpen: boolean;
  openWishlist: () => void;
  closeWishlist: () => void;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

function readLocal(key: string): Product[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(key: string, value: Product[] | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the wishlist still works for this visit.
  }
}

export const WishlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading: authLoading } = useAuth();
  const isCustomer = !!user && user.role === 'customer';
  const [wishlist, setWishlist] = useState<Product[]>([]);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const serverReady = useRef(false);

  const wishlistStorageKey = isCustomer ? `shopco_wishlist_user_${user!.id}` : 'shopco_wishlist_guest';

  // Load: guests use this device; customers get their saved account wishlist merged with
  // anything saved as a guest here. Saved products come back with current prices.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    serverReady.current = false;
    setIsHydrated(false);

    (async () => {
      writeLocal('shop_co_wishlist', null); // legacy key from the mock build
      let next = readLocal(wishlistStorageKey);

      if (isCustomer) {
        const guest = readLocal('shopco_wishlist_guest');
        try {
          const saved = await apiGetSavedWishlist();
          const fresh = saved.products.map(mapApiProductToStorefront);
          const byId = new Map<string, Product>();
          for (const p of [...next, ...guest]) byId.set(p.id, p);
          for (const p of fresh) byId.set(p.id, p); // server copy has live prices
          next = Array.from(byId.values());
          writeLocal('shopco_wishlist_guest', null);
          serverReady.current = true;
        } catch {
          next = [...next, ...guest.filter((g) => !next.some((p) => p.id === g.id))];
        }
      }

      if (!cancelled) {
        setWishlist(next);
        setIsHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, isCustomer, wishlistStorageKey]);

  useEffect(() => {
    if (!isHydrated) return;
    writeLocal(wishlistStorageKey, wishlist);

    if (!isCustomer || !serverReady.current) return;
    const timer = setTimeout(() => {
      apiSaveWishlist(wishlist.map((p) => Number(p.id)).filter((id) => id > 0)).catch(() => {
        // Saved locally; the next change retries.
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [wishlist, isHydrated, isCustomer, wishlistStorageKey]);

  const toggleWishlist = (product: Product) => {
    setWishlist((prev) =>
      prev.some((p) => p.id === product.id) ? prev.filter((p) => p.id !== product.id) : [...prev, product]
    );
  };

  const isInWishlist = (productId: string) => wishlist.some((p) => p.id === productId);

  const removeFromWishlist = (productId: string) => {
    setWishlist((prev) => prev.filter((p) => p.id !== productId));
  };

  const clearWishlist = () => setWishlist([]);

  return (
    <WishlistContext.Provider
      value={{
        wishlist,
        toggleWishlist,
        isInWishlist,
        removeFromWishlist,
        clearWishlist,
        wishlistCount: wishlist.length,
        isWishlistOpen,
        openWishlist: () => setIsWishlistOpen(true),
        closeWishlist: () => setIsWishlistOpen(false),
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = (): WishlistContextType => {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error('useWishlist must be used within a WishlistProvider');
  }
  return context;
};
