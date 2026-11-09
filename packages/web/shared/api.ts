import type { Flag, FlagKind, FlagSettings } from '@af-ledger/core';

export type SourceKey = 'sundries' | 'potion' | 'beverage' | 'jewelry' | 'relic' | 'uncategorized' | 'orders';
export type Totals = { shop: number; quests: number; minted: number; melted: number; beforeQuests: number; dailySummaryProfit: number; profit: number; questCount: number };
export type StripDay = { day: number; quests: number; profit: number; questCount: number; flagCount: number };
export type MetaResponse = {
  // `file` is the save's file name only and `version` a hash: full paths hold the user's name. (Error replies can
  // still name paths. The site is for this PC only: web.host is localhost, and the Host check stops rebound pages.)
  saveName: string; file: string; savedAt: string; version: string; stale: boolean;
  firstDay: number; latestDay: number; partialDay: number | null; questBonusPct: number;
  settings: FlagSettings; flagDefaults: FlagSettings; iconItems: string[]; days: StripDay[];          // all completed days, ascending
};
export type FlagView = Flag & { name: string; day: number; category: SourceKey | null }; // category: shop items only
export type DayBonuses = {                               // the CLI's `Ledger.bonuses(day)`, keys lower-cased
  shopProfit: number | null; categories: Record<Exclude<SourceKey, 'uncategorized' | 'orders'>, number | null>;
  orderIncomePct: number;                                // current supplier rank's order pay bonus in percent (0 = none)
  questRewards: number;
};
export type DayItemLine = {
  item: string; name: string;
  category: SourceKey | null;                          // shop only; uncategorized when unknown
  units: number; copper: number | null;                // null for unpriced purchases
  previousUnits: number | null; previousCopper: number | null; // absent items are 0; no previous day is null
};
export type DayResponse = {
  items: { shop: DayItemLine[]; orders: DayItemLine[]; purchasing: DayItemLine[]; minted: DayItemLine[]; melted: DayItemLine[] };
  showCoins: boolean;
  day: number; previousDay: number | null; bonuses: DayBonuses;
  totals: Totals; previousTotals: Totals | null;
  sources: { key: SourceKey; label: string; copper: number; previous: number | null }[]; // series order; uncategorized only if non-zero on either day
  purchasing: { copper: number; previous: number | null; unpriced: { item: string; name: string; count: number }[] };
  quests: { copper: number; previous: number | null; lines: { questId: string; label: string; copper: number }[]; unpriced: { questId: string; missing: string[] }[] };
  flags: FlagView[]; notices: string[];
};
export type HistoryResponse = {
  from: number; to: number; showCoins: boolean;
  // Profit includes Quest Rewards + Coins Minted − Coins Melted, as in the game's Ledger tab.
  days: { day: number; sources: Record<SourceKey, number>; purchasing: number; quests: number; minted: number; melted: number; profit: number }[];
  allDays: { day: number; profit: number }[];        // every completed day, for the heatmap
  events: { day: number; kind: 'shop-profit' | 'bonus' | 'order-income' | 'first-order' | 'first-sale' | 'stopped'; text: string; item?: string }[];
};
export type ItemsResponse = {
  from: number; to: number; shopTotal: number;
  categories: { key: SourceKey; copper: number }[];
  items: { item: string; name: string; category: SourceKey; units: number; copper: number }[];   // copper desc
  movers: { item: string; name: string; firstShare: number; secondShare: number; firstPerDay: number; secondPerDay: number }[]; // by perDay change (second − first), ascending
};
export type ItemResponse = {
  item: string; name: string; category: SourceKey | null; from: number; to: number;
  days: { day: number; units: number; copper: number; dispatched: number; dispatchCopper: number }[];
  flaggedDays: { day: number; stream: 'shop' | 'orders'; kind: FlagKind }[]; lastSoldDay: number | null;
};
export type ApiError = { error: string };
