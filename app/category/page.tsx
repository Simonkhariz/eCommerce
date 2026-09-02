'use client';

import React, { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PRODUCTS } from '@/data/mockData';
import { FilterState } from '@/types';
import { FilterSidebar } from '@/components/catalog/FilterSidebar';
import { FilterDrawer } from '@/components/catalog/FilterDrawer';
import { ProductGrid } from '@/components/catalog/ProductGrid';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight01Icon } from '@hugeicons/core-free-icons';

function CatalogContent() {
  const searchParams = useSearchParams();

  const initialCat = searchParams.get('cat');
  const initialStyle = searchParams.get('style');
  const initialQuery = searchParams.get('q') || '';
  const initialOnSale = searchParams.get('onSale') === 'true';
  const initialNewArrivals = searchParams.get('newArrivals') === 'true';

  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const [filters, setFilters] = useState<FilterState>({
    category: initialCat,
    dressStyle: initialStyle,
    minPrice: 50,
    maxPrice: 350,
    selectedColors: [],
    selectedSizes: [],
    sortBy: 'most-popular',
    searchQuery: initialQuery,
  });

  const handleFilterChange = (newFilters: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const handleResetFilters = () => {
    setFilters({
      category: null,
      dressStyle: null,
      minPrice: 50,
      maxPrice: 350,
      selectedColors: [],
      selectedSizes: [],
      sortBy: 'most-popular',
      searchQuery: '',
    });
  };

  // Filter and Sort Logic
  const filteredProducts = useMemo(() => {
    return PRODUCTS.filter((product) => {
      // Category filter
      if (filters.category && product.category !== filters.category) {
        return false;
      }
      // Dress style filter
      if (filters.dressStyle && product.dressStyle !== filters.dressStyle) {
        return false;
      }
      // Sale filter from URL
      if (initialOnSale && !product.discountPercent) {
        return false;
      }
      // New arrivals filter from URL
      if (initialNewArrivals && !product.isNewArrival) {
        return false;
      }
      // Price range
      if (product.price < filters.minPrice || product.price > filters.maxPrice) {
        return false;
      }
      // Color filter
      if (
        filters.selectedColors.length > 0 &&
        !product.colors.some((c) =>
          filters.selectedColors.some(
            (sc) => sc.toLowerCase() === c.name.toLowerCase() || c.name.toLowerCase().includes(sc.toLowerCase())
          )
        )
      ) {
        return false;
      }
      // Size filter
      if (
        filters.selectedSizes.length > 0 &&
        !product.sizes.some((s) => filters.selectedSizes.includes(s))
      ) {
        return false;
      }
      // Search query
      if (filters.searchQuery.trim()) {
        const q = filters.searchQuery.toLowerCase();
        const matchesName = product.name.toLowerCase().includes(q);
        const matchesCategory = product.category.toLowerCase().includes(q);
        const matchesStyle = product.dressStyle.toLowerCase().includes(q);
        if (!matchesName && !matchesCategory && !matchesStyle) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => {
      if (filters.sortBy === 'price-low-high') return a.price - b.price;
      if (filters.sortBy === 'price-high-low') return b.price - a.price;
      if (filters.sortBy === 'rating') return b.rating - a.rating;
      if (filters.sortBy === 'newest') return (b.isNewArrival ? 1 : 0) - (a.isNewArrival ? 1 : 0);
      return (b.isTopSelling ? 1 : 0) - (a.isTopSelling ? 1 : 0);
    });
  }, [filters, initialOnSale, initialNewArrivals]);

  // Derive display category title
  const activeTitle = filters.category
    ? filters.category.replace('-', ' ')
    : filters.dressStyle
    ? `${filters.dressStyle} style`
    : initialOnSale
    ? 'On Sale Deals'
    : initialNewArrivals
    ? 'New Arrivals'
    : 'Casual';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs sm:text-sm text-neutral-500 mb-6">
        <Link href="/" className="hover:text-black transition-colors">
          Home
        </Link>
        <HugeiconsIcon icon={ArrowRight01Icon} size={14} className="text-neutral-400" />
        <span className="text-black font-medium capitalize">{activeTitle}</span>
      </nav>

      {/* Main Catalog Section: Sidebar (Desktop) + Product Grid */}
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Desktop Left Filter Sidebar */}
        <FilterSidebar
          filters={filters}
          onFilterChange={handleFilterChange}
          onReset={handleResetFilters}
          onApply={() => {}}
        />

        {/* Mobile Filter Bottom Drawer */}
        <FilterDrawer
          isOpen={isMobileDrawerOpen}
          onClose={() => setIsMobileDrawerOpen(false)}
          filters={filters}
          onFilterChange={handleFilterChange}
          onReset={handleResetFilters}
        />

        {/* Product Catalog Grid */}
        <ProductGrid
          products={filteredProducts}
          totalCount={filteredProducts.length}
          categoryTitle={activeTitle}
          filters={filters}
          onFilterChange={handleFilterChange}
          onOpenMobileFilters={() => setIsMobileDrawerOpen(true)}
        />
      </div>
    </div>
  );
}

export default function CategoryPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-neutral-500">Loading catalog...</div>}>
      <CatalogContent />
    </Suspense>
  );
}
