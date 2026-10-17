'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { CartItemList } from '@/components/cart/CartItemList';
import { OrderSummary } from '@/components/cart/OrderSummary';
import { CheckoutModal } from '@/components/cart/CheckoutModal';
import { useCart } from '@/context/CartContext';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight01Icon } from '@hugeicons/core-free-icons';

export default function CartPage() {
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const { items, revalidateCart, isRevalidating } = useCart();

  // Confirm current prices and stock whenever the cart page is opened.
  useEffect(() => {
    revalidateCart();
  }, [revalidateCart]);

  const handleCheckout = async () => {
    await revalidateCart();
    setIsCheckoutOpen(true);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs sm:text-sm text-neutral-600 mb-6">
        <Link href="/" className="hover:text-black transition-colors">
          Home
        </Link>
        <HugeiconsIcon icon={ArrowRight01Icon} size={14} className="text-neutral-400" />
        <span className="text-black font-medium" aria-current="page">Cart</span>
      </nav>

      <h1 className="font-integral text-2xl sm:text-4xl text-black uppercase mb-6 sm:mb-8 font-black">
        YOUR CART
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
        <div className="lg:col-span-7">
          <CartItemList />
          {isRevalidating && items.length > 0 && (
            <p className="mt-3 text-xs text-neutral-600" role="status">
              Checking current prices and stock…
            </p>
          )}
        </div>

        <div className="lg:col-span-5">
          <OrderSummary onCheckout={handleCheckout} />
        </div>
      </div>

      <CheckoutModal isOpen={isCheckoutOpen} onClose={() => setIsCheckoutOpen(false)} />
    </div>
  );
}
