'use client';

import React from 'react';
import { ProductColor, SizeType } from '@/types';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Tick02Icon,
  MinusSignIcon,
  PlusSignIcon,
  ShoppingBag01Icon,
  FireIcon,
  FavouriteIcon,
} from '@hugeicons/core-free-icons';

interface VariantSelectorProps {
  colors: ProductColor[];
  sizes: (SizeType | string)[];
  selectedColor: ProductColor;
  onSelectColor: (color: ProductColor) => void;
  selectedSize: SizeType | string;
  onSelectSize: (size: SizeType | string) => void;
  quantity: number;
  onQuantityChange: (q: number) => void;
  onAddToCart: () => void;
  onBuyNow: () => void;
  isWishlisted?: boolean;
  onToggleWishlist?: () => void;
}

export const VariantSelector: React.FC<VariantSelectorProps> = ({
  colors,
  sizes,
  selectedColor,
  onSelectColor,
  selectedSize,
  onSelectSize,
  quantity,
  onQuantityChange,
  onAddToCart,
  onBuyNow,
  isWishlisted = false,
  onToggleWishlist,
}) => {
  return (
    <div className="space-y-6">
      {/* 1. Color Swatches */}
      <div className="pb-6 border-b border-neutral-200">
        <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider block mb-3">
          Select Colors:{' '}
          <span className="text-black font-bold normal-case">
            {selectedColor.name}
          </span>
        </span>
        <div className="flex items-center gap-3">
          {colors.map((color) => {
            const isSelected = selectedColor.name === color.name;
            const isWhite = color.hex.toLowerCase() === '#ffffff';
            return (
              <button
                key={color.name}
                onClick={() => onSelectColor(color)}
                style={{ backgroundColor: color.hex }}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:scale-105 shadow-sm ${
                  isWhite ? 'border border-neutral-300' : ''
                } ${isSelected ? 'ring-2 ring-black ring-offset-2' : ''}`}
                title={color.name}
                aria-label={`Select color ${color.name}`}
              >
                {isSelected && (
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    size={16}
                    className={isWhite ? 'text-black' : 'text-white'}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Size Selector (Small, Medium, Large, X-Large, etc.) */}
      <div className="pb-6 border-b border-neutral-200">
        <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider block mb-3">
          Choose Size:{' '}
          <span className="text-black font-bold normal-case">
            {selectedSize}
          </span>
        </span>
        <div className="flex flex-wrap gap-2.5 sm:gap-3">
          {sizes.map((size) => {
            const isSelected = selectedSize === size;
            return (
              <button
                key={size}
                onClick={() => onSelectSize(size)}
                className={`px-6 py-3 rounded-full text-xs sm:text-sm font-semibold transition-colors ${
                  isSelected
                    ? 'bg-black text-white shadow-sm'
                    : 'bg-[#F0F0F0] text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {size}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Quantity Stepper & Desktop Action CTAs */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Quantity Stepper (- 1 +) */}
          <div className="flex items-center bg-[#F0F0F0] rounded-full px-4 py-3.5 gap-5 shrink-0">
            <button
              onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
              className="text-black hover:opacity-75 p-0.5"
              aria-label="Decrease quantity"
            >
              <HugeiconsIcon icon={MinusSignIcon} size={16} />
            </button>
            <span className="font-bold text-sm text-black min-w-[1.2rem] text-center">
              {quantity}
            </span>
            <button
              onClick={() => onQuantityChange(quantity + 1)}
              className="text-black hover:opacity-75 p-0.5"
              aria-label="Increase quantity"
            >
              <HugeiconsIcon icon={PlusSignIcon} size={16} />
            </button>
          </div>

          {/* Add to Cart Button */}
          <button
            onClick={onAddToCart}
            className="flex-1 bg-black text-white hover:bg-neutral-800 font-semibold py-4 rounded-full transition-all shadow-lg flex items-center justify-center gap-2 text-sm sm:text-base"
          >
            <HugeiconsIcon icon={ShoppingBag01Icon} size={20} />
            <span>Add to Cart</span>
          </button>

          {/* Wishlist Heart Button on PDP */}
          {onToggleWishlist && (
            <button
              onClick={onToggleWishlist}
              className={`p-4 rounded-full border transition-all shrink-0 ${
                isWishlisted
                  ? 'border-red-200 bg-red-50 text-red-500 shadow-sm'
                  : 'border-neutral-200 hover:bg-neutral-50 text-neutral-500 hover:text-black'
              }`}
              title={isWishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
              aria-label={isWishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
            >
              <HugeiconsIcon
                icon={FavouriteIcon}
                size={20}
                className={isWishlisted ? 'fill-current text-red-500' : ''}
              />
            </button>
          )}
        </div>

        {/* Instant Buy Now Button */}
        <button
          onClick={onBuyNow}
          className="w-full bg-[#F0F0F0] hover:bg-neutral-200 text-black font-semibold py-3.5 rounded-full transition-colors flex items-center justify-center gap-2 text-sm"
        >
          <HugeiconsIcon icon={FireIcon} size={16} className="text-red-500 fill-current" />
          <span>Buy Now (Express)</span>
        </button>
      </div>
    </div>
  );
};
