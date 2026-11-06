import type { ItemsResponse, ItemResponse, SourceKey } from '../../shared/api';
import type { LedgerModel } from '../state';
import { apiError, completedDays, dayIndex, SOURCE_CATEGORIES } from './day';

export function itemsView(model: LedgerModel, from: number, to: number): ItemsResponse {
  const start = dayIndex(model, from), end = dayIndex(model, to);
  if (start > end) return apiError(400, 'from must not exceed to');
  const days = model.days.slice(start, end + 1);
  const split = Math.floor(days.length / 2);
  const items = new Map<string, ItemsResponse['items'][number]>();
  const halves = [new Map<string, number>(), new Map<string, number>()];
  const halfTotals = [0, 0];
  days.forEach((day, i) => {
    const half = i < split ? 0 : 1;
    halfTotals[half] += day.shop.total;
    for (const line of day.shop.lines) {
      const item = items.get(line.item) ?? { item: line.item, name: model.ledger.name(line.item), category: (model.ledger.categories.get(line.item)?.toLowerCase() ?? 'uncategorized') as SourceKey, units: 0, copper: 0 };
      item.units += line.count; item.copper += line.copper; items.set(line.item, item);
      halves[half].set(line.item, (halves[half].get(line.item) ?? 0) + line.copper);
    }
  });
  const rows = [...items.values()].sort((a, b) => b.copper - a.copper || compareId(a.item, b.item));
  return { from, to, shopTotal: halfTotals[0] + halfTotals[1], items: rows,
    categories: [...SOURCE_CATEGORIES.map(c => c.toLowerCase() as SourceKey), 'uncategorized' as const]
      .map(key => ({ key, copper: rows.filter(item => item.category === key).reduce((sum, item) => sum + item.copper, 0) }))
      .filter(c => c.key !== 'uncategorized' || c.copper !== 0),
    movers: rows.map(({ item, name }) => ({ item, name,
      firstShare: halfTotals[0] ? (halves[0].get(item) ?? 0) / halfTotals[0] : 0,
      secondShare: halfTotals[1] ? (halves[1].get(item) ?? 0) / halfTotals[1] : 0,
      firstPerDay: split ? (halves[0].get(item) ?? 0) / split : 0,
      secondPerDay: (halves[1].get(item) ?? 0) / (days.length - split),
    })).sort((a, b) => (a.secondPerDay - a.firstPerDay) - (b.secondPerDay - b.firstPerDay) || compareId(a.item, b.item)),
  };
}
const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export function itemView(model: LedgerModel, item: string, from: number, to: number): ItemResponse {
  const start = dayIndex(model, from), end = dayIndex(model, to);
  if (start > end) return apiError(400, 'from must not exceed to');
  if (!model.ledger.categories.has(item) && !model.ledger.snapshot.days.some(d => d.items.some(line => line.item === item))) return apiError(404, `Unknown item ${item}`);
  const completed = completedDays(model);
  const days = model.days.slice(start, end + 1).map((money, i) => {
    const shop = money.shop.lines.filter(l => l.item === item), orders = money.orders.lines.filter(l => l.item === item);
    return { day: completed[start + i].displayDay, units: shop.reduce((n, l) => n + l.count, 0), copper: shop.reduce((n, l) => n + l.copper, 0), dispatched: orders.reduce((n, l) => n + l.count, 0), dispatchCopper: orders.reduce((n, l) => n + l.copper, 0) };
  });
  return { item, name: model.ledger.name(item), category: (model.ledger.categories.get(item)?.toLowerCase() ?? null) as SourceKey | null, from, to, days,
    flaggedDays: model.flags.slice(start, end + 1).flatMap((flags, i) => flags.flatMap(flag => flag.item === item && flag.stream !== 'purchasing' ? [{ day: completed[start + i].displayDay, stream: flag.stream, kind: flag.kind }] : [])),
    lastSoldDay: completed.filter((_, i) => model.days[i].shop.lines.some(l => l.item === item && l.count > 0)).at(-1)?.displayDay ?? null,
  };
}
