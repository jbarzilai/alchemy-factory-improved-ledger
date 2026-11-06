import { useMemo, useState } from 'react';
import { Button, columnUnit, ItemLabel, LedgerTable, Money, Panel, SeriesLegend, type SeriesKey } from '@design/components';
import type { ItemResponse, MetaResponse } from '../../shared/api';
import { cssColor, seriesColor, useChartTheme } from '../chartTheme';
import { EChart, type EChartsOption } from './EChart';
import { itemSummary } from '../economics';
export function ItemDetail({ item, meta }: { item: ItemResponse; meta: MetaResponse }) {
  const theme = useChartTheme();
  const [showTable, setShowTable] = useState(false);
  const flagged = new Set(item.flaggedDays.map(f => f.day));
  const { units, income } = itemSummary(item.days);
  const hasOrders = item.days.some(d => d.dispatched > 0);
  const series = item.category && item.category !== 'uncategorized' ? item.category as SeriesKey : undefined;
  const unit = columnUnit(item.days.flatMap(d => [d.copper, d.dispatchCopper]));
  const priceUnit = columnUnit(item.days.map(d => d.units ? d.copper / d.units : 0));
  const option = useMemo<EChartsOption>(() => ({
      tooltip: { trigger: 'axis' }, grid: { left: 8, right: 8, top: 12, bottom: 8, containLabel: true },
      xAxis: { type: 'category', data: item.days.map(d => `Day ${d.day}`), axisLabel: { color: cssColor('--muted') }, axisLine: { lineStyle: { color: cssColor('--line') } } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { color: cssColor('--muted') }, splitLine: { lineStyle: { color: cssColor('--line') } } },
      series: [{ type: 'bar', name: 'Sold', data: item.days.map(d => d.units), itemStyle: { color: series ? seriesColor(series) : cssColor('--muted') } }, ...(hasOrders ? [{ type: 'bar', name: 'Dispatched', data: item.days.map(d => d.dispatched), itemStyle: { color: seriesColor('orders') } }] : [])],
    }), [item, theme, hasOrders, series]);
  return <Panel eyebrow="Item detail" title={<ItemLabel name={item.name} series={series} iconSrc={meta.iconItems.includes(item.item) ? `/api/icon/${encodeURIComponent(item.item)}` : undefined} />} actions={<Button size="sm" onClick={() => setShowTable(v => !v)} aria-expanded={showTable}>{showTable ? 'Hide daily numbers' : 'Show daily numbers'}</Button>}>
    <div className="flex flex-wrap gap-x-6 gap-y-2 type-small mb-3"><span>Sold {units.toLocaleString()}</span><span>Income <Money copper={income} unit={columnUnit([income])} /></span><span>Unit price <Money copper={units ? income / units : 0} unit={columnUnit([units ? income / units : 0])} /></span><span>Last sold {item.lastSoldDay === null ? '—' : `Day ${item.lastSoldDay}`}</span></div>
    {hasOrders && <div className="flex gap-3 type-small">{series && <SeriesLegend series={[series]} />}<span className="inline-flex items-center gap-2"><span className="heat-key bg-orders" aria-hidden="true" />Order Income</span></div>}
    <EChart label={`${item.name}: units sold per day${hasOrders ? ' and units dispatched' : ''}`} height={220} onClick={({ dataIndex }) => { if (item.days[dataIndex]) location.hash = `#/today/${item.days[dataIndex].day}`; }} option={option} />
    <div className="flex items-center gap-2 mt-2"><span className="type-micro text-muted">Flag</span><div className="flex flex-1 min-w-0 gap-1">{item.days.map(d => {
      const flags = item.flaggedDays.filter(f => f.day === d.day);
      const title = `Day ${d.day}: ${flags.length ? flags.map(f => `${f.stream} · ${f.kind}`).join(', ') : 'no flags'}`;
      return <a key={d.day} href={`#/today/${d.day}`} title={title} aria-label={title} className={`flag-day ${flagged.has(d.day) ? 'bg-loss' : 'bg-line'}`} />;
    })}</div></div>
    <p className="type-small text-muted mt-3">Units sold per day. <span className="text-loss">Flagged days</span> are marked below the chart.{item.flaggedDays.length === 0 ? ' No flags in this range.' : ''}</p>
    {showTable && <LedgerTable caption={`${item.name}, daily units, unit price and income`} columns={[{ header: 'Day' }, { header: 'Sold', align: 'end' }, { header: 'Unit price', align: 'end' }, { header: 'Income', align: 'end' }, ...(hasOrders ? [{ header: 'Dispatched', align: 'end' as const }, { header: 'Order Income', align: 'end' as const }] : [])]} rows={item.days.map(d => [<a href={`#/today/${d.day}`}>Day {d.day}</a>, d.units.toLocaleString(), <Money copper={d.units ? d.copper / d.units : 0} unit={priceUnit} />, <Money copper={d.copper} unit={unit} />, ...(hasOrders ? [d.dispatched.toLocaleString(), <Money copper={d.dispatchCopper} unit={unit} />] : [])])} />}
  </Panel>;
}
