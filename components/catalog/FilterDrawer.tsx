'use client';

import React from 'react';
import { FilterState } from '@/types';
import { FilterContent } from './FilterContent';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  onFilterChange: (newFilters: Partial<FilterState>) => void;
  onReset: () => void;
}

export const FilterDrawer: React.FC<FilterDrawerProps> = ({
  isOpen,
  onClose,
  filters,
  onFilterChange,
  onReset,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Bottom Sheet Modal Container */}
      <div className="fixed inset-x-0 bottom-0 max-h-[85vh] bg-white rounded-t-3xl shadow-2xl z-10 flex flex-col animate-in slide-in-from-bottom duration-300">
        {/* Grab Handle */}
        <div className="w-12 h-1.5 bg-neutral-300 rounded-full mx-auto mt-3" />

        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
          <h3 className="font-bold text-xl text-black">Filters</h3>
          <div className="flex items-center gap-4">
            <button
              onClick={onReset}
              className="text-xs text-neutral-500 hover:text-black underline"
            >
              Reset
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-full text-neutral-500 hover:text-black"
              aria-label="Close filters"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={20} />
            </button>
          </div>
        </div>

        {/* Scrollable Filter Controls */}
        <div className="p-6 overflow-y-auto flex-1">
          <FilterContent
            filters={filters}
            onFilterChange={onFilterChange}
            onApply={onClose}
            onReset={onReset}
            isMobile={true}
          />
        </div>
      </div>
    </div>
  );
};
