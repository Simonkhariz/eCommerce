'use client';

import React, { useState } from 'react';
import { UPDATES_FEED_DATA, ACTIVITY_TABS, ActivityItem } from '@/data/adminData';
import { AdminCard, AdminCardHeader, AdminCardTitle } from './AdminCard';
import { AdminIcon } from './AdminIcon';

interface ActivityFeedProps {
  className?: string;
  items?: ActivityItem[];
  title?: string;
}

const FEED_ICONS: Record<string, string> = {
  ticket: 'feed-ticket',
  user: 'feed-user',
  repeat: 'feed-repeat',
  alert: 'feed-alert',
  book: 'feed-book',
  star: 'feed-star',
};

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  className = '',
  items: customItems,
  title = 'Real-time Activity Stream',
}) => {
  const [activeTab, setActiveTab] = useState('today');
  const [searchQuery, setSearchQuery] = useState('');

  const activeTabConfig = ACTIVITY_TABS.find((t) => t.value === activeTab) || ACTIVITY_TABS[0];
  const items = customItems || UPDATES_FEED_DATA[activeTab] || [];

  const query = searchQuery.trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    if (!query) return true;
    const bodyStr = Array.isArray(item.body)
      ? item.body.map((b) => b.text).join(' ')
      : item.body;
    return (
      item.title.toLowerCase().includes(query) ||
      bodyStr.toLowerCase().includes(query) ||
      item.time.toLowerCase().includes(query)
    );
  });

  const renderBody = (item: ActivityItem) => {
    if (!Array.isArray(item.body)) {
      return item.body;
    }

    return item.body.map((segment, idx) => {
      if (segment.strong) {
        return (
          <strong key={idx} className="font-semibold text-[#1f2937]">
            {segment.strong}
          </strong>
        );
      }
      return <span key={idx}>{segment.text}</span>;
    });
  };

  return (
    <AdminCard
      patternStyle={{
        left: 'calc(50% - 55.5px)',
        top: -0.8,
        transform: 'translateX(-50%)',
      }}
      className={`h-[420px] max-h-[420px] flex flex-col animate-rise [animation-delay:200ms] ${className}`}
      aria-labelledby="updates-title"
    >
      <AdminCardHeader>
        <div className="flex items-center gap-2">
          <AdminIcon name="news" size={16} className="text-[#374151]" />
          <AdminCardTitle id="updates-title">{title}</AdminCardTitle>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-medium text-[#6b7280]">Live</span>
        </div>
      </AdminCardHeader>

      <div className="relative flex min-h-0 w-full flex-1 flex-col items-start gap-3 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white p-3">
        {/* Top Controls: Tabs & Search */}
        <div className="flex w-full flex-col gap-3">
          {/* Segmented Period Tabs */}
          <div className="relative flex w-full items-center gap-1 rounded-lg border border-[#e5e7eb] bg-[#f8f8f8] p-0.5">
            {ACTIVITY_TABS.map((tab) => {
              const isSelected = tab.value === activeTab;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setActiveTab(tab.value)}
                  className={`relative z-10 flex h-7 flex-1 items-center justify-center rounded-md text-xs font-medium leading-none transition-colors ${
                    isSelected
                      ? 'bg-[#1f2937] text-white shadow-sm font-semibold'
                      : 'text-[#4b5563] hover:text-[#1f2937]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <label className="flex h-8 w-full items-center gap-2 overflow-clip rounded-lg border border-[#e5e7eb] bg-white px-2.5 shadow-sm transition-[border-color,box-shadow] hover:border-[#d1d5db] focus-within:border-[#9ca3af] focus-within:ring-2 focus-within:ring-[#9ca3af]/20">
            <AdminIcon name="search-2" size={14} className="text-[#9ca3af]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search store activities"
              aria-label="Search store activities"
              className="min-w-0 flex-1 bg-transparent text-[13px] leading-none text-[#1f2937] outline-none placeholder:text-[#9ca3af]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs text-[#9ca3af] hover:text-[#1f2937]"
              >
                Clear
              </button>
            )}
          </label>
        </div>

        {/* Counter Summary */}
        <div className="flex w-full flex-col gap-2">
          <p className="whitespace-nowrap text-[13px] text-[#6b7280]">
            <span className="text-base font-semibold text-[#1f2937]">
              {filteredItems.length}
            </span>{' '}
            {query
              ? `${filteredItems.length === 1 ? 'event match' : 'event matches'} for “${query}”`
              : activeTabConfig.caption}
          </p>
          <div className="h-px w-full bg-[#e5e7eb]" />
        </div>

        {/* Activity Timeline List */}
        <ol className="flex min-h-0 w-full flex-1 flex-col gap-4 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {filteredItems.map((item, idx) => {
            const isLast = idx === filteredItems.length - 1;
            const iconName = FEED_ICONS[item.kind] || 'feed-ticket';

            return (
              <li key={item.id} className="relative flex items-start gap-3">
                {/* Timeline Connector Line */}
                {!isLast && (
                  <span className="absolute left-[13px] top-6 bottom-[-16px] w-px bg-[#e5e7eb]" />
                )}

                {/* Activity Icon Badge */}
                <div className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border border-[#e5e7eb] bg-white shadow-sm">
                  <AdminIcon name={iconName} size={14} />
                </div>

                {/* Activity Content */}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-[#1f2937]">
                      {item.title}
                    </span>
                    <span className="text-[11px] text-[#9ca3af] whitespace-nowrap">
                      {item.time}
                    </span>
                  </div>
                  <p className="text-xs text-[#4b5563] leading-relaxed">
                    {renderBody(item)}
                  </p>
                </div>
              </li>
            );
          })}

          {filteredItems.length === 0 && (
            <li className="flex w-full flex-col items-center justify-center gap-2 py-12 text-center">
              <AdminIcon name="search-2" size={24} className="opacity-40" />
              <p className="text-sm font-medium text-[#1f2937]">No store activities found</p>
              <p className="text-xs text-[#9ca3af]">
                Try searching for an order number or customer name.
              </p>
            </li>
          )}
        </ol>
      </div>
    </AdminCard>
  );
};
