'use client';

import React, { useState } from 'react';
import { Product } from '@/types';
import { HugeiconsIcon } from '@hugeicons/react';
import { StarIcon, CheckmarkCircle01Icon, ArrowDown01Icon } from '@hugeicons/core-free-icons';

interface ProductTabsProps {
  product: Product;
}

type TabId = 'details' | 'reviews' | 'faqs';

/**
 * Product details, approved customer reviews and FAQs. Only real data is shown:
 * tabs without content explain that rather than displaying placeholder text.
 */
export const ProductTabs: React.FC<ProductTabsProps> = ({ product }) => {
  const reviews = product.reviews ?? [];
  const faqs = product.faqs ?? [];
  const [activeTab, setActiveTab] = useState<TabId>(reviews.length > 0 ? 'reviews' : 'details');
  const [sortBy, setSortBy] = useState<'latest' | 'highest'>('latest');

  const sortedReviews = sortBy === 'highest' ? [...reviews].sort((a, b) => b.rating - a.rating) : reviews;
  const dressStyles = Array.isArray(product.dressStyle) ? product.dressStyle : [product.dressStyle];

  const tabs: { id: TabId; label: string }[] = [
    { id: 'details', label: 'Product Details' },
    { id: 'reviews', label: `Rating & Reviews (${reviews.length})` },
    ...(faqs.length > 0 ? [{ id: 'faqs' as TabId, label: 'FAQs' }] : []),
  ];

  return (
    <div className="mt-16 sm:mt-20">
      <div role="tablist" aria-label="Product information" className="flex border-b border-neutral-200 text-center text-sm sm:text-base font-medium">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 pb-4 relative transition-colors ${
              activeTab === tab.id ? 'text-black font-bold border-b-2 border-black' : 'text-neutral-600 hover:text-black'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'details' && (
        <div role="tabpanel" id="panel-details" aria-labelledby="tab-details" className="py-8 max-w-2xl mx-auto space-y-6">
          {product.description && (
            <div>
              <h4 className="font-bold text-lg text-black mb-3">About this item</h4>
              <p className="text-sm text-neutral-700 leading-relaxed whitespace-pre-line">{product.description}</p>
            </div>
          )}
          {product.details.length > 0 && (
            <div>
              <h4 className="font-bold text-lg text-black mb-3">Specifications</h4>
              <ul className="space-y-2 text-neutral-700 text-sm list-disc pl-5">
                {product.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            </div>
          )}
          {dressStyles.filter(Boolean).length > 0 && (
            <div>
              <h4 className="font-bold text-lg text-black mb-2">Style</h4>
              <p className="text-sm text-neutral-700 capitalize">{dressStyles.filter(Boolean).join(', ')}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'reviews' && (
        <div role="tabpanel" id="panel-reviews" aria-labelledby="tab-reviews" className="py-8 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-xl sm:text-2xl text-black">All Reviews</h3>
              <span className="text-sm text-neutral-600">({reviews.length})</span>
            </div>

            {reviews.length > 1 && (
              <div className="relative inline-block text-xs sm:text-sm">
                <label htmlFor="review-sort" className="sr-only">Sort reviews</label>
                <select
                  id="review-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'latest' | 'highest')}
                  className="bg-[#F0F0F0] text-black font-semibold rounded-full pl-4 pr-9 py-2.5 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-black"
                >
                  <option value="latest">Latest</option>
                  <option value="highest">Highest Rating</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-black">
                  <HugeiconsIcon icon={ArrowDown01Icon} size={14} />
                </div>
              </div>
            )}
          </div>

          {reviews.length === 0 ? (
            <div className="text-center py-10 text-neutral-600 text-sm">
              No reviews yet. Reviews from customers who bought this item will appear here.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {sortedReviews.map((rev) => (
                <article key={rev.id} className="border border-neutral-200 rounded-3xl p-6 space-y-3 bg-white">
                  <div className="flex items-center gap-1" aria-label={`${rev.rating} out of 5 stars`}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i} aria-hidden="true" className={i < rev.rating ? 'text-[#FFC633]' : 'text-neutral-300'}>
                        <HugeiconsIcon icon={StarIcon} size={14} className={i < rev.rating ? 'fill-current' : ''} />
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-base text-black">{rev.author}</span>
                    {rev.verified && (
                      <span className="text-[#01AB31]" title="Verified purchase">
                        <HugeiconsIcon icon={CheckmarkCircle01Icon} size={16} className="fill-current" />
                        <span className="sr-only">Verified purchase</span>
                      </span>
                    )}
                  </div>
                  <p className="text-neutral-700 text-sm leading-relaxed">&ldquo;{rev.comment}&rdquo;</p>
                  <p className="text-xs text-neutral-500 pt-1">Posted on {rev.date}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'faqs' && faqs.length > 0 && (
        <div role="tabpanel" id="panel-faqs" aria-labelledby="tab-faqs" className="py-8 max-w-2xl mx-auto space-y-4">
          {faqs.map((faq) => (
            <div key={faq.question} className="border border-neutral-200 rounded-2xl p-5 bg-white space-y-2">
              <h5 className="font-bold text-base text-black">{faq.question}</h5>
              <p className="text-sm text-neutral-700 leading-relaxed">{faq.answer}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
