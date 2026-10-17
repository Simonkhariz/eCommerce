'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  OPERATIONS_NAV_ITEMS,
  GROWTH_NAV_ITEMS,
  SYSTEM_NAV_ITEMS,
  NavItem,
} from '@/data/adminData';
import { AdminIcon } from './AdminIcon';

interface AdminSidebarProps {
  onCollapse: () => void;
  className?: string;
  activeId?: string;
  onSelectNav?: (id: string, childId?: string) => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  onCollapse,
  className = '',
  activeId = 'overview',
  onSelectNav,
}) => {
  const [activeItem, setActiveItem] = useState(activeId);
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
    orders: true,
    products: true,
    payments: false,
    promotions: false,
  });

  // When activeId changes, sync activeItem and ensure parent accordion is open
  useEffect(() => {
    setActiveItem(activeId);

    const allGroups = [...OPERATIONS_NAV_ITEMS, ...GROWTH_NAV_ITEMS, ...SYSTEM_NAV_ITEMS];
    allGroups.forEach((item) => {
      if (item.children?.some((c) => c.id === activeId)) {
        setOpenAccordions((prev) => ({ ...prev, [item.id]: true }));
      }
    });
  }, [activeId]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Global CMD+K shortcut to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelect = (id: string) => {
    setActiveItem(id);
    onSelectNav?.(id);
  };

  const handleToggleParent = (item: NavItem) => {
    const isOpen = !!openAccordions[item.id];
    setOpenAccordions((prev) => ({ ...prev, [item.id]: !isOpen }));

    // If opening and current tab is not in this group, select first child
    if (!isOpen && item.children && item.children.length > 0) {
      const isAlreadyInside = item.children.some((c) => c.id === activeId);
      if (!isAlreadyInside) {
        onSelectNav?.(item.children[0].id);
      }
    }
  };

  const renderNavGroup = (items: NavItem[]) => {
    const q = searchQuery.trim().toLowerCase();

    const filteredItems = items.filter((item) => {
      if (!q) return true;
      const matchParent = item.label.toLowerCase().includes(q);
      const matchChildren = item.children?.some((c) => c.label.toLowerCase().includes(q));
      return matchParent || matchChildren;
    });

    return filteredItems.map((item) => {
      const hasChildren = !!item.children?.length;
      const isOpen = !!openAccordions[item.id];
      const isDirectActive = activeItem === item.id;
      const hasActiveChild = hasChildren && item.children?.some((c) => c.id === activeItem);
      const isParentActive = isDirectActive || hasActiveChild;

      const activeStyle =
        'bg-white border-[0.8px] border-[#e5e7eb] shadow-[0px_4px_7px_0px_rgba(0,0,0,0.04)] text-[#1f2937] font-medium';
      const inactiveStyle =
        'border-[0.8px] border-transparent text-[#4b5563] hover:bg-white/70 hover:text-[#1f2937]';

      return (
        <div key={item.id} className="flex w-full flex-col">
          <button
            type="button"
            onClick={() => (hasChildren ? handleToggleParent(item) : handleSelect(item.id))}
            aria-expanded={hasChildren ? isOpen : undefined}
            aria-current={isParentActive && !hasChildren ? 'page' : undefined}
            className={`group/nav flex w-full items-center justify-between rounded-lg text-left text-[13px] leading-none outline-none transition-[background-color,box-shadow,border-color,color] duration-150 focus-visible:ring-[3px] focus-visible:ring-[#9ca3af]/40 h-8 px-2.5 ${
              isParentActive && !hasChildren ? activeStyle : inactiveStyle
            }`}
          >
            <span className="flex items-center gap-2.5">
              <span className="flex transition-transform duration-200 ease-out group-hover/nav:scale-110">
                <AdminIcon name={item.icon} size={16} />
              </span>
              <span className="whitespace-nowrap font-medium">{item.label}</span>
            </span>

            {hasChildren && (
              <span
                className={`flex transition-transform duration-300 ease-[var(--ease-out-expo)] ${
                  isOpen ? '' : 'rotate-180'
                }`}
              >
                <AdminIcon name="arrow-up" size={12} />
              </span>
            )}
          </button>

          {/* Submenu Accordion */}
          {hasChildren && isOpen && item.children && (
            <div className="mt-0.5 flex flex-col gap-0.5 overflow-hidden">
              {item.children.map((child) => {
                const isChildActive = activeItem === child.id;

                return (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => handleSelect(child.id)}
                    aria-current={isChildActive ? 'page' : undefined}
                    className="group/sub relative flex h-7 w-full items-center justify-end pl-2.5 outline-none"
                  >
                    <span
                      className={`flex h-full w-[188px] items-center rounded-md px-1 text-xs leading-none transition-[color,background-color,padding] duration-200 group-hover/sub:bg-white/70 group-hover/sub:pl-2 group-hover/sub:text-[#1f2937] group-focus-visible/sub:ring-[3px] group-focus-visible/sub:ring-[#9ca3af]/40 ${
                        isChildActive
                          ? 'bg-white/80 font-semibold text-[#1f2937] shadow-sm'
                          : 'text-[#6b7280]'
                      }`}
                    >
                      {child.label}
                    </span>

                    {/* Tree connector SVG */}
                    <span className="pointer-events-none absolute left-[18px] top-[-5px] h-5 w-2">
                      <AdminIcon name="tree-line" width={9} height={21} />
                    </span>
                    <span className="pointer-events-none absolute left-[23px] top-[13px] size-1">
                      <img
                        src="/admin/tree-dot.svg"
                        alt=""
                        width={4}
                        height={4}
                        className={`absolute inset-0 block size-full transition-transform duration-200 ${
                          isChildActive ? 'scale-150 brightness-50' : 'opacity-70'
                        }`}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <aside
      className={`flex h-full w-[250px] shrink-0 flex-col bg-[#f8f8f8] border-r border-[#e5e7eb] ${className}`}
      aria-label="Primary"
    >
      {/* Top Branding Header */}
      <div className="flex w-[250px] items-center justify-between px-3.5 py-3.5 border-b border-[#e5e7eb]/60">
        <div className="flex w-[200px] items-center gap-2.5">
          <span className="relative size-6 shrink-0 transition-transform duration-300 ease-[var(--ease-out-expo)] hover:rotate-[-8deg] hover:scale-105">
            <img src="/admin/logo.svg" alt="SHOP.CO Logo" width={24} height={24} />
          </span>
          <div className="flex flex-col">
            <span className="text-[15px] font-bold tracking-tight leading-none text-[#1f2937]">
              SHOP.CO
            </span>
            <span className="text-[10px] text-[#9ca3af] font-medium leading-tight mt-0.5">
              Store Administration
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse sidebar"
          className="-m-1 rounded-md p-1 outline-none transition-colors hover:bg-black/[0.05] focus-visible:ring-[3px] focus-visible:ring-[#9ca3af]/40"
        >
          <AdminIcon name="sidebar-right" size={16} />
        </button>
      </div>

      {/* Sidebar Navigation Body */}
      <div className="flex min-h-0 w-[250px] flex-1 flex-col gap-3.5 px-3 py-3.5">
        {/* Global Search Input with ⌘K */}
        <label
          data-slot="input-group"
          className="group/input flex h-8 w-full cursor-text items-center gap-2 overflow-clip rounded-lg border border-[#e5e7eb] bg-white py-1.5 pl-2.5 pr-2 shadow-[0px_4px_14px_0px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow] duration-150 hover:border-[#d1d5db] focus-within:border-[#9ca3af] focus-within:shadow-[0_0_0_3px_rgba(156,163,175,0.18)]"
        >
          <AdminIcon name="search" size={14} className="text-[#6b7280]" />
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search navigation"
            aria-label="Search navigation"
            className="min-w-0 flex-1 bg-transparent text-[13px] leading-none text-[#1f2937] outline-none placeholder:text-[#9ca3af] [&::-webkit-search-cancel-button]:hidden"
          />
          <span
            aria-hidden="true"
            className="flex shrink-0 items-center gap-0.5 transition-opacity group-focus-within/input:opacity-0"
          >
            <span className="flex size-4 items-center justify-center rounded p-0.5">
              <AdminIcon name="command" size={12} />
            </span>
            <span className="flex size-4 items-center justify-center rounded p-0.5 text-xs font-medium leading-none text-[#565d76]">
              K
            </span>
          </span>
        </label>

        {/* Scrollable Menus */}
        <nav className="flex min-h-0 w-full flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* Operations Section */}
          <div className="flex w-full flex-col gap-1.5">
            <p className="whitespace-nowrap px-1 text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">
              Operations
            </p>
            <div className="flex w-full flex-col gap-0.5">
              {renderNavGroup(OPERATIONS_NAV_ITEMS)}
            </div>
          </div>

          {/* Growth & Marketing Section */}
          <div className="flex w-full flex-col gap-1.5">
            <p className="whitespace-nowrap px-1 text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">
              Growth &amp; Marketing
            </p>
            <div className="flex w-full flex-col gap-0.5">
              {renderNavGroup(GROWTH_NAV_ITEMS)}
            </div>
          </div>

          {/* System & Configuration Section */}
          <div className="flex w-full flex-col gap-1.5">
            <p className="whitespace-nowrap px-1 text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">
              System &amp; Settings
            </p>
            <div className="flex w-full flex-col gap-0.5">
              {renderNavGroup(SYSTEM_NAV_ITEMS)}
            </div>
          </div>
        </nav>

        {/* Bottom User Profile Section */}
        <div className="mt-auto pt-3 border-t border-[#e5e7eb] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative size-8 shrink-0 rounded-full overflow-hidden border border-[#e5e7eb]">
              <img
                src="/admin/avatar-sarah.jpg"
                alt="Store Admin"
                className="size-full object-cover"
              />
              <span className="absolute bottom-0 right-0 size-2 rounded-full bg-emerald-500 border border-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-[#1f2937]">Store Admin</span>
              <span className="text-[10px] text-[#6b7280]">admin@shopco.ng</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onSelectNav?.('account')}
            title="Admin account settings"
            className="rounded p-1 text-[#6b7280] hover:bg-black/[0.05] hover:text-[#1f2937]"
          >
            <AdminIcon name="more" size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
};
