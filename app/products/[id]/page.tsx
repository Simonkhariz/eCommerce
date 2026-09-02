'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { PRODUCTS } from '@/data/mockData';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';
import { ImageGallery } from '@/components/product/ImageGallery';
import { VariantSelector } from '@/components/product/VariantSelector';
import { StickyMobileBar } from '@/components/product/StickyMobileBar';
import { ProductTabs } from '@/components/product/ProductTabs';
import { ProductCard } from '@/components/ui/ProductCard';
import { HugeiconsIcon } from '@hugeicons/react';
import { StarIcon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { ProductColor, SizeType } from '@/types';

export default function ProductDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const product = PRODUCTS.find((p) => p.slug === id || p.id === id);
  const currentProduct = product || PRODUCTS[0];

  const { addToCart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();

  const [selectedColor, setSelectedColor] = useState<ProductColor>(
    currentProduct.colors[0]
  );
  const [selectedSize, setSelectedSize] = useState<SizeType | string>(
    currentProduct.sizes[0] || 'Medium'
  );
  const [quantity, setQuantity] = useState(1);

  const relatedProducts = PRODUCTS.filter((p) => p.id !== currentProduct.id).slice(0, 4);

  useEffect(() => {
    router.prefetch('/cart');
  }, [router]);

  const handleAddToCart = () => {
    addToCart(currentProduct, selectedColor, selectedSize, quantity);
  };

  const handleBuyNow = () => {
    addToCart(currentProduct, selectedColor, selectedSize, quantity);
    router.push('/cart');
  };

  const isWishlisted = isInWishlist(currentProduct.id);
  const handleToggleWishlist = () => {
    toggleWishlist(currentProduct);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 md:pb-12">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs sm:text-sm text-neutral-500 mb-8 overflow-x-auto no-scrollbar whitespace-nowrap">
        <Link href="/" className="hover:text-black transition-colors">
          Home
        </Link>
        <HugeiconsIcon icon={ArrowRight01Icon} size={14} className="text-neutral-400 shrink-0" />
        <Link href="/category" className="hover:text-black transition-colors">
          Shop
        </Link>
        <HugeiconsIcon icon={ArrowRight01Icon} size={14} className="text-neutral-400 shrink-0" />
        <Link
          href={`/category?cat=${currentProduct.category}`}
          className="hover:text-black transition-colors capitalize"
        >
          {currentProduct.category}
        </Link>
        <HugeiconsIcon icon={ArrowRight01Icon} size={14} className="text-neutral-400 shrink-0" />
        <span className="text-black font-medium truncate">{currentProduct.name}</span>
      </nav>

      {/* Main Grid: Gallery on Left + Info & Buying Actions on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        {/* Left Gallery (6 cols on desktop) */}
        <div className="lg:col-span-6 w-full">
          <ImageGallery
            images={currentProduct.images}
            productName={currentProduct.name}
          />
        </div>

        {/* Right Info & Buying Actions (6 cols on desktop) */}
        <div className="lg:col-span-6 space-y-6">
          <div>
            <h1 className="font-integral text-2xl sm:text-4xl text-black leading-tight uppercase font-black">
              {currentProduct.name}
            </h1>

            {/* Star Rating */}
            <div className="flex items-center gap-2 mt-3">
              <div className="flex items-center text-[#FFC633]">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    className={i < Math.floor(currentProduct.rating) ? 'text-[#FFC633]' : 'text-neutral-300'}
                  >
                    <HugeiconsIcon
                      icon={StarIcon}
                      size={16}
                      className={i < Math.floor(currentProduct.rating) ? 'fill-current' : ''}
                    />
                  </span>
                ))}
              </div>
              <span className="text-sm font-medium text-black">
                {currentProduct.rating}/<span className="text-neutral-400">5</span>
              </span>
            </div>

            {/* Price Row */}
            <div className="flex items-center gap-3 mt-3">
              <span className="font-bold text-2xl sm:text-3xl text-black">
                ${currentProduct.price}
              </span>
              {currentProduct.originalPrice && (
                <>
                  <span className="font-bold text-2xl sm:text-3xl text-neutral-400 line-through">
                    ${currentProduct.originalPrice}
                  </span>
                  <span className="bg-[#FF3333]/10 text-[#FF3333] text-sm font-bold px-3 py-1 rounded-full">
                    -{currentProduct.discountPercent}%
                  </span>
                </>
              )}
            </div>

            {/* Description */}
            <p className="text-neutral-600 text-sm sm:text-base leading-relaxed mt-4 pb-6 border-b border-neutral-200">
              {currentProduct.description}
            </p>
          </div>

          {/* Modular Variant Selector Component */}
          <VariantSelector
            colors={currentProduct.colors}
            sizes={currentProduct.sizes}
            selectedColor={selectedColor}
            onSelectColor={setSelectedColor}
            selectedSize={selectedSize}
            onSelectSize={setSelectedSize}
            quantity={quantity}
            onQuantityChange={setQuantity}
            onAddToCart={handleAddToCart}
            onBuyNow={handleBuyNow}
            isWishlisted={isWishlisted}
            onToggleWishlist={handleToggleWishlist}
          />
        </div>
      </div>

      {/* Tabs: Specifications Accordion, Rating & Reviews with modal, FAQs */}
      <ProductTabs product={currentProduct} />

      {/* You Might Also Like Section */}
      <section className="mt-20 pt-10 border-t border-neutral-200">
        <h2 className="font-integral text-2xl sm:text-4xl text-center text-black mb-10">
          YOU MIGHT ALSO LIKE
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {relatedProducts.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* Sticky Mobile Purchase Bar */}
      <StickyMobileBar
        product={currentProduct}
        selectedColor={selectedColor}
        selectedSize={selectedSize}
        onAddToCart={handleAddToCart}
        onBuyNow={handleBuyNow}
      />
    </div>
  );
}
