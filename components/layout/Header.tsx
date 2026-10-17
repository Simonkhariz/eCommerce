'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';
import { useAuth } from '@/context/AuthContext';
import { Product } from '@/types';
import { getProducts, mapApiProductToStorefront } from '@/lib/api-client';
import { formatPrice } from '@/lib/currency';
import { CATEGORIES_LIST, DRESS_STYLES } from '@/data/mockData';
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
  const { user, isAdmin, logout, openAuthModal } = useAuth();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isShopDropdownOpen, setIsShopDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showBanner, setShowBanner] = useState(true);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await getProducts({ search: searchQuery.trim(), per_page: 5 });
        setSearchResults(res.items.map(mapApiProductToStorefront));
      } catch (e) {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    // Instant Route Prefetching for 0ms navigation
    router.prefetch('/cart');
    router.prefetch('/category');

    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setIsProfileMenuOpen(false);
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
              <button
                type="button"
                onClick={() => openAuthModal('register')}
                className="font-medium underline hover:text-neutral-300 ml-1 transition-colors"
              >
                Sign Up Now
              </button>
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

            <Link
              href="/"
              prefetch={true}
              className="font-integral text-2xl sm:text-3xl lg:text-4xl tracking-tighter text-black"
            >
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
            <Link href="/category?sort=newest" className="hover:text-black transition-colors">
              New Arrivals
            </Link>
            <Link href="/track-order" className="hover:text-black transition-colors font-medium text-emerald-800">
              Track Order
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
                {isSearching ? (
                  <div className="p-4 text-center text-xs text-neutral-500 flex items-center justify-center gap-2">
                    <span className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    <span>Searching catalogue...</span>
                  </div>
                ) : searchResults.length > 0 ? (
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
                            {product.category} • {formatPrice(product.price)}
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
            <div ref={profileRef} className="relative">
              <button
                onClick={() => {
                  if (!user) {
                    openAuthModal('login');
                  } else {
                    setIsProfileMenuOpen(!isProfileMenuOpen);
                  }
                }}
                className="p-2 text-black hover:opacity-75 transition-opacity rounded-full focus:outline-none focus:ring-2 focus:ring-black/10"
                aria-label="User Account"
                aria-expanded={isProfileMenuOpen}
              >
                {user ? (
                  <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center font-bold text-xs uppercase shadow-sm">
                    {user.full_name
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')}
                  </div>
                ) : (
                  <HugeiconsIcon icon={UserCircleIcon} size={24} />
                )}
              </button>

              {isProfileMenuOpen && user && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-neutral-100 py-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-4 py-2 border-b border-neutral-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center font-bold text-sm uppercase">
                        {user.full_name
                          .split(' ')
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join('')}
                      </div>
                      <div className="overflow-hidden">
                        <p className="font-semibold text-sm text-neutral-900 truncate">{user.full_name}</p>
                        <p className="text-xs text-neutral-500 truncate">{user.email}</p>
                      </div>
                    </div>
                  </div>

                  <div className="py-1">
                    {isAdmin && (
                      <Link
                        href="/admin"
                        onClick={() => setIsProfileMenuOpen(false)}
                        prefetch={false}
                        className="flex items-center justify-between px-4 py-2.5 text-sm text-neutral-800 hover:bg-neutral-50 transition-colors group"
                      >
                        <span className="font-medium group-hover:text-black">Admin Dashboard</span>
                        <span className="text-[10px] uppercase font-bold bg-black text-white px-2 py-0.5 rounded-full tracking-wide">
                          Admin
                        </span>
                      </Link>
                    )}

                    <Link
                      href="/orders"
                      onClick={() => setIsProfileMenuOpen(false)}
                      className="flex items-center justify-between px-4 py-2.5 text-sm text-neutral-800 hover:bg-neutral-50 transition-colors group"
                    >
                      <span className="group-hover:text-black font-medium">My Orders</span>
                      <span className="text-[10px] uppercase font-bold bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded-full">
                        History
                      </span>
                    </Link>

                    <Link
                      href="/cart"
                      onClick={() => setIsProfileMenuOpen(false)}
                      className="flex items-center justify-between px-4 py-2.5 text-sm text-neutral-800 hover:bg-neutral-50 transition-colors group"
                    >
                      <span className="group-hover:text-black">Shopping Cart</span>
                      {totalQuantity > 0 && (
                        <span className="text-xs bg-black text-white px-2 py-0.5 rounded-full font-bold">
                          {totalQuantity}
                        </span>
                      )}
                    </Link>

                    <button
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        openWishlist();
                      }}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-neutral-800 hover:bg-neutral-50 transition-colors group text-left"
                    >
                      <span className="group-hover:text-black">Wishlist</span>
                      {wishlistCount > 0 && (
                        <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">
                          {wishlistCount}
                        </span>
                      )}
                    </button>

                    <button
                      onClick={async () => {
                        setIsProfileMenuOpen(false);
                        await logout();
                      }}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors group text-left"
                    >
                      <span className="font-medium">Sign Out</span>
                    </button>
                  </div>

                  <div className="pt-2 mt-1 border-t border-neutral-100 px-4 py-1">
                    <span className="text-[11px] text-neutral-400">
                      Role: <strong className="capitalize text-neutral-600">{user.role}</strong>
                    </span>
                  </div>
                </div>
              )}
            </div>
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

                <div className="pt-2 border-t border-neutral-100 space-y-2">
                  <p className="text-xs font-bold text-neutral-400 uppercase mb-2">Account & Portal</p>
                  <Link
                    href="/track-order"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center justify-between text-sm font-semibold text-emerald-800 hover:text-black py-1"
                  >
                    <span>Track Order (Live)</span>
                    <span className="text-[10px] uppercase font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                      Tracking
                    </span>
                  </Link>
                  <Link
                    href="/admin"
                    onClick={() => setIsMobileMenuOpen(false)}
                    prefetch={false}
                    className="flex items-center justify-between text-sm font-semibold text-neutral-900 hover:text-black py-1"
                  >
                    <span>Admin Dashboard</span>
                    <span className="text-[10px] uppercase font-bold bg-black text-white px-2 py-0.5 rounded-full">
                      Admin
                    </span>
                  </Link>
                  <Link
                    href="/orders"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center justify-between text-sm font-semibold text-neutral-800 hover:text-black py-1"
                  >
                    <span>My Orders (History)</span>
                    <span className="text-[10px] uppercase font-bold bg-neutral-100 text-neutral-800 px-2 py-0.5 rounded-full">
                      Orders
                    </span>
                  </Link>
                  <Link
                    href="/cart"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center justify-between text-sm text-neutral-700 hover:text-black py-1"
                  >
                    <span>Shopping Cart</span>
                    {totalQuantity > 0 && (
                      <span className="text-xs bg-black text-white px-2 py-0.5 rounded-full font-bold">
                        {totalQuantity}
                      </span>
                    )}
                  </Link>
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      openWishlist();
                    }}
                    className="w-full flex items-center justify-between text-sm text-neutral-700 hover:text-black py-1 text-left"
                  >
                    <span>My Wishlist</span>
                    {wishlistCount > 0 && (
                      <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-bold">
                        {wishlistCount}
                      </span>
                    )}
                  </button>
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
