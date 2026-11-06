import { useMemo } from 'react';
import { columnUnit, formatMoney, SERIES, SeriesLegend, type SeriesKey } from '@design/components';
import type { ItemsResponse } from '../../shared/api';
import { cssColor, seriesColor, useChartTheme } from '../chartTheme';
import { EChart, type EChartsOption } from './EChart';
export function Treemap({ items, onSelect }: { items: ItemsResponse; onSelect: (item: string) => void }) {
  const theme = useChartTheme();
  const keys = items.categories.filter(c => c.key !== 'uncategorized').map(c => c.key as SeriesKey);
  const option = useMemo<EChartsOption>(() => {
    const unit = columnUnit(items.items.map(i => i.copper));
    const money = (n: number) => { const v = formatMoney(n, unit); return v.text + v.suffix; };
    return ({
      tooltip: { formatter: (p: { name: string; value: number }) => `${p.name}: ${money(p.value)}`, renderMode: 'richText' },
      series: [{ type: 'treemap', roam: false, nodeClick: false, breadcrumb: { show: false }, left: 0, right: 0, top: 12, bottom: 0,
        label: { color: cssColor('--ink'), fontFamily: cssColor('--font-ui'), formatter: (p: { name: string; value: number }) => `${p.name}\n${money(p.value)}` },
        levels: [{ label: { show: false }, upperLabel: { show: false } }],
        upperLabel: { show: true, height: 24, color: cssColor('--ink') },
        itemStyle: { borderColor: cssColor('--panel'), borderWidth: 2, gapWidth: 3 },
        data: items.categories.filter(c => c.copper > 0).map(c => ({ name: SERIES.find(s => s.key === c.key)?.label ?? 'Uncategorized', value: c.copper,
          itemStyle: { color: c.key === 'uncategorized' ? cssColor('--muted') : seriesColor(c.key) },
          children: items.items.filter(i => i.category === c.key && i.copper > 0).map(i => ({ name: i.name, value: i.copper, item: i.item, itemStyle: { color: c.key === 'uncategorized' ? cssColor('--muted') : seriesColor(c.key) } })),
        })),
      }],
    });
  }, [items, theme]);
  return <><SeriesLegend series={keys} />
    <EChart label="Shop Income by category and item" height={380} onClick={({ data }) => { const id = (data as { item?: string } | undefined)?.item; if (id) onSelect(id); }} option={option} />
  </>;
}
