'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Product } from '@/types';
import { PRODUCTS } from '@/data/mockData';

import { useAuth } from '@/context/AuthContext';

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

export const WishlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [wishlist, setWishlist] = useState<Product[]>([]);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  const wishlistStorageKey = user ? `shopco_wishlist_user_${user.id}` : 'shopco_wishlist_guest';

  useEffect(() => {
    try {
      // Clear legacy mock wishlist key
      localStorage.removeItem('shop_co_wishlist');

      const stored = localStorage.getItem(wishlistStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        setWishlist(Array.isArray(parsed) ? parsed : []);
      } else {
        setWishlist([]);
      }
    } catch {
      setWishlist([]);
    }
    setIsHydrated(true);
  }, [wishlistStorageKey, user]);

  useEffect(() => {
    if (isHydrated) {
      try {
        localStorage.setItem(wishlistStorageKey, JSON.stringify(wishlist));
      } catch {
        // ignore storage errors
      }
    }
  }, [wishlist, isHydrated, wishlistStorageKey]);

  const toggleWishlist = (product: Product) => {
    setWishlist((prev) => {
      const exists = prev.some((p) => p.id === product.id);
      if (exists) {
        return prev.filter((p) => p.id !== product.id);
      } else {
        return [...prev, product];
      }
    });
  };

  const isInWishlist = (productId: string) => {
    return wishlist.some((p) => p.id === productId);
  };

  const removeFromWishlist = (productId: string) => {
    setWishlist((prev) => prev.filter((p) => p.id !== productId));
  };

  const clearWishlist = () => {
    setWishlist([]);
  };

  const openWishlist = () => setIsWishlistOpen(true);
  const closeWishlist = () => setIsWishlistOpen(false);

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
        openWishlist,
        closeWishlist,
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
