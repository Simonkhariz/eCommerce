'use client';

import React from 'react';
import { ProductColor } from '@/types';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Tick02Icon,
  MinusSignIcon,
  PlusSignIcon,
  ShoppingBag01Icon,
  FireIcon,
  FavouriteIcon,
} from '@hugeicons/core-free-icons';

/** 'available' = in stock, 'sold-out' = offered but no stock, 'unavailable' = not offered in this colour. */
export type OptionState = 'available' | 'sold-out' | 'unavailable';

interface VariantSelectorProps {
  colors: ProductColor[];
  sizes: string[];
  selectedColor: ProductColor | null;
  onSelectColor: (color: ProductColor) => void;
  selectedSize: string | null;
  onSelectSize: (size: string) => void;
  /** Availability of each size for the selected colour. */
  sizeStates: Record<string, OptionState>;
  /** Whether each colour has any size in stock. */
  colorInStock: Record<string, boolean>;
  quantity: number;
  maxQuantity: number;
  onQuantityChange: (q: number) => void;
  canPurchase: boolean;
  /** Short stock line under the options, e.g. "Only 3 left" or "Sold out in this size". */
  stockMessage?: string | null;
  onAddToCart: () => void;
  onBuyNow: () => void;
  isWishlisted?: boolean;
  onToggleWishlist?: () => void;
}


/** Next radio index for arrow / Home / End keys, skipping options that cannot be chosen. */
function nextIndex(e: React.KeyboardEvent, index: number, length: number, selectable: (i: number) => boolean): number | null {
  const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
  if (e.key === 'Home' || e.key === 'End') {
    const order = Array.from({ length }, (_, i) => (e.key === 'Home' ? i : length - 1 - i));
    return order.find(selectable) ?? null;
  }
  if (step === 0) return null;
  for (let n = 1; n <= length; n++) {
    const i = (index + step * n + length * n) % length;
    if (selectable(i)) return i;
  }
  return null;
}

/** Move focus to the radio at position `index` within the same group. */
function focusSibling(current: HTMLElement, index: number) {
  const radios = current.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]');
  radios?.[index]?.focus();
}

export const VariantSelector: React.FC<VariantSelectorProps> = ({
  colors,
  sizes,
  selectedColor,
  onSelectColor,
  selectedSize,
  onSelectSize,
  sizeStates,
  colorInStock,
  quantity,
  maxQuantity,
  onQuantityChange,
  canPurchase,
  stockMessage,
  onAddToCart,
  onBuyNow,
  isWishlisted = false,
  onToggleWishlist,
}) => {
  return (
    <div className="space-y-6">
      {/* 1. Colour (radio group: arrow keys move and select) */}
      {colors.length > 0 && (
        <div className="pb-6 border-b border-neutral-200">
          <p id="variant-color-label" className="text-xs font-bold text-neutral-600 uppercase tracking-wider block mb-3">
            Select Color: <span className="text-black font-bold normal-case">{selectedColor?.name ?? '—'}</span>
          </p>
          <div role="radiogroup" aria-labelledby="variant-color-label" className="flex flex-wrap items-center gap-3">
            {colors.map((color, index) => {
              const isSelected = selectedColor?.name === color.name;
              const isLight = ['#ffffff', '#fff', '#fafafa', '#f5f5f5'].includes(color.hex.toLowerCase());
              const inStock = colorInStock[color.name] !== false;
              const focusable = isSelected || (!selectedColor && index === 0);
              return (
                <button
                  key={color.name}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={focusable ? 0 : -1}
                  onClick={() => onSelectColor(color)}
                  onKeyDown={(e) => {
                    const next = nextIndex(e, index, colors.length, () => true);
                    if (next === null) return;
                    e.preventDefault();
                    onSelectColor(colors[next]);
                    focusSibling(e.currentTarget, next);
                  }}
                  style={{ backgroundColor: color.hex }}
                  className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:scale-105 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 ${
                    isLight ? 'border border-neutral-300' : ''
                  } ${isSelected ? 'ring-2 ring-black ring-offset-2' : ''} ${inStock ? '' : 'opacity-50'}`}
                  title={inStock ? color.name : `${color.name} (sold out)`}
                  aria-label={`${color.name}${inStock ? '' : ', sold out'}`}
                >
                  {isSelected && (
                    <HugeiconsIcon icon={Tick02Icon} size={16} className={isLight ? 'text-black' : 'text-white'} aria-hidden="true" />
                  )}
                  {!inStock && (
                    <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
                      <span className="block w-full h-0.5 bg-neutral-500 rotate-45" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Size (radio group; sizes not made in this colour are skipped) */}
      {sizes.length > 0 && (
        <div className="pb-6 border-b border-neutral-200">
          <p id="variant-size-label" className="text-xs font-bold text-neutral-600 uppercase tracking-wider block mb-3">
            Choose Size: <span className="text-black font-bold normal-case">{selectedSize ?? '—'}</span>
          </p>
          <div role="radiogroup" aria-labelledby="variant-size-label" className="flex flex-wrap gap-2.5 sm:gap-3">
            {sizes.map((size, index) => {
              const state = sizeStates[size] ?? 'unavailable';
              const isSelected = selectedSize === size;
              const unavailable = state === 'unavailable';
              const firstSelectable = sizes.findIndex((x) => (sizeStates[x] ?? 'unavailable') !== 'unavailable');
              const focusable = isSelected || (!sizes.some((x) => x === selectedSize) && index === firstSelectable);
              return (
                <button
                  key={size}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-disabled={unavailable || undefined}
                  tabIndex={focusable && !unavailable ? 0 : -1}
                  onClick={() => {
                    if (!unavailable) onSelectSize(size);
                  }}
                  onKeyDown={(e) => {
                    const next = nextIndex(e, index, sizes.length, (i) => (sizeStates[sizes[i]] ?? 'unavailable') !== 'unavailable');
                    if (next === null) return;
                    e.preventDefault();
                    onSelectSize(sizes[next]);
                    focusSibling(e.currentTarget, next);
                  }}
                  title={state === 'sold-out' ? 'Sold out' : unavailable ? 'Not available in this colour' : undefined}
                  className={`px-6 py-3 rounded-full text-xs sm:text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 ${
                    isSelected
                      ? 'bg-black text-white shadow-sm'
                      : unavailable
                        ? 'bg-[#F0F0F0] text-neutral-500 cursor-not-allowed'
                        : 'bg-[#F0F0F0] text-neutral-700 hover:bg-neutral-200'
                  } ${state === 'sold-out' || unavailable ? 'line-through decoration-1' : ''}`}
                >
                  {size}
                  {state === 'sold-out' && <span className="sr-only"> (sold out)</span>}
                  {unavailable && <span className="sr-only"> (unavailable in this colour)</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {stockMessage && (
        <p
          role="status"
          className={`text-sm font-medium ${canPurchase ? 'text-amber-700' : 'text-red-600'}`}
        >
          {stockMessage}
        </p>
      )}

      {/* 3. Quantity Stepper & Desktop Action CTAs */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex items-center bg-[#F0F0F0] rounded-full px-4 py-3.5 gap-5 shrink-0">
            <button
              type="button"
              onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
              disabled={!canPurchase || quantity <= 1}
              className="text-black hover:opacity-75 p-0.5 disabled:opacity-30"
              aria-label="Decrease quantity"
            >
              <HugeiconsIcon icon={MinusSignIcon} size={16} />
            </button>
            <span className="font-bold text-sm text-black min-w-[1.2rem] text-center" aria-live="polite">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => onQuantityChange(Math.min(maxQuantity, quantity + 1))}
              disabled={!canPurchase || quantity >= maxQuantity}
              className="text-black hover:opacity-75 p-0.5 disabled:opacity-30"
              aria-label="Increase quantity"
            >
              <HugeiconsIcon icon={PlusSignIcon} size={16} />
            </button>
          </div>

          <button
            type="button"
            onClick={onAddToCart}
            disabled={!canPurchase}
            className="flex-1 bg-black text-white hover:bg-neutral-800 font-semibold py-4 rounded-full transition-all shadow-lg flex items-center justify-center gap-2 text-sm sm:text-base disabled:bg-neutral-300 disabled:text-neutral-700 disabled:shadow-none disabled:cursor-not-allowed"
          >
            <HugeiconsIcon icon={ShoppingBag01Icon} size={20} />
            <span>{canPurchase ? 'Add to Cart' : 'Unavailable'}</span>
          </button>

          {onToggleWishlist && (
            <button
              type="button"
              onClick={onToggleWishlist}
              className={`p-4 rounded-full border transition-all shrink-0 ${
                isWishlisted
                  ? 'border-red-200 bg-red-50 text-red-500 shadow-sm'
                  : 'border-neutral-300 hover:bg-neutral-50 text-neutral-600 hover:text-black'
              }`}
              title={isWishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
              aria-label={isWishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
              aria-pressed={isWishlisted}
            >
              <HugeiconsIcon icon={FavouriteIcon} size={20} className={isWishlisted ? 'fill-current text-red-500' : ''} />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onBuyNow}
          disabled={!canPurchase}
          className="w-full bg-[#F0F0F0] hover:bg-neutral-200 text-black font-semibold py-3.5 rounded-full transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <HugeiconsIcon icon={FireIcon} size={16} className="text-red-500 fill-current" />
          <span>Buy Now</span>
        </button>
      </div>
    </div>
  );
};
