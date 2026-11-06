import type { FlagSettings } from '@af-ledger/core';
import type { MetaResponse, DayResponse, HistoryResponse, ItemsResponse, ItemResponse } from '../shared/api';
export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}
async function get<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const body = await response.json();
  if (!response.ok) throw new ApiError((body as { error: string }).error, response.status);
  return body as T;
}
export const getMeta = (signal?: AbortSignal) => get<MetaResponse>('/api/meta', signal);
export const getDay = (n: number, signal?: AbortSignal) => get<DayResponse>(`/api/day/${n}`, signal);
export const getHistory = (from: number, to: number, signal?: AbortSignal) => get<HistoryResponse>(`/api/history?from=${from}&to=${to}`, signal);
export const getItems = (from: number, to: number, signal?: AbortSignal) => get<ItemsResponse>(`/api/items?from=${from}&to=${to}`, signal);
export const getItem = (id: string, from: number, to: number, signal?: AbortSignal) => get<ItemResponse>(`/api/item/${encodeURIComponent(id)}?from=${from}&to=${to}`, signal);

export async function putFlagSettings(settings: FlagSettings): Promise<{ settings: FlagSettings }> {
  const response = await fetch('/api/settings/flags', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings),
  });
  const body = await response.json();
  if (!response.ok) throw new ApiError((body as { error: string }).error, response.status);
  return body as { settings: FlagSettings };
}
