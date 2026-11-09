import type { SourceKey } from '../shared/api';
export type DayStream = 'shop' | 'orders' | 'purchasing' | 'minted' | 'melted';
export type ShopFilter = Exclude<SourceKey, 'orders'> | 'all';
export type DaySelection = { stream: DayStream; category: ShopFilter; item: string | null };
export const DEFAULT_SELECTION: DaySelection = { stream: 'shop', category: 'all', item: null };
export type Range = { last: number } | { from: number; to: number };
export type Route = { page: 'today'; day: number | null; items: DaySelection } | { page: 'history'; range: Range } | { page: 'items'; range: Range; item: string | null };
const positive = (value: string | null): number | null => value !== null && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
function parseRange(query: URLSearchParams): Range {
  if (['last', 'from', 'to'].some(key => query.getAll(key).length > 1)) return { last: 7 };
  const last = positive(query.get('last'));
  const from = positive(query.get('from')), to = positive(query.get('to'));
  if (query.has('last')) return last && !query.has('from') && !query.has('to') ? { last } : { last: 7 };
  return from && to && from <= to ? { from, to } : { last: 7 };
}
export function parseRoute(hash: string): Route {
  const fallback: Route = { page: 'today', day: null, items: DEFAULT_SELECTION };
  const match = /^#\/(today(?:\/[^/?#]+)?|history|items)(?:\?([^#]*))?$/.exec(hash);
  if (!match) return fallback;
  const [page, day] = match[1].split('/');
  const query = new URLSearchParams(match[2]);
  if (page === 'today') {
    const single = (key: string) => query.getAll(key).length === 1 ? query.get(key) : null;
    const value = single('items');
    const stream: DayStream = value === 'orders' || value === 'purchasing' || value === 'minted' || value === 'melted' ? value : 'shop';
    const cat = single('cat');
    const category: ShopFilter = stream === 'shop' && ['sundries', 'potion', 'beverage', 'jewelry', 'relic', 'uncategorized'].includes(cat ?? '') ? cat as ShopFilter : 'all';
    return { page, day: day === undefined ? null : positive(day), items: { stream, category, item: single('item') || null } };
  }
  const range = parseRange(query);
  return page === 'history' ? { page, range } : { page: 'items', range, item: query.get('item') || null };
}
export function routeHash(route: Route): string {
  if (route.page === 'today') {
    const query = new URLSearchParams();
    if (route.items.stream !== 'shop') query.set('items', route.items.stream);
    if (route.items.stream === 'shop' && route.items.category !== 'all') query.set('cat', route.items.category);
    if (route.items.item) query.set('item', route.items.item);
    return `#/today${route.day === null ? '' : `/${route.day}`}${query.size ? `?${query}` : ''}`;
  }
  const query = new URLSearchParams('last' in route.range ? { last: String(route.range.last) } : { from: String(route.range.from), to: String(route.range.to) });
  if (route.page === 'items' && route.item) query.set('item', route.item);
  return `#/${route.page}?${query}`;
}
export function rangeDays(range: Range, latestDay: number): { from: number; to: number } | null {
  // No completed days: callers must show an empty state instead of requesting a range.
  if (latestDay <= 0) return null;
  const clamp = (n: number) => Math.max(1, Math.min(latestDay, n));
  return 'last' in range ? { from: clamp(latestDay - range.last + 1), to: latestDay } : { from: clamp(range.from), to: clamp(range.to) };
}
