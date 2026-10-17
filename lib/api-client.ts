/**
 * Storefront API Client for Shop.co
 * Communicates with the PHP 8+ REST backend API running on XAMPP / local server.
 */

import { Product, ProductColor, Review } from '@/types';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';

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

export interface ApiProductDetail extends ApiProductSummary {
  status: string;
  updated_at: string;
  images: ApiProductImage[];
  variants: ApiProductVariant[];
  available_colors: Array<{ name: string; hex: string }>;
  available_sizes: string[];
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
  featured_products: ApiProductSummary[];
  flash_deals: ApiProductSummary[];
  new_arrivals: ApiProductSummary[];
  top_selling: ApiProductSummary[];
  categories: ApiCategory[];
  promotions: ApiPromotion[];
  banners: ApiBanner[];
  reviews?: ApiReview[];
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
    details?: any;
  };
}

let memoryCsrfToken: string | null = null;

export function setMemoryCsrfToken(token: string | null): void {
  memoryCsrfToken = token;
}

export function getMemoryCsrfToken(): string | null {
  return memoryCsrfToken;
}

const apiCache = new Map<string, { data: ApiResponse<any>; timestamp: number }>();
const CACHE_TTL_MS = 60000; // 60 seconds

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
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const method = (options?.method || 'GET').toUpperCase();
  const isCacheable =
    method === 'GET' &&
    !endpoint.startsWith('/auth') &&
    !endpoint.startsWith('/customer');

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
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> || {}),
  };

  if (memoryCsrfToken) {
    headers['X-CSRF-Token'] = memoryCsrfToken;
  }

  const adminSessionToken =
    typeof window !== 'undefined' ? localStorage.getItem('shopco_admin_session_token') : null;
  const customerSessionToken =
    typeof window !== 'undefined' ? localStorage.getItem('shopco_customer_session_token') : null;

  if (endpoint.startsWith('/admin') && adminSessionToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${adminSessionToken}`;
  } else if (customerSessionToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${customerSessionToken}`;
  }

  const devToken =
    process.env.NEXT_PUBLIC_DEV_ADMIN_TOKEN ||
    (typeof window !== 'undefined' ? localStorage.getItem('shopco_dev_admin_token') : null) ||
    'dev_admin_secret_token_12345';

  if (devToken && (endpoint.startsWith('/admin') || endpoint.startsWith('/setup'))) {
    headers['X-Dev-Admin-Token'] = devToken;
  }

  try {
    const res = await fetch(url, {
      ...options,
      credentials: 'include',
      signal: controller.signal,
      headers,
      // Do not cache during active storefront operations
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    const json: ApiResponse<T> = await res.json();

    if (!res.ok || !json.success) {
      const errMsg =
        json.error?.message || json.message || `API request failed with status ${res.status}`;
      const err = new Error(errMsg);
      (err as any).statusCode = res.status;
      (err as any).errorCode = json.error?.code;
      throw err;
    }

    if (isCacheable) {
      apiCache.set(url, { data: json, timestamp: Date.now() });
    } else if (method !== 'GET') {
      apiCache.clear();
    }

    return json;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('API connection timed out. Please check if local backend is running.');
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

/**
 * Maps an API product summary or detail into the Storefront's Product interface.
 * Preserves compatibility with existing ProductCard, ImageGallery, and PDP components.
 */
export function mapApiProductToStorefront(
  item: ApiProductSummary | ApiProductDetail
): Product & { product_type: 'physical'; total_stock: number; in_stock: boolean } {
  // Extract images
  let images: string[] = [];
  if ('images' in item && Array.isArray(item.images) && item.images.length > 0) {
    images = item.images.map((img) => img.image_url);
  } else if (item.primary_image) {
    images = [item.primary_image];
  } else {
    images = ['/images/categories/tshirts.webp'];
  }

  // Extract colors
  let colors: ProductColor[] = [];
  if ('available_colors' in item && Array.isArray(item.available_colors) && item.available_colors.length > 0) {
    colors = item.available_colors.map((c) => ({
      name: c.name,
      hex: c.hex || '#000000',
    }));
  } else {
    colors = [{ name: 'Default', hex: '#000000' }];
  }

  // Extract sizes
  let sizes: string[] = [];
  if ('available_sizes' in item && Array.isArray(item.available_sizes) && item.available_sizes.length > 0) {
    sizes = item.available_sizes;
  } else {
    sizes = ['Medium', 'Large'];
  }

  const dressStyle = item.dress_style
    ? [item.dress_style.toLowerCase() as any]
    : (['casual'] as any);

  // Generate structured details from description or product properties
  const details = [
    'Crafted with premium materials tailored for durability and breathability.',
    `Product SKU: ${item.sku}`,
    `Stock Status: ${item.in_stock ? `${item.total_stock} units available` : 'Out of stock'}`,
    `Category: ${item.category_name}`,
  ];

  const defaultReviews: Review[] = [
    {
      id: `rev-${item.id}-1`,
      author: 'Chinedu O.',
      rating: 5,
      verified: true,
      comment:
        'Great quality piece! Fast delivery to Enugu and the fabric feels really premium. Definitely recommending Shop.co.',
      date: 'October 12, 2026',
    },
    {
      id: `rev-${item.id}-2`,
      author: 'Amina B.',
      rating: 4.5,
      verified: true,
      comment:
        'Fit is true to size and colors are exactly as shown on the website. Will order again.',
      date: 'October 8, 2026',
    },
  ];

  return {
    id: String(item.id),
    name: item.name,
    slug: item.slug,
    description: item.description,
    price: Number(item.base_price),
    originalPrice: item.original_price ? Number(item.original_price) : undefined,
    discountPercent: item.discount_percent > 0 ? item.discount_percent : undefined,
    rating: Number(item.rating_avg) || 4.5,
    reviewCount: Number(item.rating_count) || 12,
    category: item.category_slug,
    dressStyle,
    gender: 'unisex',
    images,
    colors,
    sizes,
    isNewArrival: true,
    isTopSelling: item.is_featured || item.rating_count > 30,
    details,
    faqs: [
      {
        question: 'What is the delivery time?',
        answer: 'Deliveries within Enugu city arrive in 24–48 hours. Regional deliveries across Nigeria take 2–4 business days.',
      },
      {
        question: 'What is your return policy?',
        answer: 'We offer an easy 7-day exchange window for unwashed, unworn physical items with original tags attached.',
      },
    ],
    reviews: defaultReviews,
    product_type: 'physical',
    total_stock: item.total_stock,
    in_stock: item.in_stock,
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
  if (params.sort) query.set('sort', params.sort);
  if (params.page !== undefined) query.set('page', String(params.page));
  if (params.per_page !== undefined) query.set('per_page', String(params.per_page));

  const queryString = query.toString();
  const endpoint = queryString ? `/products?${queryString}` : '/products';
  
  const json = await fetchFullFromApi<ApiProductSummary[]>(endpoint);

  const rawItems = Array.isArray(json.data)
    ? json.data
    : ((json.data as any)?.items || []);

  const meta = json.meta || (json.data as any)?.pagination;

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
  session_token: string;
  csrf_token: string;
  expires_at: string;
  verification_token?: string;
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
  if (res.data?.csrf_token) {
    setMemoryCsrfToken(res.data.csrf_token);
  }
  if (res.data?.session_token && typeof window !== 'undefined') {
    localStorage.setItem('shopco_customer_session_token', res.data.session_token);
  }
  return res.data!;
}

/**
 * Sign in using email and password.
 */
export async function apiLogin(credentials: {
  email: string;
  password: string;
}): Promise<ApiAuthResponse> {
  const res = await fetchFullFromApi<ApiAuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
  if (res.data?.csrf_token) {
    setMemoryCsrfToken(res.data.csrf_token);
  }
  if (res.data?.session_token && typeof window !== 'undefined') {
    if (res.data?.user?.role === 'admin' || res.data?.user?.role === 'super_admin') {
      localStorage.setItem('shopco_admin_session_token', res.data.session_token);
    }
    localStorage.setItem('shopco_customer_session_token', res.data.session_token);
  }
  return res.data!;
}

/**
 * Sign out of active session.
 */
export async function apiLogout(): Promise<void> {
  await fetchFullFromApi<null>('/auth/logout', {
    method: 'POST',
  });
  setMemoryCsrfToken(null);
  if (typeof window !== 'undefined') {
    localStorage.removeItem('shopco_customer_session_token');
    localStorage.removeItem('shopco_admin_session_token');
  }
}

/**
 * Fetch current authenticated user.
 */
export async function apiGetMe(): Promise<{ user: ApiUser; csrf_token: string }> {
  const res = await fetchFullFromApi<{ user: ApiUser; csrf_token: string }>('/auth/me');
  if (res.data?.csrf_token) {
    setMemoryCsrfToken(res.data.csrf_token);
  }
  return res.data!;
}

/**
 * Request passwordless magic sign-in link.
 */
export async function apiRequestMagicLink(email: string): Promise<{ message: string; magic_token?: string }> {
  const res = await fetchFullFromApi<{ message: string; magic_token?: string }>('/auth/customer/magic-link', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  return res.data!;
}

/**
 * Verify passwordless magic sign-in token.
 */
export async function apiVerifyMagicLink(token: string): Promise<ApiAuthResponse> {
  const res = await fetchFullFromApi<ApiAuthResponse>('/auth/customer/verify', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  if (res.data?.csrf_token) {
    setMemoryCsrfToken(res.data.csrf_token);
  }
  if (res.data?.session_token && typeof window !== 'undefined') {
    localStorage.setItem('shopco_customer_session_token', res.data.session_token);
  }
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

/**
 * Merge local guest cart into customer database cart.
 */
export async function apiMergeCart(items: Array<{ variant_id: number; quantity: number }>): Promise<any> {
  return fetchFromApi<any>('/cart/merge', {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}

/**
 * Merge local guest wishlist into customer database wishlist.
 */
export async function apiMergeWishlist(product_ids: number[]): Promise<any> {
  return fetchFromApi<any>('/wishlist/merge', {
    method: 'POST',
    body: JSON.stringify({ product_ids }),
  });
}

/**
 * Check admin onboarding setup status.
 */
export async function apiGetSetupStatus(): Promise<{ is_setup_completed: boolean; store_name: string }> {
  return fetchFromApi<any>('/setup/status');
}

/**
 * Complete first-run admin onboarding.
 */
export async function apiSetupStore(payload: any): Promise<ApiAuthResponse> {
  const res = await fetchFullFromApi<ApiAuthResponse>('/setup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (res.data?.csrf_token) {
    setMemoryCsrfToken(res.data.csrf_token);
  }
  return res.data!;
}

/**
 * Fetch admin destination shipping zones and fees.
 */
export async function apiGetAdminShippingZones(): Promise<ApiShippingZone[]> {
  return fetchFromApi<ApiShippingZone[]>('/admin/shipping-zones');
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

/**
 * Fetch admin products with filtering and pagination.
 */
export async function apiGetAdminProducts(params: Record<string, any> = {}): Promise<{
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
    items: (res.data as AdminProduct[]) || [],
    pagination: (res.meta as unknown as PaginationMeta) || {
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
export async function apiCreateAdminProduct(payload: any): Promise<ApiProductDetail> {
  return fetchFromApi<ApiProductDetail>('/admin/products', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Update an existing product as admin.
 */
export async function apiUpdateAdminProduct(id: number, payload: any): Promise<ApiProductDetail> {
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
): Promise<any> {
  return fetchFromApi<any>(`/admin/products/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

/**
 * Adjust variant inventory with reason and audit trail.
 */
export async function apiAdjustInventory(payload: {
  variant_id: number;
  adjustment: number;
  reason: string;
  notes?: string;
}): Promise<any> {
  return fetchFromApi<any>('/admin/inventory/adjust', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}



/**
 * Archive a product.
 */
export async function apiDeleteAdminProduct(id: number): Promise<any> {
  return fetchFromApi<any>(`/admin/products/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Upload an image file for product photography.
 */
export async function apiUploadProductImage(
  file: File
): Promise<{ image_url: string; file_name: string; size_bytes: number }> {
  const url = `${API_BASE_URL}/admin/upload-image`;
  const formData = new FormData();
  formData.append('image', file);

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  const devToken =
    process.env.NEXT_PUBLIC_DEV_ADMIN_TOKEN ||
    (typeof window !== 'undefined' ? localStorage.getItem('shopco_dev_admin_token') : null);

  if (devToken) {
    headers['X-Dev-Admin-Token'] = devToken;
  }

  if (memoryCsrfToken) {
    headers['X-CSRF-Token'] = memoryCsrfToken;
  }

  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: formData,
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error?.message || json.message || 'Image upload failed.');
  }

  return json.data;
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

export interface CheckoutQuoteResponse {
  currency: string;
  items: Array<{
    product_id: number;
    variant_id: number;
    name: string;
    slug: string;
    sku: string;
    variant_options: { size: string; color: string; color_hex: string };
    unit_price: number;
    quantity: number;
    line_total: number;
    stock_available: number;
  }>;
  items_count: number;
  total_quantity: number;
  subtotal: number;
  discount_amount: number;
  shipping_fee: number;
  grand_total: number;
  applied_coupon: { id: number; code: string; description: string; discount_percent: number } | null;
  shipping_zone: ShippingZone | null;
  eligible_zones: ShippingZone[];
  origin: {
    store_name: string;
    origin_city: string;
    origin_state: string;
    origin_address: string;
    contact_phone: string;
    contact_email: string;
  };
}

export interface CheckoutOrderResponse {
  order_id: number;
  order_number: string;
  guest_access_token: string;
  guest_email: string;
  user_id: number | null;
  status: string;
  payment_status: string;
  payment_reference: string;
  currency: string;
  subtotal: number;
  discount_amount: number;
  shipping_fee: number;
  grand_total: number;
  shipping_zone: any;
  shipping_address: ShippingAddressInput;
  items_count: number;
  items: any[];
  created_at: string;
}

/**
 * Fetch available shipping destination zones from the store backend.
 */
export async function apiGetShippingZones(): Promise<{ zones: ShippingZone[]; origin: any }> {
  return fetchFromApi<{ zones: ShippingZone[]; origin: any }>('/checkout/shipping-zones');
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
}): Promise<CheckoutOrderResponse> {
  return fetchFromApi<CheckoutOrderResponse>('/checkout/orders', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Retrieve public order details using order number and guest token, email, phone, or auth session.
 */
export async function apiGetOrder(
  orderNumber: string,
  verification?: string | { token?: string; email?: string; phone?: string; reference?: string }
): Promise<any> {
  const params = new URLSearchParams();
  const headers: Record<string, string> = {};

  if (typeof verification === 'string') {
    if (verification) {
      params.append('token', verification);
      headers['X-Guest-Access-Token'] = verification;
    }
  } else if (verification) {
    if (verification.token) {
      params.append('token', verification.token);
      headers['X-Guest-Access-Token'] = verification.token;
    }
    if (verification.reference) {
      params.append('reference', verification.reference);
      params.append('paymentReference', verification.reference);
      headers['X-Payment-Reference'] = verification.reference;
    }
    if (verification.email) params.append('email', verification.email);
    if (verification.phone) params.append('phone', verification.phone);
  }

  const query = params.toString() ? `?${params.toString()}` : '';
  return fetchFromApi<any>(`/checkout/orders/${orderNumber}${query}`, { headers });
}

/**
 * Retrieve all past orders for the authenticated customer.
 */
export async function apiGetCustomerOrders(): Promise<any[]> {
  return fetchFromApi<any[]>('/customer/orders');
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
  api_key?: string;
  contract_code?: string;
  customer_name?: string;
  customer_email?: string;
  payment_description?: string;
  is_test_mode?: boolean;
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

export interface PaymentVerificationResponse {
  order_number: string;
  provider_reference: string;
  provider?: string;
  status: 'successful' | 'failed' | 'pending';
  order_status: string;
  amount: number;
  currency: string;
  verified_at?: string;
  failure_reason?: string;
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
  if (guestAccessToken) params.append('token', guestAccessToken);
  if (reference) {
    params.append('reference', reference);
    params.append('paymentReference', reference);
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

/**
 * List orders for administrative fulfillment queue with pagination and filters.
 */
export async function apiAdminGetOrders(params?: {
  status?: string;
  search?: string;
  page?: number;
  per_page?: number;
}): Promise<{ items: any[]; meta: PaginationMeta }> {
  const q = new URLSearchParams();
  if (params?.status) q.append('status', params.status);
  if (params?.search) q.append('search', params.search);
  if (params?.page) q.append('page', String(params.page));
  if (params?.per_page) q.append('per_page', String(params.per_page));

  const query = q.toString() ? `?${q.toString()}` : '';
  const json = await fetchFullFromApi<any>(`/admin/orders${query}`);
  const rawData: any = json.data;
  const items: any[] = Array.isArray(rawData)
    ? rawData
    : Array.isArray(rawData?.items)
    ? rawData.items
    : [];

  const meta: PaginationMeta = json.meta || rawData?.pagination || {
    page: 1,
    per_page: 20,
    total: items.length,
    total_pages: 1,
  };

  return { items, meta };
}

/**
 * Retrieve single order detail with shipment, items, status history, and audit log.
 */
export async function apiAdminGetOrder(idOrNumber: string | number): Promise<any> {
  return fetchFromApi<any>(`/admin/orders/${idOrNumber}`);
}

/**
 * Transition order status adhering to the state machine.
 */
export async function apiAdminUpdateOrderStatus(
  idOrNumber: string | number,
  status: string,
  comment?: string
): Promise<any> {
  return fetchFromApi<any>(`/admin/orders/${idOrNumber}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, comment }),
  });
}

/**
 * Assign or update physical parcel shipment, carrier, and tracking details.
 */
export async function apiAdminAssignShipment(
  idOrNumber: string | number,
  data: {
    carrier: string;
    tracking_number?: string;
    tracking_url?: string;
    status?: string;
    shipped_at?: string;
    delivered_at?: string;
  }
): Promise<any> {
  return fetchFromApi<any>(`/admin/orders/${idOrNumber}/shipment`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Confirm physical parcel delivery.
 */
export async function apiAdminConfirmDelivery(
  idOrNumber: string | number,
  comment?: string
): Promise<any> {
  return fetchFromApi<any>(`/admin/orders/${idOrNumber}/delivered`, {
    method: 'POST',
    body: JSON.stringify({ comment }),
  });
}

/**
 * Settle and confirm manual / WhatsApp payment for an order.
 */
export async function apiAdminConfirmPayment(
  idOrNumber: string | number,
  data?: { reference?: string; note?: string }
): Promise<any> {
  return fetchFromApi<any>(`/admin/orders/${idOrNumber}/confirm-payment`, {
    method: 'POST',
    body: JSON.stringify(data || {}),
  });
}

// =============================================================================
// STEP 13 COMPLETE ADMIN OPERATIONS & ANALYTICS API FUNCTIONS
// =============================================================================

export async function apiAdminGetOverview(): Promise<any> {
  return fetchFromApi<any>('/admin/dashboard/overview');
}

export async function apiAdminGetAnalyticsReport(params?: {
  range?: string;
  start_date?: string;
  end_date?: string;
}): Promise<any> {
  const query = new URLSearchParams();
  if (params?.range) query.set('range', params.range);
  if (params?.start_date) query.set('start_date', params.start_date);
  if (params?.end_date) query.set('end_date', params.end_date);
  const qs = query.toString();
  return fetchFromApi<any>(`/admin/analytics/report${qs ? `?${qs}` : ''}`);
}

/**
 * Download authenticated CSV report blob from backend with access verification.
 */
export async function apiAdminDownloadExport(endpoint: string, filename: string): Promise<void> {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Dev-Admin-Token': 'dev_admin_secret_token_12345',
      Accept: 'text/csv',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Export failed with HTTP ${response.status}`);
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
}

export async function apiAdminGetInventory(params?: {
  filter?: string;
  search?: string;
}): Promise<any> {
  const query = new URLSearchParams();
  if (params?.filter) query.set('filter', params.filter);
  if (params?.search) query.set('search', params.search);
  const qs = query.toString();
  return fetchFromApi<any>(`/admin/inventory${qs ? `?${qs}` : ''}`);
}

export async function apiAdminAdjustStock(data: {
  variant_id: number;
  change_amount: number;
  reason: string;
}): Promise<any> {
  return fetchFromApi<any>('/admin/inventory/adjust', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function apiAdminGetInventoryLogs(): Promise<any> {
  return fetchFromApi<any>('/admin/inventory/logs');
}

export async function apiAdminGetCustomers(params?: {
  search?: string;
  status?: string;
}): Promise<any> {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.status) query.set('status', params.status);
  const qs = query.toString();
  return fetchFromApi<any>(`/admin/customers${qs ? `?${qs}` : ''}`);
}

export async function apiAdminGetCustomerDetail(id: number): Promise<any> {
  return fetchFromApi<any>(`/admin/customers/${id}`);
}

export async function apiAdminUpdateCustomerStatus(
  id: number,
  status: string
): Promise<any> {
  return fetchFromApi<any>(`/admin/customers/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function apiAdminGetPayments(params?: {
  gateway?: string;
  status?: string;
  search?: string;
}): Promise<any> {
  const query = new URLSearchParams();
  if (params?.gateway) query.set('gateway', params.gateway);
  if (params?.status) query.set('status', params.status);
  if (params?.search) query.set('search', params.search);
  const qs = query.toString();
  return fetchFromApi<any>(`/admin/payments${qs ? `?${qs}` : ''}`);
}

export async function apiAdminGetRefunds(): Promise<any> {
  return fetchFromApi<any>('/admin/refunds');
}

export async function apiAdminCreateRefund(data: {
  order_number: string;
  amount: number;
  reason: string;
  provider_refund_reference?: string;
}): Promise<any> {
  return fetchFromApi<any>('/admin/refunds', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function apiAdminGetPromotions(): Promise<any> {
  return fetchFromApi<any>('/admin/promotions');
}

export async function apiAdminCreatePromotion(data: {
  code: string;
  description: string;
  discount_percent: number;
  max_uses?: number;
  is_active?: boolean | number;
  expires_at?: string | null;
}): Promise<any> {
  return fetchFromApi<any>('/admin/promotions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function apiAdminUpdatePromotion(
  id: number,
  data: Partial<{
    code: string;
    description: string;
    discount_percent: number;
    max_uses: number;
    is_active: boolean | number;
    expires_at: string | null;
  }>
): Promise<any> {
  return fetchFromApi<any>(`/admin/promotions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function apiAdminDeletePromotion(id: number): Promise<any> {
  return fetchFromApi<any>(`/admin/promotions/${id}`, {
    method: 'DELETE',
  });
}

export async function apiAdminGetBanners(): Promise<any> {
  return fetchFromApi<any>('/admin/storefront/banners');
}

export async function apiAdminCreateBanner(data: {
  title: string;
  subtitle?: string;
  cta_text?: string;
  cta_url?: string;
  image_url: string;
  is_active?: boolean | number;
  display_order?: number;
}): Promise<any> {
  return fetchFromApi<any>('/admin/storefront/banners', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function apiAdminUpdateBanner(
  id: number,
  data: any
): Promise<any> {
  return fetchFromApi<any>(`/admin/storefront/banners/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function apiAdminDeleteBanner(id: number): Promise<any> {
  return fetchFromApi<any>(`/admin/storefront/banners/${id}`, {
    method: 'DELETE',
  });
}

export async function apiAdminGetReviews(status?: string): Promise<any> {
  const qs = status && status !== 'all' ? `?status=${status}` : '';
  return fetchFromApi<any>(`/admin/storefront/reviews${qs}`);
}

export async function apiAdminUpdateReviewStatus(
  id: number,
  status: string
): Promise<any> {
  return fetchFromApi<any>(`/admin/storefront/reviews/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function apiAdminGetOutbox(status?: string): Promise<any> {
  const qs = status && status !== 'all' ? `?status=${status}` : '';
  return fetchFromApi<any>(`/admin/notifications/outbox${qs}`);
}

export async function apiAdminRetryOutbox(id: number): Promise<any> {
  return fetchFromApi<any>(`/admin/notifications/outbox/${id}/retry`, {
    method: 'POST',
  });
}

export async function apiAdminGetAuditLogs(params?: {
  action?: string;
  entity_type?: string;
}): Promise<any> {
  const query = new URLSearchParams();
  if (params?.action) query.set('action', params.action);
  if (params?.entity_type) query.set('entity_type', params.entity_type);
  const qs = query.toString();
  return fetchFromApi<any>(`/admin/audit-logs${qs ? `?${qs}` : ''}`);
}

export async function apiAdminGetSettings(): Promise<any> {
  return fetchFromApi<any>('/admin/settings');
}

export async function apiAdminUpdateSettings(
  data: Record<string, any>
): Promise<any> {
  return fetchFromApi<any>('/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function apiAdminGetSystemStatus(): Promise<any> {
  return fetchFromApi<any>('/admin/system-status');
}

export async function apiAdminGetMarketingAudience(): Promise<any> {
  return fetchFromApi<any>('/admin/marketing/subscribers');
}

export async function apiAdminSendMarketingBroadcast(data: {
  subject: string;
  content: string;
  target: 'subscribers' | 'customers' | 'all';
}): Promise<any> {
  return fetchFromApi<any>('/admin/marketing/broadcast', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function apiSubscribeNewsletter(email: string): Promise<any> {
  return fetchFromApi<any>('/newsletter/subscribe', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function apiAdminGetAccount(): Promise<any> {
  return fetchFromApi<any>('/admin/account');
}

export async function apiAdminUpdateAccount(data: {
  full_name?: string;
  phone?: string;
  current_password?: string;
  new_password?: string;
}): Promise<any> {
  return fetchFromApi<any>('/admin/account', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}



