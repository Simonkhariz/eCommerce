'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Product } from '@/types';
import { formatPrice } from '@/lib/currency';
import { HugeiconsIcon } from '@hugeicons/react';
import { StarIcon, ShoppingBag01Icon, FavouriteIcon } from '@hugeicons/core-free-icons';
import { useWishlist } from '@/context/WishlistContext';

interface ProductCardProps {
  product: Product;
}

/**
 * Catalogue card. Size and colour are chosen on the product page, so the card's cart
 * action opens the product rather than guessing an option.
 */
export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const { toggleWishlist, isInWishlist } = useWishlist();
  const isFavorited = isInWishlist(product.id);
  const href = `/products/${product.slug}`;
  const soldOut = product.inStock === false;

  return (
    <article className="group relative flex flex-col h-full bg-white rounded-2xl overflow-hidden">
      <div className="relative aspect-square w-full bg-[#F0EEED] rounded-2xl overflow-hidden mb-3">
        <Link href={href} className="absolute inset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-black rounded-2xl" tabIndex={-1} aria-hidden="true">
          <Image
            src={product.images[0]}
            alt=""
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className={`object-cover group-hover:scale-105 transition-transform duration-300 ${soldOut ? 'opacity-60' : ''}`}
          />
        </Link>

        {soldOut && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-black/80 px-2.5 py-1 text-xs font-semibold text-white">
            Sold out
          </span>
        )}

        <button
          type="button"
          onClick={() => toggleWishlist(product)}
          className={`absolute top-2 right-2 p-2.5 rounded-full transition-all duration-200 z-10 ${
            isFavorited
              ? 'bg-white text-red-500 shadow-md scale-105'
              : 'bg-white/80 backdrop-blur-sm text-neutral-600 hover:text-red-500 hover:bg-white shadow-sm'
          }`}
          aria-label={isFavorited ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
          aria-pressed={isFavorited}
        >
          <HugeiconsIcon icon={FavouriteIcon} size={16} className={isFavorited ? 'fill-current text-red-500' : ''} aria-hidden="true" />
        </button>
      </div>

      <h3 className="font-bold text-sm sm:text-base text-black line-clamp-1">
        <Link href={href} className="hover:text-neutral-700 focus:outline-none focus-visible:underline">
          {product.name}
        </Link>
      </h3>

      {product.reviewCount > 0 ? (
        <div className="flex items-center gap-1.5 my-1.5" role="img" aria-label={`Rated ${product.rating.toFixed(1)} out of 5 from ${product.reviewCount} ${product.reviewCount === 1 ? 'review' : 'reviews'}`}>
          <div className="flex items-center" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => {
              const isFilled = i + 1 <= Math.round(product.rating);
              return (
                <span key={i} className={isFilled ? 'text-[#FFC633]' : 'text-neutral-300'}>
                  <HugeiconsIcon icon={StarIcon} size={14} className={isFilled ? 'fill-current' : ''} />
                </span>
              );
            })}
          </div>
          <span className="text-xs text-neutral-700 font-medium" aria-hidden="true">
            {product.rating.toFixed(1)}/<span className="text-neutral-600">5</span>
          </span>
        </div>
      ) : (
        <div className="my-1.5 h-[18px]" />
      )}

      <div className="flex items-center justify-between gap-2 mt-auto pt-2">
        <div className="flex items-baseline sm:items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
          <span className="font-bold text-base sm:text-xl md:text-lg lg:text-xl text-black">{formatPrice(product.price)}</span>
          {product.originalPrice && product.originalPrice > product.price && (
            <span className="font-semibold text-xs sm:text-sm text-neutral-600 line-through">
              <span className="sr-only">Was </span>
              {formatPrice(product.originalPrice)}
            </span>
          )}
        </div>

        <Link
          href={href}
          className="bg-black hover:bg-neutral-800 text-white rounded-full p-2.5 sm:px-3.5 sm:py-2 md:p-2.5 lg:px-3.5 lg:py-2 flex items-center justify-center gap-1 text-xs font-semibold shadow-sm hover:shadow-md transition-all shrink-0"
          aria-label={soldOut ? `View ${product.name}` : `Choose options for ${product.name}`}
        >
          <HugeiconsIcon icon={ShoppingBag01Icon} size={15} aria-hidden="true" />
          <span className="hidden sm:inline md:hidden lg:inline">{soldOut ? 'View' : 'Options'}</span>
        </Link>
      </div>
    </article>
  );
};
