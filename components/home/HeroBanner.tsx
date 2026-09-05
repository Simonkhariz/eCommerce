'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Sparkle } from 'lucide-react';

export const HeroBanner: React.FC = () => {
  return (
    <section className="bg-[#F2F0F1] relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-16 lg:pt-20 pb-0 sm:pb-8 lg:pb-0">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Copy & Stats */}
          <div className="lg:col-span-7 space-y-6 sm:space-y-8 z-10 pb-6 lg:pb-16">
            <h1 className="font-integral text-3xl sm:text-5xl lg:text-6xl text-black leading-[1.05] tracking-tight">
              FIND CLOTHES THAT MATCHES YOUR STYLE
            </h1>

            <p className="text-neutral-600 text-sm sm:text-base leading-relaxed max-w-xl">
              Browse through our diverse range of meticulously crafted garments, designed to bring out your individuality and cater to your sense of style.
            </p>

            <div>
              <Link
                href="/category"
                className="inline-block w-full sm:w-auto text-center bg-black text-white hover:bg-neutral-800 font-semibold px-12 py-4 rounded-full transition-all shadow-lg text-sm sm:text-base"
              >
                Shop Now
              </Link>
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

            <div className="relative w-full max-w-lg h-[460px] sm:h-[540px] lg:h-[620px] flex items-end justify-center">
              <Image
                src="/images/hero/african_models_hero.webp"
                alt="African fashion models posing together in stylish dope streetwear"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-contain object-bottom drop-shadow-xl"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
