/**
 * Catalogue URL <-> filter state. The URL is the single source of truth, so Back/Forward,
 * shared links and header links always show exactly the filters in the address bar.
 * Older parameter names (category, colors, sizes, newArrivals, topSelling...) are still read.
 */
import type { FilterState } from '@/types';

export const PAGE_SIZE = 12;

const SORTS: FilterState['sortBy'][] = ['most-popular', 'price-low-high', 'price-high-low', 'newest', 'rating'];

function list(value: string | null): string[] {
  return value ? value.split(',').map((v) => v.trim()).filter(Boolean) : [];
}

function num(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parseCatalogParams(params: URLSearchParams): FilterState {
  const sortParam = params.get('sort') as FilterState['sortBy'] | null;
  const sortBy: FilterState['sortBy'] = sortParam && SORTS.includes(sortParam)
    ? sortParam
    : params.get('newArrivals') === 'true'
      ? 'newest'
      : 'most-popular';

  return {
    category: params.get('cat') || params.get('category') || null,
    dressStyle: params.get('style') || params.get('dressStyle') || null,
    searchQuery: params.get('q') || params.get('search') || '',
    selectedColors: list(params.get('color') || params.get('colors')),
    selectedSizes: list(params.get('size') || params.get('sizes')),
    minPrice: num(params.get('min_price')),
    maxPrice: num(params.get('max_price')),
    sortBy,
    onSale: params.get('onSale') === 'true',
    flashDeals: params.get('flash') === 'true' || params.get('flashDeals') === 'true',
    page: Math.max(1, Math.floor(num(params.get('page')) ?? 1)),
  };
}

export function buildCatalogUrl(f: FilterState): string {
  const params = new URLSearchParams();
  if (f.category) params.set('cat', f.category);
  if (f.dressStyle) params.set('style', f.dressStyle);
  if (f.searchQuery.trim()) params.set('q', f.searchQuery.trim());
  if (f.selectedColors.length) params.set('color', f.selectedColors.join(','));
  if (f.selectedSizes.length) params.set('size', f.selectedSizes.join(','));
  if (f.minPrice !== null) params.set('min_price', String(f.minPrice));
  if (f.maxPrice !== null) params.set('max_price', String(f.maxPrice));
  if (f.sortBy !== 'most-popular') params.set('sort', f.sortBy);
  if (f.onSale) params.set('onSale', 'true');
  if (f.flashDeals) params.set('flash', 'true');
  if (f.page > 1) params.set('page', String(f.page));
  const qs = params.toString();
  return qs ? `/category?${qs}` : '/category';
}

export const EMPTY_FILTERS: FilterState = {
  category: null,
  dressStyle: null,
  minPrice: null,
  maxPrice: null,
  selectedColors: [],
  selectedSizes: [],
  sortBy: 'most-popular',
  searchQuery: '',
  onSale: false,
  flashDeals: false,
  page: 1,
};

/** API sort value for a UI sort option. */
export function apiSortFor(sortBy: FilterState['sortBy']): string {
  switch (sortBy) {
    case 'price-low-high':
      return 'price_asc';
    case 'price-high-low':
      return 'price_desc';
    case 'newest':
      return 'newest';
    case 'rating':
      return 'rating_desc';
    default:
      return 'best_selling';
  }
}

export function hasActiveFilters(f: FilterState): boolean {
  return Boolean(
    f.category || f.dressStyle || f.searchQuery.trim() || f.selectedColors.length || f.selectedSizes.length ||
      f.minPrice !== null || f.maxPrice !== null || f.onSale || f.flashDeals
  );
}
