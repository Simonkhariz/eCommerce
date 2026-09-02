'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { CartItem, Product, ProductColor, PromoCode, SizeType } from '@/types';
import { PROMO_CODES } from '@/data/mockData';

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
  appliedPromo: PromoCode | null;
  applyPromoCode: (code: string) => { success: boolean; message: string };
  removePromoCode: () => void;
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  total: number;
  totalQuantity: number;
  toast: ToastMessage | null;
  hideToast: () => void;
}

const DEFAULT_ITEMS: CartItem[] = [
  {
    id: 'gradient-graphic-tshirt-Large-White',
    productId: 'gradient-graphic-tshirt',
    name: 'Gradient Graphic T-shirt',
    slug: 'gradient-graphic-tshirt',
    price: 145,
    originalPrice: 242,
    image: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=600&q=80',
    size: 'Large',
    color: { name: 'White', hex: '#FFFFFF' },
    quantity: 1,
  },
  {
    id: 'checkered-shirt-Medium-Red',
    productId: 'checkered-shirt',
    name: 'Checkered Shirt',
    slug: 'checkered-shirt',
    price: 180,
    image: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=600&q=80',
    size: 'Medium',
    color: { name: 'Red', hex: '#B91C1C' },
    quantity: 1,
  },
  {
    id: 'skinny-fit-jeans-Large-Blue',
    productId: 'skinny-fit-jeans',
    name: 'Skinny Fit Jeans',
    slug: 'skinny-fit-jeans',
    price: 240,
    originalPrice: 260,
    image: 'https://images.unsplash.com/photo-1542272604-780c96856592?auto=format&fit=crop&w=600&q=80',
    size: 'Large',
    color: { name: 'Blue', hex: '#2563EB' },
    quantity: 1,
  },
];

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(DEFAULT_ITEMS);
  const [isLoaded, setIsLoaded] = useState(false);

  const [appliedPromo, setAppliedPromo] = useState<PromoCode | null>({
    code: 'SHOP20',
    discountPercent: 20,
    description: '20% off for new customers',
  });

  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Load from localStorage on client mount only
  useEffect(() => {
    try {
      const saved = localStorage.getItem('shopco_cart');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setItems(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to load cart from localStorage', e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save to localStorage whenever items change after initial load
  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem('shopco_cart', JSON.stringify(items));
    } catch (e) {
      console.error('Failed to persist cart to localStorage', e);
    }
  }, [items, isLoaded]);

  const showToast = (title: string, message: string, image?: string) => {
    const id = Date.now().toString();
    setToast({ id, title, message, image });
    setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 4000);
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
      'Added to Cart!',
      `${quantity}x ${product.name} (${selectedSize}, ${selectedColor.name})`,
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

  const applyPromoCode = (code: string) => {
    const cleanCode = code.trim().toUpperCase();
    const match = PROMO_CODES.find((p) => p.code.toUpperCase() === cleanCode);
    if (match) {
      setAppliedPromo(match);
      showToast('Promo Code Applied!', `${match.code} applied: ${match.discountPercent}% discount!`);
      return { success: true, message: `Promo code ${match.code} applied!` };
    } else {
      return { success: false, message: 'Invalid promo code. Try PANTO10 or SHOP20' };
    }
  };

  const removePromoCode = () => {
    setAppliedPromo(null);
  };

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discountPercent = appliedPromo ? appliedPromo.discountPercent : 0;
  const discountAmount = subtotal > 0 ? Math.round((subtotal * discountPercent) / 100) : 0;
  const deliveryFee = items.length > 0 ? 15 : 0;
  const total = Math.max(0, subtotal - discountAmount + deliveryFee);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
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
