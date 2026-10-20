/**
 * Storefront API Client for Shop.co
 * Communicates with the PHP 8+ REST backend API running on XAMPP / local server.
 */

import { Product, ProductColor, ProductVariant, Review } from '@/types';
import { optimizeImageForUpload } from '@/lib/image-optimize';

// Same-origin by default: next.config.mjs proxies /api/v1/* to the PHP backend so the
// HTTP-only session cookies work without exposing session tokens to JavaScript.
/** Neutral stand-in shown when a product has no photos yet. */
export const PRODUCT_IMAGE_PLACEHOLDER = '/images/placeholder-product.svg';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1';

export interface ApiProductSummary {
  id: number;
  uuid: string;
  name: string;
  slug: string;
  description: string;
  product_type: 'physical';
  base_price: number;
  original_price: number | null;
  currency: string;
  sku: string;
  rating_avg: number;
  rating_count: number;
  is_featured: boolean;
  is_flash_deal: boolean;
  /** When the flash deal ends (null = no end date set). */
  flash_deal_ends_at?: string | null;
  dress_style: string | null;
  created_at: string;
  category_id: number;
  category_name: string;
  category_slug: string;
  primary_image: string | null;
  total_stock: number;
  in_stock: boolean;
  discount_percent: number;
  available_colors?: Array<{ name: string; hex: string }>;
  available_sizes?: string[];
}

export interface ApiProductImage {
  id: number;
  image_url: string;
  alt_text?: string;
  is_primary: number | boolean;
  display_order: number;
}

export interface ApiProductVariant {
  id: number;
  sku: string;
  size: string;
  color_name: string;
  color_hex: string;
  price_override: number | null;
  stock_quantity: number;
  low_stock_threshold?: number;
  in_stock: boolean;
}

export interface ApiProductReview {
  id: number;
  author: string;
  rating: number;
  title?: string | null;
  comment: string;
  verified: boolean;
  created_at: string;
}

export interface ApiProductDetail extends ApiProductSummary {
  status: string;
  updated_at: string;
  images: ApiProductImage[];
  variants: ApiProductVariant[];
  available_colors: Array<{ name: string; hex: string }>;
  available_sizes: string[];
  reviews?: ApiProductReview[];
}

export interface CatalogFacets {
  categories: ApiCategory[];
  colors: Array<{ name: string; hex: string; product_count: number }>;
  sizes: string[];
  dress_styles: string[];
  price: { min: number; max: number };
}

export interface ApiCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  image_url: string;
  display_order?: number;
  product_count: number;
}

export interface ApiPromotion {
  code: string;
  description: string;
  discount_percent: number;
}

export interface ApiBanner {
  id: number;
  title: string;
  subtitle: string | null;
  cta_text: string | null;
  cta_url: string | null;
  image_url: string;
  display_order: number;
  is_active?: number | boolean;
}

export interface ApiReview {
  id: number;
  product_id: number;
  product_name?: string;
  author: string;
  rating: number;
  title?: string;
  comment: string;
  verified?: boolean | number;
  created_at: string;
}

export interface HomepageData {
  /** Real counts for the hero (no marketing numbers). */
  stats?: { published_products: number; categories: number; states_served: number };
  /** Soonest real end time among the flash deals shown; null = no countdown. */
  flash_deals_end_at?: string | null;
  featured_products: ApiProductSummary[];
  flash_deals: ApiProductSummary[];
  new_arrivals: ApiProductSummary[];
  top_selling: ApiProductSummary[];
  categories: ApiCategory[];
  promotions: ApiPromotion[];
  banners: ApiBanner[];
  reviews?: ApiReview[];
  /** Brands for the logo strip (admin Settings); empty hides it. */
  brands?: string[];
}

export interface PaginationMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface ProductListResponse {
  items: ApiProductSummary[];
  pagination: PaginationMeta;
}

export interface ProductQueryParams {
  category?: string;
  search?: string;
  min_price?: number;
  max_price?: number;
  dress_style?: string;
  colors?: string[];
  sizes?: string[];
  on_sale?: boolean;
  is_featured?: boolean;
  flash_deals?: boolean;
  sort?: 'popularity' | 'price_asc' | 'price_desc' | 'latest' | 'rating_desc' | string;
  page?: number;
  per_page?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  meta?: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
  };
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// Session tokens live only in HTTP-only cookies. JavaScript holds just the per-session
// CSRF tokens (in memory), one for the customer session and one for the admin session.
let memoryCsrfToken: string | null = null;
let memoryAdminCsrfToken: string | null = null;

export function setMemoryCsrfToken(token: string | null): void {
  memoryCsrfToken = token;
}

export function getMemoryCsrfToken(): string | null {
  return memoryCsrfToken;
}

export function setAdminCsrfToken(token: string | null): void {
  memoryAdminCsrfToken = token;
}

function isAdminEndpoint(endpoint: string): boolean {
  return endpoint.startsWith('/admin') || endpoint.startsWith('/setup') || endpoint.includes('scope=admin');
}

function rememberCsrf(user: ApiUser | undefined, token: string | undefined): void {
  if (!token) return;
  if (user && (user.role === 'admin' || user.role === 'super_admin')) {
    setAdminCsrfToken(token);
  } else {
    setMemoryCsrfToken(token);
  }
}

/** The message to show for a failed request (or anything thrown), else the fallback. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export class ApiError extends Error {
  statusCode: number;
  errorCode?: string;
  details?: Record<string, unknown>;

  constructor(message: string, statusCode: number, errorCode?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
  }
}

// Only public catalogue reads are cached briefly. Orders, payment status, customer and
// admin data are always fetched fresh so status changes show up immediately.
const CACHEABLE_PREFIXES = ['/products', '/categories', '/storefront/homepage'];
const apiCache = new Map<string, { data: ApiResponse<unknown>; timestamp: number }>();
const CACHE_TTL_MS = 30000;

export function clearApiCache(): void {
  apiCache.clear();
}

/**
 * Standard HTTP fetcher returning full ApiResponse envelope.
 */
async function fetchFullFromApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${API_BASE_URL}${path}`;
  const method = (options?.method || 'GET').toUpperCase();
  const isCacheable = method === 'GET' && CACHEABLE_PREFIXES.some((prefix) => path.startsWith(prefix));

  if (isCacheable) {
    const cached = apiCache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data as ApiResponse<T>;
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options?.headers as Record<string, string> || {}),
  };

  const csrf = isAdminEndpoint(path) ? memoryAdminCsrfToken : memoryCsrfToken;
  if (csrf && method !== 'GET') {
    headers['X-CSRF-Token'] = csrf;
  }

  try {
    const res = await fetch(url, {
      ...options,
      credentials: 'include',
      signal: controller.signal,
      headers,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    let json: ApiResponse<T>;
    try {
      json = await res.json();
    } catch {
      throw new ApiError(
        res.status >= 500 || res.status === 0
          ? 'The store server is not responding. Please try again in a moment.'
          : `Unexpected response from the server (HTTP ${res.status}).`,
        res.status
      );
    }

    if (!res.ok || !json.success) {
      const errMsg =
        json.error?.message || json.message || `Request failed with status ${res.status}`;
      throw new ApiError(errMsg, res.status, json.error?.code, json.error?.details);
    }

    if (isCacheable) {
      apiCache.set(url, { data: json, timestamp: Date.now() });
    } else if (method !== 'GET') {
      apiCache.clear();
    }

    return json;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError('The request timed out. Please check your connection and try again.', 0, 'TIMEOUT');
    }
    if (err instanceof TypeError) {
      throw new ApiError('Could not reach the store server. Please check your connection and try again.', 0, 'NETWORK_ERROR');
    }
    throw err;
  }
}

/**
 * Standard HTTP fetcher returning unwrapped payload.
 */
async function fetchFromApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const json = await fetchFullFromApi<T>(endpoint, options);
  return json.data as T;
}

/** Request helpers shared with lib/admin-api.ts. */
export const apiRequest = fetchFromApi;
export const apiRequestFull = fetchFullFromApi;

/**
 * Maps an API product summary or detail into the storefront Product shape.
 * Only real data is used: no invented reviews, ratings, specifications, FAQs,
 * colours or sizes. Missing information stays empty and the UI shows nothing for it.
 */
export function mapApiProductToStorefront(item: ApiProductSummary | ApiProductDetail): Product {
  const images =
    'images' in item && Array.isArray(item.images) && item.images.length > 0
      ? item.images.map((img) => img.image_url)
      : item.primary_image
        ? [item.primary_image]
        : [PRODUCT_IMAGE_PLACEHOLDER];

  const colors: ProductColor[] = Array.isArray(item.available_colors)
    ? item.available_colors.map((c) => ({ name: c.name, hex: c.hex || '#000000' }))
    : [];
  const sizes: string[] = Array.isArray(item.available_sizes) ? item.available_sizes : [];

  const basePrice = Number(item.base_price);
  const variants: ProductVariant[] | undefined =
    'variants' in item && Array.isArray(item.variants)
      ? item.variants.map((v) => ({
          id: Number(v.id),
          sku: v.sku,
          size: v.size,
          color: { name: v.color_name, hex: v.color_hex || '#000000' },
          price: v.price_override !== null && Number(v.price_override) > 0 ? Number(v.price_override) : basePrice,
          stock: Math.max(0, Number(v.stock_quantity) || 0),
        }))
      : undefined;

  const reviews: Review[] =
    'reviews' in item && Array.isArray(item.reviews)
      ? item.reviews.map((r) => ({
          id: String(r.id),
          author: r.author,
          rating: Number(r.rating),
          verified: Boolean(r.verified),
          comment: r.comment,
          date: new Date(r.created_at.replace(' ', 'T')).toLocaleDateString('en-NG', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
        }))
      : [];

  const details = [item.sku ? `SKU: ${item.sku}` : '', item.category_name ? `Category: ${item.category_name}` : ''].filter(Boolean);

  return {
    id: String(item.id),
    name: item.name,
    slug: item.slug,
    description: item.description || '',
    price: basePrice,
    originalPrice: item.original_price ? Number(item.original_price) : undefined,
    discountPercent: item.discount_percent > 0 ? item.discount_percent : undefined,
    rating: Number(item.rating_avg) || 0,
    reviewCount: Number(item.rating_count) || 0,
    category: item.category_slug,
    categoryName: item.category_name,
    dressStyle: item.dress_style ? [item.dress_style.toLowerCase()] : [],
    gender: 'unisex',
    images,
    colors,
    sizes,
    variants,
    totalStock: Number(item.total_stock) || 0,
    inStock: Boolean(item.in_stock),
    sku: item.sku,
    details,
    faqs: [],
    reviews,
  };
}

/**
 * Fetch Homepage sections (featured, flash deals, new arrivals, top selling, categories, promotions).
 */
export async function getHomepageData(): Promise<HomepageData> {
  return fetchFromApi<HomepageData>('/storefront/homepage');
}

/**
 * Fetch filtered, searched, and paginated public product listing.
 */
export async function getProducts(params: ProductQueryParams = {}): Promise<ProductListResponse> {
  const query = new URLSearchParams();
  if (params.category) query.set('category', params.category);
  if (params.search) query.set('search', params.search);
  if (params.min_price !== undefined) query.set('min_price', String(params.min_price));
  if (params.max_price !== undefined) query.set('max_price', String(params.max_price));
  if (params.dress_style) query.set('dress_style', params.dress_style);
  if (params.colors && params.colors.length > 0) query.set('colors', params.colors.join(','));
  if (params.sizes && params.sizes.length > 0) query.set('sizes', params.sizes.join(','));
  if (params.on_sale) query.set('on_sale', '1');
  if (params.is_featured) query.set('is_featured', '1');
  if (params.flash_deals) query.set('flash_deals', '1');
  if (params.sort) query.set('sort', params.sort);
  if (params.page !== undefined) query.set('page', String(params.page));
  if (params.per_page !== undefined) query.set('per_page', String(params.per_page));

  const queryString = query.toString();
  const endpoint = queryString ? `/products?${queryString}` : '/products';
  
  const json = await fetchFullFromApi<ApiProductSummary[]>(endpoint);

  const rawItems = Array.isArray(json.data) ? json.data : [];
  const meta = json.meta;

  const pagination: PaginationMeta = meta
    ? {
        total: Number(meta.total ?? rawItems.length),
        page: Number(meta.page ?? 1),
        per_page: Number(meta.per_page ?? 12),
        total_pages: Number(meta.total_pages ?? 1),
      }
    : {
        total: rawItems.length,
        page: 1,
        per_page: 12,
        total_pages: 1,
      };

  return {
    items: rawItems,
    pagination,
  };
}

/**
 * Fetch single product detail by ID or Slug.
 */
export async function getProductDetail(idOrSlug: string | number): Promise<ApiProductDetail> {
  return fetchFromApi<ApiProductDetail>(`/products/${encodeURIComponent(idOrSlug)}`);
}

/**
 * Filter options that exist in the published catalogue.
 */
export async function getCatalogFacets(category?: string | null): Promise<CatalogFacets> {
  return fetchFromApi<CatalogFacets>(category ? `/catalog/facets?category=${encodeURIComponent(category)}` : '/catalog/facets');
}

/**
 * Fetch public active categories.
 */
export async function getCategories(): Promise<ApiCategory[]> {
  return fetchFromApi<ApiCategory[]>('/categories');
}

export const apiGetCategories = getCategories;

// =============================================================================
// AUTHENTICATION & CUSTOMER ACCOUNT API CLIENT METHODS
// =============================================================================

export interface ApiUser {
  id: number;
  uuid: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: 'customer' | 'admin' | 'super_admin';
  status: 'active' | 'unverified' | 'suspended';
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiAddress {
  id: number;
  user_id: number;
  label: string;
  recipient_name: string;
  phone: string;
  street_address: string;
  city: string;
  state: string;
  country: string;
  postal_code: string | null;
  is_default: number | boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiAuthResponse {
  user: ApiUser;
  csrf_token: string;
  expires_at: string;
}

export interface ApiShippingZone {
  id: number;
  name: string;
  code: string;
  description: string;
  states_covered: string[];
  fee: number;
  estimated_days: string;
  is_active: boolean;
}

/**
 * Register a new customer account.
 */
export async function apiRegister(payload: {
  full_name: string;
  email: string;
  password: string;
  phone?: string;
}): Promise<ApiAuthResponse> {
  const res = await fetchFullFromApi<ApiAuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  rememberCsrf(res.data?.user, res.data?.csrf_token);
  return res.data!;
}

/**
 * Sign in using email and password. The server sets the HTTP-only session cookie
 * (admin or customer scope, depending on the account role).
 */
export async function apiLogin(credentials: {
  email: string;
  password: string;
}): Promise<ApiAuthResponse> {
  const res = await fetchFullFromApi<ApiAuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
  rememberCsrf(res.data?.user, res.data?.csrf_token);
  return res.data!;
}

/**
 * Sign out of the customer session (or the admin session with scope 'admin').
 * Local state is cleared even if the network call fails.
 */
export async function apiLogout(scope: 'customer' | 'admin' = 'customer'): Promise<void> {
  try {
    await fetchFullFromApi<null>(`/auth/logout${scope === 'admin' ? '?scope=admin' : ''}`, {
      method: 'POST',
    });
  } finally {
    if (scope === 'admin') {
      setAdminCsrfToken(null);
    } else {
      setMemoryCsrfToken(null);
    }
    clearApiCache();
  }
}

/**
 * Fetch the current signed-in customer (or admin with scope 'admin').
 */
export async function apiGetMe(scope: 'customer' | 'admin' = 'customer'): Promise<{ user: ApiUser; csrf_token: string }> {
  const res = await fetchFullFromApi<{ user: ApiUser; csrf_token: string }>(
    `/auth/me${scope === 'admin' ? '?scope=admin' : ''}`
  );
  if (res.data?.csrf_token) {
    if (scope === 'admin') {
      setAdminCsrfToken(res.data.csrf_token);
    } else {
      setMemoryCsrfToken(res.data.csrf_token);
    }
  }
  return res.data!;
}

/**
 * Request a passwordless magic sign-in link. The link is delivered by email only.
 */
export async function apiRequestMagicLink(email: string): Promise<{ message: string }> {
  const res = await fetchFullFromApi<{ email: string; expires_in_minutes: number }>('/auth/customer/magic-link', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  return { message: res.message || 'Check your inbox for a sign-in link.' };
}

/**
 * Verify passwordless magic sign-in token.
 */
export async function apiVerifyMagicLink(token: string): Promise<ApiAuthResponse> {
  const res = await fetchFullFromApi<ApiAuthResponse>('/auth/customer/verify', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  rememberCsrf(res.data?.user, res.data?.csrf_token);
  return res.data!;
}

/**
 * Update authenticated customer profile.
 */
export async function apiUpdateProfile(data: { full_name?: string; phone?: string }): Promise<ApiUser> {
  return fetchFromApi<ApiUser>('/customer/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/**
 * List customer saved addresses.
 */
export async function apiGetAddresses(): Promise<ApiAddress[]> {
  return fetchFromApi<ApiAddress[]>('/customer/addresses');
}

/**
 * Create a new customer delivery address.
 */
export async function apiCreateAddress(address: Partial<ApiAddress>): Promise<ApiAddress> {
  return fetchFromApi<ApiAddress>('/customer/addresses', {
    method: 'POST',
    body: JSON.stringify(address),
  });
}

/**
 * Delete a customer delivery address.
 */
export async function apiDeleteAddress(id: number): Promise<void> {
  await fetchFromApi<null>(`/customer/addresses/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Set an address as default.
 */
export async function apiSetDefaultAddress(id: number): Promise<void> {
  await fetchFromApi<null>(`/customer/addresses/${id}/default`, {
    method: 'POST',
  });
}

export interface ApiSavedCartItem {
  variant_id: number;
  product_id: number;
  quantity: number;
  size: string;
  color_name: string;
  color_hex: string;
  sku: string;
  unit_price: number;
  original_price: number | null;
  stock_quantity: number;
  product_name: string;
  product_slug: string;
  available: boolean;
  image_url: string | null;
}

export interface CartLineCheck {
  variant_id: number;
  product_id: number;
  sku: string;
  size: string;
  color_name: string;
  color_hex: string;
  unit_price: number;
  original_price: number | null;
  stock_quantity: number;
  product_name: string;
  product_slug: string;
  available: boolean;
}

/**
 * Live price, stock and availability for cart lines (no sign-in needed).
 */
export async function apiCheckCartLines(variantIds: number[]): Promise<{ lines: CartLineCheck[] }> {
  if (variantIds.length === 0) return { lines: [] };
  return fetchFromApi<{ lines: CartLineCheck[] }>('/checkout/cart-check', {
    method: 'POST',
    body: JSON.stringify({ variant_ids: variantIds }),
  });
}

/**
 * The signed-in customer's saved cart (current prices and stock).
 */
export async function apiGetSavedCart(): Promise<ApiSavedCartItem[]> {
  const res = await fetchFromApi<{ items: ApiSavedCartItem[] }>('/customer/cart');
  return res.items || [];
}

/**
 * Replace the signed-in customer's saved cart.
 */
export async function apiSaveCart(items: Array<{ variant_id: number; quantity: number }>): Promise<ApiSavedCartItem[]> {
  const res = await fetchFromApi<{ items: ApiSavedCartItem[] }>('/customer/cart', {
    method: 'PUT',
    body: JSON.stringify({ items }),
  });
  return res.items || [];
}

/**
 * The signed-in customer's saved wishlist.
 */
export async function apiGetSavedWishlist(): Promise<{ product_ids: number[]; products: ApiProductSummary[] }> {
  return fetchFromApi<{ product_ids: number[]; products: ApiProductSummary[] }>('/customer/wishlist');
}

/**
 * Replace the signed-in customer's saved wishlist.
 */
export async function apiSaveWishlist(productIds: number[]): Promise<{ product_ids: number[]; products: ApiProductSummary[] }> {
  return fetchFromApi<{ product_ids: number[]; products: ApiProductSummary[] }>('/customer/wishlist', {
    method: 'PUT',
    body: JSON.stringify({ product_ids: productIds }),
  });
}

/**
 * Check admin onboarding setup status.
 */
export async function apiGetSetupStatus(): Promise<{ is_setup_completed: boolean; store_name: string }> {
  return fetchFromApi<{ is_setup_completed: boolean; store_name: string }>('/setup/status');
}

export interface SetupStorePayload {
  name: string;
  email: string;
  password: string;
  store_name: string;
  contact_email: string;
  contact_phone: string;
  origin_address: string;
  origin_city: string;
  origin_state: string;
}

/**
 * Complete first-run admin onboarding.
 */
export async function apiSetupStore(payload: SetupStorePayload): Promise<ApiAuthResponse> {
  const res = await fetchFullFromApi<ApiAuthResponse>('/setup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  rememberCsrf(res.data?.user, res.data?.csrf_token);
  return res.data!;
}

export interface AdminProduct {
  id: number;
  uuid: string;
  name: string;
  slug: string;
  description: string;
  product_type: 'physical';
  status: 'draft' | 'published' | 'archived';
  base_price: number;
  original_price: number | null;
  currency: string;
  sku: string;
  rating_avg: number;
  rating_count: number;
  is_featured: boolean;
  is_flash_deal: boolean;
  flash_deal_ends_at?: string | null;
  dress_style: string | null;
  created_at: string;
  updated_at: string;
  category_id: number | null;
  category_name?: string;
  category_slug?: string;
  primary_image?: string;
  total_stock: number;
  is_low_stock: boolean;
  variants_count: number;
  variants: ApiProductVariant[];
  images: ApiProductImage[];
}

export interface AdminProductQuery {
  page?: number;
  per_page?: number;
  search?: string;
  category?: string;
  status?: string;
  inventory?: string;
}

/** What the product editor saves. A new variant carries its starting stock; later changes go through inventory. */
export interface AdminProductPayload {
  name: string;
  slug: string;
  category_id: number | null;
  product_type: 'physical';
  status: AdminProduct['status'];
  dress_style: string | null;
  base_price: number;
  original_price: number | null;
  sku: string;
  description: string;
  is_featured: 0 | 1;
  is_flash_deal: 0 | 1;
  flash_deal_ends_at: string;
  images: Array<{ image_url: string; alt_text: string; is_primary: 0 | 1; display_order: number }>;
  variants: Array<{
    id?: number;
    stock_quantity?: number;
    sku: string;
    size: string;
    color_name: string;
    color_hex: string;
    price_override: number | null;
    low_stock_threshold: number;
  }>;
}

/**
 * Fetch admin products with filtering and pagination.
 */
export async function apiGetAdminProducts(params: AdminProductQuery = {}): Promise<{
  items: AdminProduct[];
  pagination: PaginationMeta;
}> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      query.append(k, String(v));
    }
  });
  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await fetchFullFromApi<AdminProduct[]>(`/admin/products${qs}`);
  return {
    items: res.data || [],
    pagination: res.meta || {
      page: 1,
      per_page: 15,
      total: 0,
      total_pages: 1,
    },
  };
}

/**
 * Create a new product as admin.
 */
export async function apiCreateAdminProduct(payload: AdminProductPayload): Promise<ApiProductDetail> {
  return fetchFromApi<ApiProductDetail>('/admin/products', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Update an existing product as admin.
 */
export async function apiUpdateAdminProduct(id: number, payload: AdminProductPayload): Promise<ApiProductDetail> {
  return fetchFromApi<ApiProductDetail>(`/admin/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

/**
 * Quick status update for product.
 */
export async function apiUpdateAdminProductStatus(
  id: number,
  status: 'draft' | 'published' | 'archived'
): Promise<void> {
  await fetchFromApi<unknown>(`/admin/products/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

/**
 * Archive a product.
 */
export async function apiDeleteAdminProduct(id: number): Promise<void> {
  await fetchFromApi<unknown>(`/admin/products/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Upload an image (products, categories, banners). The photo is resized and converted to
 * WebP in the browser first, so customers download small files.
 */
export async function apiUploadProductImage(
  file: File
): Promise<{ image_url: string; file_name: string; size_bytes: number }> {
  const formData = new FormData();
  formData.append('image', await optimizeImageForUpload(file));

  return fetchFromApi<{ image_url: string; file_name: string; size_bytes: number }>('/admin/upload-image', {
    method: 'POST',
    body: formData,
  });
}

// =============================================================================
// Checkout & Order Creation APIs
// =============================================================================

export interface CheckoutItemInput {
  product_id: number;
  variant_id?: number;
  quantity: number;
  size?: string;
  color?: string;
}

export interface ShippingAddressInput {
  full_name: string;
  phone: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  postal_code?: string;
  country: string;
}

export interface ShippingZone {
  id: number;
  name: string;
  code: string;
  description?: string;
  fee: number;
  estimated_days: string;
  states_covered: string[];
  is_active: boolean;
}

/** Size and colour as saved on an order line. */
export interface VariantOptions {
  size?: string;
  color?: string;
  color_hex?: string;
}

/** Store contact and dispatch details as configured in admin Settings ('' means not set). */
export interface StoreOrigin {
  store_name: string;
  origin_city: string;
  origin_state: string;
  origin_address: string;
  contact_phone: string;
  contact_email: string;
  whatsapp_phone?: string;
}

/** A priced cart line as the server checked it (quote and newly placed order). */
export interface CheckoutLineItem {
  product_id: number;
  variant_id: number;
  name: string;
  slug?: string;
  sku: string;
  variant_options: VariantOptions | null;
  unit_price: number;
  quantity: number;
  line_total: number;
  stock_available?: number;
}

export interface CheckoutQuoteResponse {
  currency: string;
  items: CheckoutLineItem[];
  items_count: number;
  total_quantity: number;
  subtotal: number;
  discount_amount: number;
  shipping_fee: number;
  grand_total: number;
  applied_coupon: { id: number; code: string; description: string; discount_percent: number } | null;
  shipping_zone: ShippingZone | null;
  eligible_zones: ShippingZone[];
  origin: StoreOrigin;
}

/** The delivery zone as it was when the order was placed. */
export interface OrderZoneSnapshot {
  id: number;
  name: string;
  code: string;
  fee: number;
  estimated_days: string;
  origin?: StoreOrigin;
}

export interface CheckoutOrderResponse {
  order_id: number;
  order_number: string;
  guest_access_token: string;
  guest_email: string;
  user_id: number | null;
  status: string;
  payment_status: string;
  expires_at?: string | null;
  currency: string;
  subtotal: number;
  discount_amount: number;
  shipping_fee: number;
  grand_total: number;
  shipping_zone: OrderZoneSnapshot | null;
  shipping_address: ShippingAddressInput;
  items_count: number;
  items: CheckoutLineItem[];
  created_at: string;
  /** True when a repeated submit returned the order already placed. */
  replayed?: boolean;
}

/** One line of a placed order. */
export interface ApiOrderItem {
  id: number;
  product_id: number | null;
  variant_id: number | null;
  item_name: string;
  sku: string;
  variant_options: VariantOptions | null;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export interface ApiOrderShipment {
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  status: string;
  shipped_at: string | null;
  delivered_at: string | null;
}

/** A customer's order as listed in "My orders". */
export interface ApiCustomerOrder {
  id: number;
  order_number: string;
  order_status: string;
  payment_status: string;
  currency: string;
  subtotal: number;
  discount_amount: number;
  shipping_fee: number;
  grand_total: number;
  shipping_address_snapshot: ShippingAddressInput | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  items: ApiOrderItem[];
  items_count: number;
  shipment: ApiOrderShipment | null;
}

/** One order as the order lookup returns it (internal fields are removed by the server). */
export interface ApiOrder extends Omit<ApiCustomerOrder, 'items_count'> {
  /** Same as order_status. */
  status: string;
  guest_email: string | null;
  shipping_zone_id: number | null;
  shipping_zone_snapshot: OrderZoneSnapshot | null;
  applied_promo_code: string | null;
  notes: string | null;
  customer_marked_paid_at: string | null;
  history: Array<{ previous_status: string | null; new_status: string; created_at: string }>;
  /** The successful payment, else the latest attempt. */
  payment: {
    provider: string;
    provider_reference: string | null;
    amount: number;
    currency: string;
    status: string;
    verified_at: string | null;
  } | null;
}

/**
 * Fetch available shipping destination zones from the store backend.
 */
export async function apiGetShippingZones(): Promise<{ zones: ShippingZone[]; origin: StoreOrigin }> {
  return fetchFromApi<{ zones: ShippingZone[]; origin: StoreOrigin }>('/checkout/shipping-zones');
}

export interface ValidatePromoResponse {
  valid: boolean;
  code: string;
  discount_percent: number;
  discount_amount: number;
  description: string;
}

/**
 * Validate a promotional coupon code server-side against MySQL active promotions, dates and usage limits.
 */
export async function apiValidatePromotion(
  code: string,
  subtotal: number = 0
): Promise<ValidatePromoResponse> {
  return fetchFromApi<ValidatePromoResponse>('/checkout/validate-promo', {
    method: 'POST',
    body: JSON.stringify({ code, subtotal }),
  });
}

/**
 * Fetch real-time checkout quote with server-side pricing and shipping calculation.
 */
export async function apiGetCheckoutQuote(data: {
  items: CheckoutItemInput[];
  shipping_address?: Partial<ShippingAddressInput>;
  shipping_zone_id?: number;
  coupon_code?: string;
}): Promise<CheckoutQuoteResponse> {
  return fetchFromApi<CheckoutQuoteResponse>('/checkout/quote', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Submit and create a real order with atomic inventory reservation.
 */
export async function apiCreateCheckoutOrder(data: {
  email?: string;
  items: CheckoutItemInput[];
  shipping_address: ShippingAddressInput;
  shipping_zone_id?: number;
  coupon_code?: string;
  notes?: string;
}, idempotencyKey?: string): Promise<CheckoutOrderResponse> {
  return fetchFromApi<CheckoutOrderResponse>('/checkout/orders', {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify(data),
  });
}

/**
 * Retrieve order details. Access requires the signed-in owner's session, the guest access
 * token (sent as a header, never in the URL), or the full email used at checkout.
 */
export async function apiGetOrder(
  orderNumber: string,
  verification?: string | { token?: string; email?: string; reference?: string }
): Promise<ApiOrder> {
  const headers: Record<string, string> = {};
  const token = typeof verification === 'string' ? verification : verification?.token;
  const email = typeof verification === 'string' ? undefined : verification?.email;

  if (token) headers['X-Guest-Access-Token'] = token;
  if (email) headers['X-Order-Email'] = email.trim();

  return fetchFromApi<ApiOrder>(`/checkout/orders/${encodeURIComponent(orderNumber)}`, { headers });
}

/**
 * Retrieve all past orders for the authenticated customer.
 */
export async function apiGetCustomerOrders(): Promise<ApiCustomerOrder[]> {
  return fetchFromApi<ApiCustomerOrder[]>('/customer/orders');
}

export interface PaymentMethodItem {
  id: 'monnify' | 'kora' | 'whatsapp';
  name: string;
  description: string;
  badge: string;
  is_default: boolean;
}

export interface PaymentMethodsResponse {
  methods: PaymentMethodItem[];
  support_phone: string;
}

/**
 * Fetch enabled payment gateways and support contact.
 */
export async function apiGetPaymentMethods(): Promise<PaymentMethodsResponse> {
  return fetchFromApi<PaymentMethodsResponse>('/checkout/payment-methods');
}

export interface PaymentInitializationResponse {
  order_number: string;
  provider: 'monnify' | 'kora' | string;
  provider_reference: string;
  checkout_url?: string;
  amount: number;
  currency: string;
  status: string;
  expires_in_minutes?: number;
  expires_at?: string | null;
  support_phone?: string;
}

/**
 * Initialize payment session (Monnify or Kora) for an order.
 */
export async function apiInitializePayment(
  orderNumber: string,
  guestAccessToken?: string,
  redirectUrl?: string,
  gateway?: 'monnify' | 'kora' | string
): Promise<PaymentInitializationResponse> {
  const headers: Record<string, string> = {};
  if (guestAccessToken) {
    headers['X-Guest-Access-Token'] = guestAccessToken;
  }

  return fetchFromApi<PaymentInitializationResponse>(
    `/checkout/orders/${orderNumber}/initialize-payment`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        guest_access_token: guestAccessToken,
        redirect_url: redirectUrl,
        gateway: gateway || 'monnify',
      }),
    }
  );
}

/**
 * "Mark as paid" for a WhatsApp transfer: tells the store to check and confirm it. This never
 * marks the order paid; the store does that once the money has arrived.
 */
export async function apiMarkPaymentSent(
  orderNumber: string,
  guestAccessToken?: string
): Promise<{ order_number: string; recorded: boolean; order_status: string; customer_marked_paid_at?: string | null; expires_at?: string | null }> {
  const headers: Record<string, string> = {};
  if (guestAccessToken) {
    headers['X-Guest-Access-Token'] = guestAccessToken;
  }
  return fetchFromApi(`/checkout/orders/${encodeURIComponent(orderNumber)}/payment-sent`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ guest_access_token: guestAccessToken }),
  });
}

export interface PaymentVerificationResponse {
  order_number: string;
  provider_reference: string;
  provider?: string;
  status: 'successful' | 'failed' | 'pending' | 'not_started';
  order_status: string;
  amount: number;
  currency: string;
  verified_at?: string;
  failure_reason?: string;
  message?: string;
  expires_at?: string | null;
  source: string;
}


/**
 * Authoritatively query backend for verified payment status of an order.
 * Replaces trusting client query parameters with real server-side verification.
 */
export async function apiVerifyPayment(
  orderNumber: string,
  guestAccessToken?: string,
  reference?: string
): Promise<PaymentVerificationResponse> {
  const params = new URLSearchParams();
  if (reference) {
    params.append('reference', reference);
  }
  const query = params.toString() ? `?${params.toString()}` : '';

  const headers: Record<string, string> = {};
  if (guestAccessToken) {
    headers['X-Guest-Access-Token'] = guestAccessToken;
  }
  if (reference) {
    headers['X-Payment-Reference'] = reference;
  }

  return fetchFromApi<PaymentVerificationResponse>(
    `/checkout/orders/${orderNumber}/verify-payment${query}`,
    {
      method: 'GET',
      headers,
    }
  );
}

export async function apiSubscribeNewsletter(email: string): Promise<{ email: string }> {
  return fetchFromApi<{ email: string }>('/newsletter/subscribe', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

/** One-click unsubscribe from the link in every newsletter. */
export async function apiUnsubscribeNewsletter(token: string): Promise<{ email: string }> {
  return fetchFromApi<{ email: string }>('/newsletter/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

/**
 * Submit a product review. It is held for moderation; "verified purchase" is decided by the
 * server from paid orders for the given email (or the signed-in account).
 */
export async function apiSubmitReview(
  productIdOrSlug: string | number,
  review: { author_name: string; email: string; rating: number; title?: string; comment: string }
): Promise<{ id: number; status: 'pending'; verified_purchase: boolean; message: string }> {
  const res = await fetchFullFromApi<{ id: number; status: 'pending'; verified_purchase: boolean }>(
    `/products/${encodeURIComponent(String(productIdOrSlug))}/reviews`,
    { method: 'POST', body: JSON.stringify(review) }
  );
  return { ...res.data!, message: res.message || 'Thanks! Your review will appear once it has been checked.' };
}
