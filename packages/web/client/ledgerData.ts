import { ApiError, getDay, getMeta, getHistory, getItems, getItem } from './api';
import { DEFAULT_SELECTION, rangeDays, type Route } from './route';
import { defaultItem } from './economics';
import type { DayResponse, MetaResponse, HistoryResponse, ItemsResponse, ItemResponse } from '../shared/api';
export type LedgerData = { meta: MetaResponse; day: DayResponse | null; history: HistoryResponse | null; items: ItemsResponse | null; item: ItemResponse | null; itemError: string | null };

// Cache key for the page data: the route without the Today item selection (filtered in the browser)
// or the Items page's item (fetched separately below).
export const dataRoute = (route: Route): Route =>
  route.page === 'items' ? { ...route, item: null } : route.page === 'today' ? { ...route, items: DEFAULT_SELECTION } : route;

// Cache only the active page/range. Item selection reuses it; navigation and reload
// refresh metadata. Never cache an aborted request or an item-detail failure.
export function createLedgerLoader() {
  let cached: { key: string; data: LedgerData } | null = null;
  return async (route: Route, signal: AbortSignal, revision: number): Promise<LedgerData> => {
    const key = JSON.stringify([dataRoute(route), revision]);
    let data: LedgerData;
    if (cached?.key === key) data = { ...cached.data, item: null, itemError: null };
    else {
      const meta = await getMeta(signal);
      data = { meta, day: null, history: null, items: null, item: null, itemError: null };
      const range = route.page === 'today' ? null : rangeDays(route.range, meta.latestDay);
      if (route.page === 'today' && meta.days.length) data.day = await getDay(route.day ?? meta.latestDay, signal);
      if (range && route.page === 'history') data.history = await getHistory(range.from, range.to, signal);
      if (range && route.page === 'items') data.items = await getItems(range.from, range.to, signal);
      if (!signal.aborted) cached = { key, data: { ...data } };
    }
    if (route.page === 'items' && data.items) {
      const selected = route.item ?? defaultItem(data.items);
      if (selected) {
        try { data.item = await getItem(selected, data.items.from, data.items.to, signal); }
        catch (error) {
          if (!(error instanceof ApiError) || error.status !== 404) throw error;
          data.itemError = error.message;
        }
      }
    }
    return data;
  };
}
