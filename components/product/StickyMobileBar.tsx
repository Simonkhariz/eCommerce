'use client';

import React from 'react';
import { Product, ProductColor, SizeType } from '@/types';
import { HugeiconsIcon } from '@hugeicons/react';
import { ShoppingBag01Icon, FireIcon } from '@hugeicons/core-free-icons';

interface StickyMobileBarProps {
  product: Product;
  selectedColor: ProductColor;
  selectedSize: SizeType | string;
  onAddToCart: () => void;
  onBuyNow: () => void;
}

export const StickyMobileBar: React.FC<StickyMobileBarProps> = ({
  product,
  selectedColor,
  selectedSize,
  onAddToCart,
  onBuyNow,
}) => {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-neutral-200 p-3 px-4 shadow-2xl flex items-center justify-between gap-3 animate-in slide-in-from-bottom">
      <div className="flex flex-col">
        <span className="text-[10px] text-neutral-500 font-medium truncate max-w-[120px]">
          {selectedSize} • {selectedColor.name}
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="font-bold text-lg text-black">${product.price}</span>
          {product.originalPrice && (
            <span className="text-xs text-neutral-400 line-through">
              ${product.originalPrice}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-1 max-w-[240px]">
        <button
          onClick={onAddToCart}
          className="flex-1 bg-black text-white active:bg-neutral-800 text-xs font-bold py-3 rounded-full flex items-center justify-center gap-1.5 shadow-md"
        >
          <HugeiconsIcon icon={ShoppingBag01Icon} size={14} />
          <span>Add to Cart</span>
        </button>
        <button
          onClick={onBuyNow}
          className="bg-[#F0F0F0] active:bg-neutral-200 text-black text-xs font-bold p-3 rounded-full flex items-center justify-center shadow-sm"
          title="Buy Now"
          aria-label="Buy Now"
        >
          <HugeiconsIcon icon={FireIcon} size={14} className="text-red-500 fill-current" />
        </button>
      </div>
    </div>
  );
};
