import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { dayMoney, type DayLedger, type DayMoney, type ItemDayRecord, type QuestRecord } from '@af-ledger/core';
import { REPO } from '../../core/test/helpers/fixture';
import * as png from '../src/png';
import * as loader from '../src/load';
import { createDayCommand } from '../src/commands/day';
import { run } from '../src/run';
import { capture, makeSaveDirs } from './helpers';

vi.mock('../src/png', async (original) => ({ ...await original<typeof import('../src/png')>() }));

vi.mock('../src/load', async (original) => ({ ...await original<typeof import('../src/load')>() }));

let dirs: ReturnType<typeof makeSaveDirs>;
let ledger: loader.Ledger;
beforeAll(async () => {
  dirs = makeSaveDirs();
  ledger = await loader.loadLedger({ env: { AF_SAVE_DIR: dirs.saves } });
});
afterAll(() => dirs.cleanup());
afterEach(() => vi.restoreAllMocks());

async function invoke(args: string[], color = false) {
  const c = capture({ AF_SAVE_DIR: dirs.saves }, color);
  const code = await run(['day', ...args], c.io);
  return { code, out: c.out(), err: c.err() };
}

function parseResult(out: string): {
  save: { file: string; name: string; savedAt: string }; day: number; previousDay: number | null;
  partial: boolean; bonus: number; bonuses: loader.Bonuses; money: DayMoney; previous: DayMoney | null; notes: string[]; names: Record<string, string>;
} {
  expect(out.trim().split('\n')).toHaveLength(1);
  return JSON.parse(out);
}

function categorySection(out: string, category: string): string {
  return out.split(`${category} — `)[1].split(/\n(?:Shop — |Orders — |Purchasing — |Quests\n|Notes\n)/)[0];
}

function expectUsage(result: { code: number; out: string; err: string }) {
  expect(result.code).toBe(2);
  expect(result.out).toBe('');
  expect(result.err.trim().split('\n')).toHaveLength(1);
  expect(result.err).toMatch(/^af-ledger day:/);
}

describe('fixture daily ledger', () => {
  it('matches Day 100 and uses identical JSON and text totals', async () => {
    const text = await invoke(['100', '--unit', 'copper']);
    expect(text.code, text.err).toBe(0);
    expect(text.err).toBe('');
    expect(text.out).toMatch(/Earnings\s+1,289,241c/);
    expect(text.out).toMatch(/Expenses\s+979,800c/);
    expect(text.out).toMatch(/Profit\s+309,441c/);
    expect(text.out).toContain('Day 100');
    expect(text.out).toContain(ledger.save.file);
    expect(text.out).toContain(ledger.snapshot.saveName);
    expect(text.out).toContain(ledger.snapshot.savedAt.toLocaleString());
    expect(text.out).toMatch(/Quest Rewards\s+128% \(current\)/);
    expect(text.out).not.toContain('quest rewards use');
    expect(text.out).not.toContain('\x1b');
    const json = await invoke(['100', '--json']);
    expect(json.code, json.err).toBe(0);
    expect(json.err).toBe('');
    const data = parseResult(json.out);
    expect(data.money.earnings).toBe(1289241);
    expect(data.money.expenses).toBe(979800);
    expect(data.money.dailySummaryProfit).toBe(309441);
    expect(data.previous).toEqual(ledger.money(ledger.snapshot.days[98]));
    expect(data.previousDay).toBe(99);
    expect(data.partial).toBe(false);
    expect(data.save).toEqual({ file: ledger.save.file, name: ledger.snapshot.saveName, savedAt: ledger.snapshot.savedAt.toISOString() });
    expect(Object.keys(data).sort()).toEqual(['save', 'day', 'previousDay', 'partial', 'bonus', 'money', 'previous', 'notes', 'names', 'bonuses'].sort());
    const sections = ['Bonuses', 'Bottom line', 'Earnings by category', 'Shop by category', 'Shop —', 'Orders —', 'Purchasing —', 'Quests\n'];
    for (let i = 1; i < sections.length; i++) expect(text.out.indexOf(sections[i])).toBeGreaterThan(text.out.indexOf(sections[i - 1]));
  });

  it('includes real quests and the current skills bonus on Day 199', async () => {
    const json = await invoke(['199', '--json']);
    expect(json.code, json.err).toBe(0);
    const data = parseResult(json.out);
    expect(data.money.earnings).toBe(1261045 + 5136000 + 5849000 + data.money.quests!.total);
    expect(Math.abs(data.money.quests!.total - 595529)).toBeLessThanOrEqual(5);
    expect(data.bonus).toBeCloseTo(1.28);
    expect(data.bonuses).toEqual({
      shopProfit: 120, categories: { Sundries: 180, Potion: 180, Beverage: 140, Relic: 140, Jewelry: 124 }, questRewards: 128,
    });
    // Day 97 is when Shop Profit went 110% → 120%; its sales may predate the change, so categories are unknown.
    const changeDay = parseResult((await invoke(['97', '--json'])).out).bonuses;
    expect(changeDay.shopProfit).toBe(120);
    expect(Object.values(changeDay.categories).every((v) => v === null)).toBe(true);
    const note = "quest rewards use the save's current Quest Rewards bonus (128%), as the game's own ledger does";
    expect(data.notes).toContain(note);
    const text = await invoke(['199', '--unit', 'copper']);
    expect(text.code, text.err).toBe(0);
    expect(text.out).toMatch(/Quests\s+595,525c/);
    expect(text.out).toContain(note);
    const mixed = await invoke(['199']);
    for (const [label, pct] of [['Shop', 120], ['Sundries', 180], ['Potion', 180], ['Beverage', 140], ['Relic', 140], ['Jewelry', 124]]) {
      expect(mixed.out).toMatch(new RegExp(`${label} Profit\\s+${pct}%`));
    }
    expect(mixed.out).toMatch(/Quest Rewards\s+128% \(current\)/);
    expect(mixed.out).toMatch(/Earnings\s+128.42g/);
  });

  // Day 5 (9,305c) is silver because Day 4 earned 14,027c; Day 2 (3,233c after 1,150c) stays copper.
  it.each([['10', '10.61s'], ['5', '9.31s'], ['2', '3,233c']])('scales mixed earnings on Day %s', async (day, amount) => {
    const text = await invoke([day]);
    expect(text.code, text.err).toBe(0);
    expect(text.out).toMatch(new RegExp(`Earnings\\s+${amount.replace('.', '\\.')}\\s`));
  });

  it('uses in-game names and the new earnings and shop category layout', async () => {
    const text = await invoke(['199', '--unit', 'copper']);
    expect(text.code, text.err).toBe(0);
    expect(text.out).toContain('Fertile Catalyst');
    expect(text.out).not.toContain('Catalyst2');
    expect(text.out).not.toMatch(/Why profit changed|Δ|×1\.28/);
    const earnings = text.out.split('Earnings by category\n')[1].split('\n\n')[0];
    expect(earnings).toMatch(/Amount\s+Change\s+Share of Earnings/);
    expect(earnings).not.toContain('Purchasing');
    expect(earnings.match(/^(Shop|Orders|Quests)\s/gm)).toHaveLength(3);
    expect(text.out.split('Shop by category\n')[1]).toMatch(/Amount\s+Change\s+Share of Shop/);
  });

  it('keeps raw IDs in JSON and supplies names for every current and previous ID', async () => {
    const data = parseResult((await invoke(['199', '--json'])).out);
    expect(data.money.orders.lines.some((line) => line.item === 'Catalyst2')).toBe(true);
    expect(data.names.Catalyst2).toBe('Fertile Catalyst');
    for (const day of [data.money, data.previous!]) {
      for (const line of [...day.shop.lines, ...day.orders.lines, ...day.purchasing.lines, ...day.purchasing.unpriced]) {
        expect(data.names[line.item]).toBe(ledger.name(line.item));
      }
      for (const q of [...day.quests!.lines, ...day.quests!.unpriced]) expect(data.names[q.questId]).toBeTruthy();
      for (const q of day.quests!.unpriced) for (const id of q.missing) expect(data.names[id]).toBe(ledger.name(id));
    }
    expect(ledger.name('CashRegister')).toBe('CashRegister');
  });

  it('defaults to the latest completed UI day', async () => {
    const result = await invoke(['--json']);
    expect(result.code, result.err).toBe(0);
    const explicit = await invoke([String(ledger.snapshot.currentSaveDay), '--json']);
    expect(result.out).toBe(explicit.out);
    expect(parseResult(result.out).day).toBe(ledger.snapshot.currentSaveDay);
  });

  it('has no baseline or change sections on Day 1', async () => {
    const text = await invoke(['1']);
    expect(text.code, text.err).toBe(0);
    expect(text.out).toMatch(/Earnings\s+\S+\s+—\s+—\s+—/);
    expect(text.out).toMatch(/Expenses\s+\S+\s+—\s+—\s+—/);
    expect(text.out).toMatch(/Profit\s+\S+\s+—\s+—\s+—/);
    expect(text.out).not.toMatch(/Why profit changed|Top upward movers|Top downward movers|Spent more|Spent less/);
    expect(text.out.match(/^Top items$/gm)).toHaveLength(3);
    const earnings = text.out.split('Earnings by category\n')[1].split('\n\n')[0];
    for (const row of earnings.split('\n').slice(1)) expect(row).toMatch(/^\w+\s+\S+\s+—\s/);
    const shop = text.out.split('Shop by category\n')[1].split('\n\n')[0];
    for (const row of shop.split('\n').slice(1)) expect(row).toMatch(/^\w+\s+\S+\s+—\s/);
    const json = parseResult((await invoke(['1', '--json'])).out);
    expect(json.previousDay).toBeNull();
    expect(json.previous).toBeNull();
  });

  it.each(['0', '-3', '-12', '1.5', 'abc', 'NaN', 'Infinity', '1e2', ''])('rejects invalid day %j with the valid range', async (day) => {
    const result = await invoke([day]);
    expectUsage(result);
    expect(result.err).toContain(`1..${ledger.snapshot.currentSaveDay}`);
  });

  it('rejects days beyond the in-progress day', async () => {
    for (const extra of [[], ['--partial']]) {
      const result = await invoke([String(ledger.snapshot.currentSaveDay + 2), ...extra]);
      expectUsage(result);
      expect(result.err).toContain(`1..${ledger.snapshot.currentSaveDay}`);
    }
  });

  it('allows only an explicit --partial for the in-progress day', async () => {
    const day = String(ledger.snapshot.currentSaveDay + 1);
    const invalid = await invoke([day]);
    expectUsage(invalid);
    expect(invalid.err).toContain('--partial');
    expect(invalid.err).toContain(`1..${ledger.snapshot.currentSaveDay}`);
    const text = await invoke([day, '--partial']);
    expect(text.code, text.err).toBe(0);
    expect(text.out).toContain(`Day ${day} (in progress)`);
    expect(text.out).toContain('in progress: this day is incomplete');
    const data = parseResult((await invoke([day, '--partial', '--json'])).out);
    expect(data.partial).toBe(true);
    expect(data.previousDay).toBe(ledger.snapshot.currentSaveDay);
    expect(data.money).toEqual(ledger.money(ledger.snapshot.days.at(-1)!));
    expect(data.bonuses.shopProfit).toBe(120);
    expect(text.out).toMatch(/Shop Profit\s+120%/);
    const completed = parseResult((await invoke(['100', '--partial', '--json'])).out);
    expect(completed.partial).toBe(false);
    expect(completed.notes.join(' ')).not.toContain('in progress');
  });

  it.each([
    ['--unit', 'bogus'], ['--top', '0'], ['--top', '-3'], ['--top', '1.5'],
    ['--top', 'abc'], ['--top', 'Infinity'], ['--top', '9007199254740992'], ['--top', ''],
    ['--unknown'], ['--unit'], ['100', '101'],
  ])('rejects invalid flags or extra arguments %j', async (...args) => {
    expectUsage(await invoke(args));
  });

  it('accepts options before N and respects --top', async () => {
    const result = await invoke(['--unit', 'copper', '--top', '1', '100']);
    expect(result.code, result.err).toBe(0);
    expect(result.out).toMatch(/Earnings\s+1,289,241c/);
    const section = categorySection(result.out, 'Shop').split('Top upward movers\n')[1].split('\n\n')[0];
    expect(section.split('\n')).toHaveLength(2);
  });

  it.each([['gold', '12.89g'], ['silver', '1,289.24s']])('supports forced %s units', async (unit, earnings) => {
    const result = await invoke(['100', '--unit', unit]);
    expect(result.code, result.err).toBe(0);
    expect(result.out).toContain(earnings);
  });

  it('reports negative day ranges even with flags on either side', async () => {
    const result = await invoke(['--unit', 'copper', '-3', '--top', '1']);
    expectUsage(result);
    expect(result.err).toContain(`1..${ledger.snapshot.currentSaveDay}`);
  });

  it('resolves explicit file/folder overrides over AF_SAVE_DIR', async () => {
    for (const save of [dirs.saves, ledger.save.file]) {
      const c = capture({ AF_SAVE_DIR: dirs.empty });
      expect(await run(['day', '100', '--save', save, '--json'], c.io), c.err()).toBe(0);
      expect(parseResult(c.out()).save.file).toBe(ledger.save.file);
    }
  });

  it('reports SaveNotFoundError in one line without stdout or a stack', async () => {
    const c = capture({ AF_SAVE_DIR: dirs.empty });
    expect(await run(['day'], c.io)).toBe(1);
    expect(c.out()).toBe('');
    expect(c.err()).toMatch(/^af-ledger day: no .sav files found/);
    expect(c.err()).toContain(dirs.empty);
    expect(c.err().trim().split('\n')).toHaveLength(1);
    const result = await invoke(['--save', path.join(dirs.empty, 'missing\nfile.sav')]);
    expect(result.code).toBe(1);
    expect(result.err).toMatch(/^af-ledger day: save not found or unreadable:/);
    expect(result.err.trim().split('\n')).toHaveLength(1);
    expect(result.out).toBe('');
  });

  it('maps real incomplete extraction with retries: 0 to the friendly message', async () => {
    const truncated = readFileSync(ledger.save.file).subarray(0, 900);
    const readFile = vi.fn(async () => truncated);
    const c = capture({ AF_SAVE_DIR: dirs.saves });
    const command = createDayCommand({ readFile, retries: 0 });
    expect(await command.run({ values: {}, positionals: ['100'] }, c.io)).toBe(1);
    expect(readFile).toHaveBeenCalledExactlyOnceWith(ledger.save.file);
    expect(c.out()).toBe('');
    expect(c.err()).toBe('af-ledger day: the save is being written by the game; try again in a moment\n');
  });

  it('colours only headings and signs without changing padding, and never JSON', async () => {
    const plain = await invoke(['100', '--unit', 'copper']);
    const color = await invoke(['100', '--unit', 'copper'], true);
    expect(color.out).toContain('\x1b[1mBottom line\x1b[0m');
    expect(color.out).toMatch(/\x1b\[(31|32)m[+-]\x1b\[0m\d/);
    expect(color.out.replace(/\x1b\[[0-9;]*m/g, '')).toBe(plain.out);
    const json = await invoke(['100', '--json'], true);
    expect(json.out).not.toContain('\x1b');
    parseResult(json.out);
  });
});

const item = (name: string, sold: number, income: number, dispatched = 0, orders = 0, purchased = 0): ItemDayRecord => ({
  item: name, soldCount: sold, soldValue: { gold: 0, silver: 0, copper: income },
  dispatchedCount: dispatched, dispatchValue: { gold: 0, silver: 0, copper: orders },
  restockCount: purchased, producedCount: 0, consumedCount: 0,
});
const quest: QuestRecord = {
  questId: 'UnknownQuest', isMain: false, isRandom: true, acceptDay: 0, submitDay: 1, goldFactor: 1.3,
  awardGold: { gold: 0, silver: 0, copper: 0 }, requires: [{ item: 'MissingBase', count: 1 }],
};

function synthetic(days: DayLedger[], prices = new Map<string, number>(), categories = new Map<string, import('@af-ledger/core').ShopCategory>()) {
  const fake: loader.Ledger = {
    ...ledger, categories,
    snapshot: { ...ledger.snapshot, currentSaveDay: days.filter((d) => d.complete).length, days },
    money: (day) => dayMoney(day, prices, { questPrices: new Map(), bonus: ledger.bonus }),
  };
  vi.spyOn(loader, 'loadLedger').mockResolvedValue(fake);
  return fake;
}
const dayRecord = (day: number, items: ItemDayRecord[], questsSubmitted: QuestRecord[] = []): DayLedger => ({
  saveDay: day - 1, displayDay: day, complete: true, profitCoef: 1, items, questsSubmitted,
});

describe('daily presentation edge cases', () => {
  it('defaults --partial to today, including a save with no completed days', async () => {
    const partial = { ...dayRecord(1, []), complete: false };
    synthetic([partial]);
    const plain = await invoke([]);
    expect(plain.code).toBe(1);
    expect(plain.out).toBe('');
    expect(plain.err).toBe('af-ledger day: no completed days yet; use --partial for today\n');
    const today = await invoke(['--partial', '--json']);
    expect(today.code, today.err).toBe(0);
    expect(parseResult(today.out)).toMatchObject({ day: 1, partial: true, previous: null });
    synthetic([dayRecord(1, []), { ...dayRecord(2, []), complete: false }]);
    const next = await invoke(['--partial', '--json']);
    expect(next.code, next.err).toBe(0);
    expect(parseResult(next.out)).toMatchObject({ day: 2, partial: true, previousDay: 1 });
  });

  it('warns about excluded comparison purchases and quests in text and JSON', async () => {
    synthetic([
      dayRecord(1, [item('MissingPrice', 0, 0, 0, 0, 3)], [quest]), dayRecord(2, []),
    ]);
    const json = await invoke(['2', '--json']);
    const notes = parseResult(json.out).notes;
    expect(notes).toEqual([
      'Day 1 (comparison): unpriced purchases (excluded from Expenses): MissingPrice ×3',
      'Day 1 (comparison): quest UnknownQuest excluded, no quest price for MissingBase',
    ]);
    const text = await invoke(['2']);
    for (const note of notes) expect(text.out).toContain(note);
  });

  it('uses current earnings to choose one unit for all report amounts', async () => {
    synthetic([
      dayRecord(1, [item('A', 1, 99999)]), dayRecord(2, [item('A', 1, 101000)]),
    ]);
    const result = await invoke(['2']);
    expect(result.out).toMatch(/Earnings\s+101.00s\s+100.00s\s+\+1.00s/);
    expect(result.out).toMatch(/A\s+1 → 1\s+1.01g\s+101.00s\s+\+1.00s/);
  });

  it('chooses the unit from the larger of current and previous earnings', async () => {
    synthetic([dayRecord(1, [item('A', 1, 5_000_000)]), dayRecord(2, [item('A', 1, 0)])]);
    const result = await invoke(['2']);
    expect(result.out).toMatch(/Earnings\s+0.00g\s+50.00g\s+-50.00g/);
  });

  it('shows per-row unit prices and category counts for unpriced purchases', async () => {
    synthetic([dayRecord(1, [item('GloomSpores', 1, 460), item('Potion', 1, 2448), item('Mars', 1, 448000), item('Unknown', 0, 0, 0, 0, 7)])]);
    const result = await invoke(['1']);
    expect(result.out).toMatch(/Item\s+Count\s+Unit price\s+Value\s+Change/);
    expect(result.out).toMatch(/Gloom Spores\s+1\s+460c\s+0.46s/);
    expect(result.out).toMatch(/Unknown\s+7\s+—\s+—\s+—/);
  });

  it.each([-1, 1])('does not colour or sign rounded zero deltas (%s copper)', async (diff) => {
    synthetic([dayRecord(1, [item('A', 1, 1000000)]), dayRecord(2, [item('A', 1, 1000000 + diff)])]);
    const result = await invoke(['2', '--unit', 'gold'], true);
    expect(result.out).not.toMatch(/\x1b\[(31|32)m/);
    expect(result.out).not.toMatch(/[+-]0\.0/);
    expect(result.out).toMatch(/Earnings\s+10.00g\s+10.00g\s+0.00g\s+0.0%/);
  });

  it('lists missing data only when applicable, in both text and JSON', async () => {
    synthetic([dayRecord(1, [item('UnknownShop', 1, 100), item('MissingPrice', 0, 0, 0, 0, 3)], [quest])]);
    const result = await invoke(['1', '--json']);
    const data = parseResult(result.out);
    expect(data.money.expenses).toBe(0);
    expect(data.money.quests!.total).toBe(0);
    expect(data.notes).toHaveLength(4);
    expect(data.notes[0]).toContain('MissingPrice ×3');
    expect(data.notes[0]).toContain('excluded from Expenses');
    expect(data.notes[1]).toContain('UnknownQuest: MissingBase');
    expect(data.notes[2]).toContain("quest rewards use the save's current Quest Rewards bonus (128%)");
    expect(data.notes[3]).toContain('Uncategorized');
    const text = await invoke(['1', '--unit', 'copper']);
    for (const note of data.notes) expect(text.out).toContain(note);
    expect(text.out).toMatch(/Uncategorized\s+100c\s+—\s+100.0%/);
  });

  it('computes category contributions, per-unit values and prior-only changes', async () => {
    synthetic([
      dayRecord(1, [item('Gone', 2, 500), item('A', 1, 10)]),
      dayRecord(2, [item('A', 2, 400, 3, 600, 1), item('PurchaseOnly', 0, 0, 0, 0, 2), item('CountZero', 0, 50)]),
    ], new Map([['A', 100], ['PurchaseOnly', 100]]), new Map([
      ['A', 'Potion' as const], ['CountZero', 'Potion' as const],
    ]));
    const result = await invoke(['2', '--unit', 'copper', '--top', '10']);
    expect(result.code, result.err).toBe(0);
    expect(result.out).toMatch(/Shop\s+450c\s+-60c\s+42.9%/);
    expect(result.out).toMatch(/Orders\s+600c\s+\+600c\s+57.1%/);
    expect(categorySection(result.out, 'Purchasing')).toMatch(/^300c \(\+300c\)/);
    expect(result.out).toMatch(/Potion\s+450c\s+\+440c\s+100.0%/);
    expect(result.out.split('Shop by category\n')[1].split('\n\n')[0]).toMatch(/Uncategorized\s+0c\s+-500c\s+0.0%/);
    const shop = categorySection(result.out, 'Shop');
    expect(shop).toMatch(/A\s+1 → 2\s+200c\s+400c\s+\+390c/);
    expect(shop).toMatch(/CountZero\s+0 → 0\s+—\s+50c\s+\+50c/);
    expect(shop).toMatch(/Gone\s+2 → 0\s+250c\s+0c\s+-500c/);
    expect(shop).not.toContain('PurchaseOnly');
    const orders = categorySection(result.out, 'Orders');
    expect(orders).toMatch(/A\s+0 → 3\s+200c\s+600c\s+\+600c/);
    expect(orders).not.toContain('Gone');
    const purchases = categorySection(result.out, 'Purchasing');
    expect(purchases).toMatch(/A\s+0 → 1\s+100c\s+100c\s+\+100c/);
    expect(purchases).toMatch(/PurchaseOnly\s+0 → 2\s+100c\s+200c\s+\+200c/);
    expect(result.out).not.toContain('Notes');
  });

  it('uses one mixed unit for all amounts including small amounts and purchases', async () => {
    synthetic([dayRecord(1, [item('Big', 1, 100000), item('Small', 1, 1000), item('Cost', 0, 0, 0, 0, 1)])], new Map([['Cost', 1]]));
    const result = await invoke(['1']);
    expect(result.out).toMatch(/Earnings\s+101.00s/);
    expect(result.out).toMatch(/Expenses\s+0.00s/);
    const shop = categorySection(result.out, 'Shop');
    expect(shop).toMatch(/Big\s+1\s+1.00g\s+100.00s/);
    expect(shop).toMatch(/Small\s+1\s+1.00s\s+1.00s/);
    expect(categorySection(result.out, 'Purchasing')).toMatch(/Cost\s+1\s+1c\s+0.00s/);
  });

  it('preserves spending signs and colours on Spent more and Spent less tables', async () => {
    synthetic([
      dayRecord(1, [item('SageSeed', 0, 0, 0, 0, 1), item('Wood', 0, 0, 0, 0, 3)]),
      dayRecord(2, [item('SageSeed', 0, 0, 0, 0, 3), item('Wood', 0, 0, 0, 0, 1)]),
    ], new Map([['SageSeed', 137000], ['Wood', 100000]]));
    const text = await invoke(['2', '--unit', 'gold'], true);
    const purchases = categorySection(text.out, 'Purchasing');
    expect(purchases).toContain('(+0.74g)');
    expect(purchases).toMatch(/Sage Seeds.*\x1b\[31m\+\x1b\[0m2.74g/);
    expect(purchases).toMatch(/Logs.*\x1b\[32m-\x1b\[0m2.00g/);
  });

  it('isolates an order-only item from Shop and shows each stream for a shared item', async () => {
    synthetic([
      dayRecord(1, [item('A', 9, 900, 2, 400), item('Catalyst2', 0, 0, 1, 500)]),
      dayRecord(2, [item('A', 6, 1200, 3, 900), item('Catalyst2', 0, 0, 2, 1000)]),
    ]);
    const text = await invoke(['2', '--unit', 'copper']);
    const shop = categorySection(text.out, 'Shop');
    const orders = categorySection(text.out, 'Orders');
    expect(shop).not.toContain('Fertile Catalyst');
    expect(shop).toMatch(/A\s+9 → 6\s+200c\s+1,200c\s+\+300c/);
    expect(orders).toMatch(/A\s+2 → 3\s+300c\s+900c\s+\+500c/);
    expect(orders).toContain('Fertile Catalyst');
  });

  it('limits each up/down table independently, defaults to ten for Shop and Orders, leaves Purchasing unlimited and uses top items without a baseline', async () => {
    const increasing = Array.from({ length: 12 }, (_, i) => `Up${i}`);
    const decreasing = Array.from({ length: 12 }, (_, i) => `Down${i}`);
    const names = [...increasing, ...decreasing];
    const prev = names.map((id) => item(id, 1, 100, 1, 100, id.startsWith('Up') ? 1 : 10));
    const cur = names.map((id) => item(id, 1, id.startsWith('Up') ? 200 : 50, 1, id.startsWith('Up') ? 200 : 50, id.startsWith('Up') ? 10 : 1));
    synthetic([dayRecord(1, prev), dayRecord(2, cur)], new Map(names.map((id) => [id, 10])));
    for (const [flags, limit] of [[[], 10], [['--top', '2'], 2]] as const) {
      const text = await invoke(['2', ...flags]);
      for (const category of ['Shop', 'Orders', 'Purchasing']) {
        const section = categorySection(text.out, category);
        for (const title of category === 'Purchasing' ? ['Spent more', 'Spent less'] : ['Top upward movers', 'Top downward movers']) {
          const rows = section.split(`${title}\n`)[1].split('\n\n')[0].trim().split('\n').slice(1);
          expect(rows).toHaveLength(category === 'Purchasing' ? 12 : limit);
        }
      }
    }
    const first = await invoke(['1', '--top', '2']);
    expect(first.out).not.toMatch(/Why profit changed|Top upward movers|Top downward movers|Spent more|Spent less/);
    for (const category of ['Shop', 'Orders', 'Purchasing']) {
      const section = categorySection(first.out, category);
      expect(section.split('Top items\n')[1].trim().split('\n').slice(1)).toHaveLength(category === 'Purchasing' ? 24 : 2);
      expect(section).not.toContain(' → ');
    }
  });

  it('names all missing-price and uncategorized notes while preserving IDs in JSON', async () => {
    const missingQuest = { ...quest, questId: 'RandomBulk', requires: [{ item: 'ManaPotion', count: 1 }] };
    synthetic([
      dayRecord(1, [item('SageSeed', 0, 0, 0, 0, 2)], [missingQuest]),
      dayRecord(2, [item('Catalyst2', 1, 100), item('Wood', 0, 0, 0, 0, 3)], [missingQuest]),
    ]);
    const text = await invoke(['2', '--unit', 'copper']);
    expect(text.out).not.toMatch(/SageSeed|ManaPotion|Catalyst2|RandomBulk/);
    expect(text.out).toContain('unpriced purchases (excluded from Expenses): Logs ×3');
    expect(text.out).toContain('Day 1 (comparison): unpriced purchases (excluded from Expenses): Sage Seeds ×2');
    expect(text.out).toContain('Random quest (Bulk): Transformation Potion');
    expect(text.out).toContain('Random quest (Bulk) excluded: missing quest prices for Transformation Potion');
    expect(text.out).toContain('(Uncategorized): Fertile Catalyst');
    expect(categorySection(text.out, 'Purchasing')).toMatch(/Logs\s+0 → 3\s+—\s+—\s+—/);
    expect(categorySection(text.out, 'Purchasing')).toMatch(/Sage Seeds\s+2 → 0\s+—\s+—\s+—/);
    const json = parseResult((await invoke(['2', '--json'])).out);
    expect(json.money.purchasing.unpriced[0].item).toBe('Wood');
    expect(json.previous!.purchasing.unpriced[0].item).toBe('SageSeed');
    expect(json.names).toMatchObject({ Wood: 'Logs', SageSeed: 'Sage Seeds', ManaPotion: 'Transformation Potion', RandomBulk: 'Random quest (Bulk)' });
    expect(json.notes.join(' ')).toContain('RandomBulk: ManaPotion');
  });

  it('lists each priced quest with a label and payout for both days', async () => {
    const fixed = { ...quest, questId: 'Main7', isMain: true, isRandom: false, awardGold: { gold: 6, silver: 0, copper: 0 }, requires: [] };
    synthetic([dayRecord(1, [], [fixed]), dayRecord(2, [])]);
    const text = await invoke(['2', '--unit', 'gold']);
    expect(text.out.split('Quests\n')[1]).toContain('Day 1: Main quest 7 8.00g\nDay 2: none');
  });

  it('handles empty days and zero baselines without NaN or Infinity or spurious notes', async () => {
    synthetic([dayRecord(1, []), dayRecord(2, [])]);
    const result = await invoke(['2']);
    expect(result.code, result.err).toBe(0);
    expect(result.out).toMatch(/Earnings\s+0c\s+0c\s+0c\s+—/);
    expect(result.out).toMatch(/Shop\s+0c\s+0c\s+0.0%\s+░{20}/);
    expect(result.out).not.toMatch(/NaN|Infinity|Notes/);
  });
});

describe('day PNG export', () => {
  let temp: string;
  beforeAll(() => { temp = mkdtempSync(path.join(REPO, '.cache', 'day-png-')); });
  afterAll(() => rmSync(temp, { recursive: true, force: true }));
  const exportRun = async (args: string[]) => {
    const c = capture({ AF_SAVE_DIR: dirs.saves, AF_EXPORT_DIR: temp, NO_COLOR: '1' });
    const code = await run(['day', ...args], c.io);
    return { code, out: c.out(), err: c.err() };
  };

  it('keeps stdout identical and writes the default or explicit PNG path', async () => {
    const plain = await invoke(['100']);
    const image = await exportRun(['100', '--png']);
    expect(image.code, image.err).toBe(0);
    expect(image.out).toBe(plain.out);
    const file = path.join(temp, '1-point-oh-day-100.png');
    expect(image.err).toBe(`wrote ${file}\n`);
    expect(readFileSync(file).subarray(0, 8)).toEqual(Buffer.from('89504e470d0a1a0a', 'hex'));
    const output = path.join(temp, 'sub', 'x.png');
    const custom = await exportRun(['100', '--png', '--output', output]);
    expect(custom.code, custom.err).toBe(0);
    expect(custom.err).toBe(`wrote ${output}\n`);
    expect(readFileSync(output).subarray(0, 8)).toEqual(Buffer.from('89504e470d0a1a0a', 'hex'));
  });

  it('always sends coloured text to PNG and names partial days', async () => {
    const writer = vi.spyOn(png, 'writePng').mockResolvedValue();
    const result = await exportRun(['--partial', '--png']);
    expect(result.code, result.err).toBe(0);
    expect(result.out).not.toContain('\x1b');
    expect(writer).toHaveBeenCalledWith(expect.stringContaining('\x1b[1m'), path.join(temp, '1-point-oh-day-200-partial.png'));
  });

  it('rejects incompatible flags and save destinations without printing or writing', async () => {
    const writer = vi.spyOn(png, 'writePng');
    const before = readdirSync(temp);
    const blocked = path.join(dirs.saves, 'forbidden.png');
    for (const args of [['--output', path.join(temp, 'unused.png')], ['--png', '--json'], ['100', '--png', '--output', blocked]]) {
      expectUsage(await exportRun(args));
    }
    expect(writer).not.toHaveBeenCalled();
    expect(readdirSync(temp)).toEqual(before);
    expect(existsSync(blocked)).toBe(false);
  });

  it('maps rendering failures to ordinary command failures after stdout', async () => {
    vi.spyOn(png, 'writePng').mockRejectedValue(new Error('render failed'));
    const result = await exportRun(['100', '--png']);
    expect(result.code).toBe(1);
    expect(result.out).toBe((await invoke(['100'])).out);
    expect(result.err).toBe('af-ledger day: render failed\n');
  });
});
