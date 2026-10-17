import React from 'react';
import { FilterState } from '@/types';
import { ApiCategory } from '@/lib/api-client';
import { FilterContent } from './FilterContent';

interface FilterSidebarProps {
  filters: FilterState;
  onFilterChange: (newFilters: Partial<FilterState>) => void;
  onReset: () => void;
  onApply: () => void;
  categories?: ApiCategory[];
}

export const FilterSidebar: React.FC<FilterSidebarProps> = ({
  filters,
  onFilterChange,
  onReset,
  onApply,
  categories,
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
          categories={categories}
        />
      </div>
    </aside>
  );
};
