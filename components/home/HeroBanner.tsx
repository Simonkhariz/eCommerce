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

const DEFAULT_SLIDE = {
  title: 'FIND CLOTHES THAT MATCHES YOUR STYLE',
  subtitle:
    'Browse through our diverse range of meticulously crafted garments, designed to bring out your individuality and cater to your sense of style.',
  ctaText: 'Shop Now',
  ctaUrl: '/category',
  imageUrl: '/images/hero/african_models_hero.webp',
};

/** The store's own cut-out hero art keeps its transparent look; any other picture is shown as a photo card. */
const isCutout = (src: string) => src.startsWith('/images/hero/');

export const HeroBanner: React.FC<HeroBannerProps> = ({ banners = [], promotions = [], stats }) => {
  const slides = (banners.length > 0 ? banners : [null]).map((b) => ({
    key: b ? String(b.id) : 'default',
    title: b?.title || DEFAULT_SLIDE.title,
    subtitle: b?.subtitle || DEFAULT_SLIDE.subtitle,
    ctaText: b?.cta_text || DEFAULT_SLIDE.ctaText,
    ctaUrl: b?.cta_url || DEFAULT_SLIDE.ctaUrl,
    imageUrl: b?.image_url || DEFAULT_SLIDE.imageUrl,
  }));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;
  // Stays valid if the list of banners gets shorter.
  const active = Math.min(currentIndex, count - 1);

  // Auto-rotate when there are several banners (paused while the shopper hovers or focuses them).
  useEffect(() => {
    if (count <= 1 || paused) return;
    const interval = setInterval(() => setCurrentIndex((prev) => (prev + 1) % count), 6000);
    return () => clearInterval(interval);
  }, [count, paused]);

  const activePromo = promotions.length > 0 ? promotions[0] : null;

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

  const go = (delta: number) => setCurrentIndex((prev) => (prev + delta + count) % count);

  return (
    <section
      className="bg-[#F2F0F1] relative overflow-hidden"
      aria-roledescription={count > 1 ? 'carousel' : undefined}
      aria-label="Featured"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-14 lg:pt-16">
        {activePromo && (
          <div className="mb-4 inline-flex items-center gap-2 bg-black text-white px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide shadow-sm">
            <Tag className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" aria-hidden="true" />
            <span>
              Special Offer: Use code <strong className="text-yellow-400">{activePromo.code}</strong> for{' '}
              {activePromo.discount_percent}% off!
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left: copy. Every slide's text sits in the same grid cell, so the block is always
              as tall as the longest slide and nothing below it jumps when the slide changes. */}
          <div className="lg:col-span-7 space-y-6 sm:space-y-8 z-10 lg:pb-16">
            <div className="grid">
              {slides.map((s, idx) => {
                const shown = idx === active;
                return (
                  <div
                    key={s.key}
                    aria-hidden={!shown}
                    className={`[grid-area:1/1] space-y-5 sm:space-y-7 transition-opacity duration-500 ${shown ? 'opacity-100' : 'opacity-0 invisible'}`}
                  >
                    {/* Only the first slide is the page's heading. */}
                    {React.createElement(
                      idx === 0 ? 'h1' : 'p',
                      { className: 'font-integral text-3xl sm:text-5xl lg:text-6xl xl:text-[68px] text-black leading-[1.02] sm:leading-[0.98] tracking-tight uppercase' },
                      s.title
                    )}
                    <p className="text-neutral-600 text-sm sm:text-base leading-relaxed max-w-xl">{s.subtitle}</p>
                    <Link
                      href={s.ctaUrl}
                      tabIndex={shown ? undefined : -1}
                      className="inline-block w-full sm:w-auto text-center bg-black text-white hover:bg-neutral-800 font-semibold px-12 py-4 rounded-full transition-all shadow-lg text-sm sm:text-base active:scale-95"
                    >
                      {s.ctaText}
                    </Link>
                  </div>
                );
              })}
            </div>

            {/* Real store numbers (hidden when unknown) */}
            {statItems.length > 0 && (
              <dl className="grid grid-cols-3 sm:flex sm:flex-wrap sm:items-center gap-y-4 pt-4 sm:pt-6 border-t border-neutral-300/40">
                {statItems.map((item, idx) => (
                  <div key={item.label} className={`min-w-0 pr-3 sm:pr-8 ${idx > 0 ? 'pl-3 sm:pl-8 border-l border-neutral-300' : ''}`}>
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

          {/* Right: the slide pictures, cross-fading, with the slider controls at the bottom. */}
          <div className="lg:col-span-5 relative flex items-end justify-center">
            <div className="absolute top-12 left-4 sm:left-8 z-20 text-black animate-pulse" aria-hidden="true">
              <Sparkle className="w-8 h-8 sm:w-12 sm:h-12 fill-black" />
            </div>
            <div className="absolute top-2 right-4 sm:right-8 z-20 text-black animate-pulse delay-300" aria-hidden="true">
              <Sparkle className="w-12 h-12 sm:w-16 sm:h-16 fill-black" />
            </div>

            <div className="relative w-full max-w-lg h-[400px] sm:h-[540px] lg:h-[620px]">
              {slides.map((s, idx) => {
                const shown = idx === active;
                const cutout = isCutout(s.imageUrl);
                return (
                  <div
                    key={s.key}
                    aria-hidden={!shown}
                    className={`absolute inset-0 transition-opacity duration-700 ${shown ? 'opacity-100' : 'opacity-0'} ${
                      cutout ? '' : 'top-6 bottom-6 sm:top-10 sm:bottom-10 overflow-hidden rounded-[2rem] shadow-xl'
                    }`}
                  >
                    <Image
                      src={s.imageUrl}
                      alt={shown ? s.title : ''}
                      fill
                      preload={idx === 0}
                      unoptimized={!canOptimizeImage(s.imageUrl)}
                      sizes="(max-width: 640px) 100vw, 512px"
                      className={cutout ? 'object-contain object-bottom drop-shadow-xl' : 'object-cover object-top'}
                    />
                  </div>
                );
              })}

              {count > 1 && (
                <div className="absolute bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 rounded-full bg-white/85 px-1.5 py-1 shadow-md backdrop-blur-sm">
                  <button type="button" onClick={() => go(-1)} aria-label="Previous banner" className="p-2 rounded-full text-black hover:bg-black/5">
                    <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                  </button>
                  {slides.map((s, idx) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setCurrentIndex(idx)}
                      aria-label={`Show banner ${idx + 1} of ${count}`}
                      aria-current={idx === active ? 'true' : undefined}
                      className="flex h-8 items-center px-[3px]"
                    >
                      <span className={`block h-2 rounded-full transition-all ${idx === active ? 'w-6 bg-black' : 'w-2 bg-neutral-400'}`} />
                    </button>
                  ))}
                  <button type="button" onClick={() => go(1)} aria-label="Next banner" className="p-2 rounded-full text-black hover:bg-black/5">
                    <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
