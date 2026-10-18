'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useWishlist } from '@/context/WishlistContext';
import { formatPrice } from '@/lib/currency';
import { PRODUCT_IMAGE_PLACEHOLDER } from '@/lib/api-client';
import { Dialog } from '@/components/ui/Dialog';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, FavouriteIcon, ShoppingBag01Icon, Delete02Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';

export const WishlistDrawer: React.FC = () => {
  const { wishlist, isWishlistOpen, closeWishlist, removeFromWishlist } = useWishlist();

  return (
    <Dialog
      open={isWishlistOpen}
      onClose={closeWishlist}
      title="Your wishlist"
      placement="right"
      panelClassName="animate-in slide-in-from-right flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-100 p-6">
        <div className="flex items-center gap-2.5">
          <span className="text-red-600" aria-hidden="true">
            <HugeiconsIcon icon={FavouriteIcon} size={22} className="fill-current" />
          </span>
          <p className="text-xl font-bold text-black" aria-hidden="true">
            Your wishlist <span className="text-sm font-normal text-neutral-600">({wishlist.length})</span>
          </p>
        </div>
        <button
          type="button"
          onClick={closeWishlist}
          className="rounded-full p-2 text-neutral-600 transition-colors hover:text-black"
          aria-label="Close wishlist"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={20} />
        </button>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-6">
        {wishlist.length > 0 ? (
          <ul className="divide-y divide-neutral-100">
            {wishlist.map((product) => (
              <li key={product.id} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
                <Link
                  href={`/products/${product.slug}`}
                  onClick={closeWishlist}
                  className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#F0EEED]"
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <Image src={product.images[0] || PRODUCT_IMAGE_PLACEHOLDER} alt="" fill sizes="80px" className="object-cover" />
                </Link>

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/products/${product.slug}`}
                    onClick={closeWishlist}
                    className="block truncate text-sm font-bold text-black hover:underline"
                  >
                    {product.name}
                  </Link>
                  {(product.categoryName || product.category) && (
                    <p className="mt-0.5 text-xs capitalize text-neutral-600">{product.categoryName || product.category}</p>
                  )}
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-sm font-bold text-black">{formatPrice(product.price)}</span>
                    {product.originalPrice && product.originalPrice > product.price && (
                      <span className="text-xs text-neutral-600 line-through">
                        <span className="sr-only">Was </span>
                        {formatPrice(product.originalPrice)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-center gap-2">
                  <Link
                    href={`/products/${product.slug}`}
                    onClick={closeWishlist}
                    className="flex items-center gap-1 rounded-xl bg-black p-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-neutral-800"
                    aria-label={`Choose size and colour for ${product.name}`}
                  >
                    <HugeiconsIcon icon={ShoppingBag01Icon} size={14} />
                    <span>Choose</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeFromWishlist(product.id)}
                    className="p-1.5 text-neutral-600 transition-colors hover:text-red-700"
                    aria-label={`Remove ${product.name} from wishlist`}
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex h-full flex-col items-center justify-center py-16 text-center">
            <span className="mb-3 text-neutral-400" aria-hidden="true">
              <HugeiconsIcon icon={FavouriteIcon} size={48} />
            </span>
            <p className="mb-1 text-lg font-bold text-black">Your wishlist is empty</p>
            <p className="mb-6 max-w-xs text-sm text-neutral-600">Tap the heart on any product to save it here.</p>
            <Link
              href="/category"
              onClick={closeWishlist}
              className="rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-800"
            >
              Browse products
            </Link>
          </div>
        )}
      </div>

      {wishlist.length > 0 && (
        <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50/50 p-6">
          <Link href="/category" onClick={closeWishlist} className="flex items-center gap-1 text-sm font-semibold text-black hover:underline">
            <span>Continue shopping</span>
            <HugeiconsIcon icon={ArrowRight01Icon} size={14} />
          </Link>
          <span className="text-xs text-neutral-600">
            {wishlist.length} item{wishlist.length !== 1 ? 's' : ''} saved
          </span>
        </div>
      )}
    </Dialog>
  );
};
