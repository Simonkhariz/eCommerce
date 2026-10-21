'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ExternalLink, LogOut } from 'lucide-react';
import { AdminIcon } from '@/components/admin/AdminIcon';
import { useAdminSession } from '@/components/admin/AdminAuthGate';
import { ADMIN_NAV, AdminNavItem, findAdminNav, isActiveAdminLink } from '@/lib/admin-nav';
import { adminGetOrders, adminGetStorageAlert } from '@/lib/admin-api';

/**
 * Admin chrome: sidebar navigation (real links), header breadcrumb, attention bell and sign-out.
 * The sidebar is sticky on desktop and a drawer on mobile.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/admin';
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [alerts, setAlerts] = useState<{ claimed: number; attention: number } | null>(null);
  // The first database problem found (null when size, speed and clean-ups are fine).
  const [storage, setStorage] = useState<string | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const alertsRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Close the mobile drawer and the alerts menu on navigation.
  const [openedOn, setOpenedOn] = useState(pathname);
  if (pathname !== openedOn) {
    setOpenedOn(pathname);
    setDrawerOpen(false);
    setAlertsOpen(false);
  }

  // Bell: WhatsApp transfers customers marked as paid (to check and confirm) and orders flagged
  // for attention (late / duplicate / mismatched payments). Refreshed on navigation and every
  // minute while the admin is open, so a new "Mark as paid" shows up without reloading.
  // Database size / speed problems are checked on navigation only (they change slowly).
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (document.visibilityState === 'hidden') return;
      Promise.all([adminGetOrders({ status: 'payment_claimed', per_page: 1 }), adminGetOrders({ status: 'attention', per_page: 1 })])
        .then(([claimed, attention]) => {
          if (!cancelled) setAlerts({ claimed: claimed.pagination.total, attention: attention.pagination.total });
        })
        .catch(() => !cancelled && setAlerts(null));
    };
    load();
    adminGetStorageAlert()
      .then((r) => !cancelled && setStorage(r.level === 'ok' ? null : (r.issues[0]?.title ?? 'Database needs attention')))
      .catch(() => !cancelled && setStorage(null));
    const timer = setInterval(load, 60_000);
    document.addEventListener('visibilitychange', load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, [pathname]);

  useEffect(() => {
    if (!alertsOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!alertsRef.current?.contains(e.target as Node)) setAlertsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAlertsOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [alertsOpen]);

  const alertTotal = (alerts ? alerts.claimed + alerts.attention : 0) + (storage ? 1 : 0);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawerOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const current = findAdminNav(pathname);

  return (
    <div className="flex min-h-dvh w-full bg-[#f8f8f8]">
      <a
        href="#admin-main"
        className="sr-only z-[80] rounded-lg bg-white px-3 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>

      {/* Desktop sidebar: fixed to the window; the spacer keeps the page beside it */}
      {!collapsed && (
        <>
          <div className="hidden w-[250px] shrink-0 lg:block" aria-hidden="true" />
          <div className="fixed inset-y-0 left-0 z-40 hidden w-[250px] lg:block">
            <AdminSidebar pathname={pathname} onClose={() => setCollapsed(true)} closeLabel="Hide sidebar" />
          </div>
        </>
      )}

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="animate-fade absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 h-dvh w-[260px] max-w-[85vw] shadow-2xl" role="dialog" aria-modal="true" aria-label="Admin navigation">
            <AdminSidebar pathname={pathname} onClose={() => setDrawerOpen(false)} closeLabel="Close menu" />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col bg-white shadow-[inset_0_0_0_0.8px_#e5e7eb] lg:min-h-dvh">
        {/* Fixed header: stays at the top while the page scrolls */}
        <header
          className={`fixed inset-x-0 top-0 z-30 flex h-[52px] items-center justify-between gap-2 border-b border-[#e5e7eb]/80 bg-white/95 px-3 backdrop-blur sm:px-4 ${
            collapsed ? '' : 'lg:left-[250px]'
          }`}
        >
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => (window.innerWidth >= 1024 ? setCollapsed((c) => !c) : setDrawerOpen(true))}
              aria-label={collapsed ? 'Show sidebar' : 'Open menu'}
              className={`flex size-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-700 outline-none transition-colors hover:bg-neutral-100 focus-visible:ring-[3px] focus-visible:ring-[#9ca3af]/40 ${
                collapsed ? '' : 'lg:hidden'
              }`}
            >
              <AdminIcon name="sidebar-right" size={18} className="rotate-180" />
            </button>

            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2">
              <span className="hidden shrink-0 text-sm text-[#6b7280] sm:inline">{current?.section ?? 'Admin'}</span>
              <span className="hidden shrink-0 sm:inline-flex" aria-hidden="true">
                <AdminIcon name="breadcrumb-slash" width={7} height={11} className="-translate-y-0.5" />
              </span>
              <span aria-current="page" className="truncate text-sm font-semibold text-[#1f2937]">
                {current?.label ?? 'Admin'}
              </span>
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Link
              href="/"
              target="_blank"
              rel="noopener"
              className="hidden items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-[#f8f8f8] px-2.5 py-1 text-xs font-medium text-[#4b5563] transition-colors hover:bg-white hover:text-[#1f2937] sm:inline-flex"
            >
              View store
              <ExternalLink className="size-3 text-neutral-400" aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </Link>

            <div ref={alertsRef} className="relative">
              <button
                type="button"
                onClick={() => setAlertsOpen((o) => !o)}
                aria-expanded={alertsOpen}
                aria-haspopup="true"
                aria-label={alertTotal ? `${alertTotal} alerts` : 'Alerts'}
                title="Alerts"
                className="relative rounded-md p-2.5 outline-none sm:p-1.5 transition-colors hover:bg-black/[0.05] focus-visible:ring-[3px] focus-visible:ring-[#9ca3af]/40"
              >
                <AdminIcon name="bell" />
                {alertTotal > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white">
                    {alertTotal > 99 ? '99+' : alertTotal}
                  </span>
                )}
              </button>
              {alertsOpen && (
                <div className="absolute right-0 top-full z-[60] mt-2 w-[min(18rem,calc(100vw-1.5rem))] rounded-xl border border-[#e5e7eb] bg-white p-1 text-[13px] shadow-lg">
                  {[
                    { href: '/admin/orders?status=payment_claimed', title: 'Customers say they have paid', hint: 'WhatsApp transfers to check and confirm', count: alerts?.claimed },
                    { href: '/admin/orders?status=attention', title: 'Orders need attention', hint: 'Late, duplicate or mismatched payments', count: alerts?.attention },
                    {
                      href: '/admin/data',
                      title: 'Database & storage',
                      hint: storage ?? 'Size, speed and clean-ups are fine',
                      count: storage ? 1 : 0,
                    },
                  ].map((a) => (
                    <Link key={a.href} href={a.href} className="flex items-start justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-[#f3f4f6]">
                      <span className="min-w-0">
                        <span className="block font-semibold text-[#111827]">{a.title}</span>
                        <span className="block text-xs text-[#6b7280]">{a.hint}</span>
                      </span>
                      <span
                        className={`mt-0.5 shrink-0 rounded-full px-2 text-xs font-bold leading-5 ${a.count ? 'bg-red-600 text-white' : 'bg-[#f3f4f6] text-[#6b7280]'}`}
                      >
                        {a.count ?? '–'}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <Link
              href="/admin/settings"
              aria-label="Store settings"
              title="Store settings"
              className="rounded-md p-2.5 outline-none sm:p-1.5 transition-colors hover:bg-black/[0.05] focus-visible:ring-[3px] focus-visible:ring-[#9ca3af]/40"
            >
              <AdminIcon name="hd-settings" />
            </Link>
          </div>
        </header>
        <div className="h-[52px] shrink-0" aria-hidden="true" />

        <main id="admin-main" tabIndex={-1} className="flex w-full min-w-0 flex-1 flex-col px-3 py-4 outline-none sm:px-5 sm:py-5">
          {/* Pages keep a readable width on large screens; the overview may be wider (charts and
              KPIs side by side) but still stops growing on very wide monitors. */}
          <div className={`mx-auto flex w-full flex-1 flex-col ${pathname === '/admin' ? 'max-w-[1600px]' : 'max-w-[1280px]'}`}>{children}</div>
        </main>
      </div>
    </div>
  );
}

function AdminSidebar({ pathname, onClose, closeLabel }: { pathname: string; onClose: () => void; closeLabel: string }) {
  const { admin, signOut } = useAdminSession();
  const [signingOut, setSigningOut] = useState(false);

  // Groups open by default when they contain the page the panel was opened on.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const open: Record<string, boolean> = {};
    ADMIN_NAV.forEach((section) =>
      section.items.forEach((item) => {
        if (item.children?.some((c) => isActiveAdminLink(pathname, c.href))) open[item.href] = true;
      })
    );
    return open;
  });

  useEffect(() => {
    ADMIN_NAV.forEach((section) =>
      section.items.forEach((item) => {
        if (item.children?.some((c) => isActiveAdminLink(pathname, c.href))) {
          setOpenGroups((prev) => (prev[item.href] ? prev : { ...prev, [item.href]: true }));
        }
      })
    );
  }, [pathname]);

  const renderItem = (item: AdminNavItem) => {
    const linkBase =
      'flex h-8 w-full items-center gap-2.5 rounded-lg border-[0.8px] px-2.5 text-[13px] font-medium leading-none outline-none transition-[background-color,border-color,color] duration-150 focus-visible:ring-[3px] focus-visible:ring-[#9ca3af]/40';
    const active = 'border-[#e5e7eb] bg-white text-[#1f2937] shadow-[0px_4px_7px_0px_rgba(0,0,0,0.04)]';
    const inactive = 'border-transparent text-[#4b5563] hover:bg-white/70 hover:text-[#1f2937]';

    if (!item.children) {
      const isActive = isActiveAdminLink(pathname, item.href);
      return (
        <Link key={item.href} href={item.href} aria-current={isActive ? 'page' : undefined} className={`${linkBase} ${isActive ? active : inactive}`}>
          <AdminIcon name={item.icon} size={16} />
          {item.label}
        </Link>
      );
    }

    const isOpen = !!openGroups[item.href];
    const groupId = `nav-group-${item.href.replace(/\W+/g, '-')}`;
    return (
      <div key={item.href} className="flex flex-col">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={groupId}
          onClick={() => setOpenGroups((prev) => ({ ...prev, [item.href]: !isOpen }))}
          className={`${linkBase} justify-between ${inactive}`}
        >
          <span className="flex items-center gap-2.5">
            <AdminIcon name={item.icon} size={16} />
            {item.label}
          </span>
          <span className={`transition-transform duration-200 ${isOpen ? '' : 'rotate-180'}`}>
            <AdminIcon name="arrow-up" size={12} />
          </span>
        </button>
        {isOpen && (
          <ul id={groupId} className="mt-0.5 flex flex-col gap-0.5 pl-7">
            {item.children.map((child) => {
              const isActive = isActiveAdminLink(pathname, child.href);
              return (
                <li key={child.href}>
                  <Link
                    href={child.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex h-7 items-center rounded-md px-2 text-xs outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[#9ca3af]/40 ${
                      isActive ? 'bg-white font-semibold text-[#1f2937] shadow-sm' : 'text-[#4b5563] hover:bg-white/70 hover:text-[#1f2937]'
                    }`}
                  >
                    {child.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };

  return (
    <aside className="flex h-full w-full flex-col border-r border-[#e5e7eb] bg-[#f8f8f8]" aria-label="Admin">
      <div className="flex items-center justify-between border-b border-[#e5e7eb]/60 px-3.5 py-3.5">
        <Link href="/admin" className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-[#9ca3af]/40">
          {/* logo.svg is 34×37 (it includes a drop shadow), so 24 wide is 26 tall. */}
          <Image src="/admin/logo.svg" alt="" width={24} height={26} unoptimized />
          <span className="flex flex-col">
            <span className="text-[15px] font-bold leading-none tracking-tight text-[#1f2937]">SHOP.CO</span>
            <span className="mt-0.5 text-xs leading-tight text-[#6b7280]">Store admin</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="-m-1 rounded-md p-1 outline-none transition-colors hover:bg-black/[0.05] focus-visible:ring-[3px] focus-visible:ring-[#9ca3af]/40"
        >
          <AdminIcon name="sidebar-right" size={16} />
        </button>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-3.5" aria-label="Admin sections">
        {ADMIN_NAV.map((section) => (
          <div key={section.title} className="flex flex-col gap-1.5">
            <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-[#6b7280]">{section.title}</p>
            <div className="flex flex-col gap-0.5">{section.items.map(renderItem)}</div>
          </div>
        ))}
      </nav>

      <div className="flex items-center justify-between gap-2 border-t border-[#e5e7eb] px-3 py-3">
        <Link href="/admin/account" className="flex min-w-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-[#9ca3af]/40">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#111827] text-xs font-bold uppercase text-white" aria-hidden="true">
            {(admin.full_name || admin.email).trim().charAt(0)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-semibold text-[#1f2937]">{admin.full_name || 'Administrator'}</span>
            <span className="truncate text-xs text-[#6b7280]">{admin.email}</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={async () => {
            setSigningOut(true);
            await signOut();
          }}
          disabled={signingOut}
          aria-label="Sign out"
          title="Sign out"
          className="shrink-0 rounded-md p-1.5 text-[#6b7280] outline-none transition-colors hover:bg-black/[0.05] hover:text-[#1f2937] focus-visible:ring-[3px] focus-visible:ring-[#9ca3af]/40 disabled:opacity-50"
        >
          <LogOut className="size-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
