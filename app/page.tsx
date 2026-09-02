import { HeroBanner } from '@/components/home/HeroBanner';
import { BrandBar } from '@/components/home/BrandBar';
import { FlashDeals } from '@/components/home/FlashDeals';
import { ProductSection } from '@/components/home/ProductSection';
import { CategoryGrid } from '@/components/home/CategoryGrid';
import { BrowseByDressStyle } from '@/components/home/BrowseByDressStyle';
import { CustomerReviews } from '@/components/home/CustomerReviews';
import { PRODUCTS } from '@/data/mockData';

export default function HomePage() {
  const newArrivals = PRODUCTS.filter((p) => p.isNewArrival);
  const topSelling = PRODUCTS.filter((p) => p.isTopSelling);

  return (
    <div className="space-y-4">
      {/* 1. Hero Promo Section with Statistics and Fashion Couple */}
      <HeroBanner />

      {/* 2. Luxury Brand Strip (VERSACE, ZARA, GUCCI, PRADA, Calvin Klein) */}
      <BrandBar />

      {/* 3. Limited-Time Flash Sale Offers with Live Countdown */}
      <FlashDeals />

      {/* 4. New Arrivals Section */}
      <ProductSection
        title="NEW ARRIVALS"
        products={newArrivals.length > 0 ? newArrivals : PRODUCTS.slice(0, 4)}
        viewAllHref="/category?newArrivals=true"
        hasDivider={true}
      />

      {/* 5. Top Selling Section */}
      <ProductSection
        title="TOP SELLING"
        products={topSelling.length > 0 ? topSelling : PRODUCTS.slice(4, 8)}
        viewAllHref="/category?topSelling=true"
        hasDivider={false}
      />

      {/* 6. Curated Category Visual Grid */}
      <CategoryGrid />

      {/* 7. Browse by Dress Style (Casual, Formal, Party, Gym) */}
      <BrowseByDressStyle />

      {/* 8. Happy Customer Testimonials Slider */}
      <CustomerReviews />
    </div>
  );
}
