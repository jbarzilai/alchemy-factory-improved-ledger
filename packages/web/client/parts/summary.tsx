import { formatMoney, Money, SERIES, ShareBar, type SeriesKey, type Unit } from '@design/components';
import { moneyChange, questCount } from '../today';
import type { DayResponse } from '../../shared/api';
export type SummaryLine = { label: string; copper: number; previous: number | null; symbol: string; series?: SeriesKey; expense?: boolean; subtotal?: boolean; quest?: boolean; final?: boolean };
export function summaryLines(day: DayResponse): SummaryLine[] {
  const t = day.totals, p = day.previousTotals;
  const orders = day.sources.find(s => s.key === 'orders')!;
  return [
    { label: 'Shop Income', copper: t.shop, previous: p?.shop ?? null, symbol: '' },
    { label: 'Order Income', copper: orders.copper, previous: orders.previous, symbol: '+', series: 'orders' },
    { label: 'Purchasing Cost', copper: day.purchasing.copper, previous: day.purchasing.previous, symbol: '−', series: 'purchasing', expense: true },
    { label: 'Subtotal before quests', copper: t.beforeQuests, previous: p?.beforeQuests ?? null, symbol: '=', subtotal: true },
    { label: 'Quest Rewards', copper: t.quests, previous: p?.quests ?? null, symbol: '+', series: 'quests', quest: true },
    { label: 'Profit', copper: t.dailySummaryProfit, previous: p?.dailySummaryProfit ?? null, symbol: '=', final: true },
  ];
}
export function changeCells(copper: number, previous: number | null, unit: Unit, expense = false) {
  if (previous === null) return [<span className="text-muted">–</span>, <span className="text-muted">–</span>];
  const change = copper - previous;
  const money = moneyChange(change, formatMoney(change, unit, true), expense);
  const color = money.color;
  const pct = previous === 0 ? '–' : `${change > 0 ? '+' : change < 0 ? '−' : ''}${Math.abs(change / previous * 100).toFixed(1)}%`;
  return [<span className={`type-body whitespace-nowrap ${color}`}>{money.arrow && `${money.arrow} `}{money.text}{money.suffix}</span>, <span className={`type-body whitespace-nowrap ${color}`}>{pct}</span>];
}
export function Swatch({ series }: { series?: SeriesKey }) {
  return series ? <span aria-hidden="true" className={`inline-block size-2.5 shrink-0 rounded-xs ${SERIES.find(s => s.key === series)!.bg}`} /> : null;
}
export function lineLabel(line: SummaryLine, day: DayResponse) {
  return <span className={line.final || line.subtotal ? 'type-heading' : ''}>
    <span className="inline-flex items-center gap-2"><Swatch series={line.series} />{line.label}</span>
    {line.quest && <span className="type-micro ml-2 text-muted">{questCount(day.totals.questCount)}</span>}
    {line.final && <span className="type-micro block text-muted">matches the in-game Daily Summary</span>}
  </span>;
}
export function lineAmount(line: SummaryLine, unit: Unit, negativeExpense = false) {
  return <span className={line.final ? 'type-kpi' : line.subtotal ? 'type-heading' : ''}>
    {line.quest && <span className="text-violet" title="Computed, not read from the save">≈ </span>}
    <Money copper={negativeExpense && line.expense ? -line.copper : line.copper} unit={unit} />
  </span>;
}
export const changeColumns = [{ header: 'Change', align: 'end' as const, className: 'whitespace-nowrap' }, { header: '% change', align: 'end' as const, className: 'change-percent whitespace-nowrap' }];
export function categories(day: DayResponse) { return day.sources.filter(s => s.key !== 'orders' && (s.key !== 'uncategorized' || s.copper !== 0)); }
export function categoryShare(key: string, copper: number, total: number) {
  const fraction = total ? copper / total : 0;
  return key === 'uncategorized' ? <span className="type-micro text-muted">{(fraction * 100).toFixed(1)}%</span> : <ShareBar className="share-visual" fraction={fraction} series={key as SeriesKey} />;
}
