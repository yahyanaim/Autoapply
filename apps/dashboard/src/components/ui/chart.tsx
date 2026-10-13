'use client';

import * as React from 'react';
import * as RechartsPrimitive from 'recharts';
import type { TooltipValueType } from 'recharts';
import { cn } from '@/lib/utils';

// Adapted from shadcn/ui's MIT-licensed chart component for this Tailwind 3 app.
// Source: https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/chart.tsx
/*
MIT License — Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
export type ChartConfig = Record<string, { label?: React.ReactNode; color?: string }>;
const ChartContext = React.createContext<{ config: ChartConfig } | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) throw new Error('Chart components require ChartContainer');
  return context;
}

export function ChartContainer({ id, className, children, config, ...props }: React.ComponentProps<'div'> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children'];
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id ?? uniqueId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  // Locally defined config only; no raw API fields enter a CSS/style template.
  const colors = Object.fromEntries(Object.entries(config).filter(([, item]) => item.color).map(([key, item]) => [`--color-${key}`, item.color]));
  return <ChartContext.Provider value={{ config }}>
    <div data-slot="chart" data-chart={chartId} className={cn(
      'flex min-w-0 justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/50 [&_.recharts-tooltip-cursor]:stroke-border [&_.recharts-surface:focus-visible]:outline [&_.recharts-surface:focus-visible]:outline-2 [&_.recharts-surface:focus-visible]:outline-offset-2 [&_.recharts-surface:focus-visible]:outline-primary-600',
      className,
    )} style={colors as React.CSSProperties} {...props}>
      <RechartsPrimitive.ResponsiveContainer initialDimension={{ width: 640, height: 240 }}>{children}</RechartsPrimitive.ResponsiveContainer>
    </div>
  </ChartContext.Provider>;
}

export const ChartTooltip = RechartsPrimitive.Tooltip;

type TooltipProps = React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
  React.ComponentProps<'div'> & Omit<RechartsPrimitive.DefaultTooltipContentProps<TooltipValueType, number | string>, 'accessibilityLayer'>;

export function ChartTooltipContent({ active, payload, className, label, labelFormatter, formatter }: TooltipProps) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;
  return <div className={cn('grid min-w-40 gap-2 rounded-xl border border-border/60 bg-white px-3 py-2.5 text-xs shadow-lg', className)}>
    <div className="font-medium">{labelFormatter ? labelFormatter(label, payload) : label}</div>
    {payload.filter((item) => item.type !== 'none').map((item, index) => {
      const itemConfig = config[String(item.dataKey ?? item.name ?? 'value')];
      return <div key={`${item.dataKey}-${index}`} className="flex items-center gap-2">
        {formatter && item.value !== undefined && item.name ? formatter(item.value, item.name, item, index, item.payload) : <>
          <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: itemConfig?.color ?? item.color }} />
          <span className="flex-1 text-muted-foreground">{itemConfig?.label ?? item.name}</span>
          <bdi dir="ltr" className="font-semibold tabular-nums">{String(item.value ?? '')}</bdi>
        </>}
      </div>;
    })}
  </div>;
}
