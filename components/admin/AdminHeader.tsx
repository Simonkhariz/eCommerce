'use client';

import React from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { AdminIcon } from './AdminIcon';

interface AdminHeaderProps {
  onMenu: () => void;
  sidebarHidden: boolean;
  activeTab?: string;
  onNavigateTab?: (tab: string) => void;
}

const TAB_TITLES: Record<string, { group: string; label: string }> = {
  overview: { group: 'Operations', label: 'Overview & KPIs' },
  orders: { group: 'Operations', label: 'Orders & Fulfilment' },
  shipping: { group: 'Operations', label: 'Shipping & Parcels' },
  products: { group: 'Operations', label: 'Products & SKUs' },
  categories: { group: 'Operations', label: 'Categories' },
  inventory: { group: 'Operations', label: 'Stock & Inventory Logs' },
  customers: { group: 'Operations', label: 'Customer Accounts' },
  payments: { group: 'Operations', label: 'Payment Transactions' },
  refunds: { group: 'Operations', label: 'Refund Claims' },
  promotions: { group: 'Growth & Marketing', label: 'Promotions & Coupons' },
  marketing: { group: 'Growth & Marketing', label: 'Email Marketing Broadcasts' },
  storefront: { group: 'Growth & Marketing', label: 'Storefront Banners & Reviews' },
  analytics: { group: 'Growth & Marketing', label: 'Analytics & Sales Reports' },
  notifications: { group: 'System & Settings', label: 'Email Outbox' },
  'audit-logs': { group: 'System & Settings', label: 'Security Audit Logs' },
  settings: { group: 'System & Settings', label: 'Store Settings' },
  'system-status': { group: 'System & Settings', label: 'System Diagnostics' },
  account: { group: 'System & Settings', label: 'Admin Profile & Security' },
};

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  onMenu,
  sidebarHidden,
  activeTab = 'overview',
  onNavigateTab,
}) => {
  const currentNav = TAB_TITLES[activeTab] || { group: 'Operations', label: 'Overview' };

  return (
    <header className="flex h-[52px] w-full items-center justify-between px-3 py-2 border-b border-[#e5e7eb]/80 bg-white">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {/* Prominent, comfortable Mobile & Desktop Sidebar Toggle */}
        <button
          type="button"
          onClick={onMenu}
          aria-label="Toggle sidebar"
          className={`shrink-0 flex items-center justify-center size-8 sm:size-9 rounded-lg border border-neutral-200/90 bg-neutral-50/90 hover:bg-neutral-100 text-neutral-700 outline-none transition-colors shadow-xs ${
            sidebarHidden ? '' : 'lg:hidden'
          }`}
        >
          <AdminIcon name="sidebar-right" size={18} className="rotate-180" />
        </button>

        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => onNavigateTab ? onNavigateTab('overview') : undefined}
            className="group/bc hidden sm:flex items-center rounded-md outline-none focus-visible:ring-[2px] focus-visible:ring-[#9ca3af]/40 shrink-0"
          >
            <span className="whitespace-nowrap text-xs sm:text-sm leading-none text-[#6b7280] transition-colors group-hover/bc:text-[#1f2937]">
              {currentNav.group}
            </span>
          </button>
          <span className="relative h-2.5 w-1.5 shrink-0 hidden sm:inline" aria-hidden="true">
            <AdminIcon name="breadcrumb-slash" width={7} height={11} className="-translate-y-0.5" />
          </span>
          <span
            aria-current="page"
            className="truncate text-xs sm:text-sm font-semibold leading-none text-[#1f2937]"
            title={currentNav.label}
          >
            {currentNav.label}
          </span>
        </nav>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Quick link back to customer store */}
        <Link
          href="/"
          target="_blank"
          className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-[#f8f8f8] px-2.5 py-1 text-xs font-medium text-[#4b5563] transition-colors hover:bg-white hover:text-[#1f2937]"
        >
          <span>Storefront</span>
          <ExternalLink className="size-3 text-neutral-400" />
        </Link>

        {/* Notifications */}
        <button
          type="button"
          aria-label="Notifications"
          className="group/bell relative rounded-md p-1 outline-none transition-colors hover:bg-black/[0.05] focus-visible:ring-[3px] focus-visible:ring-[#9ca3af]/40"
        >
          <AdminIcon
            name="bell"
            className="origin-top transition-transform group-hover/bell:animate-[ring_600ms_ease-in-out]"
          />
          <span className="absolute top-1 right-1 size-1.5 rounded-full bg-[#ef4444]" />
        </button>

        {/* Settings */}
        <button
          type="button"
          aria-label="Settings"
          className="group/set rounded-md p-1 outline-none transition-colors hover:bg-black/[0.05] focus-visible:ring-[3px] focus-visible:ring-[#9ca3af]/40"
        >
          <AdminIcon
            name="hd-settings"
            className="transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover/set:rotate-90"
          />
        </button>
      </div>
    </header>
  );
};
