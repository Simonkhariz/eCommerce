'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import { HugeiconsIcon } from '@hugeicons/react';
import { Delete02Icon, MinusSignIcon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { formatPrice } from '@/lib/currency';

export const CartItemList: React.FC = () => {
  const { items, updateQuantity, removeFromCart } = useCart();

  if (items.length === 0) {
    return (
      <div className="border border-neutral-200 rounded-3xl p-12 text-center bg-white">
        <h3 className="font-bold text-xl text-black mb-2">Your cart is empty</h3>
        <p className="text-sm text-neutral-500 mb-6 max-w-sm mx-auto">
          Explore our latest collections and find clothes that match your style.
        </p>
        <Link
          href="/category"
          className="inline-block bg-black text-white px-8 py-3.5 rounded-full text-sm font-semibold hover:bg-neutral-800 transition-colors shadow-md"
        >
          Start Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="border border-neutral-200 rounded-3xl p-4 sm:p-6 bg-white divide-y divide-neutral-200">
      {items.map((item) => (
        <div
          key={item.id}
          className="py-4 sm:py-6 first:pt-0 last:pb-0 flex gap-4 sm:gap-6 items-start"
        >
          {/* Item Thumbnail */}
          <Link
            href={`/products/${item.slug}`}
            className="relative w-24 h-24 sm:w-32 sm:h-32 bg-[#F0EEED] rounded-2xl overflow-hidden shrink-0"
          >
            <Image
              src={item.image}
              alt={item.name}
              fill
              sizes="128px"
              className="object-cover hover:scale-105 transition-transform"
            />
          </Link>

          {/* Item Details */}
          <div className="flex-1 min-w-0 flex flex-col justify-between h-24 sm:h-32">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link
                  href={`/products/${item.slug}`}
                  className="font-bold text-base sm:text-lg text-black hover:text-neutral-700 transition-colors line-clamp-1"
                >
                  {item.name}
                </Link>
                <p className="text-xs sm:text-sm text-neutral-600 mt-0.5">
                  <span className="text-black font-medium">Size:</span> {item.size}
                </p>
                <p className="text-xs sm:text-sm text-neutral-600">
                  <span className="text-black font-medium">Color:</span> {item.color.name}
                </p>
              </div>

              {/* Delete / Remove Item Button */}
              <button
                onClick={() => removeFromCart(item.id)}
                className="text-red-500 hover:text-red-700 p-1 transition-colors"
                aria-label={`Remove ${item.name} from cart`}
              >
                <HugeiconsIcon icon={Delete02Icon} size={20} />
              </button>
            </div>

            {/* Price & Quantity Stepper Row */}
            <div className="flex items-center justify-between mt-auto">
              <span className="font-bold text-lg sm:text-xl text-black">
                {formatPrice(item.price)}
              </span>

              <div className="flex items-center bg-[#F0F0F0] rounded-full px-3 sm:px-4 py-1.5 sm:py-2 gap-3 sm:gap-4">
                <button
                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                  className="text-black hover:opacity-75"
                  aria-label="Decrease quantity"
                >
                  <HugeiconsIcon icon={MinusSignIcon} size={14} />
                </button>
                <span className="font-bold text-xs sm:text-sm text-black min-w-[1rem] text-center">
                  {item.quantity}
                </span>
                <button
                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                  className="text-black hover:opacity-75"
                  aria-label="Increase quantity"
                >
                  <HugeiconsIcon icon={PlusSignIcon} size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
