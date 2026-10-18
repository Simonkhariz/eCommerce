'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useCart, MAX_QUANTITY_PER_LINE } from '@/context/CartContext';
import { HugeiconsIcon } from '@hugeicons/react';
import { Delete02Icon, MinusSignIcon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { formatPrice } from '@/lib/currency';

export const CartItemList: React.FC = () => {
  const { items, updateQuantity, removeFromCart, cartNotices, dismissCartNotices } = useCart();

  const notices = cartNotices.length > 0 && (
    <div role="status" className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">Your cart was updated</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {cartNotices.map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
          </ul>
        </div>
        <button type="button" onClick={dismissCartNotices} className="shrink-0 text-sm font-semibold underline hover:no-underline">
          Dismiss
        </button>
      </div>
    </div>
  );

  if (items.length === 0) {
    return (
      <div>
        {notices}
        <div className="border border-neutral-200 rounded-3xl p-12 text-center bg-white">
          <h2 className="font-bold text-xl text-black mb-2">Your cart is empty</h2>
          <p className="text-sm text-neutral-600 mb-6 max-w-sm mx-auto">Explore our latest collections and find clothes that match your style.</p>
          <Link
            href="/category"
            className="inline-block bg-black text-white px-8 py-3.5 rounded-full text-sm font-semibold hover:bg-neutral-800 transition-colors shadow-md"
          >
            Start shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {notices}
      <ul aria-label="Items in your cart" className="border border-neutral-200 rounded-3xl p-4 sm:p-6 bg-white divide-y divide-neutral-200">
        {items.map((item) => {
          const maxQty = Math.min(MAX_QUANTITY_PER_LINE, item.maxStock ?? MAX_QUANTITY_PER_LINE);
          const atMax = item.quantity >= maxQty;
          return (
            <li key={item.id} className="py-4 sm:py-6 first:pt-0 last:pb-0 flex gap-4 sm:gap-6 items-start">
              {/* The image repeats the product link below, so it is hidden from keyboard and screen readers. */}
              <Link
                href={`/products/${item.slug}`}
                tabIndex={-1}
                aria-hidden="true"
                className="relative w-24 h-24 sm:w-32 sm:h-32 bg-[#F0EEED] rounded-2xl overflow-hidden shrink-0"
              >
                <Image src={item.image} alt="" fill sizes="128px" className="object-cover hover:scale-105 transition-transform" />
              </Link>

              <div className="flex-1 min-w-0 flex flex-col justify-between min-h-24 sm:min-h-32 gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/products/${item.slug}`}
                      className="font-bold text-base sm:text-lg text-black hover:text-neutral-700 transition-colors line-clamp-1"
                    >
                      {item.name}
                    </Link>
                    <p className="text-sm text-neutral-600 mt-0.5">
                      <span className="text-black font-medium">Size:</span> {item.size}
                    </p>
                    <p className="text-sm text-neutral-600">
                      <span className="text-black font-medium">Colour:</span> {item.color.name}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeFromCart(item.id)}
                    className="text-red-600 hover:text-red-800 p-1 transition-colors"
                    aria-label={`Remove ${item.name} (${item.size}, ${item.color.name}) from cart`}
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={20} aria-hidden="true" />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3 mt-auto">
                  <div className="min-w-0">
                    <span className="font-bold text-lg sm:text-xl text-black">{formatPrice(item.price)}</span>
                    {item.quantity > 1 && (
                      <span className="block text-xs text-neutral-600">{formatPrice(item.price * item.quantity)} for {item.quantity}</span>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <div
                      role="group"
                      aria-label={`Quantity of ${item.name}`}
                      className="flex items-center bg-[#F0F0F0] rounded-full px-3 sm:px-4 py-1.5 sm:py-2 gap-3 sm:gap-4"
                    >
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="text-black hover:opacity-75"
                        aria-label={item.quantity <= 1 ? `Remove ${item.name} from cart` : `Decrease quantity of ${item.name}`}
                      >
                        <HugeiconsIcon icon={MinusSignIcon} size={14} aria-hidden="true" />
                      </button>
                      <span className="font-bold text-sm text-black min-w-[1rem] text-center" aria-live="polite" aria-atomic="true">
                        <span className="sr-only">Quantity </span>
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        disabled={atMax}
                        className="text-black hover:opacity-75 disabled:opacity-30"
                        aria-label={`Increase quantity of ${item.name}`}
                      >
                        <HugeiconsIcon icon={PlusSignIcon} size={14} aria-hidden="true" />
                      </button>
                    </div>
                    {typeof item.maxStock === 'number' && item.maxStock <= 5 ? (
                      <span className="text-xs text-amber-800">Only {item.maxStock} left</span>
                    ) : atMax ? (
                      <span className="text-xs text-neutral-600">Maximum {maxQty} per order</span>
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
