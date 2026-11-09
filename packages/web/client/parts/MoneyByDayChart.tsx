import { useMemo } from 'react';
import { columnUnit, formatMoney, SeriesLegend, type SeriesKey } from '@design/components';
import type { HistoryResponse } from '../../shared/api';
import { cssColor, seriesColor, useChartTheme } from '../chartTheme';
import { EChart, type EChartsOption } from './EChart';
export const incomeSeries: Exclude<SeriesKey, 'minted' | 'melted'>[] = ['sundries', 'potion', 'beverage', 'jewelry', 'relic', 'orders', 'quests', 'purchasing'];
const labels = ['Sundries', 'Potion', 'Beverage', 'Jewelry', 'Relic', 'Order Income', 'Quest Rewards', 'Purchasing Cost'];
export function MoneyByDayChart({ days }: { days: HistoryResponse['days'] }) {
  const theme = useChartTheme();
  const option = useMemo<EChartsOption>(() => {
    const unit = columnUnit(days.flatMap(d => [Object.values(d.sources).reduce((a, b) => a + b, 0) + d.quests, d.purchasing, d.profit]));
    const money = (n: number) => { const v = formatMoney(n, unit); return v.text + v.suffix; };
    const option: EChartsOption = {
      textStyle: { fontFamily: cssColor('--font-ui'), color: cssColor('--muted') },
      tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => money(Number(value)) },
      grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
      xAxis: { type: 'category', data: days.map(d => `Day ${d.day}`), axisLine: { lineStyle: { color: cssColor('--line') } }, axisLabel: { color: cssColor('--muted') } },
      yAxis: { type: 'value', axisLabel: { color: cssColor('--muted'), formatter: money }, splitLine: { lineStyle: { color: cssColor('--line') } } },
      series: [
        ...incomeSeries.map((key, i) => ({ name: labels[i], type: 'bar', stack: 'money', itemStyle: { color: seriesColor(key) }, data: days.map(d => key === 'purchasing' ? -d.purchasing : key === 'quests' ? d.quests : d.sources[key]) })),
        ...(days.some(d => d.sources.uncategorized !== 0) ? [{ name: 'Uncategorized', type: 'bar', stack: 'money', itemStyle: { color: cssColor('--muted') }, data: days.map(d => d.sources.uncategorized) }] : []),
        { name: 'Profit', type: 'line', itemStyle: { color: cssColor('--ink') }, lineStyle: { width: 2 }, symbolSize: 5, data: days.map(d => d.profit) },
      ],
    };
    return option;
  }, [days, theme]);
  return <><div className="flex flex-wrap gap-3 type-small"><SeriesLegend series={incomeSeries.slice(0, 5)} />{incomeSeries.slice(5).map((key, i) => <span key={key} className="inline-flex items-center gap-2 text-ink"><span aria-hidden="true" className="heat-key" style={{ background: `var(--series-${key})` }} />{labels[i + 5]}</span>)}<span className="text-ink">— Profit</span>{days.some(d => d.sources.uncategorized) && <span>Uncategorized</span>}</div>
    <EChart label="Money by day: Shop Income, Order Income, Quest Rewards, Purchasing Cost and Profit" option={option} height={340} onClick={({ dataIndex }) => { if (days[dataIndex]) location.hash = `#/today/${days[dataIndex].day}`; }} /></>;
}
