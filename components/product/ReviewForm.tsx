'use client';

import React, { useId, useRef, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { useAuth } from '@/context/AuthContext';
import { ApiError, apiSubmitReview } from '@/lib/api-client';
import { HugeiconsIcon } from '@hugeicons/react';
import { StarIcon, Cancel01Icon, CheckmarkCircle01Icon } from '@hugeicons/core-free-icons';

interface ReviewFormProps {
  open: boolean;
  onClose: () => void;
  productSlug: string;
  productName: string;
}

const COMMENT_MIN = 10;
const COMMENT_MAX = 2000;
const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

type Errors = Partial<Record<'author_name' | 'email' | 'rating' | 'title' | 'comment' | 'form', string>>;

/**
 * Review submission. Reviews are held for moderation, and "verified purchase" is decided by the
 * server from paid orders, so nothing is added to the page here after submitting.
 */
export function ReviewForm({ open, onClose, productSlug, productName }: ReviewFormProps) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const ratingRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const ids = useId();

  // Fresh form each time it opens; prefill from the signed-in customer.
  const formKey = open ? `open:${user?.id ?? 'guest'}` : 'closed';
  const [formFor, setFormFor] = useState('closed');
  if (formKey !== formFor) {
    setFormFor(formKey);
    if (open) {
      setName(user?.full_name ?? '');
      setEmail(user?.email ?? '');
      setRating(0);
      setTitle('');
      setComment('');
      setErrors({});
      setDoneMessage(null);
    }
  }

  const pickRating = (value: number, focus = false) => {
    setRating(value);
    if (focus) ratingRefs.current[value - 1]?.focus();
  };

  const onRatingKey = (e: React.KeyboardEvent, value: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      pickRating(Math.min(5, value + 1), true);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      pickRating(Math.max(1, value - 1), true);
    } else if (e.key === 'Home') {
      e.preventDefault();
      pickRating(1, true);
    } else if (e.key === 'End') {
      e.preventDefault();
      pickRating(5, true);
    }
  };

  const validate = (): Errors => {
    const next: Errors = {};
    if (!name.trim()) next.author_name = 'Enter your name.';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Enter the email you ordered with.';
    if (rating < 1) next.rating = 'Choose a rating from 1 to 5 stars.';
    if (title.trim().length > 120) next.title = 'Keep the title under 120 characters.';
    const len = comment.trim().length;
    if (len < COMMENT_MIN || len > COMMENT_MAX) next.comment = `Write between ${COMMENT_MIN} and ${COMMENT_MAX.toLocaleString()} characters.`;
    return next;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local = validate();
    setErrors(local);
    if (Object.keys(local).length > 0) return;

    setSubmitting(true);
    try {
      const res = await apiSubmitReview(productSlug, {
        author_name: name.trim(),
        email: email.trim(),
        rating,
        title: title.trim() || undefined,
        comment: comment.trim(),
      });
      setDoneMessage(res.message);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 409) {
          setErrors({ form: "You've already reviewed this product. Thank you!" });
        } else if (err.statusCode === 422 && err.details) {
          const fieldErrors: Errors = {};
          Object.entries(err.details).forEach(([key, value]) => {
            if (typeof value === 'string') fieldErrors[key as keyof Errors] = value;
          });
          setErrors(Object.keys(fieldErrors).length ? fieldErrors : { form: err.message });
        } else {
          setErrors({ form: err.message });
        }
      } else {
        setErrors({ form: 'Your review could not be sent. Please try again.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass = (invalid: boolean) =>
    `w-full rounded-xl border px-4 py-3 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-black ${
      invalid ? 'border-red-500' : 'border-neutral-300'
    }`;
  const errorId = (field: string) => `${ids}-${field}-error`;
  const commentLength = comment.trim().length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Review ${productName}`}
      busy={submitting}
      panelClassName="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-4 mb-4" aria-hidden="true">
        <div>
          <p className="font-bold text-xl text-black">Write a review</p>
          <p className="text-sm text-neutral-600 mt-0.5 line-clamp-1">{productName}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        disabled={submitting}
        aria-label="Close"
        className="absolute top-5 right-5 p-1.5 rounded-full text-neutral-600 hover:text-black hover:bg-neutral-100 disabled:opacity-40"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={20} />
      </button>

      {doneMessage ? (
        <div className="text-center py-6 space-y-4" role="status">
          <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto">
            <HugeiconsIcon icon={CheckmarkCircle01Icon} size={28} />
          </div>
          <p className="text-base font-semibold text-black">{doneMessage}</p>
          <button
            type="button"
            onClick={onClose}
            data-autofocus
            className="bg-black text-white hover:bg-neutral-800 font-semibold px-8 py-3 rounded-full text-sm"
          >
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          {errors.form && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {errors.form}
            </p>
          )}

          <fieldset aria-describedby={errors.rating ? errorId('rating') : undefined}>
            <legend className="text-sm font-semibold text-black mb-2">Your rating</legend>
            <div role="radiogroup" aria-label="Rating" className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((value) => {
                const filled = value <= rating;
                const isChecked = rating === value;
                return (
                  <button
                    key={value}
                    ref={(el) => {
                      ratingRefs.current[value - 1] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={isChecked}
                    aria-label={`${value} star${value === 1 ? '' : 's'} – ${RATING_LABELS[value]}`}
                    tabIndex={isChecked || (rating === 0 && value === 1) ? 0 : -1}
                    onClick={() => pickRating(value)}
                    onKeyDown={(e) => onRatingKey(e, value)}
                    className={`p-1 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-black ${filled ? 'text-[#FFC633]' : 'text-neutral-500'}`}
                  >
                    <HugeiconsIcon icon={StarIcon} size={28} className={filled ? 'fill-current' : ''} />
                  </button>
                );
              })}
              <span className="ml-2 text-sm text-neutral-700" aria-hidden="true">
                {rating > 0 ? RATING_LABELS[rating] : ''}
              </span>
            </div>
            {errors.rating && (
              <p id={errorId('rating')} className="mt-1 text-xs text-red-700">
                {errors.rating}
              </p>
            )}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${ids}-name`} className="block text-sm font-semibold text-black mb-1">
                Name
              </label>
              <input
                id={`${ids}-name`}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                aria-invalid={!!errors.author_name}
                aria-describedby={errors.author_name ? errorId('author_name') : undefined}
                className={fieldClass(!!errors.author_name)}
              />
              {errors.author_name && (
                <p id={errorId('author_name')} className="mt-1 text-xs text-red-700">
                  {errors.author_name}
                </p>
              )}
            </div>
            <div>
              <label htmlFor={`${ids}-email`} className="block text-sm font-semibold text-black mb-1">
                Email
              </label>
              <input
                id={`${ids}-email`}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={!!user?.email}
                aria-invalid={!!errors.email}
                aria-describedby={`${ids}-email-hint${errors.email ? ` ${errorId('email')}` : ''}`}
                className={`${fieldClass(!!errors.email)} read-only:bg-neutral-50`}
              />
              <p id={`${ids}-email-hint`} className="mt-1 text-xs text-neutral-600">
                Not published. Used to check for a matching order.
              </p>
              {errors.email && (
                <p id={errorId('email')} className="mt-1 text-xs text-red-700">
                  {errors.email}
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor={`${ids}-title`} className="block text-sm font-semibold text-black mb-1">
              Title <span className="font-normal text-neutral-600">(optional)</span>
            </label>
            <input
              id={`${ids}-title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? errorId('title') : undefined}
              className={fieldClass(!!errors.title)}
            />
            {errors.title && (
              <p id={errorId('title')} className="mt-1 text-xs text-red-700">
                {errors.title}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={`${ids}-comment`} className="block text-sm font-semibold text-black mb-1">
              Your review
            </label>
            <textarea
              id={`${ids}-comment`}
              rows={5}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={COMMENT_MAX}
              aria-invalid={!!errors.comment}
              aria-describedby={`${ids}-comment-count${errors.comment ? ` ${errorId('comment')}` : ''}`}
              className={`${fieldClass(!!errors.comment)} resize-y`}
            />
            <p id={`${ids}-comment-count`} className="mt-1 text-xs text-neutral-600" aria-live="polite">
              {commentLength.toLocaleString()} / {COMMENT_MAX.toLocaleString()} characters
              {commentLength > 0 && commentLength < COMMENT_MIN ? ` (at least ${COMMENT_MIN})` : ''}
            </p>
            {errors.comment && (
              <p id={errorId('comment')} className="mt-1 text-xs text-red-700">
                {errors.comment}
              </p>
            )}
          </div>

          <p className="text-xs text-neutral-600">
            Reviews appear after the store has checked them. A &ldquo;verified purchase&rdquo; badge is added only when we find a paid order for
            this product.
          </p>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-black text-white hover:bg-neutral-800 font-semibold py-3.5 rounded-full text-sm disabled:opacity-60"
          >
            {submitting ? 'Sending…' : 'Submit review'}
          </button>
        </form>
      )}
    </Dialog>
  );
}
