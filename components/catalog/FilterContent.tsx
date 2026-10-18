'use client';

import React, { useEffect, useState } from 'react';
import { FilterState } from '@/types';
import { CatalogFacets } from '@/lib/api-client';
import { formatPrice } from '@/lib/currency';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight01Icon, ArrowUp01Icon, Tick02Icon, SlidersHorizontalIcon } from '@hugeicons/core-free-icons';

interface FilterContentProps {
  filters: FilterState;
  onFilterChange: (newFilters: Partial<FilterState>) => void;
  onReset?: () => void;
  /** Mobile drawer: show a "Show results" button that closes it. */
  onDone?: () => void;
  isMobile?: boolean;
  facets: CatalogFacets | null;
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = `filter-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className="pb-6 border-b border-neutral-200">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
        className="w-full flex items-center justify-between font-bold text-base mb-4"
      >
        <span>{title}</span>
        <HugeiconsIcon icon={ArrowUp01Icon} size={16} aria-hidden="true" className={`transition-transform duration-200 ${open ? '' : 'rotate-180'}`} />
      </button>
      {open && <div id={id}>{children}</div>}
    </div>
  );
}

const isLight = (hex: string) => ['#ffffff', '#fff', '#fafafa', '#f5f5f5', '#fffdd0'].includes(hex.toLowerCase());

/**
 * Catalogue filters. Every option comes from /catalog/facets, so only categories, colours,
 * sizes and styles that exist in the published catalogue are offered.
 */
export const FilterContent: React.FC<FilterContentProps> = ({ filters, onFilterChange, onReset, onDone, isMobile = false, facets }) => {
  const [minInput, setMinInput] = useState(filters.minPrice?.toString() ?? '');
  const [maxInput, setMaxInput] = useState(filters.maxPrice?.toString() ?? '');

  // Keep the price inputs in step with the URL (Back/Forward, chip removal).
  useEffect(() => {
    setMinInput(filters.minPrice?.toString() ?? '');
    setMaxInput(filters.maxPrice?.toString() ?? '');
  }, [filters.minPrice, filters.maxPrice]);

  const toggleIn = (list: string[], value: string) =>
    list.some((v) => v.toLowerCase() === value.toLowerCase())
      ? list.filter((v) => v.toLowerCase() !== value.toLowerCase())
      : [...list, value];

  const applyPrice = (e?: React.FormEvent) => {
    e?.preventDefault();
    const min = minInput.trim() === '' ? null : Math.max(0, Number(minInput));
    const max = maxInput.trim() === '' ? null : Math.max(0, Number(maxInput));
    if ((min !== null && Number.isNaN(min)) || (max !== null && Number.isNaN(max))) return;
    if (min !== null && max !== null && min > max) {
      onFilterChange({ minPrice: max, maxPrice: min });
      return;
    }
    onFilterChange({ minPrice: min, maxPrice: max });
  };

  const categories = facets?.categories ?? [];
  const colors = facets?.colors ?? [];
  const sizes = facets?.sizes ?? [];
  const styles = facets?.dress_styles ?? [];

  return (
    <div className="space-y-6 text-black">
      {!isMobile && (
        <div className="flex items-center justify-between pb-4 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={SlidersHorizontalIcon} size={20} />
            <h2 className="font-bold text-lg text-black">Filters</h2>
          </div>
          {onReset && (
            <button type="button" onClick={onReset} className="text-sm text-neutral-700 hover:text-black underline">
              Reset all
            </button>
          )}
        </div>
      )}

      {!facets && <p className="text-sm text-neutral-600" role="status">Loading filters…</p>}

      {categories.length > 0 && (
        <fieldset className="space-y-1 pb-6 border-b border-neutral-200">
          <legend className="sr-only">Category</legend>
          {categories.map((cat) => {
            const isActive = filters.category?.toLowerCase() === cat.slug.toLowerCase();
            return (
              <button
                key={cat.slug}
                type="button"
                aria-pressed={isActive}
                onClick={() => onFilterChange({ category: isActive ? null : cat.slug })}
                className={`w-full flex items-center justify-between text-sm py-1.5 transition-colors ${
                  isActive ? 'font-bold text-black' : 'text-neutral-700 hover:text-black'
                }`}
              >
                <span>
                  {cat.name}
                  {typeof cat.product_count === 'number' && <span className="text-neutral-500 font-normal"> ({cat.product_count})</span>}
                </span>
                <HugeiconsIcon icon={ArrowRight01Icon} size={16} className={isActive ? 'text-black' : 'text-neutral-500'} aria-hidden="true" />
              </button>
            );
          })}
        </fieldset>
      )}

      <Section title="Price">
        <form onSubmit={applyPrice} className="space-y-3" aria-label="Price range">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={`min-price-${isMobile ? 'm' : 'd'}`} className="block text-xs font-semibold text-neutral-700 mb-1">Min (₦)</label>
              <input
                id={`min-price-${isMobile ? 'm' : 'd'}`}
                type="number"
                inputMode="numeric"
                min={0}
                step={500}
                placeholder={facets ? String(Math.floor(facets.price.min)) : '0'}
                value={minInput}
                onChange={(e) => setMinInput(e.target.value)}
                onBlur={() => applyPrice()}
                className="w-full rounded-xl bg-[#F0F0F0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <div>
              <label htmlFor={`max-price-${isMobile ? 'm' : 'd'}`} className="block text-xs font-semibold text-neutral-700 mb-1">Max (₦)</label>
              <input
                id={`max-price-${isMobile ? 'm' : 'd'}`}
                type="number"
                inputMode="numeric"
                min={0}
                step={500}
                placeholder={facets ? String(Math.ceil(facets.price.max)) : 'Any'}
                value={maxInput}
                onChange={(e) => setMaxInput(e.target.value)}
                onBlur={() => applyPrice()}
                className="w-full rounded-xl bg-[#F0F0F0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          </div>
          {facets && facets.price.max > 0 && (
            <p className="text-xs text-neutral-600">
              Prices range from {formatPrice(facets.price.min)} to {formatPrice(facets.price.max)}.
            </p>
          )}
        </form>
      </Section>

      {colors.length > 0 && (
        <Section title="Colors">
          <fieldset className="grid grid-cols-5 gap-3">
            <legend className="sr-only">Colours</legend>
            {colors.map((col) => {
              const isSelected = filters.selectedColors.some((c) => c.toLowerCase() === col.name.toLowerCase());
              const hex = col.hex || '#cccccc';
              return (
                <button
                  key={col.name}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onFilterChange({ selectedColors: toggleIn(filters.selectedColors, col.name) })}
                  style={{ backgroundColor: hex }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${
                    isLight(hex) ? 'border border-neutral-300' : ''
                  } ${isSelected ? 'ring-2 ring-black ring-offset-2' : ''}`}
                  title={col.name}
                  aria-label={`${col.name} (${col.product_count})`}
                >
                  {isSelected && <HugeiconsIcon icon={Tick02Icon} size={16} className={isLight(hex) ? 'text-black' : 'text-white'} aria-hidden="true" />}
                </button>
              );
            })}
          </fieldset>
        </Section>
      )}

      {sizes.length > 0 && (
        <Section title="Size">
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Sizes</legend>
            {sizes.map((size) => {
              const isSelected = filters.selectedSizes.some((s) => s.toLowerCase() === size.toLowerCase());
              return (
                <button
                  key={size}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onFilterChange({ selectedSizes: toggleIn(filters.selectedSizes, size) })}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    isSelected ? 'bg-black text-white' : 'bg-[#F0F0F0] text-neutral-700 hover:bg-neutral-200'
                  }`}
                >
                  {size}
                </button>
              );
            })}
          </fieldset>
        </Section>
      )}

      {styles.length > 0 && (
        <Section title="Dress Style">
          <fieldset className="space-y-1">
            <legend className="sr-only">Dress style</legend>
            {styles.map((style) => {
              const isActive = filters.dressStyle?.toLowerCase() === style.toLowerCase();
              return (
                <button
                  key={style}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onFilterChange({ dressStyle: isActive ? null : style.toLowerCase() })}
                  className={`w-full flex items-center justify-between text-sm py-1.5 transition-colors ${
                    isActive ? 'font-bold text-black' : 'text-neutral-700 hover:text-black'
                  }`}
                >
                  <span>{style}</span>
                  <HugeiconsIcon icon={ArrowRight01Icon} size={16} className={isActive ? 'text-black' : 'text-neutral-500'} aria-hidden="true" />
                </button>
              );
            })}
          </fieldset>
        </Section>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold text-black mb-1">Offers</legend>
        <label className="flex items-center gap-2 text-sm text-neutral-800">
          <input type="checkbox" className="size-4 accent-black" checked={filters.onSale} onChange={(e) => onFilterChange({ onSale: e.target.checked })} />
          On sale
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-800">
          <input type="checkbox" className="size-4 accent-black" checked={filters.flashDeals} onChange={(e) => onFilterChange({ flashDeals: e.target.checked })} />
          Flash deals
        </label>
      </fieldset>

      {isMobile && onDone && (
        <button
          type="button"
          onClick={onDone}
          className="w-full bg-black text-white hover:bg-neutral-800 font-semibold py-3.5 rounded-full transition-colors shadow-md text-sm"
        >
          Show results
        </button>
      )}
    </div>
  );
};
