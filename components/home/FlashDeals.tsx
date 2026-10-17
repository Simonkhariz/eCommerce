'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Product } from '@/types';
import { ProductCard } from '@/components/ui/ProductCard';
import { HugeiconsIcon } from '@hugeicons/react';
import { FireIcon, Clock01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';

interface FlashDealsProps {
  products?: Product[];
}

export const FlashDeals: React.FC<FlashDealsProps> = ({ products }) => {
  // 24-hour dynamic countdown timer simulation
  const [timeLeft, setTimeLeft] = useState({
    hours: 14,
    minutes: 36,
    seconds: 48,
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev.seconds > 0) {
          return { ...prev, seconds: prev.seconds - 1 };
        } else if (prev.minutes > 0) {
          return { ...prev, minutes: 59, seconds: 59 };
        } else if (prev.hours > 0) {
          return { hours: prev.hours - 1, minutes: 59, seconds: 59 };
        }
        return { hours: 23, minutes: 59, seconds: 59 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Use live products passed from homepage API
  const flashProducts = products && products.length > 0
    ? products.slice(0, 4)
    : [];

  if (flashProducts.length === 0) {
    return null;
  }

  return (
    <section className="py-12 sm:py-16 bg-neutral-50/70 border-y border-neutral-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Flash Sale Header with Animated Countdown */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 sm:mb-12">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              <HugeiconsIcon icon={FireIcon} size={14} className="text-red-600 animate-bounce" />
              Limited Time Deals
            </div>
            <h2 className="font-integral text-2xl sm:text-4xl lg:text-5xl text-black tracking-tight">
              FLASH SALE OFFERS
            </h2>
          </div>

          {/* Countdown Clock */}
          <div className="flex items-center gap-2 sm:gap-3 bg-white border border-neutral-200 shadow-sm rounded-2xl p-3 px-4 self-start md:self-auto">
            <HugeiconsIcon icon={Clock01Icon} size={20} className="text-neutral-500" />
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mr-1">
              Ends In:
            </span>
            <div className="flex items-center gap-1.5 font-mono font-bold text-sm sm:text-base">
              <span className="bg-black text-white px-2.5 py-1 rounded-lg">
                {String(timeLeft.hours).padStart(2, '0')}
              </span>
              <span className="text-black font-bold">:</span>
              <span className="bg-black text-white px-2.5 py-1 rounded-lg">
                {String(timeLeft.minutes).padStart(2, '0')}
              </span>
              <span className="text-black font-bold">:</span>
              <span className="bg-black text-white px-2.5 py-1 rounded-lg text-red-400">
                {String(timeLeft.seconds).padStart(2, '0')}
              </span>
            </div>
          </div>
        </div>

        {/* Product Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {flashProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        {/* View All Flash Sale Link */}
        <div className="mt-10 text-center">
          <Link
            href="/category?onSale=true"
            className="inline-flex items-center gap-2 bg-black text-white hover:bg-neutral-800 font-semibold px-10 py-3.5 rounded-full transition-colors text-sm shadow-md"
          >
            <span>View All Sale Deals</span>
            <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
};
