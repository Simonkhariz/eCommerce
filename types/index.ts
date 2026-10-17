export type CategoryType =
  | 't-shirts'
  | 'shorts'
  | 'shirts'
  | 'hoodie'
  | 'jeans'
  | 'apparel'
  | 'footwear'
  | 'accessories'
  | 'electronics';

export type DressStyleType = 'casual' | 'formal' | 'party' | 'gym';

export type SizeType =
  | 'XX-Small'
  | 'X-Small'
  | 'Small'
  | 'Medium'
  | 'Large'
  | 'X-Large'
  | 'XX-Large'
  | '3X-Large'
  | '4X-Large'
  | 'One Size'
  | 'US 8'
  | 'US 9'
  | 'US 10'
  | 'US 11';

export interface ProductColor {
  name: string;
  hex: string;
}

export interface Review {
  id: string;
  author: string;
  rating: number;
  verified: boolean;
  comment: string;
  date: string;
}

/** One purchasable size + colour combination, with its own price and stock. */
export interface ProductVariant {
  id: number;
  sku: string;
  size: string;
  color: ProductColor;
  price: number;
  stock: number;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  originalPrice?: number;
  discountPercent?: number;
  /** Average of approved reviews; 0 when there are none. */
  rating: number;
  reviewCount: number;
  category: CategoryType | string;
  categoryName?: string;
  dressStyle: DressStyleType | (DressStyleType | string)[];
  gender: 'men' | 'women' | 'unisex';
  images: string[];
  colors: ProductColor[];
  sizes: (SizeType | string)[];
  /** Present on product detail; summaries only carry colours/sizes. */
  variants?: ProductVariant[];
  totalStock?: number;
  inStock?: boolean;
  sku?: string;
  isNewArrival?: boolean;
  isTopSelling?: boolean;
  details: string[];
  faqs: { question: string; answer: string }[];
  reviews: Review[];
}

export interface CartItem {
  /** Unique line key: the variant ID as a string. */
  id: string;
  productId: string;
  /** Exact size + colour combination being bought (required at checkout). */
  variantId?: number;
  sku?: string;
  name: string;
  slug: string;
  /** Last known unit price (display only; the server always recalculates). */
  price: number;
  originalPrice?: number;
  image: string;
  size: SizeType | string;
  color: ProductColor;
  quantity: number;
  /** Last known stock for this variant, used to cap the quantity stepper. */
  maxStock?: number;
}

/** Catalogue filters. The page URL is the source of truth; this is its parsed form. */
export interface FilterState {
  category: string | null;
  dressStyle: string | null;
  /** null = no lower/upper price bound. */
  minPrice: number | null;
  maxPrice: number | null;
  selectedColors: string[];
  selectedSizes: string[];
  sortBy: 'most-popular' | 'price-low-high' | 'price-high-low' | 'newest' | 'rating';
  searchQuery: string;
  onSale: boolean;
  flashDeals: boolean;
  page: number;
}

export interface PromoCode {
  code: string;
  discountPercent: number;
  description: string;
}
