'use client';

import React, { useState } from 'react';
import { Product, FilterState } from '@/types';
import { ProductCard } from '@/components/ui/ProductCard';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  SlidersHorizontalIcon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
} from '@hugeicons/core-free-icons';

interface ProductGridProps {
  products: Product[];
  totalCount: number;
  categoryTitle: string;
  filters: FilterState;
  onFilterChange: (newFilters: Partial<FilterState>) => void;
  onOpenMobileFilters: () => void;
}

export const ProductGrid: React.FC<ProductGridProps> = ({
  products,
  totalCount,
  categoryTitle,
  filters,
  onFilterChange,
  onOpenMobileFilters,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 9;

  const totalPages = Math.max(1, Math.ceil(products.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedProducts = products.slice(startIndex, startIndex + itemsPerPage);

  return (
    <div className="flex-1 min-w-0">
      {/* Header with Title, Counts, Sorting and Mobile Filter Trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-integral text-2xl sm:text-3xl text-black capitalize">
            {categoryTitle}
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">
            Showing {products.length > 0 ? startIndex + 1 : 0}-
            {Math.min(startIndex + itemsPerPage, products.length)} of {totalCount} Products
          </p>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          {/* Mobile Filters Trigger Button */}
          <button
            onClick={onOpenMobileFilters}
            className="lg:hidden p-2.5 bg-[#F0F0F0] rounded-full text-black hover:bg-neutral-200 transition-colors flex items-center justify-center"
            aria-label="Open filters"
          >
            <HugeiconsIcon icon={SlidersHorizontalIcon} size={20} />
          </button>

          {/* Sort By Dropdown */}
          <div className="relative flex items-center text-xs sm:text-sm text-neutral-600">
            <span className="hidden sm:inline mr-1 text-neutral-500">Sort by:</span>
            <div className="relative inline-block">
              <select
                value={filters.sortBy}
                onChange={(e) =>
                  onFilterChange({ sortBy: e.target.value as FilterState['sortBy'] })
                }
                className="appearance-none bg-transparent font-semibold text-black pr-6 py-1 cursor-pointer focus:outline-none"
              >
                <option value="most-popular">Most Popular</option>
                <option value="price-low-high">Price: Low to High</option>
                <option value="price-high-low">Price: High to Low</option>
                <option value="newest">Newest</option>
                <option value="rating">Top Rated</option>
              </select>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-black">
                <HugeiconsIcon icon={ArrowDown01Icon} size={14} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Product Grid */}
      {paginatedProducts.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
          {paginatedProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="bg-neutral-50 rounded-3xl p-12 text-center my-8">
          <h3 className="font-bold text-lg text-black mb-2">No matching products found</h3>
          <p className="text-sm text-neutral-500 max-w-sm mx-auto mb-6">
            Try adjusting your search filters, color selections, or price range to find what you&apos;re looking for.
          </p>
          <button
            onClick={() =>
              onFilterChange({
                category: null,
                dressStyle: null,
                minPrice: 50,
                maxPrice: 350,
                selectedColors: [],
                selectedSizes: [],
                searchQuery: '',
              })
            }
            className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-neutral-800"
          >
            Clear All Filters
          </button>
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="mt-12 pt-6 border-t border-neutral-200 flex items-center justify-between text-xs sm:text-sm font-semibold text-neutral-700">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="flex items-center gap-2 px-4 py-2 border border-neutral-200 rounded-lg hover:bg-neutral-50 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
            <span>Previous</span>
          </button>

          <div className="flex items-center gap-1 sm:gap-2">
            {Array.from({ length: totalPages }).map((_, idx) => {
              const pageNum = idx + 1;
              const isActive = currentPage === pageNum;
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                    isActive
                      ? 'bg-neutral-100 text-black font-bold'
                      : 'text-neutral-500 hover:bg-neutral-50'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="flex items-center gap-2 px-4 py-2 border border-neutral-200 rounded-lg hover:bg-neutral-50 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <span>Next</span>
            <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
          </button>
        </div>
      )}
    </div>
  );
};
