'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterState, Product } from '@/types';
import { CatalogFacets, getCatalogFacets, getProducts, mapApiProductToStorefront } from '@/lib/api-client';
import { PAGE_SIZE, apiSortFor, buildCatalogUrl, EMPTY_FILTERS, parseCatalogParams } from '@/lib/catalog-query';
import { FilterSidebar } from '@/components/catalog/FilterSidebar';
import { FilterDrawer } from '@/components/catalog/FilterDrawer';
import { ProductGrid } from '@/components/catalog/ProductGrid';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight01Icon } from '@hugeicons/core-free-icons';

function CatalogContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();
  // The URL is the single source of truth for every filter, the sort and the page.
  const filters = useMemo(() => parseCatalogParams(new URLSearchParams(queryKey)), [queryKey]);

  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [facets, setFacets] = useState<CatalogFacets | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    getCatalogFacets()
      .then(setFacets)
      .catch(() => setFacets({ categories: [], colors: [], sizes: [], dress_styles: [], price: { min: 0, max: 0 } }));
  }, []);

  // One request per URL change; responses from superseded requests are ignored.
  const fetchProducts = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const response = await getProducts({
        category: filters.category || undefined,
        search: filters.searchQuery.trim() || undefined,
        min_price: filters.minPrice ?? undefined,
        max_price: filters.maxPrice ?? undefined,
        dress_style: filters.dressStyle || undefined,
        colors: filters.selectedColors.length ? filters.selectedColors : undefined,
        sizes: filters.selectedSizes.length ? filters.selectedSizes : undefined,
        on_sale: filters.onSale || undefined,
        flash_deals: filters.flashDeals || undefined,
        sort: apiSortFor(filters.sortBy),
        page: filters.page,
        per_page: PAGE_SIZE,
      });
      if (requestId !== requestRef.current) return;
      setProducts(response.items.map(mapApiProductToStorefront));
      setTotalCount(response.pagination.total);
      setTotalPages(Math.max(1, response.pagination.total_pages));
    } catch (err: any) {
      if (requestId !== requestRef.current) return;
      setError(err?.message || 'The catalogue could not be loaded.');
      setProducts([]);
      setTotalCount(0);
      setTotalPages(1);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const navigate = (next: FilterState, scrollTop = false) => {
    router.push(buildCatalogUrl(next), { scroll: false });
    if (scrollTop) window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Any filter change starts again from page 1.
  const handleFilterChange = (patch: Partial<FilterState>) => navigate({ ...filters, ...patch, page: 1 });
  const handlePageChange = (page: number) => navigate({ ...filters, page }, true);
  const handleReset = () => navigate(EMPTY_FILTERS);

  const activeCategory = facets?.categories.find((c) => c.slug.toLowerCase() === filters.category?.toLowerCase());
  const activeTitle = activeCategory
    ? activeCategory.name
    : filters.category
      ? filters.category.replace(/-/g, ' ')
      : filters.searchQuery.trim()
        ? `Results for “${filters.searchQuery.trim()}”`
        : filters.dressStyle
          ? `${filters.dressStyle} style`
          : filters.flashDeals
            ? 'Flash deals'
            : filters.onSale
              ? 'On sale'
              : filters.sortBy === 'newest'
                ? 'New arrivals'
                : 'All products';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-neutral-700 mb-6">
        <Link href="/" className="hover:text-black transition-colors">
          Home
        </Link>
        <HugeiconsIcon icon={ArrowRight01Icon} size={14} className="text-neutral-400" />
        <span className="text-black font-medium capitalize" aria-current="page">{activeTitle}</span>
      </nav>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        <FilterSidebar filters={filters} onFilterChange={handleFilterChange} onReset={handleReset} facets={facets} />

        <FilterDrawer
          isOpen={isMobileDrawerOpen}
          onClose={() => setIsMobileDrawerOpen(false)}
          filters={filters}
          onFilterChange={handleFilterChange}
          onReset={handleReset}
          facets={facets}
          resultCount={totalCount}
        />

        <ProductGrid
          products={products}
          totalCount={totalCount}
          categoryTitle={activeTitle}
          filters={filters}
          onFilterChange={handleFilterChange}
          onReset={handleReset}
          onOpenMobileFilters={() => setIsMobileDrawerOpen(true)}
          loading={loading}
          error={error}
          onRetry={fetchProducts}
          onPageChange={handlePageChange}
          totalPages={totalPages}
        />
      </div>
    </div>
  );
}

export default function CategoryPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-neutral-700">Loading catalogue…</div>}>
      <CatalogContent />
    </Suspense>
  );
}
