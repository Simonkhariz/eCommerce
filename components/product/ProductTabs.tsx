'use client';

import React, { useState } from 'react';
import { Product, Review } from '@/types';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  StarIcon,
  CheckmarkCircle01Icon,
  SlidersHorizontalIcon,
  ArrowDown01Icon,
  PlusSignIcon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons';

interface ProductTabsProps {
  product: Product;
}

export const ProductTabs: React.FC<ProductTabsProps> = ({ product }) => {
  const [activeTab, setActiveTab] = useState<'details' | 'reviews' | 'faqs'>('reviews');
  const [reviews, setReviews] = useState<Review[]>(product.reviews);
  const [sortBy, setSortBy] = useState<'latest' | 'highest'>('latest');
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  // New review form state
  const [authorName, setAuthorName] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState('');

  const handleAddReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!authorName.trim() || !reviewText.trim()) return;

    const newRev: Review = {
      id: `rev-${Date.now()}`,
      author: authorName.trim(),
      rating: reviewRating,
      verified: true,
      comment: reviewText.trim(),
      date: new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    };

    setReviews([newRev, ...reviews]);
    setAuthorName('');
    setReviewText('');
    setIsReviewModalOpen(false);
  };

  const sortedReviews = [...reviews].sort((a, b) => {
    if (sortBy === 'highest') return b.rating - a.rating;
    return 0; // default initial order
  });

  return (
    <div className="mt-16 sm:mt-20">
      {/* Tab Navigation Header */}
      <div className="flex border-b border-neutral-200 text-center text-sm sm:text-base font-medium">
        <button
          onClick={() => setActiveTab('details')}
          className={`flex-1 pb-4 relative transition-colors ${
            activeTab === 'details'
              ? 'text-black font-bold border-b-2 border-black'
              : 'text-neutral-500 hover:text-black'
          }`}
        >
          Product Details
        </button>
        <button
          onClick={() => setActiveTab('reviews')}
          className={`flex-1 pb-4 relative transition-colors ${
            activeTab === 'reviews'
              ? 'text-black font-bold border-b-2 border-black'
              : 'text-neutral-500 hover:text-black'
          }`}
        >
          Rating &amp; Reviews ({reviews.length})
        </button>
        <button
          onClick={() => setActiveTab('faqs')}
          className={`flex-1 pb-4 relative transition-colors ${
            activeTab === 'faqs'
              ? 'text-black font-bold border-b-2 border-black'
              : 'text-neutral-500 hover:text-black'
          }`}
        >
          FAQs
        </button>
      </div>

      {/* Tab 1: Product Details */}
      {activeTab === 'details' && (
        <div className="py-8 max-w-2xl mx-auto space-y-6">
          <div>
            <h4 className="font-bold text-lg text-black mb-3">Specifications</h4>
            <ul className="space-y-2 text-neutral-600 text-sm list-disc pl-5">
              {product.details?.map((detail, idx) => (
                <li key={idx}>{detail}</li>
              )) || <li>Premium combed streetwear fabric.</li>}
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-lg text-black mb-2">Category &amp; Style</h4>
            <p className="text-sm text-neutral-600 capitalize">
              {product.category} • {product.dressStyle} styling • {product.gender}
            </p>
          </div>
        </div>
      )}

      {/* Tab 2: Reviews */}
      {activeTab === 'reviews' && (
        <div className="py-8 space-y-8">
          {/* Header Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-xl sm:text-2xl text-black">All Reviews</h3>
              <span className="text-sm text-neutral-500">({reviews.length})</span>
            </div>

            <div className="flex items-center gap-3">
              {/* Filter / Sort by */}
              <div className="relative inline-block text-xs sm:text-sm">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'latest' | 'highest')}
                  className="bg-[#F0F0F0] text-black font-semibold rounded-full pl-4 pr-9 py-2.5 appearance-none cursor-pointer focus:outline-none"
                >
                  <option value="latest">Latest</option>
                  <option value="highest">Highest Rating</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-black">
                  <HugeiconsIcon icon={ArrowDown01Icon} size={14} />
                </div>
              </div>

              {/* Write a Review Button */}
              <button
                onClick={() => setIsReviewModalOpen(true)}
                className="bg-black text-white hover:bg-neutral-800 text-xs sm:text-sm font-semibold px-5 py-2.5 rounded-full transition-colors"
              >
                Write a Review
              </button>
            </div>
          </div>

          {/* Reviews Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {sortedReviews.map((rev) => (
              <div
                key={rev.id}
                className="border border-neutral-200 rounded-3xl p-6 space-y-3 bg-white"
              >
                {/* Rating Stars */}
                <div className="flex items-center gap-1 text-[#FFC633]">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span
                      key={i}
                      className={i < rev.rating ? 'text-[#FFC633]' : 'text-neutral-300'}
                    >
                      <HugeiconsIcon
                        icon={StarIcon}
                        size={14}
                        className={i < rev.rating ? 'fill-current' : ''}
                      />
                    </span>
                  ))}
                </div>

                {/* Author */}
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-base text-black">{rev.author}</span>
                  {rev.verified && (
                    <span className="text-[#01AB31]">
                      <HugeiconsIcon icon={CheckmarkCircle01Icon} size={16} className="fill-current" />
                    </span>
                  )}
                </div>

                {/* Comment */}
                <p className="text-neutral-600 text-sm leading-relaxed">&ldquo;{rev.comment}&rdquo;</p>

                {/* Date */}
                <p className="text-xs text-neutral-400 pt-1">Posted on {rev.date}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: FAQs */}
      {activeTab === 'faqs' && (
        <div className="py-8 max-w-2xl mx-auto space-y-4">
          {product.faqs && product.faqs.length > 0 ? (
            product.faqs.map((faq, idx) => (
              <div key={idx} className="border border-neutral-200 rounded-2xl p-5 bg-white space-y-2">
                <h5 className="font-bold text-base text-black">{faq.question}</h5>
                <p className="text-sm text-neutral-600 leading-relaxed">{faq.answer}</p>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-neutral-500 text-sm">
              No frequently asked questions for this product yet.
            </div>
          )}
        </div>
      )}

      {/* Write a Review Modal */}
      {isReviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-6 shadow-2xl relative animate-in zoom-in-95">
            <button
              onClick={() => setIsReviewModalOpen(false)}
              className="absolute top-6 right-6 text-neutral-400 hover:text-black"
              aria-label="Close modal"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={20} />
            </button>

            <div>
              <h3 className="font-bold text-2xl text-black">Write a Review</h3>
              <p className="text-xs text-neutral-500 mt-1">
                Share your thoughts and feedback on {product.name}
              </p>
            </div>

            <form onSubmit={handleAddReview} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
                  Your Name
                </label>
                <input
                  type="text"
                  required
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="e.g. Alex M."
                  className="w-full bg-[#F0F0F0] text-sm text-black rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
                  Rating
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setReviewRating(star)}
                      className="p-1 hover:scale-110 transition-transform"
                    >
                      <span className={star <= reviewRating ? 'text-[#FFC633]' : 'text-neutral-300'}>
                        <HugeiconsIcon
                          icon={StarIcon}
                          size={24}
                          className={star <= reviewRating ? 'fill-current' : ''}
                        />
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
                  Review Comment
                </label>
                <textarea
                  required
                  rows={4}
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder="How was the fit, material quality, and style?"
                  className="w-full bg-[#F0F0F0] text-sm text-black rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsReviewModalOpen(false)}
                  className="flex-1 border border-neutral-200 hover:bg-neutral-50 font-semibold py-3 rounded-full text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-black text-white hover:bg-neutral-800 font-semibold py-3 rounded-full text-sm transition-colors"
                >
                  Submit Review
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
