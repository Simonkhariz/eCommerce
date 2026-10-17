'use client';

import React, { useState, useEffect } from 'react';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { AdminOverview } from '@/components/admin/AdminOverview';
import { OrderManagement } from '@/components/admin/OrderManagement';
import { AdminShipping } from '@/components/admin/AdminShipping';
import { ProductManagement } from '@/components/admin/ProductManagement';
import { AdminCategories } from '@/components/admin/AdminCategories';
import { AdminInventory } from '@/components/admin/AdminInventory';
import { AdminPayments } from '@/components/admin/AdminPayments';
import { AdminRefunds } from '@/components/admin/AdminRefunds';
import { AdminCustomers } from '@/components/admin/AdminCustomers';
import { AdminPromotions } from '@/components/admin/AdminPromotions';
import { AdminStorefront } from '@/components/admin/AdminStorefront';
import { AdminMarketing } from '@/components/admin/AdminMarketing';
import { AdminAnalytics } from '@/components/admin/AdminAnalytics';
import { AdminNotifications } from '@/components/admin/AdminNotifications';
import { AdminAuditLogs } from '@/components/admin/AdminAuditLogs';
import { AdminSettings } from '@/components/admin/AdminSettings';
import { AdminSystemStatus } from '@/components/admin/AdminSystemStatus';
import { AdminAccount } from '@/components/admin/AdminAccount';

export default function AdminDashboardPage() {
  const [activeNav, setActiveNav] = useState<string>('overview');
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Sync tab with URL query parameter on mount and when changed
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab) {
        setActiveNav(tab);
      }
    }
  }, []);

  const handleSelectNav = (id: string) => {
    setActiveNav(id);
    setMobileDrawerOpen(false);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', id);
      window.history.pushState({}, '', url.toString());
    }
  };

  // Close mobile drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex min-h-dvh w-full bg-[#f8f8f8]">
      {/* Desktop Sticky Sidebar */}
      <div
        className={`sticky top-0 hidden h-dvh shrink-0 overflow-hidden transition-[width] duration-300 ease-[var(--ease-out-expo)] lg:block ${
          desktopSidebarCollapsed ? 'w-0' : 'w-[250px]'
        }`}
      >
        <AdminSidebar
          activeId={activeNav}
          onSelectNav={handleSelectNav}
          onCollapse={() => setDesktopSidebarCollapsed(true)}
          className={`transition-opacity duration-200 ${
            desktopSidebarCollapsed ? 'opacity-0' : 'opacity-100'
          }`}
        />
      </div>

      {/* Mobile Drawer Sidebar */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/20 backdrop-blur-[2px] transition-opacity duration-300 animate-fade"
            onClick={() => setMobileDrawerOpen(false)}
          />
          {/* Sliding Panel */}
          <div className="absolute inset-y-0 left-0 h-dvh w-[250px] bg-[#f8f8f8] shadow-2xl transition-transform duration-300 ease-[var(--ease-out-expo)]">
            <AdminSidebar
              activeId={activeNav}
              onSelectNav={handleSelectNav}
              onCollapse={() => setMobileDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Administrative Workspace */}
      <main className="flex min-w-0 flex-1 flex-col bg-white shadow-[inset_0_0_0_0.8px_#e5e7eb] px-3 lg:min-h-dvh">
        {/* Top Header */}
        <AdminHeader
          activeTab={activeNav}
          onNavigateTab={handleSelectNav}
          onMenu={() => {
            if (window.innerWidth >= 1024) {
              setDesktopSidebarCollapsed(!desktopSidebarCollapsed);
            } else {
              setMobileDrawerOpen(true);
            }
          }}
          sidebarHidden={desktopSidebarCollapsed}
        />

        {/* Dynamic Content Container */}
        <div className="flex w-full flex-col px-1 py-4">
          {activeNav === 'overview' && (
            <AdminOverview onNavigateTab={handleSelectNav} />
          )}

          {activeNav === 'orders' && (
            <OrderManagement />
          )}

          {activeNav === 'shipping' && (
            <AdminShipping />
          )}

          {activeNav === 'products' && (
            <ProductManagement />
          )}

          {activeNav === 'categories' && (
            <AdminCategories />
          )}

          {activeNav === 'inventory' && (
            <AdminInventory />
          )}

          {activeNav === 'payments' && (
            <AdminPayments />
          )}

          {activeNav === 'refunds' && (
            <AdminRefunds />
          )}

          {activeNav === 'customers' && (
            <AdminCustomers />
          )}

          {activeNav === 'promotions' && (
            <AdminPromotions />
          )}

          {activeNav === 'storefront' && (
            <AdminStorefront />
          )}

          {activeNav === 'marketing' && (
            <AdminMarketing />
          )}

          {activeNav === 'analytics' && (
            <AdminAnalytics />
          )}

          {activeNav === 'notifications' && (
            <AdminNotifications />
          )}

          {activeNav === 'audit-logs' && (
            <AdminAuditLogs />
          )}

          {activeNav === 'settings' && (
            <AdminSettings />
          )}

          {activeNav === 'system-status' && (
            <AdminSystemStatus />
          )}

          {activeNav === 'account' && (
            <AdminAccount />
          )}
        </div>
      </main>
    </div>
  );
}
