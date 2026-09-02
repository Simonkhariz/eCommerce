'use client';

import React from 'react';
import Link from 'next/link';

export const BrandBar: React.FC = () => {
  const brands = [
    { name: 'VERSACE', fontClass: 'font-serif tracking-widest text-xl sm:text-3xl' },
    { name: 'ZARA', fontClass: 'font-serif font-black tracking-tighter text-2xl sm:text-4xl' },
    { name: 'GUCCI', fontClass: 'font-serif tracking-[0.2em] text-xl sm:text-3xl' },
    { name: 'PRADA', fontClass: 'font-sans font-black tracking-widest text-xl sm:text-3xl' },
    { name: 'Calvin Klein', fontClass: 'font-sans font-light tracking-wide text-lg sm:text-2xl' },
  ];

  return (
    <section className="bg-black py-8 sm:py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-around sm:justify-between gap-6 text-white opacity-90">
          {brands.map((brand) => (
            <Link
              key={brand.name}
              href={`/category?q=${encodeURIComponent(brand.name)}`}
              className={`hover:text-neutral-400 transition-colors uppercase cursor-pointer ${brand.fontClass}`}
            >
              {brand.name}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};
