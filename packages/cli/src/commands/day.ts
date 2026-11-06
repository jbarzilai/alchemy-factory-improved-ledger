import path from 'node:path';
import { exportsDir, exportSlug, outputBlocked, writePng } from '../png';
import {
  SHOP_CATEGORIES, shopByCategory,
  type DayMoney, type ExtractOptions,
} from '@af-ledger/core';
import { bar, reportUnit, delta, money, oneLine, percentage, priceText, questLabel, signed, table, type Unit } from '../format';
import { ledgerFailure, loadLedger, type Bonuses, type Ledger } from '../load';
import type { Command, IO } from '../run';

const DASH = '—';
const share = (value: number, total: number): number => total === 0 ? 0 : value / total;
const percent = (value: number): string => percentage(value * 100);
const byName = (a: { item: string }, b: { item: string }) => a.item < b.item ? -1 : a.item > b.item ? 1 : 0;

type Category = 'shop' | 'orders' | 'purchasing';
type Mover = {
  item: string; count: number; previousCount: number; price: number | null;
  copper: number | null; diff: number | null; current: boolean;
};

// Keep each income stream separate, even when the same item appears in several.
function moversFor(current: DayMoney, previous: DayMoney | null, category: Category): Mover[] {
  // Sum repeated records for one item, so the rows always add up to the category total.
  const lines = (day: DayMoney) => {
    const out = new Map<string, { count: number; copper: number | null }>();
    const add = (item: string, count: number, copper: number | null) => {
      const prev = out.get(item);
      out.set(item, prev
        ? { count: prev.count + count, copper: prev.copper === null || copper === null ? null : prev.copper + copper }
        : { count, copper });
    };
    for (const line of day[category].lines) add(line.item, line.count, line.copper);
    if (category === 'purchasing') for (const line of day.purchasing.unpriced) add(line.item, line.count, null);
    return out;
  };
  const cur = lines(current);
  const prev = previous ? lines(previous) : new Map();
  return [...new Set([...cur.keys(), ...prev.keys()])].map((item) => {
    const now = cur.get(item);
    const before = prev.get(item);
    const copper = now ? now.copper : before?.copper === null ? null : 0;
    const priorCopper = before?.copper ?? 0;
    const priced = now && now.count > 0 ? now : before;
    return {
      item, count: now?.count ?? 0, previousCount: before?.count ?? 0,
      price: priced && priced.count > 0 && priced.copper !== null ? priced.copper / priced.count : null,
      copper, diff: copper === null || before?.copper === null ? null : copper - priorCopper,
      current: now !== undefined,
    };
  });
}

function namesFor(ledger: Ledger, days: (DayMoney | null)[]): Record<string, string> {
  const entries: [string, string][] = [];
  for (const day of days) {
    if (!day) continue;
    for (const line of [...day.shop.lines, ...day.orders.lines, ...day.purchasing.lines, ...day.purchasing.unpriced]) {
      entries.push([line.item, ledger.name(line.item)]);
    }
    for (const q of [...(day.quests?.lines ?? []), ...(day.quests?.unpriced ?? [])]) {
      entries.push([q.questId, questLabel(q.questId)]);
      if ('missing' in q) for (const id of q.missing) entries.push([id, ledger.name(id)]);
    }
  }
  return Object.fromEntries(entries);
}

function notesFor(ledger: Ledger, current: DayMoney, partial: boolean, json = false): string[] {
  const name = json ? (id: string) => id : ledger.name;
  const label = json ? (id: string) => id : questLabel;
  const notes: string[] = [];
  if (current.purchasing.unpriced.length) {
    notes.push(`unpriced purchases (excluded from Expenses): ${current.purchasing.unpriced.map((l) => `${name(l.item)} ×${l.count}`).join(', ')}`);
  }
  for (const quest of current.quests?.unpriced ?? []) {
    notes.push(`quests excluded for missing quest prices: ${label(quest.questId)}: ${quest.missing.map(name).join(', ')}`);
  }
  if (current.questsSubmitted) {
    notes.push(`quest rewards use the save's current Quest Rewards bonus (${Math.round(ledger.bonus * 100)}%), as the game's own ledger does`);
  }
  const uncategorized = current.shop.lines.filter((l) => !ledger.categories.has(l.item)).map((l) => name(l.item));
  if (uncategorized.length) notes.push(`sold items with no shop category in the game data (Uncategorized): ${uncategorized.join(', ')}`);
  if (partial) notes.push('in progress: this day is incomplete');
  return notes;
}

function render(
  ledger: Ledger, day: number, partial: boolean, current: DayMoney, previous: DayMoney | null,
  notes: string[], bonuses: Bonuses, unit: Unit, top: number, color: boolean,
): string {
  const heading = (text: string) => color ? `\x1b[1m${text}\x1b[0m` : text;
  // Apply sign colour after padding, keeping visible column widths identical to plain output.
  // Green = good for profit. Lines about spending (Expenses, Purchasing, Spent more/less tables) invert the colours.
  const paint = (line: string, invert: boolean) => line.replace(/(^|\s)([+-])(?=\d)/g,
    (_, space: string, sign: string) => `${space}\x1b[${(sign === '+') !== invert ? 32 : 31}m${sign}\x1b[0m`);
  // 'auto': spending rows invert; 'profit': every number is already a profit effect; 'spend': the whole table is spending.
  const signs = (text: string, mode: 'auto' | 'profit' | 'spend' = 'auto') => color
    ? text.split('\n').map((line) => paint(line,
      mode === 'spend' || (mode === 'auto' && /^(Expenses|Purchasing)\b/.test(line)))).join('\n') : text;
  const sections: string[] = [
    `${heading(`${ledger.snapshot.saveName} — Day ${day}${partial ? ' (in progress)' : ''}`)}\n` +
    `${ledger.save.file}\nSaved: ${ledger.snapshot.savedAt.toLocaleString()}`,
  ];
  const pct = (value: number | null) => value === null ? DASH : `${value}%`;
  sections.push(`${heading('Bonuses')}\n${table([
    ['Shop Profit', pct(bonuses.shopProfit)],
    ...SHOP_CATEGORIES.map((category) => [`${category} Profit`, pct(bonuses.categories[category])]),
    ['Quest Rewards', `${pct(bonuses.questRewards)} (current)`],
  ], ['l', 'l'])}`);
  // The larger of today's and yesterday's Earnings, so an in-progress day doesn't drop to copper.
  const amountUnit = reportUnit(Math.max(Math.abs(current.earnings), Math.abs(previous?.earnings ?? 0)), unit);
  const totals = [
    ['Earnings', current.earnings, previous?.earnings ?? null],
    ['Expenses', current.expenses, previous?.expenses ?? null],
    ['Profit', current.net, previous?.net ?? null],
  ] as const;
  sections.push(`${heading('Bottom line')}\n${signs(table([
    ['', 'Amount', 'Previous', 'Change', 'Change %'],
    ...totals.map(([name, cur, prev]) => {
      const d = delta(cur, prev);
      return [name, money(cur, amountUnit), prev === null ? DASH : money(prev, amountUnit),
        d.diff === null ? DASH : signed(d.diff, (v) => money(v, amountUnit)),
        d.pct === null ? DASH : signed(d.pct, percentage)];
    }),
  ], ['l', 'r', 'r', 'r', 'r']))}`);

  const categories = [
    ['Shop', current.shop.total, previous?.shop.total ?? null, current.earnings],
    ['Orders', current.orders.total, previous?.orders.total ?? null, current.earnings],
    ['Quests', current.quests?.total ?? 0, previous ? previous.quests?.total ?? 0 : null, current.earnings],
  ] as const;
  sections.push(`${heading('Earnings by category')}\n${signs(table([
    ['', 'Amount', 'Change', 'Share of Earnings', ''],
    ...categories.map(([name, value, prev, total]) => [name, money(value, amountUnit),
      prev === null ? DASH : signed(value - prev, (v) => money(v, amountUnit)),
      percent(share(value, total)), bar(share(value, total))]),
  ], ['l', 'r', 'r', 'r', 'l']))}`);
  const shop = shopByCategory(current.shop.lines, ledger.categories);
  const previousShop = previous ? shopByCategory(previous.shop.lines, ledger.categories) : new Map<string, number>();
  const shopNames = [...new Set([...shop.keys(), ...previousShop.keys()])]
    .sort((a, b) => (shop.get(b) ?? 0) - (shop.get(a) ?? 0) || byName({ item: a }, { item: b }));
  sections.push(`${heading('Shop by category')}\n${signs(table([
    ['', 'Amount', 'Change', 'Share of Shop', ''],
    ...shopNames.map((name) => {
      const value = shop.get(name) ?? 0;
      return [name, money(value, amountUnit),
        previous ? signed(value - (previousShop.get(name) ?? 0), (v) => money(v, amountUnit)) : DASH,
        percent(share(value, current.shop.total)), bar(share(value, current.shop.total))];
    }),
  ], ['l', 'r', 'r', 'r', 'l']), 'profit')}`);

  const itemCategories = [['shop', 'Shop'], ['orders', 'Orders'], ['purchasing', 'Purchasing']] as const;
  const itemRows = itemCategories.map(([category]) => moversFor(current, previous, category));
  for (const [index, [category, title]] of itemCategories.entries()) {
    const items = itemRows[index];
    const limit = category === 'purchasing' ? undefined : top;
    const total = current[category].total;
    const diff = previous ? total - previous[category].total : null;
    const tables: string[] = [];
    const movers = (label: string, rows: Mover[]) => {
      if (rows.length === 0) {
        tables.push(`${heading(label)}\n(none)`);
        return;
      }
      tables.push(`${heading(label)}\n${signs(table([
        ['Item', 'Count', 'Unit price', 'Value', 'Change'],
        ...rows.map((l) => [ledger.name(l.item), previous ? `${l.previousCount.toLocaleString('en-US')} → ${l.count.toLocaleString('en-US')}` : l.count.toLocaleString('en-US'),
          l.price === null ? DASH : priceText(l.price, unit), l.copper === null ? DASH : money(l.copper, amountUnit),
          !previous || l.diff === null ? DASH : signed(l.diff, (v) => money(v, amountUnit))]),
      ], ['l', 'r', 'r', 'r', 'r']), category === 'purchasing' ? 'spend' : 'auto')}`);
    };
    if (previous) {
      movers(category === 'purchasing' ? 'Spent more' : 'Top upward movers', items.filter((l) => l.diff !== null && l.diff > 0)
        .sort((a, b) => b.diff! - a.diff! || byName(a, b)).slice(0, limit));
      movers(category === 'purchasing' ? 'Spent less' : 'Top downward movers', items.filter((l) => l.diff !== null && l.diff < 0)
        .sort((a, b) => a.diff! - b.diff! || byName(a, b)).slice(0, limit));
    } else {
      movers('Top items', items.filter((l) => l.current && l.copper !== null)
        .sort((a, b) => b.copper! - a.copper! || byName(a, b)).slice(0, limit));
    }
    const unpriced = items.filter((l) => l.copper === null);
    if (unpriced.length) movers('Unpriced purchases', unpriced.sort(byName));
    sections.push(`${heading(`${title} — ${money(total, amountUnit)}${diff === null ? '' : ` (${signed(diff, (v) => money(v, amountUnit))})`}`)}\n` + tables.join('\n\n'));
  }
  const questDays = previous ? [[day - 1, previous], [day, current]] as const : [[day, current]] as const;
  sections.push(`${heading('Quests')}\n` + questDays.map(([n, m]) => {
    const rows = [
      ...(m.quests?.lines ?? []).map((q) => `${questLabel(q.questId)} ${money(q.copper, amountUnit)}`),
      ...(m.quests?.unpriced ?? []).map((q) => `${questLabel(q.questId)} excluded: missing quest prices for ${q.missing.map(ledger.name).join(', ')}`),
    ];
    return `Day ${n}: ${rows.join('; ') || 'none'}`;
  }).join('\n'));
  if (notes.length) sections.push(`${heading('Notes')}\n${notes.map((note) => `- ${note}`).join('\n')}`);
  return sections.join('\n\n') + '\n';
}

// Internal injection seam: tests can exercise real extraction retries without a CLI flag.
export function createDayCommand(extract?: ExtractOptions): Command {
  return {
    positionals: true,
    options: {
      save: { type: 'string' }, unit: { type: 'string' }, top: { type: 'string' },
      json: { type: 'boolean' }, partial: { type: 'boolean' },
      png: { type: 'boolean' }, output: { type: 'string' },
    },
    async run({ values, positionals }, io: IO) {
      const usage = (message: string) => { io.err(`af-ledger day: ${oneLine(message)}\n`); return 2; };
      if (values.output !== undefined && !values.png) return usage('--output requires --png');
      if (values.png && values.json) return usage('--png cannot be combined with --json');
      const unit = values.unit ?? 'mixed';
      if (!['mixed', 'gold', 'silver', 'copper'].includes(String(unit))) {
        return usage('--unit must be mixed, gold, silver or copper');
      }
      const top = values.top === undefined ? 10 : Number(values.top);
      if (values.top !== undefined && !/^\d+$/.test(String(values.top)) || !Number.isSafeInteger(top) || top < 1) {
        return usage('--top must be a positive integer');
      }
      let ledger: Ledger;
      try {
        ledger = await loadLedger({ save: typeof values.save === 'string' ? values.save : undefined, env: io.env, extract });
      } catch (e) {
        return ledgerFailure('day', e, io);
      }
      const latest = ledger.snapshot.currentSaveDay;
      if (!positionals.length && !values.partial && !ledger.snapshot.days.some((d) => d.complete)) {
        io.err('af-ledger day: no completed days yet; use --partial for today\n');
        return 1;
      }
      const n = positionals.length ? Number(positionals[0]) : latest + (values.partial ? 1 : 0);
      const range = `valid range: 1..${latest} (completed), or ${latest + 1} with --partial`;
      if (positionals.length > 1 || positionals.length === 1 && !/^\d+$/.test(positionals[0]) ||
          !Number.isSafeInteger(n) || n < 1 || n > latest + 1 || n === latest + 1 && !values.partial) {
        return usage(`invalid day; ${range}`);
      }
      const day = ledger.snapshot.days.find((d) => d.displayDay === n)!;
      const partial = !day.complete;
      const file = values.png ? path.resolve(typeof values.output === 'string' ? values.output :
        path.join(exportsDir(io.env), `${exportSlug(ledger.snapshot.saveName)}-day-${n}${partial ? '-partial' : ''}.png`)) : null;
      if (file) {
        const blocked = outputBlocked(file, ledger.save.file, io.env);
        if (blocked) return usage(blocked);
      }
      const current = ledger.money(day);
      const bonuses = ledger.bonuses(day);
      const previous = n === 1 ? null : ledger.money(ledger.snapshot.days.find((d) => d.displayDay === n - 1)!);
      const notes = notesFor(ledger, current, partial, Boolean(values.json));
      const name = values.json ? (id: string) => id : ledger.name;
      const label = values.json ? (id: string) => id : questLabel;
      if (previous) {
        const prefix = `Day ${n - 1} (comparison): `;
        if (previous.purchasing.unpriced.length) {
          notes.push(`${prefix}unpriced purchases (excluded from Expenses): ${previous.purchasing.unpriced.map((l) => `${name(l.item)} ×${l.count}`).join(', ')}`);
        }
        for (const quest of previous.quests?.unpriced ?? []) {
          notes.push(`${prefix}quest ${label(quest.questId)} excluded, no quest price for ${quest.missing.map(name).join(', ')}`);
        }
      }
      if (values.json) {
        io.out(JSON.stringify({
          save: { file: ledger.save.file, name: ledger.snapshot.saveName, savedAt: ledger.snapshot.savedAt },
          day: n, previousDay: n === 1 ? null : n - 1, partial, bonus: ledger.bonus, bonuses: { shopProfit: bonuses.shopProfit, categories: bonuses.categories, questRewards: bonuses.questRewards }, money: current, previous, notes,
          names: namesFor(ledger, [current, previous]),
        }) + '\n');
      } else {
        io.out(render(ledger, n, partial, current, previous, notes, bonuses, unit as Unit, top, io.color ?? false));
        if (file) {
          await writePng(render(ledger, n, partial, current, previous, notes, bonuses, unit as Unit, top, true), file);
          io.err(`wrote ${file}\n`);
        }
      }
      return 0;
    },
  };
}

export const day = createDayCommand();
