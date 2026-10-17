import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ApiCategory } from '@/lib/api-client';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowUpRight01Icon } from '@hugeicons/core-free-icons';

interface CategoryGridProps {
  categories?: ApiCategory[];
}

const DEFAULT_CATEGORY_ITEMS = [
  {
    name: 'T-Shirts',
    slug: 't-shirts',
    count: '240+ Products',
    image: '/images/categories/tshirts.webp',
  },
  {
    name: 'Casual Shirts',
    slug: 'shirts',
    count: '180+ Products',
    image: '/images/categories/shirts.webp',
  },
  {
    name: 'Denim & Jeans',
    slug: 'jeans',
    count: '120+ Products',
    image: '/images/categories/jeans.webp',
  },
  {
    name: 'Footwear',
    slug: 'footwear',
    count: '95+ Products',
    image: '/images/categories/footwear.webp',
  },
  {
    name: 'Accessories',
    slug: 'accessories',
    count: '150+ Products',
    image: '/images/categories/accessories.webp',
  },
  {
    name: 'Hoodies',
    slug: 'hoodie',
    count: '110+ Products',
    image: '/images/categories/hoodies.webp',
  },
];

export const CategoryGrid: React.FC<CategoryGridProps> = ({ categories }) => {
  const items = categories && categories.length > 0
    ? categories.map((c) => ({
        name: c.name,
        slug: c.slug,
        count: `${c.product_count} ${c.product_count === 1 ? 'Product' : 'Products'}`,
        image: c.image_url || '/images/categories/tshirts.webp',
      }))
    : DEFAULT_CATEGORY_ITEMS;
  return (
    <section className="py-12 sm:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 sm:mb-12">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-neutral-400 block mb-1">
              Curated Collections
            </span>
            <h2 className="font-integral text-2xl sm:text-4xl lg:text-5xl text-black tracking-tight">
              EXPLORE BY CATEGORY
            </h2>
          </div>
          <Link
            href="/category"
            className="text-xs sm:text-sm font-semibold text-black hover:underline mt-2 sm:mt-0 flex items-center gap-1"
          >
            <span>Browse All Collections</span>
            <HugeiconsIcon icon={ArrowUpRight01Icon} size={16} />
          </Link>
        </div>

        {/* 6-Grid Responsive Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6">
          {items.map((cat) => (
            <Link
              key={cat.slug}
              href={`/category?cat=${cat.slug}`}
              className="group relative bg-[#F0EEED] rounded-3xl overflow-hidden aspect-[4/5] flex flex-col justify-between p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-300"
            >
              {/* Background Image with Zoom */}
              <div className="absolute inset-0 z-0">
                <Image
                  src={cat.image}
                  alt={cat.name}
                  fill
                  unoptimized
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                  className="object-cover object-center group-hover:scale-110 transition-transform duration-500 opacity-90 group-hover:opacity-100"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              </div>

              {/* Top Floating Badge */}
              <div className="relative z-10 self-end">
                <div className="w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center text-black group-hover:bg-black group-hover:text-white transition-colors shadow-sm">
                  <HugeiconsIcon icon={ArrowUpRight01Icon} size={16} />
                </div>
              </div>

              {/* Bottom Details */}
              <div className="relative z-10 text-white">
                <h3 className="font-bold text-base sm:text-lg leading-tight group-hover:translate-x-1 transition-transform">
                  {cat.name}
                </h3>
                <p className="text-[11px] text-neutral-300 mt-0.5 font-medium">
                  {cat.count}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};
