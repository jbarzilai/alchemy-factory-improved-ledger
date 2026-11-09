import type { DayResponse } from '../shared/api';
import type { DayStream } from './route';

export type SummarySeries = 'orders' | 'quests' | 'purchasing' | 'minted' | 'melted';
export type SummaryLine = { label: string; copper: number; previous: number | null; symbol: string; series?: SummarySeries; stream?: DayStream; expense?: boolean; subtotal?: boolean; quest?: boolean; final?: boolean };
export function summaryLines(day: DayResponse): SummaryLine[] {
  const t = day.totals, p = day.previousTotals;
  const orders = day.sources.find(s => s.key === 'orders')!;
  return [
    { label: 'Shop Income', copper: t.shop, previous: p?.shop ?? null, symbol: '', stream: 'shop' },
    { label: 'Order Income', copper: orders.copper, previous: orders.previous, symbol: '+', series: 'orders', stream: 'orders' },
    { label: 'Purchasing Cost', copper: day.purchasing.copper, previous: day.purchasing.previous, symbol: '−', series: 'purchasing', stream: 'purchasing', expense: true },
    { label: 'Subtotal before quests', copper: t.beforeQuests, previous: p?.beforeQuests ?? null, symbol: '=', subtotal: true },
    { label: 'Quest Rewards', copper: t.quests, previous: p?.quests ?? null, symbol: '+', series: 'quests', quest: true },
    { label: 'Profit', copper: t.profit, previous: p?.profit ?? null, symbol: '=', final: true },
  ];
}

/** Paging the day strip back moves 14 days, but stops at the first 14 tiles so the strip stays full. */
export const earlierEndIndex = (endIndex: number) => Math.max(13, endIndex - 14);

export function moneyChange(change: number, money: { text: string; suffix: string }, expense = false) {
  const flat = !/[1-9]/.test(money.text);
  const color = flat ? 'text-muted' : (expense ? change < 0 : change > 0) ? 'text-gain' : 'text-loss';
  return { ...money, arrow: flat ? '' : change > 0 ? '↑' : '↓', color };
}

export const percentSetting = (ratio: number) => `${Number((ratio * 100).toFixed(1))}%`;
export const questCount = (count: number) => `${count} ${count === 1 ? 'quest' : 'quests'}`;
