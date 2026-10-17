'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, Twitter, Facebook, Instagram, Github, CheckCircle2 } from 'lucide-react';
import { apiSubscribeNewsletter } from '@/lib/api-client';

export const Footer: React.FC = () => {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      try {
        await apiSubscribeNewsletter(email.trim());
      } catch (err) {
        console.error('Newsletter subscription error:', err);
      }
      setSubscribed(true);
      setEmail('');
      setTimeout(() => setSubscribed(false), 5000);
    }
  };

  return (
    <footer className="bg-[#F0F0F0] pt-36 pb-12 relative mt-36">
      {/* Floating Newsletter Card (Overhanging top of footer) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 absolute -top-24 sm:-top-28 left-0 right-0 z-20">
        <div className="bg-black text-white rounded-3xl p-6 sm:p-10 md:p-12 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 md:gap-10">
          <div className="max-w-md">
            <h2 className="font-integral text-2xl sm:text-3xl md:text-4xl lg:text-[42px] leading-tight sm:leading-[1.05] uppercase text-white tracking-tight">
              STAY UPTO DATE ABOUT OUR LATEST OFFERS
            </h2>
          </div>

          <div className="w-full md:w-auto flex-1 max-w-sm">
            {subscribed ? (
              <div className="bg-neutral-800 text-white p-4 rounded-full flex items-center justify-center gap-2 text-sm font-medium">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                Thank you for subscribing!
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="flex flex-col gap-3">
                <div className="relative">
                  <Mail className="w-5 h-5 text-neutral-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    className="w-full bg-white text-black text-sm placeholder:text-neutral-400 rounded-full pl-12 pr-4 py-3 sm:py-3.5 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-white text-black hover:bg-neutral-100 font-semibold text-sm rounded-full py-3 sm:py-3.5 transition-colors shadow-md"
                >
                  Subscribe to Newsletter
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Main Footer Links */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-10 pb-12 border-b border-neutral-200">
          {/* Brand Info & Socials */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="font-integral text-2xl sm:text-3xl lg:text-4xl text-black block tracking-tighter">
              SHOP.CO
            </Link>
            <p className="text-neutral-600 text-sm leading-relaxed max-w-sm">
              We have clothes that suits your style and which you&apos;re proud to wear. From women to men.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 bg-white hover:bg-black hover:text-white text-black rounded-full flex items-center justify-center transition-colors shadow-sm border border-neutral-200"
                aria-label="Twitter"
              >
                <Twitter className="w-4 h-4 fill-current" />
              </a>
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 bg-black text-white hover:bg-neutral-800 rounded-full flex items-center justify-center transition-colors shadow-sm"
                aria-label="Facebook"
              >
                <Facebook className="w-4 h-4 fill-current" />
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 bg-white hover:bg-black hover:text-white text-black rounded-full flex items-center justify-center transition-colors shadow-sm border border-neutral-200"
                aria-label="Instagram"
              >
                <Instagram className="w-4 h-4" />
              </a>
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 bg-white hover:bg-black hover:text-white text-black rounded-full flex items-center justify-center transition-colors shadow-sm border border-neutral-200"
                aria-label="GitHub"
              >
                <Github className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Column 1: COMPANY */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-black mb-4">
              Company
            </h4>
            <ul className="space-y-3 text-sm text-neutral-600">
              <li><Link href="/category" className="hover:text-black transition-colors">About</Link></li>
              <li><Link href="/category" className="hover:text-black transition-colors">Features</Link></li>
              <li><Link href="/category" className="hover:text-black transition-colors">Works</Link></li>
              <li><Link href="/category" className="hover:text-black transition-colors">Career</Link></li>
            </ul>
          </div>

          {/* Column 2: HELP */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-black mb-4">
              Help & Support
            </h4>
            <ul className="space-y-3 text-sm text-neutral-600">
              <li>
                <Link href="/track-order" className="hover:text-black font-semibold text-emerald-800 transition-colors">
                  Track Order (Live)
                </Link>
              </li>
              <li>
                <a
                  href="https://wa.me/2349066707079"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-black font-medium text-emerald-700 transition-colors"
                >
                  WhatsApp Support
                </a>
              </li>
              <li><Link href="/category" className="hover:text-black transition-colors">Delivery Details</Link></li>
              <li><Link href="/category" className="hover:text-black transition-colors">Terms & Conditions</Link></li>
            </ul>
          </div>

          {/* Column 3: FAQ */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-black mb-4">
              Orders & FAQ
            </h4>
            <ul className="space-y-3 text-sm text-neutral-600">
              <li><Link href="/track-order" className="hover:text-black transition-colors">Order Status Lookup</Link></li>
              <li><Link href="/cart" className="hover:text-black transition-colors">My Cart</Link></li>
              <li><Link href="/category" className="hover:text-black transition-colors">Manage Deliveries</Link></li>
              <li><Link href="/admin" className="hover:text-black transition-colors">Admin Portal</Link></li>
            </ul>
          </div>

          {/* Column 4: RESOURCES */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-black mb-4">
              Resources
            </h4>
            <ul className="space-y-3 text-sm text-neutral-600">
              <li><Link href="/category" className="hover:text-black transition-colors">Free eBook</Link></li>
              <li><Link href="/category" className="hover:text-black transition-colors">Development Tutorial</Link></li>
              <li><Link href="/category" className="hover:text-black transition-colors">How to - Blog</Link></li>
              <li><Link href="/category" className="hover:text-black transition-colors">Youtube Playlist</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar & Payment Badges */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
          <p>Shop.co © 2000-2024, All Rights Reserved</p>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1.5 bg-white rounded-md border border-neutral-200 font-bold text-blue-800 text-[10px] tracking-wider shadow-sm">
              VISA
            </span>
            <span className="px-3 py-1.5 bg-white rounded-md border border-neutral-200 font-bold text-red-600 text-[10px] tracking-wider shadow-sm">
              MasterCard
            </span>
            <span className="px-3 py-1.5 bg-white rounded-md border border-neutral-200 font-bold text-blue-600 text-[10px] tracking-wider shadow-sm">
              PayPal
            </span>
            <span className="px-3 py-1.5 bg-white rounded-md border border-neutral-200 font-bold text-black text-[10px] tracking-wider shadow-sm">
              Apple Pay
            </span>
            <span className="px-3 py-1.5 bg-white rounded-md border border-neutral-200 font-bold text-neutral-700 text-[10px] tracking-wider shadow-sm">
              G Pay
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
