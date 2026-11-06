// Pure daily checks; quests never enter the streams or their income baselines.
import type { DayMoney, MoneyLine } from './ledger';

export type FlagSettings = {
  incomeFlags: boolean;
  purchaseFlags: boolean;
  windowDays: number;
  dropRatio: number;
  riseRatio: number;
  moneyDropShare: number;
  purchaseShopShare: number;
  zeroRunDays: number;
};
export const DEFAULT_FLAG_SETTINGS: FlagSettings = {
  incomeFlags: true, purchaseFlags: true,
  windowDays: 3, dropRatio: 0.5, riseRatio: 2, moneyDropShare: 0.1, purchaseShopShare: 0.075, zeroRunDays: 3,
};
export type FlagStream = 'shop' | 'orders' | 'purchasing';
export type FlagKind = 'drop' | 'stopped' | 'money-drop' | 'rise' | 'money-rise';
export type Flag = {
  stream: FlagStream; item: string; kind: FlagKind;
  zeroDay?: number;
  today: number; usual: number;
  copper: number | null; usualCopper: number | null;
  impact: number | null;
};
export type StreamAmount = { count: number; copper: number | null };
const ABSENT: StreamAmount = { count: 0, copper: 0 };
const STREAMS: FlagStream[] = ['shop', 'orders', 'purchasing'];

export function streamAmounts(day: DayMoney, stream: FlagStream): Map<string, StreamAmount> {
  const result = new Map<string, StreamAmount>();
  const add = (line: Omit<MoneyLine, 'copper'> & { copper: number | null }) => {
    const prev = result.get(line.item) ?? ABSENT;
    result.set(line.item, {
      count: prev.count + line.count,
      copper: prev.copper === null || line.copper === null ? null : prev.copper + line.copper,
    });
  };
  for (const line of day[stream].lines) add(line);
  if (stream === 'purchasing') for (const line of day.purchasing.unpriced) add({ ...line, copper: null });
  return result;
}
function median(values: number[]): number {
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

// Completed, contiguous days only: index i is save day i.
export function dayFlags(days: readonly DayMoney[], index: number, settings: FlagSettings = DEFAULT_FLAG_SETTINGS): Flag[] {
  const { windowDays: w, zeroRunDays, dropRatio, riseRatio, moneyDropShare, purchaseShopShare } = settings;
  if (index < w) return [];
  const usualEarnings = median(days.slice(index - w, index).map(d => d.shop.total + d.orders.total));
  const usualShop = median(days.slice(index - w, index).map(d => d.shop.total));
  const flags: Flag[] = [];
  for (const stream of STREAMS) {
    if (stream === 'purchasing' ? !settings.purchaseFlags : !settings.incomeFlags) continue;
    // Cache earlier days lazily: zero runs can reach back beyond the current window.
    const cache = new Map<number, Map<string, StreamAmount>>();
    const at = (i: number) => {
      let value = cache.get(i);
      if (!value) { value = streamAmounts(days[i], stream); cache.set(i, value); }
      return value;
    };
    const amount = (i: number, item: string) => at(i).get(item) ?? ABSENT;
    const usualAt = (end: number, item: string): StreamAmount => {
      const values = Array.from({ length: w }, (_, j) => amount(end - w + j, item));
      return {
        count: median(values.map(v => v.count)),
        copper: values.some(v => v.copper === null) ? null : median(values.map(v => v.copper as number)),
      };
    };
    const items = new Set<string>();
    // A stopped item has no lines; look back far enough to still see it on its last zero-run day.
    for (let i = Math.max(0, index - Math.max(w, zeroRunDays)); i <= index; i++) for (const item of at(i).keys()) items.add(item);
    for (const item of items) {
      const today = amount(index, item);
      let usual = usualAt(index, item);
      let kind: FlagKind;
      let zeroDay: number | undefined;
      if (stream !== 'purchasing') {
        if (today.count === 0 && today.copper === 0) {
          let start = index;
          while (start > 0 && amount(start - 1, item).count === 0) start--;
          zeroDay = index - start + 1;
          if (zeroDay > zeroRunDays || start < w) continue;
          usual = usualAt(start, item);
          if (usual.count <= 0) continue;
          kind = 'stopped';
        } else if (usual.count > 0 && today.count <= dropRatio * usual.count) kind = 'drop';
        else if (usual.copper! - today.copper! >= moneyDropShare * usualEarnings) kind = 'money-drop';
        else continue;
      } else {
        if (usual.count > 0 && today.count >= riseRatio * usual.count) kind = 'rise';
        else if (today.copper !== null && usual.copper !== null && usualShop > 0
          && today.copper - usual.copper > 0
          && today.copper - usual.copper >= purchaseShopShare * usualShop) kind = 'money-rise';
        else continue;
      }
      const impact = today.copper === null || usual.copper === null ? null
        : stream === 'purchasing' ? -(today.copper - usual.copper) : today.copper - usual.copper;
      flags.push({ stream, item, kind, ...(zeroDay === undefined ? {} : { zeroDay }),
        today: today.count, usual: usual.count, copper: today.copper, usualCopper: usual.copper, impact });
    }
  }
  return flags.sort((a, b) => {
    if (a.impact === null && b.impact !== null) return 1;
    if (a.impact !== null && b.impact === null) return -1;
    return (a.impact ?? 0) - (b.impact ?? 0) || STREAMS.indexOf(a.stream) - STREAMS.indexOf(b.stream)
      || (a.item < b.item ? -1 : a.item > b.item ? 1 : 0);
  });
}
