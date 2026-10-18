'use client';

import React, { useId, useState } from 'react';
import Link from 'next/link';
import { Mail, CheckCircle2 } from 'lucide-react';
import { apiSubscribeNewsletter } from '@/lib/api-client';
import { useStoreInfo, useStoreNav, whatsAppLink } from '@/lib/use-store-info';
import { useStoreSupport } from '@/lib/use-store-support';

const linkClass = 'transition-colors hover:text-black hover:underline';

/** Payment options the store actually accepts (through Kora / Monnify, or manual bank transfer). */
const PAYMENT_BADGES = [
  { label: 'Visa', className: 'text-blue-800' },
  { label: 'Mastercard', className: 'text-red-700' },
  { label: 'Verve', className: 'text-emerald-800' },
  { label: 'Bank transfer', className: 'text-neutral-800' },
];

function NewsletterForm() {
  const inputId = useId();
  const statusId = useId();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    setState('sending');
    setMessage('');
    try {
      await apiSubscribeNewsletter(value);
      setState('done');
      setMessage(`Subscribed. We'll send offers to ${value}; every email has an unsubscribe link.`);
      setEmail('');
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error && err.message ? err.message : 'We could not subscribe you right now. Please try again.');
    }
  };

  if (state === 'done') {
    return (
      <div role="status" className="flex items-start gap-2 rounded-2xl bg-neutral-800 p-4 text-sm font-medium text-white">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-400" aria-hidden="true" />
        <span>{message}</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubscribe} className="flex flex-col gap-3" noValidate>
      <label htmlFor={inputId} className="sr-only">
        Email address
      </label>
      <div className="relative">
        <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-500" aria-hidden="true" />
        <input
          id={inputId}
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === 'error') setState('idle');
          }}
          aria-invalid={state === 'error' || undefined}
          aria-describedby={state === 'error' ? statusId : undefined}
          placeholder="Enter your email address"
          className="w-full rounded-full bg-white py-3 pl-12 pr-4 text-sm text-black placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 sm:py-3.5"
        />
      </div>
      <button
        type="submit"
        disabled={state === 'sending' || !email.trim()}
        className="w-full rounded-full bg-white py-3 text-sm font-semibold text-black shadow-md transition-colors hover:bg-neutral-100 disabled:opacity-60 sm:py-3.5"
      >
        {state === 'sending' ? 'Subscribing…' : 'Subscribe to newsletter'}
      </button>
      {state === 'error' && (
        <p id={statusId} role="alert" className="text-sm text-red-300">
          {message}
        </p>
      )}
    </form>
  );
}

export const Footer: React.FC = () => {
  const { categories } = useStoreNav();
  const { origin } = useStoreInfo();
  const { supportPhone } = useStoreSupport();

  const whatsappNumber = origin?.whatsapp_phone || supportPhone || '';
  const waLink = whatsAppLink(whatsappNumber, 'Hello, I have a question about my order.');

  return (
    <footer className="relative mt-36 bg-[#F0F0F0] pb-12 pt-36">
      {/* Newsletter card (overhangs the top of the footer) */}
      <div className="absolute -top-24 left-0 right-0 z-20 mx-auto max-w-7xl px-4 sm:-top-28 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 rounded-3xl bg-black p-6 text-white shadow-2xl sm:p-10 md:flex-row md:gap-10 md:p-12">
          <div className="max-w-md">
            <h2 className="font-integral text-2xl uppercase leading-tight tracking-tight text-white sm:text-3xl sm:leading-[1.05] md:text-4xl lg:text-[42px]">
              Stay up to date about our latest offers
            </h2>
          </div>
          <div className="w-full max-w-sm flex-1 md:w-auto">
            <NewsletterForm />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 border-b border-neutral-300 pb-12 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand & contact */}
          <div className="space-y-4 lg:col-span-2">
            <Link href="/" className="block font-integral text-2xl tracking-tighter text-black sm:text-3xl lg:text-4xl">
              SHOP.CO
            </Link>
            <p className="max-w-sm text-sm leading-relaxed text-neutral-700">
              Clothes that suit your style and that you&apos;re proud to wear, delivered across Nigeria.
            </p>
            <ul className="space-y-1.5 text-sm text-neutral-700">
              {origin?.contact_email && (
                <li>
                  <a href={`mailto:${origin.contact_email}`} className={linkClass}>
                    {origin.contact_email}
                  </a>
                </li>
              )}
              {waLink && (
                <li>
                  <a href={waLink} target="_blank" rel="noopener noreferrer" className={`font-medium text-emerald-800 ${linkClass}`}>
                    WhatsApp {whatsappNumber}
                    <span className="sr-only"> (opens WhatsApp)</span>
                  </a>
                </li>
              )}
              {origin?.contact_phone && (
                <li>
                  <a href={`tel:${origin.contact_phone.replace(/[^\d+]/g, '')}`} className={linkClass}>
                    {origin.contact_phone}
                  </a>
                </li>
              )}
            </ul>
          </div>

          {/* Shop */}
          <nav aria-label="Shop">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-black">Shop</h3>
            <ul className="space-y-3 text-sm text-neutral-700">
              <li>
                <Link href="/category" className={linkClass}>
                  All products
                </Link>
              </li>
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link href={`/category?cat=${encodeURIComponent(c.slug)}`} className={linkClass}>
                    {c.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/category?onSale=true" className={linkClass}>
                  On sale
                </Link>
              </li>
            </ul>
          </nav>

          {/* Help */}
          <nav aria-label="Help">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-black">Help</h3>
            <ul className="space-y-3 text-sm text-neutral-700">
              <li>
                <Link href="/track-order" className={`font-semibold text-emerald-800 ${linkClass}`}>
                  Track an order
                </Link>
              </li>
              <li>
                <Link href="/orders" className={linkClass}>
                  My orders
                </Link>
              </li>
              <li>
                <Link href="/shipping" className={linkClass}>
                  Shipping &amp; delivery
                </Link>
              </li>
              <li>
                <Link href="/returns" className={linkClass}>
                  Returns &amp; refunds
                </Link>
              </li>
              <li>
                <Link href="/faq" className={linkClass}>
                  FAQ
                </Link>
              </li>
              <li>
                <Link href="/contact" className={linkClass}>
                  Contact us
                </Link>
              </li>
            </ul>
          </nav>

          {/* Company */}
          <nav aria-label="Company">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-black">Company</h3>
            <ul className="space-y-3 text-sm text-neutral-700">
              <li>
                <Link href="/about" className={linkClass}>
                  About us
                </Link>
              </li>
              <li>
                <Link href="/terms" className={linkClass}>
                  Terms &amp; conditions
                </Link>
              </li>
              <li>
                <Link href="/privacy" className={linkClass}>
                  Privacy policy
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col items-center justify-between gap-4 pt-8 text-xs text-neutral-700 sm:flex-row">
          <p>
            © {new Date().getFullYear()} {origin?.store_name || 'SHOP.CO'}. All rights reserved.
          </p>
          <ul aria-label="Accepted payment methods" className="flex flex-wrap items-center justify-center gap-2">
            {PAYMENT_BADGES.map((b) => (
              <li
                key={b.label}
                className={`rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-bold tracking-wide shadow-sm ${b.className}`}
              >
                {b.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
};
