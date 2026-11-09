import { useMemo } from 'react';
import { columnUnit, formatMoney, SERIES, SeriesLegend, type SeriesKey } from '@design/components';
import type { HistoryResponse } from '../../shared/api';
import { cssColor, seriesColor, useChartTheme } from '../chartTheme';
import { EChart, type EChartsOption } from './EChart';
const shopSeries: SeriesKey[] = ['sundries', 'potion', 'beverage', 'jewelry', 'relic'];
const seriesOrder: SeriesKey[] = [...shopSeries, 'orders', 'quests', 'minted', 'purchasing', 'melted'];
const labels: Partial<Record<SeriesKey, string>> = { orders: 'Order Income', quests: 'Quest Rewards', purchasing: 'Purchasing Cost' };
const label = (key: SeriesKey) => labels[key] ?? SERIES.find(s => s.key === key)!.label;
export function MoneyByDayChart({ days, showCoins }: { days: HistoryResponse['days']; showCoins: boolean }) {
  const shownSeries = useMemo(() => seriesOrder.filter(key => showCoins || (key !== 'minted' && key !== 'melted')), [showCoins]);
  const description = `Money by day: Shop Income, Order Income, Quest Rewards, ${showCoins ? 'Coins Minted, Purchasing Cost, Coins Melted' : 'Purchasing Cost'} and Profit`;
  const theme = useChartTheme();
  const option = useMemo<EChartsOption>(() => {
    const unit = columnUnit(days.flatMap(d => [Object.values(d.sources).reduce((a, b) => a + b, 0) + d.quests + d.minted, d.purchasing + d.melted, d.profit]));
    const money = (n: number) => { const v = formatMoney(n, unit); return v.text + v.suffix; };
    const option: EChartsOption = {
      textStyle: { fontFamily: cssColor('--font-ui'), color: cssColor('--muted') },
      tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => money(Number(value)) },
      grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
      xAxis: { type: 'category', data: days.map(d => `Day ${d.day}`), axisLine: { lineStyle: { color: cssColor('--line') } }, axisLabel: { color: cssColor('--muted') } },
      yAxis: { type: 'value', axisLabel: { color: cssColor('--muted'), formatter: money }, splitLine: { lineStyle: { color: cssColor('--line') } } },
      series: [
        ...shownSeries.map(key => ({ name: label(key), type: 'bar', stack: 'money', itemStyle: { color: seriesColor(key) }, data: days.map(d => key === 'purchasing' || key === 'melted' ? -d[key] : key === 'quests' || key === 'minted' ? d[key] : d.sources[key]) })),
        ...(days.some(d => d.sources.uncategorized !== 0) ? [{ name: 'Uncategorized', type: 'bar', stack: 'money', itemStyle: { color: cssColor('--muted') }, data: days.map(d => d.sources.uncategorized) }] : []),
        { name: 'Profit', type: 'line', itemStyle: { color: cssColor('--ink') }, lineStyle: { width: 2 }, symbolSize: 5, data: days.map(d => d.profit) },
      ],
    };
    return option;
  }, [days, shownSeries, theme]);
  return <><div className="flex flex-wrap gap-3 type-small"><SeriesLegend series={shownSeries.filter(key => shopSeries.includes(key))} />{shownSeries.filter(key => !shopSeries.includes(key)).map(key => <span key={key} className="inline-flex items-center gap-2 text-ink"><span aria-hidden="true" className="heat-key" style={{ background: `var(--series-${key})` }} />{label(key)}</span>)}<span className="text-ink"><span aria-hidden="true">━ </span>Profit</span>{days.some(d => d.sources.uncategorized) && <span>Uncategorized</span>}</div>
    <EChart label={description} option={option} height={340} onClick={({ dataIndex }) => { if (days[dataIndex]) location.hash = `#/today/${days[dataIndex].day}`; }} /></>;
}
