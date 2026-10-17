'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { FilterState, Product } from '@/types';
import {
  getProducts,
  getCategories,
  mapApiProductToStorefront,
  ApiCategory,
} from '@/lib/api-client';
import { FilterSidebar } from '@/components/catalog/FilterSidebar';
import { FilterDrawer } from '@/components/catalog/FilterDrawer';
import { ProductGrid } from '@/components/catalog/ProductGrid';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight01Icon } from '@hugeicons/core-free-icons';

const COLOR_FAMILIES: Record<string, string[]> = {
  black: ['black', 'onyx', 'pitch', 'midnight', 'charcoal', 'dark', 'ebony', 'gray', 'grey'],
  white: ['white', 'clean', 'sand', 'ivory', 'cream', 'off-white'],
  blue: ['blue', 'navy', 'indigo', 'ocean', 'cobalt', 'royal', 'denim'],
  red: ['red', 'crimson', 'maroon', 'burgundy', 'ruby'],
  green: ['green', 'olive', 'sage', 'emerald', 'mint'],
  yellow: ['yellow', 'mustard', 'gold', 'amber', 'khaki', 'tan'],
  orange: ['orange', 'rust', 'peach', 'coral'],
  cyan: ['cyan', 'teal', 'aqua', 'turquoise', 'multi-color'],
  purple: ['purple', 'violet', 'lavender', 'plum'],
  pink: ['pink', 'rose', 'blush', 'fuchsia'],
};

function matchesProductColor(
  itemColors: Array<{ name: string; hex: string }>,
  selectedColors: string[]
): boolean {
  if (selectedColors.length === 0) return true;
  return itemColors.some((c) => {
    const cName = c.name.toLowerCase();
    return selectedColors.some((sc) => {
      const lowerSc = sc.toLowerCase();
      if (cName === lowerSc || cName.includes(lowerSc)) return true;
      const familyWords = COLOR_FAMILIES[lowerSc] || [lowerSc];
      return familyWords.some((word) => cName.includes(word));
    });
  });
}

function CatalogContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [onSaleFilter, setOnSaleFilter] = useState<boolean>(searchParams.get('onSale') === 'true');
  const [newArrivalsFilter, setNewArrivalsFilter] = useState<boolean>(searchParams.get('newArrivals') === 'true');

  const [filters, setFilters] = useState<FilterState>({
    category: searchParams.get('cat') || searchParams.get('category'),
    dressStyle: searchParams.get('style') || searchParams.get('dressStyle'),
    minPrice: searchParams.get('min_price') ? Number(searchParams.get('min_price')) : 0,
    maxPrice: searchParams.get('max_price') ? Number(searchParams.get('max_price')) : 50000,
    selectedColors: searchParams.get('color')
      ? (searchParams.get('color') as string).split(',').filter(Boolean)
      : searchParams.get('colors')
      ? (searchParams.get('colors') as string).split(',').filter(Boolean)
      : [],
    selectedSizes: searchParams.get('size')
      ? (searchParams.get('size') as string).split(',').filter(Boolean)
      : searchParams.get('sizes')
      ? (searchParams.get('sizes') as string).split(',').filter(Boolean)
      : [],
    sortBy: (searchParams.get('sort') as FilterState['sortBy']) || 'most-popular',
    searchQuery: searchParams.get('q') || searchParams.get('search') || '',
  });

  // Load categories from API on mount
  useEffect(() => {
    let isMounted = true;
    getCategories()
      .then((cats) => {
        if (isMounted) setCategories(cats);
      })
      .catch((err) => {
        console.warn('Could not load categories for sidebar:', err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Keep state synchronized whenever URL query parameters change (e.g., Header/Navbar/Breadcrumb clicks)
  useEffect(() => {
    const cat = searchParams.get('cat') || searchParams.get('category');
    const style = searchParams.get('style') || searchParams.get('dressStyle');
    const q = searchParams.get('q') || searchParams.get('search') || '';
    const onSale = searchParams.get('onSale') === 'true';
    const newArrivals = searchParams.get('newArrivals') === 'true';
    const colorParam = searchParams.get('color') || searchParams.get('colors');
    const sizeParam = searchParams.get('size') || searchParams.get('sizes');
    const minPriceParam = searchParams.get('min_price');
    const maxPriceParam = searchParams.get('max_price');
    const sortParam = searchParams.get('sort') as FilterState['sortBy'] | null;

    setOnSaleFilter(onSale);
    setNewArrivalsFilter(newArrivals);
    setFilters((prev) => ({
      ...prev,
      category: cat || null,
      dressStyle: style || null,
      searchQuery: q,
      selectedColors: colorParam ? colorParam.split(',').filter(Boolean) : prev.selectedColors,
      selectedSizes: sizeParam ? sizeParam.split(',').filter(Boolean) : prev.selectedSizes,
      minPrice: minPriceParam ? Number(minPriceParam) : prev.minPrice,
      maxPrice: maxPriceParam ? Number(maxPriceParam) : prev.maxPrice,
      sortBy: sortParam || prev.sortBy,
    }));
  }, [searchParams]);

  // Fetch products from backend API
  const fetchProductList = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Map frontend sort values to API sort parameters
    let apiSort = 'popularity';
    if (filters.sortBy === 'price-low-high') apiSort = 'price_asc';
    if (filters.sortBy === 'price-high-low') apiSort = 'price_desc';
    if (filters.sortBy === 'newest') apiSort = 'latest';
    if (filters.sortBy === 'rating') apiSort = 'rating_desc';

    try {
      const response = await getProducts({
        category: filters.category || undefined,
        search: filters.searchQuery.trim() || undefined,
        min_price: filters.minPrice > 0 ? filters.minPrice : undefined,
        max_price: filters.maxPrice < 50000 ? filters.maxPrice : undefined,
        dress_style: filters.dressStyle || undefined,
        colors: filters.selectedColors.length > 0 ? filters.selectedColors : undefined,
        sizes: filters.selectedSizes.length > 0 ? filters.selectedSizes : undefined,
        on_sale: onSaleFilter ? true : undefined,
        is_featured: newArrivalsFilter ? true : undefined,
        sort: apiSort,
        page: currentPage,
        per_page: 9,
      });

      let mappedItems = response.items.map(mapApiProductToStorefront);

      // Client-side verification and fallback filtering
      if (filters.selectedColors.length > 0) {
        mappedItems = mappedItems.filter((item) =>
          matchesProductColor(item.colors, filters.selectedColors)
        );
      }
      if (filters.selectedSizes.length > 0) {
        mappedItems = mappedItems.filter((item) =>
          item.sizes.some((s) =>
            filters.selectedSizes.some((ss) => ss.toLowerCase() === s.toLowerCase())
          )
        );
      }
      if (onSaleFilter) {
        mappedItems = mappedItems.filter((item) => Boolean(item.discountPercent));
      }

      setProducts(mappedItems);
      setTotalCount(response.pagination.total);
      setTotalPages(response.pagination.total_pages);
    } catch (err: any) {
      console.error('Failed to load products from API:', err);
      setError(err.message || 'Unable to connect to catalogue API');
      setProducts([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [filters, currentPage, onSaleFilter, newArrivalsFilter]);

  useEffect(() => {
    fetchProductList();
  }, [fetchProductList]);

  const handleFilterChange = (newFilters: Partial<FilterState>) => {
    setFilters((prev) => {
      const next = { ...prev, ...newFilters };

      // Update browser URL query string cleanly without corrupting active filters
      const params = new URLSearchParams();
      if (next.category) params.set('cat', next.category);
      if (next.dressStyle) params.set('style', next.dressStyle);
      if (next.searchQuery) params.set('q', next.searchQuery);
      if (next.selectedColors.length > 0) params.set('color', next.selectedColors.join(','));
      if (next.selectedSizes.length > 0) params.set('size', next.selectedSizes.join(','));
      if (next.minPrice > 0) params.set('min_price', String(next.minPrice));
      if (next.maxPrice < 50000) params.set('max_price', String(next.maxPrice));
      if (next.sortBy && next.sortBy !== 'most-popular') params.set('sort', next.sortBy);
      if (onSaleFilter) params.set('onSale', 'true');
      if (newArrivalsFilter) params.set('newArrivals', 'true');

      const query = params.toString();
      const nextUrl = query ? `/category?${query}` : '/category';
      router.replace(nextUrl, { scroll: false });

      return next;
    });
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setOnSaleFilter(false);
    setNewArrivalsFilter(false);
    router.replace('/category', { scroll: false });
    setFilters({
      category: null,
      dressStyle: null,
      minPrice: 0,
      maxPrice: 50000,
      selectedColors: [],
      selectedSizes: [],
      sortBy: 'most-popular',
      searchQuery: '',
    });
    setCurrentPage(1);
  };

  // Derive display category title using loaded categories metadata
  const activeCategory = categories.find(
    (c) => c.slug.toLowerCase() === filters.category?.toLowerCase()
  );
  const activeTitle = activeCategory
    ? activeCategory.name
    : filters.category
    ? filters.category.replace('-', ' ')
    : filters.dressStyle
    ? `${filters.dressStyle} style`
    : onSaleFilter
    ? 'On Sale Deals'
    : newArrivalsFilter
    ? 'New Arrivals'
    : 'All Products';

  const handleApplyDesktop = () => {
    window.scrollTo({ top: 100, behavior: 'smooth' });
  };

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
          onApply={handleApplyDesktop}
          categories={categories}
        />

        {/* Mobile Filter Bottom Drawer */}
        <FilterDrawer
          isOpen={isMobileDrawerOpen}
          onClose={() => setIsMobileDrawerOpen(false)}
          filters={filters}
          onFilterChange={handleFilterChange}
          onReset={handleResetFilters}
          categories={categories}
        />

        {/* Product Catalog Grid */}
        <ProductGrid
          products={products}
          totalCount={totalCount}
          categoryTitle={activeTitle}
          filters={filters}
          onFilterChange={handleFilterChange}
          onReset={handleResetFilters}
          onOpenMobileFilters={() => setIsMobileDrawerOpen(true)}
          loading={loading}
          error={error}
          onRetry={fetchProductList}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          totalPages={totalPages}
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
