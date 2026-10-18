'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { HeroBanner } from '@/components/home/HeroBanner';
import { FlashDeals } from '@/components/home/FlashDeals';
import { ProductSection } from '@/components/home/ProductSection';
import { CategoryGrid } from '@/components/home/CategoryGrid';
import { BrowseByDressStyle } from '@/components/home/BrowseByDressStyle';
import { CustomerReviews } from '@/components/home/CustomerReviews';
import { getHomepageData, mapApiProductToStorefront, HomepageData } from '@/lib/api-client';
import { Product } from '@/types';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, RefreshIcon } from '@hugeicons/core-free-icons';

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [homepageData, setHomepageData] = useState<HomepageData | null>(null);
  const [flashExpired, setFlashExpired] = useState(false);

  const loadHomepage = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await getHomepageData();
      setHomepageData(data);
      setFlashExpired(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHomepage();
  }, [loadHomepage]);

  const newArrivals: Product[] = homepageData ? homepageData.new_arrivals.map(mapApiProductToStorefront) : [];
  const topSelling: Product[] = homepageData ? homepageData.top_selling.map(mapApiProductToStorefront) : [];
  const flashProducts: Product[] = homepageData ? homepageData.flash_deals.map(mapApiProductToStorefront) : [];

  return (
    <div className="space-y-4">
      {/* 1. Hero with CMS banners, active promotion and real store numbers */}
      <HeroBanner banners={homepageData?.banners} promotions={homepageData?.promotions} stats={homepageData?.stats} />

      {/* Couldn't load the shop: say so plainly (never fall back to made-up products or prices) */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div
            role="alert"
            className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 text-red-700 rounded-full shrink-0" aria-hidden="true">
                <HugeiconsIcon icon={Alert02Icon} size={24} />
              </div>
              <div>
                <h2 className="font-bold text-red-900 text-base">We couldn&apos;t load the shop right now</h2>
                <p className="text-red-800 text-sm mt-0.5">Please check your connection and try again in a moment.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={loadHomepage}
              disabled={loading}
              className="inline-flex items-center gap-2 bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white font-semibold text-sm px-5 py-2.5 rounded-full transition-all shrink-0 shadow-sm"
            >
              <HugeiconsIcon icon={RefreshIcon} size={16} aria-hidden="true" />
              <span>{loading ? 'Trying again…' : 'Try again'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Loading Skeletons */}
      {loading && !homepageData && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12" role="status" aria-live="polite">
          <span className="sr-only">Loading products…</span>
          <div className="space-y-6" aria-hidden="true">
            <div className="h-10 bg-neutral-200 rounded-xl w-64 mx-auto animate-pulse" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-3 animate-pulse">
                  <div className="aspect-square bg-neutral-200 rounded-2xl" />
                  <div className="h-4 bg-neutral-200 rounded w-3/4" />
                  <div className="h-3 bg-neutral-200 rounded w-1/2" />
                  <div className="h-5 bg-neutral-200 rounded w-1/3" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2. Flash deals: real countdown only when the store set an end time */}
      {homepageData && flashProducts.length > 0 && !flashExpired && (
        <FlashDeals products={flashProducts} endsAt={homepageData.flash_deals_end_at} onExpired={() => setFlashExpired(true)} />
      )}

      {/* 3. New Arrivals */}
      {homepageData && (
        <ProductSection title="NEW ARRIVALS" products={newArrivals} viewAllHref="/category?sort=newest" hasDivider={true} />
      )}

      {/* 4. Top Selling */}
      {homepageData && <ProductSection title="TOP SELLING" products={topSelling} viewAllHref="/category" hasDivider={false} />}

      {/* 5. Categories (real counts) */}
      <CategoryGrid categories={homepageData?.categories} />

      {/* 6. Dress styles that exist in the catalogue */}
      <BrowseByDressStyle />

      {/* 7. Approved customer reviews (hidden when there are none) */}
      <CustomerReviews reviews={homepageData?.reviews} />
    </div>
  );
}
