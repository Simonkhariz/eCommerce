'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Sparkle, ChevronLeft, ChevronRight, Tag } from 'lucide-react';
import { ApiBanner, ApiPromotion } from '@/lib/api-client';

interface HeroBannerProps {
  banners?: ApiBanner[];
  promotions?: ApiPromotion[];
}

export const HeroBanner: React.FC<HeroBannerProps> = ({ banners = [], promotions = [] }) => {
  const activeBanners = banners && banners.length > 0 ? banners : [];
  const [currentIndex, setCurrentIndex] = useState(0);

  // Auto-rotate if multiple banners exist
  useEffect(() => {
    if (activeBanners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % activeBanners.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [activeBanners.length]);

  const currentBanner = activeBanners[currentIndex];
  const activePromo = promotions && promotions.length > 0 ? promotions[0] : null;

  const title = currentBanner?.title || 'FIND CLOTHES THAT MATCHES YOUR STYLE';
  const subtitle =
    currentBanner?.subtitle ||
    'Browse through our diverse range of meticulously crafted garments, designed to bring out your individuality and cater to your sense of style.';
  const ctaText = currentBanner?.cta_text || 'Shop Now';
  const ctaUrl = currentBanner?.cta_url || '/category';
  const imageUrl = currentBanner?.image_url || '/images/hero/african_models_hero.webp';

  const handlePrev = () => {
    if (activeBanners.length <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + activeBanners.length) % activeBanners.length);
  };

  const handleNext = () => {
    if (activeBanners.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % activeBanners.length);
  };

  return (
    <section className="bg-[#F2F0F1] relative overflow-hidden transition-all duration-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-14 lg:pt-16 pb-0 sm:pb-8 lg:pb-0">
        {/* Promotional Tag Strip if Promo active */}
        {activePromo && (
          <div className="mb-4 inline-flex items-center gap-2 bg-black text-white px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide shadow-sm animate-pulse">
            <Tag className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
            <span>
              Special Offer: Use code <strong className="text-yellow-400">{activePromo.code}</strong> for{' '}
              {activePromo.discount_percent}% off!
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Copy & Stats */}
          <div className="lg:col-span-7 space-y-6 sm:space-y-8 z-10 pb-6 lg:pb-16">
            <h1 className="font-integral text-3xl sm:text-5xl lg:text-6xl xl:text-[68px] text-black leading-[1.02] sm:leading-[0.98] tracking-tight uppercase transition-all duration-300">
              {title}
            </h1>

            <p className="text-neutral-600 text-sm sm:text-base leading-relaxed max-w-xl transition-all duration-300">
              {subtitle}
            </p>

            <div className="flex flex-wrap items-center gap-4">
              <Link
                href={ctaUrl}
                className="inline-block w-full sm:w-auto text-center bg-black text-white hover:bg-neutral-800 font-semibold px-12 py-4 rounded-full transition-all shadow-lg text-sm sm:text-base active:scale-95"
              >
                {ctaText}
              </Link>

              {/* Slider Controls for multiple banners */}
              {activeBanners.length > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrev}
                    aria-label="Previous banner"
                    className="p-2.5 rounded-full border border-neutral-300 bg-white/80 hover:bg-white text-black transition-all shadow-sm"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="flex gap-1.5 px-2">
                    {activeBanners.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentIndex(idx)}
                        aria-label={`Go to banner ${idx + 1}`}
                        className={`h-2 rounded-full transition-all ${
                          idx === currentIndex ? 'w-6 bg-black' : 'w-2 bg-neutral-300'
                        }`}
                      />
                    ))}
                  </div>
                  <button
                    onClick={handleNext}
                    aria-label="Next banner"
                    className="p-2.5 rounded-full border border-neutral-300 bg-white/80 hover:bg-white text-black transition-all shadow-sm"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Metrics Counter */}
            <div className="flex flex-wrap items-center justify-between sm:justify-start sm:gap-8 pt-4 sm:pt-6 border-t border-neutral-300/40">
              <div className="pr-4 sm:border-r sm:border-neutral-300">
                <div className="font-bold text-2xl sm:text-4xl text-black">200+</div>
                <div className="text-xs sm:text-sm text-neutral-500">International Brands</div>
              </div>
              <div className="px-4 sm:border-r sm:border-neutral-300">
                <div className="font-bold text-2xl sm:text-4xl text-black">2,000+</div>
                <div className="text-xs sm:text-sm text-neutral-500">High-Quality Products</div>
              </div>
              <div className="w-full sm:w-auto text-center sm:text-left mt-4 sm:mt-0 pl-0 sm:pl-4">
                <div className="font-bold text-2xl sm:text-4xl text-black">30,000+</div>
                <div className="text-xs sm:text-sm text-neutral-500">Happy Customers</div>
              </div>
            </div>
          </div>

          {/* Right Column: Hero Visual with Graphic Sparkles */}
          <div className="lg:col-span-5 relative flex items-end justify-center">
            {/* Sparkle Badges */}
            <div className="absolute top-12 left-4 sm:left-8 z-20 text-black animate-pulse">
              <Sparkle className="w-8 h-8 sm:w-12 sm:h-12 fill-black" />
            </div>
            <div className="absolute top-2 right-4 sm:right-8 z-20 text-black animate-pulse delay-300">
              <Sparkle className="w-12 h-12 sm:w-16 sm:h-16 fill-black" />
            </div>

            <div
              className="relative w-full max-w-lg h-[460px] sm:h-[540px] lg:h-[620px] flex items-end justify-center overflow-hidden"
              style={{ maxWidth: '32rem', maxHeight: '620px' }}
            >
              <Image
                key={imageUrl}
                src={imageUrl}
                alt={title}
                fill
                priority
                unoptimized
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-contain object-bottom drop-shadow-xl transition-opacity duration-500"
                style={{ objectFit: 'contain', objectPosition: 'bottom' }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
