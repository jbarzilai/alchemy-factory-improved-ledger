import type { FlagSettings } from '@af-ledger/core';
import type { DayItemLine, DayResponse, FlagView } from '../shared/api';
import type { DaySelection, ShopFilter } from './route';
const categories: { key: ShopFilter; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'sundries', label: 'Sundries' }, { key: 'potion', label: 'Potion' },
  { key: 'beverage', label: 'Beverage' }, { key: 'jewelry', label: 'Jewelry' }, { key: 'relic', label: 'Relic' },
  { key: 'uncategorized', label: 'Uncategorized' },
];
export function visibleLines(day: DayResponse, sel: DaySelection): DayItemLine[] {
  return day.items[sel.stream].filter(l => sel.stream !== 'shop' || sel.category === 'all' || l.category === sel.category);
}
export function expandedItem(day: DayResponse, sel: DaySelection): string | null {
  return visibleLines(day, sel).some(l => l.item === sel.item) ? sel.item : null;
}
export function linesTotal(lines: DayItemLine[]): number { return lines.reduce((sum, l) => sum + (l.copper ?? 0), 0); }
export function shopChips(day: DayResponse): { key: ShopFilter; label: string; copper: number }[] {
  return categories.filter(c => c.key !== 'uncategorized' || day.items.shop.some(l => l.category === c.key))
    .map(c => ({ ...c, copper: linesTotal(visibleLines(day, { stream: 'shop', category: c.key, item: null })) }));
}
export function selectionTitle(sel: DaySelection): string {
  return sel.stream === 'orders' ? 'Order Income' : sel.stream === 'purchasing' ? 'Purchasing Cost' : `Shop Income${sel.category === 'all' ? '' : ` · ${categories.find(c => c.key === sel.category)!.label}`}`;
}
export function unitPrice(units: number | null, copper: number | null): number | null { return units === null || units === 0 || copper === null ? null : copper / units; }
export function flagSelection(flag: FlagView): DaySelection {
  return { stream: flag.stream, category: flag.stream === 'shop' && flag.category !== 'orders' ? flag.category ?? 'all' : 'all', item: flag.item };
}
export function noFlagsText(day: number, settings: FlagSettings): string {
  return !settings.incomeFlags && !settings.purchaseFlags ? 'Flags are off.' : `No flags for Day ${day}.`;
}
export function flagKindLabel(flag: FlagView, settings: FlagSettings): string {
  return flag.kind === 'stopped' ? `Stopped, day ${flag.zeroDay} of ${settings.zeroRunDays}` : flag.kind === 'money-drop' ? 'Large money drop' : flag.kind === 'money-rise' ? 'Large cost rise' : flag.kind === 'rise' ? 'Purchases up' : 'Large drop';
}
export function flagSentence(flag: FlagView, settings: FlagSettings, money: (copper: number) => string): string {
  const window = flag.kind === 'stopped' ? 'before it stopped' : `(median of Days ${Math.max(1, flag.day - settings.windowDays)} to ${flag.day - 1})`;
  return `${flagKindLabel(flag, settings)}. ${flag.today} today against a usual ${flag.usual} ${window}${flag.impact === null ? '.' : `, ${money(flag.impact)} against usual.`}`;
}
