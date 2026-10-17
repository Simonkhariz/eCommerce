'use client';

import React, { useRef } from 'react';
import { MOCK_REVIEWS } from '@/data/mockData';
import { ApiReview } from '@/lib/api-client';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  StarIcon,
  CheckmarkCircle01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
} from '@hugeicons/core-free-icons';

interface CustomerReviewsProps {
  reviews?: ApiReview[];
}

export const CustomerReviews: React.FC<CustomerReviewsProps> = ({ reviews = [] }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const displayReviews =
    reviews && reviews.length > 0
      ? reviews.map((r) => ({
          id: r.id,
          author: r.author || 'Verified Customer',
          rating: Number(r.rating) || 5,
          comment: r.comment,
          verified: Boolean(r.verified),
          productName: r.product_name,
        }))
      : MOCK_REVIEWS.map((m) => ({
          id: m.id,
          author: m.author,
          rating: m.rating,
          comment: m.comment,
          verified: m.verified,
          productName: undefined,
        }));

  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = direction === 'left' ? -360 : 360;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <section className="py-12 sm:py-16 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header with Navigation Arrows */}
        <div className="flex items-center justify-between mb-8 sm:mb-10">
          <h2 className="font-integral text-2xl sm:text-4xl lg:text-5xl text-black tracking-tight">
            OUR HAPPY CUSTOMERS
          </h2>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleScroll('left')}
              className="p-2.5 rounded-full border border-neutral-200 hover:bg-neutral-100 text-black transition-colors"
              aria-label="Previous review"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} size={20} />
            </button>
            <button
              onClick={() => handleScroll('right')}
              className="p-2.5 rounded-full border border-neutral-200 hover:bg-neutral-100 text-black transition-colors"
              aria-label="Next review"
            >
              <HugeiconsIcon icon={ArrowRight01Icon} size={20} />
            </button>
          </div>
        </div>

        {/* Scrollable Review Cards */}
        <div
          ref={scrollRef}
          className="flex gap-4 sm:gap-6 overflow-x-auto no-scrollbar pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 snap-x"
        >
          {displayReviews.map((review) => (
            <div
              key={review.id}
              className="min-w-[300px] sm:min-w-[380px] max-w-[400px] bg-white border border-neutral-200 rounded-3xl p-6 sm:p-8 flex flex-col justify-between snap-start shadow-sm shrink-0"
            >
              <div>
                {/* Stars */}
                <div className="flex items-center gap-1 text-[#FFC633] mb-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span
                      key={i}
                      className={i < review.rating ? 'text-[#FFC633]' : 'text-neutral-300'}
                    >
                      <HugeiconsIcon
                        icon={StarIcon}
                        size={16}
                        className={i < review.rating ? 'fill-current' : ''}
                      />
                    </span>
                  ))}
                </div>

                {/* Author with Verified Badge */}
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="font-bold text-base sm:text-lg text-black">
                    {review.author}
                  </span>
                  {review.verified && (
                    <span className="text-[#01AB31]" title="Verified Purchase">
                      <HugeiconsIcon icon={CheckmarkCircle01Icon} size={16} className="fill-current" />
                    </span>
                  )}
                </div>

                {/* Review Quote */}
                <p className="text-neutral-600 text-sm leading-relaxed mb-3">
                  &ldquo;{review.comment}&rdquo;
                </p>

                {/* Product Tag if available from DB */}
                {review.productName && (
                  <div className="inline-block text-[11px] font-medium bg-neutral-100 text-neutral-600 px-2.5 py-1 rounded-md">
                    Item: {review.productName}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
