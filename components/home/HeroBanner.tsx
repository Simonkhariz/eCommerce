'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Sparkle, ChevronLeft, ChevronRight, Tag } from 'lucide-react';
import { ApiBanner, ApiPromotion, HomepageData } from '@/lib/api-client';
import { canOptimizeImage } from '@/lib/image';

interface HeroBannerProps {
  banners?: ApiBanner[];
  promotions?: ApiPromotion[];
  /** Real catalogue counts from the API; a stat is hidden when it is missing or zero. */
  stats?: HomepageData['stats'];
}

const ALL_STATES_AND_FCT = 37;

export const HeroBanner: React.FC<HeroBannerProps> = ({ banners = [], promotions = [], stats }) => {
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

  const statItems = [
    stats && stats.published_products > 0
      ? { value: stats.published_products.toLocaleString(), label: stats.published_products === 1 ? 'Product in store' : 'Products in store' }
      : null,
    stats && stats.categories > 0
      ? { value: stats.categories.toLocaleString(), label: stats.categories === 1 ? 'Category' : 'Categories' }
      : null,
    stats && stats.states_served > 0
      ? stats.states_served >= ALL_STATES_AND_FCT
        ? { value: '36 + FCT', label: 'Delivery to every state' }
        : { value: stats.states_served.toLocaleString(), label: stats.states_served === 1 ? 'State we deliver to' : 'States we deliver to' }
      : null,
  ].filter((item): item is { value: string; label: string } => item !== null);

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
                  <div className="flex">
                    {activeBanners.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentIndex(idx)}
                        aria-label={`Go to banner ${idx + 1}`}
                        aria-current={idx === currentIndex ? 'true' : undefined}
                        className="flex h-9 items-center px-[3px]"
                      >
                        <span
                          className={`block h-2 rounded-full transition-all ${
                            idx === currentIndex ? 'w-6 bg-black' : 'w-2 bg-neutral-300'
                          }`}
                        />
                      </button>
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

            {/* Real store numbers (hidden when unknown) */}
            {statItems.length > 0 && (
              <dl className="grid grid-cols-3 sm:flex sm:flex-wrap sm:items-center gap-y-4 pt-4 sm:pt-6 border-t border-neutral-300/40">
                {statItems.map((item, idx) => (
                  <div
                    key={item.label}
                    className={`min-w-0 pr-3 sm:pr-8 ${idx > 0 ? 'pl-3 sm:pl-8 border-l border-neutral-300' : ''}`}
                  >
                    <dt className="sr-only">{item.label}</dt>
                    <dd className="font-bold text-xl sm:text-4xl text-black">{item.value}</dd>
                    <dd className="text-xs sm:text-sm text-neutral-600" aria-hidden="true">
                      {item.label}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
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
              className="relative w-full max-w-lg h-[380px] sm:h-[540px] lg:h-[620px] flex items-end justify-center overflow-hidden"
              style={{ maxWidth: '32rem', maxHeight: '620px' }}
            >
              <Image
                key={imageUrl}
                src={imageUrl}
                alt={title}
                fill
                preload
                unoptimized={!canOptimizeImage(imageUrl)}
                sizes="(max-width: 640px) 100vw, 512px"
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
