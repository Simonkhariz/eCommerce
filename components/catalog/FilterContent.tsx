import React, { useState } from 'react';
import { CATEGORIES_LIST, DRESS_STYLES, FILTER_COLORS, FILTER_SIZES } from '@/data/mockData';
import { FilterState } from '@/types';
import { ApiCategory } from '@/lib/api-client';
import { formatPrice } from '@/lib/currency';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowRight01Icon,
  ArrowUp01Icon,
  Tick02Icon,
  SlidersHorizontalIcon,
} from '@hugeicons/core-free-icons';

interface FilterContentProps {
  filters: FilterState;
  onFilterChange: (newFilters: Partial<FilterState>) => void;
  onApply?: () => void;
  onReset?: () => void;
  isMobile?: boolean;
  categories?: ApiCategory[];
}

export const FilterContent: React.FC<FilterContentProps> = ({
  filters,
  onFilterChange,
  onApply,
  onReset,
  isMobile = false,
  categories,
}) => {
  const [priceOpen, setPriceOpen] = useState(true);
  const [colorsOpen, setColorsOpen] = useState(true);
  const [sizeOpen, setSizeOpen] = useState(true);
  const [dressStyleOpen, setDressStyleOpen] = useState(true);

  const toggleColor = (colorName: string) => {
    const isPresent = filters.selectedColors.some(
      (c) => c.toLowerCase() === colorName.toLowerCase()
    );
    const updated = isPresent
      ? filters.selectedColors.filter((c) => c.toLowerCase() !== colorName.toLowerCase())
      : [...filters.selectedColors, colorName];
    onFilterChange({ selectedColors: updated });
  };

  const toggleSize = (sizeName: string) => {
    const isPresent = filters.selectedSizes.some(
      (s) => s.toLowerCase() === sizeName.toLowerCase()
    );
    const updated = isPresent
      ? filters.selectedSizes.filter((s) => s.toLowerCase() !== sizeName.toLowerCase())
      : [...filters.selectedSizes, sizeName];
    onFilterChange({ selectedSizes: updated });
  };

  const handleCategorySelect = (categorySlug: string) => {
    onFilterChange({
      category:
        filters.category?.toLowerCase() === categorySlug.toLowerCase() ? null : categorySlug,
    });
  };

  const handleDressStyleSelect = (styleSlug: string) => {
    onFilterChange({
      dressStyle:
        filters.dressStyle?.toLowerCase() === styleSlug.toLowerCase() ? null : styleSlug,
    });
  };

  return (
    <div className="space-y-6 text-black">
      {/* Desktop Header */}
      {!isMobile && (
        <div className="flex items-center justify-between pb-4 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={SlidersHorizontalIcon} size={20} />
            <h3 className="font-bold text-lg text-black">Filters</h3>
          </div>
          {onReset && (
            <button
              onClick={onReset}
              className="text-xs text-neutral-500 hover:text-black underline"
            >
              Reset All
            </button>
          )}
        </div>
      )}

      {/* Category List */}
      <div className="space-y-3 pb-6 border-b border-neutral-200">
        {(categories && categories.length > 0
          ? categories.map((c) => ({ label: c.name, slug: c.slug }))
          : CATEGORIES_LIST
        ).map((cat) => {
          const isActive = filters.category?.toLowerCase() === cat.slug.toLowerCase();
          return (
            <button
              key={cat.slug}
              onClick={() => handleCategorySelect(cat.slug)}
              className={`w-full flex items-center justify-between text-sm py-1 transition-colors ${
                isActive
                  ? 'font-bold text-black'
                  : 'text-neutral-600 hover:text-black font-normal'
              }`}
            >
              <span>{cat.label}</span>
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={16}
                className={isActive ? 'text-black' : 'text-neutral-400'}
              />
            </button>
          );
        })}
      </div>

      {/* Price Range Slider */}
      <div className="pb-6 border-b border-neutral-200">
        <button
          onClick={() => setPriceOpen(!priceOpen)}
          className="w-full flex items-center justify-between font-bold text-base mb-4"
        >
          <span>Price</span>
          <HugeiconsIcon
            icon={ArrowUp01Icon}
            size={16}
            className={`transition-transform duration-200 ${
              priceOpen ? '' : 'rotate-180'
            }`}
          />
        </button>

        {priceOpen && (
          <div className="space-y-4">
            <input
              type="range"
              min={0}
              max={50000}
              step={1000}
              value={filters.maxPrice}
              onChange={(e) => onFilterChange({ maxPrice: Number(e.target.value) })}
              className="w-full"
            />
            <div className="flex items-center justify-between text-sm font-semibold text-neutral-800">
              <span>{formatPrice(filters.minPrice)}</span>
              <span>{formatPrice(filters.maxPrice)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Color Swatches */}
      <div className="pb-6 border-b border-neutral-200">
        <button
          onClick={() => setColorsOpen(!colorsOpen)}
          className="w-full flex items-center justify-between font-bold text-base mb-4"
        >
          <span>Colors</span>
          <HugeiconsIcon
            icon={ArrowUp01Icon}
            size={16}
            className={`transition-transform duration-200 ${
              colorsOpen ? '' : 'rotate-180'
            }`}
          />
        </button>

        {colorsOpen && (
          <div className="grid grid-cols-5 gap-3">
            {FILTER_COLORS.map((col) => {
              const isSelected = filters.selectedColors.some(
                (c) => c.toLowerCase() === col.name.toLowerCase()
              );
              const isWhite = col.hex.toLowerCase() === '#ffffff';
              return (
                <button
                  key={col.name}
                  onClick={() => toggleColor(col.name)}
                  style={{ backgroundColor: col.hex }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${
                    isWhite ? 'border border-neutral-300' : ''
                  }`}
                  title={col.name}
                  aria-label={`Color ${col.name}`}
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
        )}
      </div>

      {/* Size Selector Pills */}
      <div className="pb-6 border-b border-neutral-200">
        <button
          onClick={() => setSizeOpen(!sizeOpen)}
          className="w-full flex items-center justify-between font-bold text-base mb-4"
        >
          <span>Size</span>
          <HugeiconsIcon
            icon={ArrowUp01Icon}
            size={16}
            className={`transition-transform duration-200 ${
              sizeOpen ? '' : 'rotate-180'
            }`}
          />
        </button>

        {sizeOpen && (
          <div className="flex flex-wrap gap-2">
            {FILTER_SIZES.map((size) => {
              const isSelected = filters.selectedSizes.some(
                (s) => s.toLowerCase() === size.toLowerCase()
              );
              return (
                <button
                  key={size}
                  onClick={() => toggleSize(size)}
                  className={`px-4 py-2 rounded-full text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-black text-white'
                      : 'bg-[#F0F0F0] text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {size}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Dress Style Accordion */}
      <div className="pb-6">
        <button
          onClick={() => setDressStyleOpen(!dressStyleOpen)}
          className="w-full flex items-center justify-between font-bold text-base mb-4"
        >
          <span>Dress Style</span>
          <HugeiconsIcon
            icon={ArrowUp01Icon}
            size={16}
            className={`transition-transform duration-200 ${
              dressStyleOpen ? '' : 'rotate-180'
            }`}
          />
        </button>

        {dressStyleOpen && (
          <div className="space-y-3">
            {DRESS_STYLES.map((style) => {
              const isActive = filters.dressStyle?.toLowerCase() === style.slug.toLowerCase();
              return (
                <button
                  key={style.slug}
                  onClick={() => handleDressStyleSelect(style.slug)}
                  className={`w-full flex items-center justify-between text-sm py-1 transition-colors ${
                    isActive
                      ? 'font-bold text-black'
                      : 'text-neutral-600 hover:text-black font-normal'
                  }`}
                >
                  <span>{style.name}</span>
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    size={16}
                    className={isActive ? 'text-black' : 'text-neutral-400'}
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Apply Filter Button */}
      <button
        onClick={onApply}
        className="w-full bg-black text-white hover:bg-neutral-800 font-semibold py-3.5 rounded-full transition-colors shadow-md text-sm"
      >
        Apply Filter
      </button>
    </div>
  );
};
