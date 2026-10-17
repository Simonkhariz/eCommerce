import React, { useState, useEffect } from 'react';
import { Product, FilterState } from '@/types';
import { ProductCard } from '@/components/ui/ProductCard';
import { formatPrice } from '@/lib/currency';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  SlidersHorizontalIcon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Alert02Icon,
  RefreshIcon,
} from '@hugeicons/core-free-icons';

interface ProductGridProps {
  products: Product[];
  totalCount: number;
  categoryTitle: string;
  filters: FilterState;
  onFilterChange: (newFilters: Partial<FilterState>) => void;
  onReset?: () => void;
  onOpenMobileFilters: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  totalPages?: number;
}

export const ProductGrid: React.FC<ProductGridProps> = ({
  products,
  totalCount,
  categoryTitle,
  filters,
  onFilterChange,
  onReset,
  onOpenMobileFilters,
  loading = false,
  error = null,
  onRetry,
  currentPage: externalPage,
  onPageChange,
  totalPages: externalTotalPages,
}) => {
  const [internalPage, setInternalPage] = useState(1);
  const itemsPerPage = 9;

  const isControlled = externalPage !== undefined && onPageChange !== undefined;
  const currentPage = isControlled ? externalPage : internalPage;
  const setCurrentPage = (page: number) => {
    if (isControlled) {
      onPageChange(page);
    } else {
      setInternalPage(page);
    }
  };

  // Reset internal page on filter changes
  useEffect(() => {
    if (!isControlled) {
      setInternalPage(1);
    }
  }, [filters, isControlled]);

  const totalPages = externalTotalPages !== undefined
    ? externalTotalPages
    : Math.max(1, Math.ceil(products.length / itemsPerPage));

  // If using external server pagination, products are already sliced
  const displayProducts = isControlled
    ? products
    : products.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const startIndex = (currentPage - 1) * itemsPerPage;

  return (
    <div className="flex-1 min-w-0">
      {/* Header with Title, Counts, Sorting and Mobile Filter Trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-integral text-2xl sm:text-3xl text-black capitalize">
            {categoryTitle}
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">
            Showing {totalCount > 0 ? startIndex + 1 : 0}-
            {Math.min(startIndex + itemsPerPage, totalCount)} of {totalCount} Products
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

      {/* Active Filter Badges */}
      {(filters.category ||
        filters.dressStyle ||
        filters.selectedColors.length > 0 ||
        filters.selectedSizes.length > 0 ||
        filters.maxPrice < 50000 ||
        filters.minPrice > 0 ||
        Boolean(filters.searchQuery.trim())) && (
        <div className="flex flex-wrap items-center gap-2 mb-6 animate-in fade-in duration-200">
          <span className="text-xs font-semibold text-neutral-400 mr-1">Active:</span>

          {filters.category && (
            <button
              onClick={() => onFilterChange({ category: null })}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-black text-white text-xs rounded-full font-medium hover:bg-neutral-800 transition-colors capitalize"
            >
              <span>{filters.category.replace('-', ' ')}</span>
              <HugeiconsIcon icon={Cancel01Icon} size={12} />
            </button>
          )}

          {filters.dressStyle && (
            <button
              onClick={() => onFilterChange({ dressStyle: null })}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-neutral-900 text-white text-xs rounded-full font-medium hover:bg-neutral-700 transition-colors capitalize"
            >
              <span>Style: {filters.dressStyle}</span>
              <HugeiconsIcon icon={Cancel01Icon} size={12} />
            </button>
          )}

          {filters.selectedColors.map((color) => (
            <button
              key={color}
              onClick={() =>
                onFilterChange({
                  selectedColors: filters.selectedColors.filter((c) => c !== color),
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-neutral-100 text-neutral-800 text-xs rounded-full font-medium hover:bg-neutral-200 transition-colors"
            >
              <span>Color: {color}</span>
              <HugeiconsIcon icon={Cancel01Icon} size={12} />
            </button>
          ))}

          {filters.selectedSizes.map((size) => (
            <button
              key={size}
              onClick={() =>
                onFilterChange({
                  selectedSizes: filters.selectedSizes.filter((s) => s !== size),
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-neutral-100 text-neutral-800 text-xs rounded-full font-medium hover:bg-neutral-200 transition-colors"
            >
              <span>Size: {size}</span>
              <HugeiconsIcon icon={Cancel01Icon} size={12} />
            </button>
          ))}

          {filters.maxPrice < 50000 && (
            <button
              onClick={() => onFilterChange({ maxPrice: 50000 })}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-neutral-100 text-neutral-800 text-xs rounded-full font-medium hover:bg-neutral-200 transition-colors"
            >
              <span>Max {formatPrice(filters.maxPrice)}</span>
              <HugeiconsIcon icon={Cancel01Icon} size={12} />
            </button>
          )}

          {filters.searchQuery.trim() && (
            <button
              onClick={() => onFilterChange({ searchQuery: '' })}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-neutral-100 text-neutral-800 text-xs rounded-full font-medium hover:bg-neutral-200 transition-colors"
            >
              <span>&ldquo;{filters.searchQuery}&rdquo;</span>
              <HugeiconsIcon icon={Cancel01Icon} size={12} />
            </button>
          )}

          {onReset && (
            <button
              onClick={onReset}
              className="text-xs text-red-600 hover:text-red-700 font-bold underline ml-1"
            >
              Clear All
            </button>
          )}
        </div>
      )}

      {/* Error State Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-3xl p-8 text-center my-6">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <HugeiconsIcon icon={Alert02Icon} size={24} />
          </div>
          <h3 className="font-bold text-lg text-red-900 mb-1">Failed to load products</h3>
          <p className="text-sm text-red-700 max-w-md mx-auto mb-5">
            {error}. Real products and prices cannot be loaded from the backend API.
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-full text-sm font-semibold transition-all shadow-sm"
            >
              <HugeiconsIcon icon={RefreshIcon} size={16} />
              <span>Retry Search</span>
            </button>
          )}
        </div>
      )}

      {/* Loading Skeletons */}
      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 my-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="space-y-3 animate-pulse bg-white p-2 rounded-2xl border border-neutral-100">
              <div className="aspect-square bg-neutral-200 rounded-2xl w-full" />
              <div className="h-4 bg-neutral-200 rounded w-3/4" />
              <div className="h-3 bg-neutral-200 rounded w-1/2" />
              <div className="h-5 bg-neutral-200 rounded w-1/3" />
            </div>
          ))}
        </div>
      )}

      {/* Product Grid */}
      {!loading && !error && displayProducts.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
          {displayProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && displayProducts.length === 0 && (
        <div className="bg-neutral-50 rounded-3xl p-12 text-center my-8">
          <h3 className="font-bold text-lg text-black mb-2">No matching products found</h3>
          <p className="text-sm text-neutral-500 max-w-sm mx-auto mb-6">
            Try adjusting your search filters, color selections, or price range to find what you&apos;re looking for.
          </p>
          <button
            onClick={
              onReset
                ? onReset
                : () =>
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
            className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-neutral-800 transition-colors"
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
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
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
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
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
