'use client';

import React, { useState, useEffect } from 'react';
import {
  TREND_DATA_BY_PERIOD,
  PERIOD_OPTIONS,
  PeriodKey,
} from '@/data/adminData';
import { AdminCard, AdminCardHeader, AdminCardTitle } from './AdminCard';
import { AdminIcon } from './AdminIcon';
import { AnimatedNumber } from './AnimatedNumber';

export interface TrendSeriesPoint {
  date: string;
  label: string;
  amount: number;
  ordersCount?: number;
}

interface TrendBarChartProps {
  period?: PeriodKey;
  onPeriodChange?: (p: PeriodKey) => void;
  title?: string;
  customTotal?: number;
  customPrefix?: string;
  customDelta?: number;
  customCompare?: string;
  series?: TrendSeriesPoint[];
  className?: string;
}

export const TrendBarChart: React.FC<TrendBarChartProps> = ({
  period = 'last-week',
  onPeriodChange,
  title = 'Daily Revenue & Volume Trend',
  customTotal,
  customPrefix = '₦',
  customDelta = 12.4,
  customCompare = 'vs previous period',
  series,
  className = '',
}) => {
  const fallbackTrendData = TREND_DATA_BY_PERIOD[period] || TREND_DATA_BY_PERIOD['last-week'];
  const compareText = customCompare || PERIOD_OPTIONS.find((p) => p.value === period)?.compare || '';

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    setSelectedIndex(null);
  }, [period]);

  // If dynamic series provided from backend
  const hasDynamicSeries = Boolean(series && series.length > 0);
  const dataPoints: { label: string; rawValue: number; secondary?: string; height: number }[] = [];

  let yTicks: string[] = ['800', '600', '400', '200', '0'];

  if (hasDynamicSeries && series) {
    const maxVal = Math.max(...series.map((s) => s.amount), 1000);
    const tickStep = Math.ceil(maxVal / 4);
    yTicks = [
      `₦${Math.round((tickStep * 4) / 1000)}k`,
      `₦${Math.round((tickStep * 3) / 1000)}k`,
      `₦${Math.round((tickStep * 2) / 1000)}k`,
      `₦${Math.round((tickStep * 1) / 1000)}k`,
      '₦0',
    ];

    series.forEach((s) => {
      const h = Math.max(12, Math.round((s.amount / maxVal) * 175));
      dataPoints.push({
        label: s.label,
        rawValue: s.amount,
        secondary: s.ordersCount ? `${s.ordersCount} orders` : undefined,
        height: h,
      });
    });
  } else {
    fallbackTrendData.bars.forEach((b) => {
      dataPoints.push({
        label: b.label,
        rawValue: b.height * 4,
        height: b.height,
      });
    });
  }

  const pointCount = dataPoints.length;
  const activeIndex = hoverIndex ?? selectedIndex ?? (hasDynamicSeries ? pointCount - 1 : fallbackTrendData.active);
  const activePoint = dataPoints[activeIndex] || dataPoints[0];

  const totalValue = customTotal ?? fallbackTrendData.total;
  const deltaValue = customDelta ?? fallbackTrendData.delta;

  return (
    <AdminCard
      patternStyle={{
        left: 'calc(50% - 0.5px)',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      }}
      className={`h-[420px] max-h-[420px] w-full flex flex-col animate-rise [animation-delay:260ms] ${className}`}
      aria-labelledby="trend-title"
    >
      <AdminCardHeader>
        <div className="flex items-center gap-2.5">
          <AdminIcon name="sb-dashboard" size={16} className="text-[#374151]" />
          <AdminCardTitle id="trend-title">{title}</AdminCardTitle>
        </div>

        {/* Range Selector Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex h-7 items-center justify-between gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-xs font-medium text-[#4b5563] shadow-sm outline-none transition-colors hover:bg-[#fafafa] focus-visible:ring-2 focus-visible:ring-[#9ca3af]"
          >
            <span className="flex items-center gap-1.5">
              <AdminIcon name="calendar" size={14} />
              <span>{PERIOD_OPTIONS.find((p) => p.value === period)?.label || 'Past 14 Days'}</span>
            </span>
            <AdminIcon
              name="sb-arrow-down"
              size={12}
              className={`transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 w-36 rounded-xl border border-[#e5e7eb] bg-white p-1 shadow-lg animate-fade">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onPeriodChange?.(opt.value);
                    setIsDropdownOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-left transition-colors ${
                    opt.value === period
                      ? 'bg-[#f3f4f6] font-medium text-[#1f2937]'
                      : 'text-[#4b5563] hover:bg-[#fafafa]'
                  }`}
                >
                  <span>{opt.label}</span>
                  {opt.value === period && <AdminIcon name="check-tick" size={12} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </AdminCardHeader>

      <div className="relative flex min-h-px w-full flex-1 flex-col items-start justify-between overflow-clip rounded-xl border border-[#e5e7eb] bg-white px-3.5 pb-3.5 pt-4">
        {/* Metric Header */}
        <div className="flex items-end gap-3 whitespace-nowrap leading-none">
          <p className="text-[30px] font-semibold tracking-tight text-[#1f2937]">
            <AnimatedNumber
              value={totalValue}
              prefix={customPrefix}
              delay={320}
              decimals={customPrefix === '₦' ? 2 : 0}
            />
          </p>
          <p className="flex items-center gap-1.5 pb-1">
            <span
              className={`text-xs font-semibold ${
                deltaValue >= 0 ? 'text-[#059669]' : 'text-[#ef4444]'
              }`}
            >
              <AnimatedNumber
                value={deltaValue}
                prefix={deltaValue >= 0 ? '+' : ''}
                suffix="%"
                delay={420}
                duration={1000}
              />
            </span>
            <span className="text-[13px] text-[#6b7280]">{compareText}</span>
          </p>
        </div>

        {/* Chart Viewport */}
        <div className="flex w-full items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div
              role="group"
              tabIndex={0}
              aria-label="Sales volume chart. Hover over bars to view values."
              onMouseLeave={() => setHoverIndex(null)}
              className="relative h-[216px] w-full overflow-hidden rounded-sm outline-none"
            >
              {/* Background Grid */}
              <span className="pointer-events-none absolute left-0 top-0 block h-[214px] w-full opacity-60">
                <img
                  src="/admin/grid.svg"
                  alt=""
                  width={825}
                  height={216}
                  className="block size-full"
                />
              </span>

              {/* Render Bars in dynamic flex distribution */}
              <div className="absolute inset-x-2 bottom-0 top-0 flex items-end justify-between gap-1 px-2">
                {dataPoints.map((point, idx) => {
                  const isActive = idx === activeIndex;

                  return (
                    <div
                      key={idx}
                      className="group relative flex h-full flex-1 cursor-pointer flex-col justify-end items-center"
                      onMouseEnter={() => setHoverIndex(idx)}
                      onClick={() => setSelectedIndex(idx)}
                    >
                      {/* Bar Fill */}
                      <div
                        className="w-full max-w-[28px] rounded-t-[6px] transition-all duration-300 relative"
                        style={{
                          height: `${point.height}px`,
                        }}
                      >
                        {/* Default Inactive Bar */}
                        <div
                          className={`absolute inset-0 rounded-t-[6px] bg-gradient-to-b from-[#e5e7eb] to-[#f3f4f6] transition-opacity duration-300 ${
                            isActive ? 'opacity-0' : 'opacity-100 group-hover:from-[#d1d5db]'
                          }`}
                        />
                        {/* Active Bar */}
                        <div
                          className={`absolute inset-0 rounded-t-[6px] bg-[linear-gradient(180deg,#37475d_0%,#1f2937_64.7%)] shadow-[0px_2px_8px_0px_rgba(31,41,55,0.2)] transition-opacity duration-300 ${
                            isActive ? 'opacity-100' : 'opacity-0'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Active Indicator & Tooltip */}
              {activePoint && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 transition-all duration-300"
                >
                  {/* Dashed Horizontal Line */}
                  <div
                    className="absolute inset-x-0 border-t border-dashed border-[#1f2937]/30 transition-[top] duration-300"
                    style={{
                      top: `${Math.max(20, 216 - activePoint.height)}px`,
                    }}
                  />
                  {/* Floating Tooltip Pill */}
                  <div
                    className="absolute left-1/2 -translate-x-1/2 transition-[top] duration-300"
                    style={{
                      top: `${Math.max(8, 216 - activePoint.height - 30)}px`,
                    }}
                  >
                    <div className="flex items-center gap-1.5 rounded-md bg-[#1f2937] px-2.5 py-1 text-white shadow-lg">
                      <span className="text-xs font-semibold text-white">
                        {activePoint.label}:
                      </span>
                      <span className="text-xs font-mono font-medium text-white/90">
                        {customPrefix === '₦'
                          ? `₦${Number(activePoint.rawValue).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`
                          : activePoint.rawValue}
                      </span>
                      {activePoint.secondary && (
                        <span className="text-[10px] text-white/70">
                          ({activePoint.secondary})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* X-Axis Labels */}
            <div className="flex w-full items-center justify-between px-1 sm:px-3 pt-2" aria-hidden="true">
              {dataPoints.map((point, idx) => {
                // Adaptive spacing on small screens: show ~5 key ticks and the active bar
                const isKeyMobileTick =
                  pointCount <= 7 ||
                  idx === 0 ||
                  idx === pointCount - 1 ||
                  idx % Math.ceil(pointCount / 5) === 0 ||
                  idx === activeIndex;

                const dayOnly = point.label.includes('/') ? point.label.split('/')[0] : point.label;

                return (
                  <div key={idx} className="flex flex-1 justify-center min-w-0">
                    {/* Mobile Label: Clean spaced day numbers */}
                    <span
                      className={`text-[9px] sm:hidden font-mono transition-colors duration-200 ${
                        !isKeyMobileTick
                          ? 'opacity-0 select-none'
                          : idx === activeIndex
                          ? 'font-bold text-[#1f2937]'
                          : 'text-[#9ca3af]'
                      }`}
                    >
                      {dayOnly}
                    </span>

                    {/* Desktop Label: Full date */}
                    <span
                      className={`hidden sm:inline text-[11px] leading-none transition-colors duration-200 ${
                        idx === activeIndex
                          ? 'font-bold text-[#1f2937]'
                          : 'text-[#9ca3af]'
                      }`}
                    >
                      {point.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Y-Axis Tick Numbers */}
          <div className="flex h-[200px] flex-col items-end justify-between pl-1" aria-hidden="true">
            {yTicks.map((tick, i) => (
              <div key={i} className="flex w-full items-center justify-end">
                <p className="whitespace-nowrap font-mono text-[11px] leading-none text-[#9ca3af]">{tick}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminCard>
  );
};
