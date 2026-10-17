'use client';

import React from 'react';
import { PeriodMetrics, METRIC_DEFS } from '@/data/adminData';
import { AdminCard, AdminCardHeader, AdminCardTitle } from './AdminCard';
import { AdminIcon } from './AdminIcon';
import { AnimatedNumber } from './AnimatedNumber';

export interface CustomMetricItem {
  key: string;
  title: string;
  icon: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  delta: number;
  compareText?: string;
  sparkType?: 'spark-1' | 'spark-2' | 'spark-3';
  patternLeft?: string;
  tracking?: string;
}

interface MetricsRowProps {
  data?: PeriodMetrics;
  compare?: string;
  periodKey?: string;
  items?: CustomMetricItem[];
}

const SPARK_CONFIGS: Record<
  string,
  { name: string; w: number; h: number; box: [number, number]; inset: string }
> = {
  'spark-1': {
    name: 'spark-1',
    w: 92,
    h: 38,
    box: [91, 36],
    inset: '-3.11% -0.4% -0.47% -0.52%',
  },
  'spark-2': {
    name: 'spark-2',
    w: 92,
    h: 33,
    box: [91, 32],
    inset: '-1.97% -0.4% 0 -0.13%',
  },
  'spark-3': {
    name: 'spark-3',
    w: 92,
    h: 37,
    box: [91, 36],
    inset: '-1.77% -0.38% 0 -0.43%',
  },
  // Legacy aliases
  tickets: {
    name: 'spark-1',
    w: 92,
    h: 38,
    box: [91, 36],
    inset: '-3.11% -0.4% -0.47% -0.52%',
  },
  resolution: {
    name: 'spark-2',
    w: 92,
    h: 33,
    box: [91, 32],
    inset: '-1.97% -0.4% 0 -0.13%',
  },
  sla: {
    name: 'spark-3',
    w: 92,
    h: 37,
    box: [91, 36],
    inset: '-1.77% -0.38% 0 -0.43%',
  },
};

export const MetricsRow: React.FC<MetricsRowProps> = ({
  data,
  compare = 'vs last period',
  periodKey = 'current',
  items,
}) => {
  if (items && items.length > 0) {
    return (
      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
        {items.map((item, idx) => {
          const sparkKey = item.sparkType || (idx === 0 ? 'spark-1' : idx === 1 ? 'spark-2' : 'spark-3');
          const spark = SPARK_CONFIGS[sparkKey] || SPARK_CONFIGS['spark-1'];
          const isPositive = item.delta >= 0;
          const deltaDecimals = Number.isInteger(item.delta) ? 0 : 1;

          return (
            <AdminCard
              key={item.key}
              patternStyle={{
                left: item.patternLeft || 'calc(50% - 55px)',
                top: -0.8,
                transform: 'translateX(-50%)',
              }}
              className="group/kpi h-[140px] min-w-0 flex-1 animate-rise"
              style={{ animationDelay: `${80 + idx * 70}ms` }}
              aria-label={item.title}
            >
              <AdminCardHeader>
                <AdminCardTitle className={item.tracking}>{item.title}</AdminCardTitle>
                <AdminIcon
                  name={item.icon}
                  size={16}
                  className="transition-transform duration-300 ease-[var(--ease-out-expo)] group-hover/kpi:-rotate-12 group-hover/kpi:scale-110 text-[#4b5563]"
                />
              </AdminCardHeader>

              <div className="relative flex min-h-px w-full flex-1 items-end justify-between rounded-[10px] border border-[#e5e7eb] bg-white px-3 pb-3 transition-[box-shadow,transform] duration-300 ease-[var(--ease-out-expo)] group-hover/kpi:-translate-y-px group-hover/kpi:shadow-[0px_2px_3px_-1px_rgba(0,0,0,0.1),0px_1px_0px_0px_rgba(25,28,33,0.02),0px_0px_0px_1px_rgba(25,28,33,0.08)]">
                <div className="flex flex-col items-start gap-2 whitespace-nowrap leading-none">
                  <p className="text-2xl font-semibold text-[#1f2937]">
                    <AnimatedNumber
                      value={item.value}
                      prefix={item.prefix}
                      suffix={item.suffix}
                      decimals={item.decimals ?? 0}
                      delay={150 + idx * 90}
                    />
                  </p>
                  <p className="flex items-center gap-1.5">
                    <span
                      className={`text-xs font-semibold ${
                        isPositive ? 'text-[#059669]' : 'text-[#ef4444]'
                      }`}
                    >
                      <AnimatedNumber
                        value={item.delta}
                        decimals={deltaDecimals}
                        prefix={isPositive ? '+' : ''}
                        suffix="%"
                        delay={250 + idx * 90}
                        duration={1100}
                      />
                    </span>
                    <span className="text-[13px] text-[#6b7280]">
                      {item.compareText || compare}
                    </span>
                  </p>
                </div>

                {/* Sparkline Graphic */}
                <div className="flex items-end">
                  <div
                    key={`${periodKey}-${item.key}`}
                    className="relative shrink-0 animate-draw transition-transform duration-300 group-hover/kpi:scale-[1.04]"
                    style={{
                      width: spark.box[0],
                      height: spark.box[1],
                      animationDelay: `${300 + idx * 120}ms`,
                      transformOrigin: 'bottom right',
                    }}
                  >
                    <img
                      src={`/admin/${spark.name}.svg`}
                      alt=""
                      width={spark.w}
                      height={spark.h}
                      className="block size-full max-w-none"
                    />
                  </div>
                </div>
              </div>
            </AdminCard>
          );
        })}
      </div>
    );
  }

  // Fallback to legacy structure if items are not passed
  if (!data) return null;

  return (
    <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
      {METRIC_DEFS.map((def, idx) => {
        const kpi = data[def.key];
        const spark = SPARK_CONFIGS[def.key];
        const isPositive = kpi.delta >= 0;
        const decimals = Number.isInteger(kpi.delta) ? 0 : 1;

        return (
          <AdminCard
            key={def.key}
            patternStyle={{
              left: def.patternLeft,
              top: -0.8,
              transform: 'translateX(-50%)',
            }}
            className="group/kpi h-[140px] min-w-0 flex-1 animate-rise"
            style={{ animationDelay: `${80 + idx * 70}ms` }}
            aria-label={def.title}
          >
            <AdminCardHeader>
              <AdminCardTitle className={def.tracking}>{def.title}</AdminCardTitle>
              <AdminIcon
                name={def.icon}
                size={16}
                className="transition-transform duration-300 ease-[var(--ease-out-expo)] group-hover/kpi:-rotate-12 group-hover/kpi:scale-110"
              />
            </AdminCardHeader>

            <div className="relative flex min-h-px w-full flex-1 items-end justify-between rounded-[10px] border border-[#e5e7eb] bg-white px-3 pb-3 transition-[box-shadow,transform] duration-300 ease-[var(--ease-out-expo)] group-hover/kpi:-translate-y-px group-hover/kpi:shadow-[0px_2px_3px_-1px_rgba(0,0,0,0.1),0px_1px_0px_0px_rgba(25,28,33,0.02),0px_0px_0px_1px_rgba(25,28,33,0.08)]">
              <div className="flex flex-col items-start gap-2 whitespace-nowrap leading-none">
                <p className="text-2xl font-medium text-[#1f2937]">
                  <AnimatedNumber
                    value={kpi.value}
                    suffix={kpi.suffix}
                    delay={150 + idx * 90}
                  />
                </p>
                <p className="flex items-center gap-1.5">
                  <span
                    className={`text-xs font-medium ${
                      isPositive ? 'text-[#059669]' : 'text-[#ef4444]'
                    }`}
                  >
                    <AnimatedNumber
                      value={kpi.delta}
                      decimals={decimals}
                      prefix={isPositive ? '+' : ''}
                      suffix="%"
                      delay={250 + idx * 90}
                      duration={1100}
                    />
                  </span>
                  <span className="text-[13px] text-[#6b7280]">{compare}</span>
                </p>
              </div>

              {/* Sparkline Graphic */}
              <div className="flex items-end">
                <div
                  key={`${periodKey}-${def.key}`}
                  className="relative shrink-0 animate-draw transition-transform duration-300 group-hover/kpi:scale-[1.04]"
                  style={{
                    width: spark.box[0],
                    height: spark.box[1],
                    animationDelay: `${300 + idx * 120}ms`,
                    transformOrigin: 'bottom right',
                  }}
                >
                  <img
                    src={`/admin/${spark.name}.svg`}
                    alt=""
                    width={spark.w}
                    height={spark.h}
                    className="block size-full max-w-none"
                  />
                </div>
              </div>
            </div>
          </AdminCard>
        );
      })}
    </div>
  );
};
