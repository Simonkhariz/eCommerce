'use client';

import React from 'react';
import { FilterState } from '@/types';
import { FilterContent } from './FilterContent';

interface FilterSidebarProps {
  filters: FilterState;
  onFilterChange: (newFilters: Partial<FilterState>) => void;
  onReset: () => void;
  onApply: () => void;
}

export const FilterSidebar: React.FC<FilterSidebarProps> = ({
  filters,
  onFilterChange,
  onReset,
  onApply,
}) => {
  return (
    <aside className="hidden lg:block w-72 shrink-0">
      <div className="border border-neutral-200 rounded-3xl p-6 bg-white sticky top-28 shadow-sm">
        <FilterContent
          filters={filters}
          onFilterChange={onFilterChange}
          onReset={onReset}
          onApply={onApply}
          isMobile={false}
        />
      </div>
    </aside>
  );
};
