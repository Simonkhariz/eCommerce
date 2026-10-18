'use client';

import React from 'react';
import { FilterState } from '@/types';
import { CatalogFacets } from '@/lib/api-client';
import { Dialog } from '@/components/ui/Dialog';
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

/** Mobile filters as a bottom sheet (the shared Dialog handles Escape, focus and scroll lock). */
export const FilterDrawer: React.FC<FilterDrawerProps> = ({ isOpen, onClose, filters, onFilterChange, onReset, facets, resultCount }) => {
  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Filters"
      placement="bottom"
      panelClassName="w-full max-h-[85vh] bg-white rounded-t-3xl shadow-2xl flex flex-col"
    >
      <div className="w-12 h-1.5 bg-neutral-300 rounded-full mx-auto mt-3" aria-hidden="true" />

      <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
        <p className="font-bold text-xl text-black" aria-hidden="true">
          Filters
        </p>
        <div className="flex items-center gap-4">
          <button type="button" onClick={onReset} className="text-sm text-neutral-700 hover:text-black underline">
            Reset
          </button>
          <button type="button" onClick={onClose} className="p-1 rounded-full text-neutral-600 hover:text-black" aria-label="Close filters">
            <HugeiconsIcon icon={Cancel01Icon} size={20} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="p-6 overflow-y-auto flex-1">
        <FilterContent filters={filters} onFilterChange={onFilterChange} onReset={onReset} onDone={onClose} isMobile facets={facets} />
        <p className="mt-3 text-center text-xs text-neutral-600" role="status">
          {resultCount} {resultCount === 1 ? 'product' : 'products'} match
        </p>
      </div>
    </Dialog>
  );
};
