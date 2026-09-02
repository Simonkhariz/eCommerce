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

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  originalPrice?: number;
  discountPercent?: number;
  rating: number;
  reviewCount: number;
  category: CategoryType | string;
  dressStyle: DressStyleType;
  gender: 'men' | 'women' | 'unisex';
  images: string[];
  colors: ProductColor[];
  sizes: (SizeType | string)[];
  isNewArrival?: boolean;
  isTopSelling?: boolean;
  details: string[];
  faqs: { question: string; answer: string }[];
  reviews: Review[];
}

export interface CartItem {
  id: string; // unique key combining productId + size + color.name
  productId: string;
  name: string;
  slug: string;
  price: number;
  originalPrice?: number;
  image: string;
  size: SizeType | string;
  color: ProductColor;
  quantity: number;
}

export interface FilterState {
  category: string | null;
  dressStyle: string | null;
  minPrice: number;
  maxPrice: number;
  selectedColors: string[];
  selectedSizes: string[];
  sortBy: 'most-popular' | 'price-low-high' | 'price-high-low' | 'newest' | 'rating';
  searchQuery: string;
}

export interface PromoCode {
  code: string;
  discountPercent: number;
  description: string;
}
