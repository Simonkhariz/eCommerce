'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useWishlist } from '@/context/WishlistContext';
import { formatPrice } from '@/lib/currency';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Cancel01Icon,
  FavouriteIcon,
  ShoppingBag01Icon,
  Delete02Icon,
  ArrowRight01Icon,
} from '@hugeicons/core-free-icons';

export const WishlistDrawer: React.FC = () => {
  const { wishlist, isWishlistOpen, closeWishlist, removeFromWishlist } = useWishlist();

  if (!isWishlistOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={closeWishlist}
      />

      {/* Drawer Panel */}
      <div className="fixed inset-y-0 right-0 max-w-md w-full bg-white shadow-2xl flex flex-col justify-between z-10 animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-6 border-b border-neutral-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-red-500">
              <HugeiconsIcon icon={FavouriteIcon} size={22} className="fill-current" />
            </span>
            <h3 className="font-bold text-xl text-black">
              Your Wishlist <span className="text-sm font-normal text-neutral-500">({wishlist.length})</span>
            </h3>
          </div>
          <button
            onClick={closeWishlist}
            className="p-2 text-neutral-400 hover:text-black rounded-full transition-colors"
            aria-label="Close wishlist"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 divide-y divide-neutral-100">
          {wishlist.length > 0 ? (
            wishlist.map((product) => (
              <div key={product.id} className="py-4 first:pt-0 last:pb-0 flex gap-4 items-center">
                {/* Thumbnail */}
                <Link
                  href={`/products/${product.slug}`}
                  onClick={closeWishlist}
                  className="relative w-20 h-20 bg-[#F0EEED] rounded-xl overflow-hidden shrink-0"
                >
                  <Image
                    src={product.images[0]}
                    alt={product.name}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </Link>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/products/${product.slug}`}
                    onClick={closeWishlist}
                    className="font-bold text-sm text-black hover:underline truncate block"
                  >
                    {product.name}
                  </Link>
                  <p className="text-xs text-neutral-500 capitalize mt-0.5">
                    {product.category}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="font-bold text-sm text-black">{formatPrice(product.price)}</span>
                    {product.originalPrice && product.originalPrice > product.price && (
                      <span className="text-xs text-neutral-500 line-through">
                        {formatPrice(product.originalPrice)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 shrink-0">
                  <Link
                    href={`/products/${product.slug}`}
                    onClick={closeWishlist}
                    className="bg-black text-white hover:bg-neutral-800 p-2 rounded-xl text-xs font-semibold flex items-center gap-1 shadow-sm transition-colors"
                    aria-label={`Choose size and colour for ${product.name}`}
                  >
                    <HugeiconsIcon icon={ShoppingBag01Icon} size={14} />
                    <span>Choose</span>
                  </Link>
                  <button
                    onClick={() => removeFromWishlist(product.id)}
                    className="text-neutral-400 hover:text-red-500 p-1.5 self-center transition-colors"
                    title="Remove"
                    aria-label="Remove item"
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={16} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center py-16">
              <span className="text-neutral-300 mb-3">
                <HugeiconsIcon icon={FavouriteIcon} size={48} />
              </span>
              <h4 className="font-bold text-lg text-black mb-1">Your wishlist is empty</h4>
              <p className="text-xs text-neutral-500 max-w-xs mb-6">
                Explore our catalog and click the heart icon on any product to save your favorites here.
              </p>
              <Link
                href="/category"
                onClick={closeWishlist}
                className="bg-black text-white text-xs font-semibold px-6 py-3 rounded-full hover:bg-neutral-800 transition-colors"
              >
                Discover Collections
              </Link>
            </div>
          )}
        </div>

        {/* Footer */}
        {wishlist.length > 0 && (
          <div className="p-6 border-t border-neutral-100 bg-neutral-50/50 flex items-center justify-between">
            <Link
              href="/category"
              onClick={closeWishlist}
              className="text-xs font-semibold text-black hover:underline flex items-center gap-1"
            >
              <span>Continue Shopping</span>
              <HugeiconsIcon icon={ArrowRight01Icon} size={14} />
            </Link>
            <span className="text-xs text-neutral-500">
              {wishlist.length} item{wishlist.length !== 1 ? 's' : ''} saved
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
