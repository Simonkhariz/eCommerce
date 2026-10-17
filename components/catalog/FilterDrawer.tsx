'use client';

import React, { useEffect, useRef } from 'react';
import { FilterState } from '@/types';
import { CatalogFacets } from '@/lib/api-client';
import { FilterContent } from './FilterContent';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  onFilterChange: (newFilters: Partial<FilterState>) => void;
  onReset: () => void;
  facets: CatalogFacets | null;
  resultCount: number;
}

export const FilterDrawer: React.FC<FilterDrawerProps> = ({ isOpen, onClose, filters, onFilterChange, onReset, facets, resultCount }) => {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes, the page behind doesn't scroll, and focus starts inside the drawer.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLElement>('button')?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-drawer-title"
        className="fixed inset-x-0 bottom-0 max-h-[85vh] bg-white rounded-t-3xl shadow-2xl z-10 flex flex-col"
      >
        <div className="w-12 h-1.5 bg-neutral-300 rounded-full mx-auto mt-3" aria-hidden="true" />

        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
          <h2 id="filter-drawer-title" className="font-bold text-xl text-black">Filters</h2>
          <div className="flex items-center gap-4">
            <button type="button" onClick={onReset} className="text-sm text-neutral-700 hover:text-black underline">
              Reset
            </button>
            <button type="button" onClick={onClose} className="p-1 rounded-full text-neutral-600 hover:text-black" aria-label="Close filters">
              <HugeiconsIcon icon={Cancel01Icon} size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <FilterContent filters={filters} onFilterChange={onFilterChange} onReset={onReset} onDone={onClose} isMobile facets={facets} />
          <p className="mt-3 text-center text-xs text-neutral-600" role="status">
            {resultCount} {resultCount === 1 ? 'product' : 'products'} match
          </p>
        </div>
      </div>
    </div>
  );
};
