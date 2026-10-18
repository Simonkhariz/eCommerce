'use client';

import React from 'react';
import { Product } from '@/types';
import { formatPrice } from '@/lib/currency';
import { HugeiconsIcon } from '@hugeicons/react';
import { ShoppingBag01Icon, FireIcon } from '@hugeicons/core-free-icons';

interface StickyMobileBarProps {
  product: Product;
  /** Price of the selected variant. */
  price: number;
  /** e.g. "Large • Black", or a prompt to choose options. */
  selectionLabel: string;
  canPurchase: boolean;
  onAddToCart: () => void;
  onBuyNow: () => void;
}

export const StickyMobileBar: React.FC<StickyMobileBarProps> = ({
  product,
  price,
  selectionLabel,
  canPurchase,
  onAddToCart,
  onBuyNow,
}) => {
  return (
    <div role="region" aria-label="Quick purchase" className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-neutral-200 p-3 px-4 shadow-2xl flex items-center justify-between gap-3">
      <div className="flex flex-col min-w-0">
        <span className="text-xs text-neutral-600 font-medium truncate max-w-[140px]">{selectionLabel}</span>
        <div className="flex items-baseline gap-1.5">
          <span className="font-bold text-lg text-black">{formatPrice(price)}</span>
          {product.originalPrice && product.originalPrice > price && (
            <span className="text-xs text-neutral-600 line-through">
              <span className="sr-only">Was </span>
              {formatPrice(product.originalPrice)}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-1 max-w-[240px]">
        <button
          type="button"
          onClick={onAddToCart}
          disabled={!canPurchase}
          className="flex-1 bg-black text-white active:bg-neutral-800 text-xs font-bold py-3 rounded-full flex items-center justify-center gap-1.5 shadow-md disabled:bg-neutral-300 disabled:text-neutral-700 disabled:shadow-none"
        >
          <HugeiconsIcon icon={ShoppingBag01Icon} size={14} aria-hidden="true" />
          <span>{canPurchase ? 'Add to Cart' : 'Unavailable'}</span>
        </button>
        <button
          type="button"
          onClick={onBuyNow}
          disabled={!canPurchase}
          className="bg-[#F0F0F0] active:bg-neutral-200 text-black text-xs font-bold p-3 rounded-full flex items-center justify-center shadow-sm disabled:opacity-50"
          title="Buy now"
          aria-label={canPurchase ? `Buy ${product.name} now` : 'Buy now (unavailable)'}
        >
          <HugeiconsIcon icon={FireIcon} size={14} className="text-red-500 fill-current" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
