'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { CartItemList } from '@/components/cart/CartItemList';
import { OrderSummary } from '@/components/cart/OrderSummary';
import { CheckoutModal } from '@/components/cart/CheckoutModal';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight01Icon } from '@hugeicons/core-free-icons';

export default function CartPage() {
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs sm:text-sm text-neutral-500 mb-6">
        <Link href="/" className="hover:text-black transition-colors">
          Home
        </Link>
        <HugeiconsIcon icon={ArrowRight01Icon} size={14} className="text-neutral-400" />
        <span className="text-black font-medium">Cart</span>
      </nav>

      {/* Main Title */}
      <h1 className="font-integral text-2xl sm:text-4xl text-black uppercase mb-6 sm:mb-8 font-black">
        YOUR CART
      </h1>

      {/* 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
        {/* Left Column: Line Items (7 cols on desktop) */}
        <div className="lg:col-span-7">
          <CartItemList />
        </div>

        {/* Right Column: Order Summary (5 cols on desktop) */}
        <div className="lg:col-span-5">
          <OrderSummary onCheckout={() => setIsCheckoutOpen(true)} />
        </div>
      </div>

      {/* Interactive Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
      />
    </div>
  );
}
