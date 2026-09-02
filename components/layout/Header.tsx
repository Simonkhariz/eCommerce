'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';
import { PRODUCTS, CATEGORIES_LIST, DRESS_STYLES } from '@/data/mockData';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Search01Icon,
  ShoppingCart01Icon,
  UserCircleIcon,
  Menu01Icon,
  Cancel01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  FavouriteIcon,
} from '@hugeicons/core-free-icons';

export const Header: React.FC = () => {
  const router = useRouter();
  const { totalQuantity } = useCart();
  const { wishlistCount, openWishlist } = useWishlist();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isShopDropdownOpen, setIsShopDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showBanner, setShowBanner] = useState(true);
  const searchRef = useRef<HTMLDivElement>(null);

  const searchResults = searchQuery.trim()
    ? PRODUCTS.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.dressStyle.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 5)
    : [];

  useEffect(() => {
    // Instant Route Prefetching for 0ms navigation
    router.prefetch('/cart');
    router.prefetch('/category');

    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [router]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setIsSearchFocused(false);
      router.push(`/category?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-neutral-100">
      {/* Top Promotional Announcement Banner */}
      {showBanner && (
        <div className="bg-black text-white text-xs sm:text-sm py-2 px-4 transition-all">
          <div className="max-w-7xl mx-auto flex items-center justify-between relative">
            <div className="w-full text-center font-normal">
              Sign up and get 20% off to your first order.{' '}
              <Link
                href="/category?onSale=true"
                className="font-medium underline hover:text-neutral-300 ml-1 transition-colors"
              >
                Sign Up Now
              </Link>
            </div>
            <button
              onClick={() => setShowBanner(false)}
              className="hidden sm:block text-neutral-400 hover:text-white absolute right-0"
              aria-label="Close banner"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Main Nav Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-4">
          {/* Left: Mobile Menu Toggle & Logo */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-1 text-black hover:opacity-75"
              aria-label="Open menu"
            >
              <HugeiconsIcon icon={Menu01Icon} size={24} />
            </button>

            <Link href="/" className="font-integral text-2xl sm:text-3xl tracking-tighter text-black">
              SHOP.CO
            </Link>
          </div>

          {/* Center: Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-neutral-700">
            {/* Shop Dropdown */}
            <div
              className="relative"
              onMouseEnter={() => setIsShopDropdownOpen(true)}
              onMouseLeave={() => setIsShopDropdownOpen(false)}
            >
              <button
                className="flex items-center gap-1 hover:text-black py-2 transition-colors"
                aria-expanded={isShopDropdownOpen}
              >
                <span>Shop</span>
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  size={16}
                  className={`transition-transform duration-200 ${
                    isShopDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isShopDropdownOpen && (
                <div className="absolute top-full left-0 w-80 bg-white border border-neutral-100 shadow-2xl rounded-2xl p-4 grid grid-cols-2 gap-3 z-50 animate-in fade-in slide-in-from-top-2">
                  <div>
                    <h5 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2 px-2">
                      Categories
                    </h5>
                    {CATEGORIES_LIST.map((cat) => (
                      <Link
                        key={cat.slug}
                        href={`/category?cat=${cat.slug}`}
                        onClick={() => setIsShopDropdownOpen(false)}
                        className="block px-2 py-1.5 text-sm rounded-lg hover:bg-neutral-50 text-neutral-800 font-normal hover:font-medium transition-colors"
                      >
                        {cat.label}
                      </Link>
                    ))}
                  </div>

                  <div>
                    <h5 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2 px-2">
                      Dress Styles
                    </h5>
                    {DRESS_STYLES.map((style) => (
                      <Link
                        key={style.slug}
                        href={`/category?style=${style.slug}`}
                        onClick={() => setIsShopDropdownOpen(false)}
                        className="block px-2 py-1.5 text-sm rounded-lg hover:bg-neutral-50 text-neutral-800 font-normal hover:font-medium transition-colors"
                      >
                        {style.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Link href="/category?onSale=true" className="hover:text-black transition-colors">
              On Sale
            </Link>
            <Link href="/category?newArrivals=true" className="hover:text-black transition-colors">
              New Arrivals
            </Link>
            <Link href="/category" className="hover:text-black transition-colors">
              Brands
            </Link>
          </nav>

          {/* Search Bar with Instant Autocomplete Dropdown */}
          <div ref={searchRef} className="flex-1 max-w-md hidden md:block relative">
            <form onSubmit={handleSearchSubmit} className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">
                <HugeiconsIcon icon={Search01Icon} size={20} />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                placeholder="Search for products..."
                className="w-full bg-[#F0F0F0] text-sm text-black placeholder:text-neutral-500 rounded-full pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-black/20 transition-all"
              />
            </form>

            {/* Live Autocomplete Results */}
            {isSearchFocused && searchQuery.trim() && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-neutral-100 shadow-2xl rounded-2xl overflow-hidden z-50 animate-in fade-in">
                {searchResults.length > 0 ? (
                  <div className="divide-y divide-neutral-100">
                    {searchResults.map((product) => (
                      <Link
                        key={product.id}
                        href={`/products/${product.slug}`}
                        onClick={() => {
                          setIsSearchFocused(false);
                          setSearchQuery('');
                        }}
                        className="flex items-center gap-3 p-3 hover:bg-neutral-50 transition-colors"
                      >
                        <div className="relative w-12 h-12 bg-neutral-100 rounded-lg overflow-hidden shrink-0">
                          <Image
                            src={product.images[0]}
                            alt={product.name}
                            fill
                            className="object-cover"
                            sizes="48px"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-neutral-900 truncate">
                            {product.name}
                          </p>
                          <p className="text-xs text-neutral-500 capitalize">
                            {product.category} • ${product.price}
                          </p>
                        </div>
                        <HugeiconsIcon icon={ArrowRight01Icon} size={16} className="text-neutral-400" />
                      </Link>
                    ))}
                    <button
                      onClick={handleSearchSubmit}
                      className="w-full text-center py-2.5 text-xs font-semibold text-black bg-neutral-50 hover:bg-neutral-100 transition-colors"
                    >
                      View all results for &ldquo;{searchQuery}&rdquo;
                    </button>
                  </div>
                ) : (
                  <div className="p-4 text-center text-sm text-neutral-500">
                    No products found matching &ldquo;{searchQuery}&rdquo;
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Action Icons: Wishlist, Cart, Profile */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Mobile Search Button */}
            <Link
              href="/category"
              className="md:hidden p-2 text-black hover:opacity-75 transition-opacity"
              aria-label="Search catalog"
            >
              <HugeiconsIcon icon={Search01Icon} size={24} />
            </Link>

            {/* Wishlist Heart Icon with Red Badge (Same container styling as Cart) */}
            <button
              onClick={openWishlist}
              className="p-2 text-black hover:opacity-75 transition-opacity relative"
              aria-label="Open Wishlist"
              title="Your Wishlist"
            >
              <HugeiconsIcon icon={FavouriteIcon} size={24} />
              {wishlistCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white animate-in zoom-in">
                  {wishlistCount}
                </span>
              )}
            </button>

            {/* Shopping Cart with Black Badge */}
            <Link
              href="/cart"
              prefetch={true}
              className="p-2 text-black hover:opacity-75 transition-opacity relative"
              aria-label="Shopping Cart"
            >
              <HugeiconsIcon icon={ShoppingCart01Icon} size={24} />
              {totalQuantity > 0 && (
                <span className="absolute -top-1 -right-1 bg-black text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white animate-in zoom-in">
                  {totalQuantity}
                </span>
              )}
            </Link>

            {/* User Profile */}
            <button
              className="p-2 text-black hover:opacity-75 transition-opacity"
              aria-label="User Account"
            >
              <HugeiconsIcon icon={UserCircleIcon} size={24} />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Slide-Out Navigation Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 max-w-xs w-full bg-white shadow-2xl p-6 flex flex-col justify-between z-10 animate-in slide-in-from-left duration-300">
            <div>
              <div className="flex items-center justify-between mb-8">
                <Link
                  href="/"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="font-integral text-2xl tracking-tighter text-black"
                >
                  SHOP.CO
                </Link>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 text-neutral-500 hover:text-black rounded-full"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={20} />
                </button>
              </div>

              <nav className="space-y-4">
                <Link
                  href="/category"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block text-lg font-semibold text-neutral-900 hover:text-black"
                >
                  All Products
                </Link>
                <div className="pt-2 border-t border-neutral-100">
                  <p className="text-xs font-bold text-neutral-400 uppercase mb-2">Categories</p>
                  <div className="space-y-2">
                    {CATEGORIES_LIST.map((c) => (
                      <Link
                        key={c.slug}
                        href={`/category?cat=${c.slug}`}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="block text-sm text-neutral-700 hover:text-black"
                      >
                        {c.label}
                      </Link>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-neutral-100">
                  <p className="text-xs font-bold text-neutral-400 uppercase mb-2">Dress Styles</p>
                  <div className="space-y-2">
                    {DRESS_STYLES.map((s) => (
                      <Link
                        key={s.slug}
                        href={`/category?style=${s.slug}`}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="block text-sm text-neutral-700 hover:text-black"
                      >
                        {s.name}
                      </Link>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-neutral-100 space-y-2">
                  <Link
                    href="/category?onSale=true"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block text-sm font-semibold text-red-600"
                  >
                    🔥 On Sale (Up to 40% Off)
                  </Link>
                  <Link
                    href="/category?newArrivals=true"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block text-sm font-semibold text-neutral-900"
                  >
                    ✨ New Arrivals
                  </Link>
                </div>
              </nav>
            </div>

            <div className="pt-6 border-t border-neutral-100 text-xs text-neutral-500">
              © {new Date().getFullYear()} SHOP.CO. All Rights Reserved.
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
