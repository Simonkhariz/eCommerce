'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterState, Product } from '@/types';
import { CatalogFacets, errorMessage, getCatalogFacets, getProducts, mapApiProductToStorefront } from '@/lib/api-client';
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
  // One request per address (filters, page) and per "Try again"; only its answer is shown.
  const [retries, setRetries] = useState(0);
  const requestKey = `${queryKey}#${retries}`;
  const [answer, setAnswer] = useState<{
    key: string;
    products: Product[];
    totalCount: number;
    totalPages: number;
    error: string | null;
  } | null>(null);
  // While the next page loads, the previous results stay on screen.
  const loading = answer?.key !== requestKey;
  const products = answer?.products ?? [];
  const totalCount = answer?.totalCount ?? 0;
  const totalPages = answer?.totalPages ?? 1;
  const error = loading ? null : (answer?.error ?? null);

  useEffect(() => {
    getCatalogFacets()
      .then(setFacets)
      .catch(() => setFacets({ categories: [], colors: [], sizes: [], dress_styles: [], price: { min: 0, max: 0 } }));
  }, []);

  useEffect(() => {
    let current = true; // a newer request makes this answer irrelevant
    getProducts({
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
    }).then(
      (response) => {
        if (!current) return;
        setAnswer({
          key: requestKey,
          products: response.items.map(mapApiProductToStorefront),
          totalCount: response.pagination.total,
          totalPages: Math.max(1, response.pagination.total_pages),
          error: null,
        });
      },
      (err) => {
        if (!current) return;
        setAnswer({ key: requestKey, products: [], totalCount: 0, totalPages: 1, error: errorMessage(err, 'The catalogue could not be loaded.') });
      }
    );
    return () => {
      current = false;
    };
  }, [filters, requestKey]);

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
        <HugeiconsIcon icon={ArrowRight01Icon} size={14} className="text-neutral-500" aria-hidden="true" />
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
          onRetry={() => setRetries((n) => n + 1)}
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
