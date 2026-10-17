'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { HeroBanner } from '@/components/home/HeroBanner';
import { BrandBar } from '@/components/home/BrandBar';
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
  const [error, setError] = useState<string | null>(null);
  const [homepageData, setHomepageData] = useState<HomepageData | null>(null);

  const loadHomepage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getHomepageData();
      setHomepageData(data);
    } catch (err: any) {
      console.error('Failed to load homepage from backend API:', err);
      setError(err.message || 'Unable to connect to Shop.co catalogue API.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHomepage();
  }, [loadHomepage]);

  const newArrivals: Product[] = homepageData
    ? homepageData.new_arrivals.map(mapApiProductToStorefront)
    : [];
  const topSelling: Product[] = homepageData
    ? homepageData.top_selling.map(mapApiProductToStorefront)
    : [];
  const flashProducts: Product[] = homepageData
    ? homepageData.flash_deals.map(mapApiProductToStorefront)
    : [];

  return (
    <div className="space-y-4">
      {/* 1. Hero Promo Section with Statistics and Dynamic CMS Banners */}
      <HeroBanner
        banners={homepageData?.banners}
        promotions={homepageData?.promotions}
      />

      {/* 2. Luxury Brand Strip (VERSACE, ZARA, GUCCI, PRADA, Calvin Klein) */}
      <BrandBar />

      {/* Error / Connection State Banner (Never silently fallback to fake prices) */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 text-red-600 rounded-full shrink-0">
                <HugeiconsIcon icon={Alert02Icon} size={24} />
              </div>
              <div>
                <h3 className="font-bold text-red-900 text-base">Backend Catalogue Disconnected</h3>
                <p className="text-red-700 text-sm mt-0.5">
                  {error} - Live prices and stock are temporarily unavailable.
                </p>
              </div>
            </div>
            <button
              onClick={loadHomepage}
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm px-5 py-2.5 rounded-full transition-all shrink-0 shadow-sm"
            >
              <HugeiconsIcon icon={RefreshIcon} size={16} />
              <span>Retry Connection</span>
            </button>
          </div>
        </div>
      )}

      {/* Loading Skeletons */}
      {loading && !homepageData && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
          <div className="space-y-6">
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

      {/* 3. Limited-Time Flash Sale Offers with Live Countdown */}
      {homepageData && flashProducts.length > 0 && (
        <FlashDeals products={flashProducts} />
      )}

      {/* 4. New Arrivals Section */}
      {homepageData && (
        <ProductSection
          title="NEW ARRIVALS"
          products={newArrivals}
          viewAllHref="/category?newArrivals=true"
          hasDivider={true}
        />
      )}

      {/* 5. Top Selling Section */}
      {homepageData && (
        <ProductSection
          title="TOP SELLING"
          products={topSelling}
          viewAllHref="/category?topSelling=true"
          hasDivider={false}
        />
      )}

      {/* 6. Curated Category Visual Grid */}
      <CategoryGrid categories={homepageData?.categories} />

      {/* 7. Browse by Dress Style (Casual, Formal, Party, Gym) */}
      <BrowseByDressStyle />

      {/* 8. Happy Customer Testimonials Slider */}
      <CustomerReviews reviews={homepageData?.reviews} />
    </div>
  );
}
