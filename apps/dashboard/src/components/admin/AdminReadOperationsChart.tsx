'use client';

import { useCallback, useId } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

export type CountTone = 'brand' | 'success' | 'danger' | 'neutral';
export type CountRow = { key: string; label: string; count: number; tone?: CountTone };

/** Local labels and authorized aggregate counts only; no reads or data synthesis. */
export default function CountBarPlot({ label, rows, maximum, rtl, unit }: {
  label: string;
  rows: CountRow[];
  maximum: number;
  rtl: boolean;
  unit: string;
}) {
  const id = `count-stripes-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  // Reserve space for the exact raw count at the end of the longest bar.
  // Changing the drawing margin does not change the count domain or ratios.
  const countLabelSpace = Math.max(28, String(maximum).length * 7 + 12);
  const formatCategory = useCallback((value: string) => rows.find(row => row.label === value)?.count === 0 ? `${value} · 0` : value, [rows]);
  return <div dir="ltr" className="[--count-success:theme(colors.success.700)] [--count-danger:theme(colors.danger.700)] [--count-neutral:theme(colors.muted.foreground)]">
    <ChartContainer config={{ count: { label: unit, color: 'var(--color-primary)' } }} className="h-full w-full">
      <BarChart data={rows} layout="vertical" accessibilityLayer aria-label={`${label} · ${unit}`} margin={{ top: 8, bottom: 0, left: rtl ? countLabelSpace : 0, right: rtl ? 0 : countLabelSpace }}>
        <defs><pattern id={`${id}-pattern`} width="6" height="1" patternUnits="userSpaceOnUse"><rect width="3" height="1" fill="white" /></pattern><mask id={id}><rect width="100%" height="100%" fill={`url(#${id}-pattern)`} /></mask></defs>
        <CartesianGrid horizontal={false} strokeDasharray="3 4" />
        <XAxis type="number" domain={[0, maximum]} allowDecimals={false} tickCount={Math.min(maximum + 1, 5)} reversed={rtl} axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="label" width={104} orientation={rtl ? 'right' : 'left'} axisLine={false} tickLine={false} tick={{ fontSize: 12 }} tickFormatter={formatCategory} />
        <ChartTooltip cursor={{ fill: 'hsl(var(--muted) / 0.45)' }} content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-count)" stroke="var(--color-primary-focus)" strokeWidth={1} mask={`url(#${id})`} radius={0} maxBarSize={18} isAnimationActive={false}>
          {rows.map(row => <Cell key={row.key} fill={!row.tone || row.tone === 'brand' ? 'var(--color-count)' : `var(--count-${row.tone})`} stroke={!row.tone || row.tone === 'brand' ? 'var(--color-primary-focus)' : `var(--count-${row.tone})`} />)}
          {/* Recharts mirrors the end of a signed drawing width when X is
              reversed. "right" therefore places both LTR and RTL counts at
              the value endpoint, rather than at RTL's zero baseline. */}
          <LabelList dataKey="count" position="right" offset={8} fill="hsl(var(--foreground))" fontSize={12} className="tabular-nums" />
        </Bar>
      </BarChart>
    </ChartContainer>
  </div>;
}
