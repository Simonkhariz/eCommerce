'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Product } from '@/types';
import { formatPrice } from '@/lib/currency';
import { HugeiconsIcon } from '@hugeicons/react';
import { StarIcon, ShoppingBag01Icon, FavouriteIcon } from '@hugeicons/core-free-icons';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';

interface ProductCardProps {
  product: Product;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const { addToCart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();

  const isFavorited = isInWishlist(product.id);

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addToCart(product, product.colors[0], product.sizes[0] || 'Medium', 1);
  };

  const handleToggleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWishlist(product);
  };

  return (
    <Link
      href={`/products/${product.slug}`}
      prefetch={true}
      className="group flex flex-col h-full bg-white rounded-2xl overflow-hidden focus:outline-none"
    >
      {/* Product Image Container */}
      <div className="relative aspect-square w-full bg-[#F0EEED] rounded-2xl overflow-hidden mb-3">
        <Image
          src={product.images[0]}
          alt={product.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-cover group-hover:scale-105 transition-transform duration-300"
        />


        {/* Wishlist Heart Button in Image Corner (Top-Right) */}
        <button
          onClick={handleToggleWishlist}
          className={`absolute top-2.5 right-2.5 p-2 rounded-full transition-all duration-200 z-10 ${
            isFavorited
              ? 'bg-white text-red-500 shadow-md scale-105'
              : 'bg-white/80 backdrop-blur-sm text-neutral-400 hover:text-red-500 hover:bg-white shadow-sm'
          }`}
          title={isFavorited ? 'Remove from wishlist' : 'Save to wishlist'}
          aria-label={isFavorited ? 'Remove from wishlist' : 'Save to wishlist'}
        >
          <HugeiconsIcon
            icon={FavouriteIcon}
            size={16}
            className={isFavorited ? 'fill-current text-red-500' : ''}
          />
        </button>
      </div>

      {/* Product Title */}
      <h3 className="font-bold text-sm sm:text-base text-black group-hover:text-neutral-700 transition-colors line-clamp-1">
        {product.name}
      </h3>

      {/* Star Rating */}
      <div className="flex items-center gap-1.5 my-1.5">
        <div className="flex items-center text-[#FFC633]">
          {Array.from({ length: 5 }).map((_, i) => {
            const isFilled = i + 1 <= Math.floor(product.rating);
            return (
              <span key={i} className={isFilled ? 'text-[#FFC633]' : 'text-neutral-300'}>
                <HugeiconsIcon icon={StarIcon} size={14} className={isFilled ? 'fill-current' : ''} />
              </span>
            );
          })}
        </div>
        <span className="text-xs text-neutral-600 font-medium">
          {product.rating}/<span className="text-neutral-400">5</span>
        </span>
      </div>

      {/* Bottom Row: Price on Left, Add to Cart on Right */}
      <div className="flex items-center justify-between gap-2 mt-auto pt-2">
        {/* Pricing */}
        <div className="flex items-baseline sm:items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
          <span className="font-bold text-base sm:text-xl text-black">
            {formatPrice(product.price)}
          </span>
          {product.originalPrice && product.originalPrice > product.price && (
            <span className="font-semibold text-xs sm:text-sm text-neutral-400 line-through">
              {formatPrice(product.originalPrice)}
            </span>
          )}
        </div>

        {/* Add to Cart CTA Button (Opposite Price) */}
        <button
          onClick={handleQuickAdd}
          className="bg-black hover:bg-neutral-800 active:scale-90 text-white rounded-full p-2 sm:px-3.5 sm:py-1.5 flex items-center justify-center gap-1 text-xs font-semibold shadow-sm hover:shadow-md transition-all shrink-0"
          title="Add to cart"
          aria-label="Add to cart"
        >
          <HugeiconsIcon icon={ShoppingBag01Icon} size={15} />
          <span className="hidden sm:inline">Add</span>
        </button>
      </div>
    </Link>
  );
};
