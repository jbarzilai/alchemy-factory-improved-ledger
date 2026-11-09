import path from 'node:path';
import { REPO } from '../../core/test/helpers/fixture';
import * as png from '../src/png';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { dayMoney, type DayLedger } from '@af-ledger/core';
import * as loader from '../src/load';
import { createDaysCommand, type DaysRow } from '../src/commands/days';
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

async function invoke(args: string[]) {
  const c = capture({ AF_SAVE_DIR: dirs.saves });
  const code = await run(['days', ...args], c.io);
  return { code, out: c.out(), err: c.err() };
}

function json(out: string): DaysRow[] {
  expect(out.trim().split('\n')).toHaveLength(1);
  const rows = JSON.parse(out);
  expect(Array.isArray(rows)).toBe(true);
  for (const row of rows) expect(Object.keys(row).sort()).toEqual([
    'day', 'partial', 'earnings', 'expenses', 'dailySummaryProfit', 'unpricedPurchases', 'unpricedQuests',
  ].sort());
  return rows;
}
const textRows = (out: string) => out.split('\n').filter((line) => /^\s*\d+\s+-?\d/.test(line));

describe('days history', () => {
  it('returns exactly one array of completed days, oldest first, with golden totals and day parity', async () => {
    const result = await invoke(['--json']);
    expect(result.code, result.err).toBe(0);
    expect(result.err).toBe('');
    const rows = json(result.out);
    const completed = ledger.snapshot.days.filter((d) => d.complete);
    expect(rows).toHaveLength(completed.length);
    expect(rows.map((r) => r.day)).toEqual(completed.map((d) => d.displayDay).sort((a, b) => a - b));
    expect(rows.every((r) => !r.partial)).toBe(true);
    expect(rows.find((r) => r.day === 100)).toMatchObject({ earnings: 1289241, expenses: 979800, dailySummaryProfit: 309441 });
    const daily = capture({ AF_SAVE_DIR: dirs.saves });
    expect(await run(['day', '199', '--json'], daily.io), daily.err()).toBe(0);
    expect(rows.find((r) => r.day === 199)!.earnings).toBe(JSON.parse(daily.out()).money.earnings);
    const text = await invoke([]);
    expect(text.code, text.err).toBe(0);
    const rendered = textRows(text.out);
    for (const row of rows) {
      const day = completed.find((d) => d.displayDay === row.day)!;
      const m = ledger.money(day);
      expect(row.unpricedPurchases).toBe(m.purchasing.unpriced.length);
      expect(row.unpricedQuests).toBe(m.quests!.unpriced.length);
      const flags = `${row.unpricedPurchases ? '$' : ''}${row.unpricedQuests ? 'q' : ''}`;
      expect(rendered[row.day - 1].trim().split(/\s+/).slice(4).join('')).toBe(flags);
    }
  });

  it('limits to the latest five completed rows with a complete header and consistent mixed columns', async () => {
    const result = await invoke(['--last', '5']);
    expect(result.code, result.err).toBe(0);
    expect(result.err).toBe('');
    const rows = textRows(result.out);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => Number(r.trim().split(/\s+/)[0]))).toEqual([195, 196, 197, 198, 199]);
    for (const row of rows) expect(row).toMatch(/^\s*\d+\s+-?\d+\.\d{2}g\s+-?\d+\.\d{2}g\s+-?\d+\.\d{2}g/);
    expect(result.out).toContain(ledger.snapshot.saveName);
    expect(result.out).toContain(ledger.save.file);
    expect(result.out).toContain(ledger.snapshot.savedAt.toLocaleString());
    expect(result.out).toContain('Quest Rewards 128% (current)');
    expect(result.out).not.toContain('~ in progress');
    expect(textRows((await invoke(['--last', '9999'])).out)).toHaveLength(199);
  });

  it.each(['gold', 'silver', 'copper'])('forces %s for all amount columns', async (unit) => {
    const result = await invoke(['--last', '100', '--unit', unit]);
    expect(result.code, result.err).toBe(0);
    const row = textRows(result.out)[0];
    expect(row).toContain(unit === 'gold' ? '12.89g' : unit === 'silver' ? '1,289.24s' : '1,289,241c');
  });

  it.each(['0', 'x', '-1', '1.5', '', 'Infinity', '9007199254740992', '1e2'])('rejects --last %j with exit 2', async (value) => {
    const result = await invoke(['--last', value]);
    expect(result.code).toBe(2);
    expect(result.out).toBe('');
    expect(result.err).toMatch(/^af-ledger days: .*--last/);
    expect(result.err.trim().split('\n')).toHaveLength(1);
  });

  it.each([['--unit', 'bogus'], ['--last'], ['--unknown'], ['100']])('rejects invalid options/positionals %j', async (...args) => {
    const result = await invoke(args);
    expect(result.code).toBe(2);
    expect(result.out).toBe('');
    expect(result.err).toMatch(/^af-ledger days:/);
    expect(result.err.trim().split('\n')).toHaveLength(1);
  });

  it('appends the in-progress day, after any completed-day limit', async () => {
    const result = await invoke(['--partial', '--json']);
    expect(result.code, result.err).toBe(0);
    const rows = json(result.out);
    expect(rows).toHaveLength(200);
    expect(rows.at(-1)).toMatchObject({ day: 200, partial: true });
    expect(rows.slice(0, -1).every((r) => !r.partial)).toBe(true);
    const limited = await invoke(['--partial', '--last', '5', '--json']);
    expect(json(limited.out).map((r) => r.day)).toEqual([195, 196, 197, 198, 199, 200]);
    const text = await invoke(['--partial', '--last', '1']);
    expect(textRows(text.out).at(-1)).toMatch(/200\s+.*~$/);
    expect(text.out).toContain('~ in progress');
  });

  it('marks unpriced purchases/quests and explains only flags present in the selected rows', async () => {
    // Synthetic purchases ensure $ is covered even if the fixture has no missing purchase prices.
    const base: DayLedger = { saveDay: 0, displayDay: 1, complete: true, profitCoef: 1, items: [], questsSubmitted: [] };
    const days: DayLedger[] = [{
      ...base,
      items: [{ item: 'Unknown', restockCount: 7, soldCount: 0, soldValue: { gold: 0, silver: 0, copper: 0 },
        dispatchedCount: 0, dispatchValue: { gold: 0, silver: 0, copper: 0 }, producedCount: 0, consumedCount: 0 }],
      questsSubmitted: [{ questId: 'RandomNormal', isMain: false, isRandom: true, acceptDay: 0, submitDay: 0,
        goldFactor: 1.3, awardGold: { gold: 0, silver: 0, copper: 0 }, requires: [{ item: 'Stone', count: 5 }] }],
    }, { ...base, saveDay: 1, displayDay: 2 }];
    vi.spyOn(loader, 'loadLedger').mockResolvedValue({ ...ledger,
      snapshot: { ...ledger.snapshot, currentSaveDay: 2, days },
      money: (d) => dayMoney(d, new Map(), { questPrices: new Map(), bonus: ledger.bonus }),
    });
    const result = await invoke([]);
    expect(textRows(result.out)[0]).toMatch(/\$q$/);
    expect(textRows(result.out)[1]).not.toMatch(/[$q~]/);
    expect(result.out).toContain('$ unpriced purchases excluded from Expenses');
    expect(result.out).toContain('q quests excluded for missing quest prices');
    expect(result.out).not.toContain('~ in progress');
    const rows = json((await invoke(['--json'])).out);
    expect(rows[0]).toMatchObject({ unpricedPurchases: 1, unpricedQuests: 1 });
    expect(rows[1]).toMatchObject({ unpricedPurchases: 0, unpricedQuests: 0 });
    const limited = await invoke(['--last', '1']);
    // Only rows and legend: the header path has a random mkdtemp suffix that can contain 'q'.
    expect(textRows(limited.out).join('\n')).not.toMatch(/[$q~]/);
    expect(limited.out).not.toMatch(/^[$q~] /m);
  });

  it('scales each mixed column by its maximum absolute amount, including negative profit', async () => {
    const snapshot = { ...ledger.snapshot, days: ledger.snapshot.days.slice(0, 2) };
    vi.spyOn(loader, 'loadLedger').mockResolvedValue({ ...ledger, snapshot, money: (day) => ({
      ...ledger.money(day), earnings: day.displayDay === 1 ? 10000 : 9999,
      expenses: day.displayDay === 1 ? 2000000 : 0, dailySummaryProfit: day.displayDay === 1 ? -1990000 : 9999,
    }) });
    const text = await invoke([]);
    const rows = textRows(text.out);
    expect(rows[0]).toMatch(/1\s+10.00s\s+20.00g\s+-19.90g/);
    expect(rows[1]).toMatch(/2\s+10.00s\s+0.00g\s+0.10g/);
  });

  it('maps an injected truncated read to exit 1 and the shared being-written message', async () => {
    const readFile = vi.fn(async () => readFileSync(ledger.save.file).subarray(0, 900));
    const c = capture({ AF_SAVE_DIR: dirs.saves });
    expect(await createDaysCommand({ readFile, retries: 0 }).run({ values: {}, positionals: [] }, c.io)).toBe(1);
    expect(readFile).toHaveBeenCalledExactlyOnceWith(ledger.save.file);
    expect(c.out()).toBe('');
    expect(c.err()).toBe('af-ledger days: the save is being written by the game; try again in a moment\n');
  });

  it('shares save discovery overrides and one-line runtime errors with day', async () => {
    const missing = capture({ AF_SAVE_DIR: dirs.empty });
    expect(await run(['days'], missing.io)).toBe(1);
    expect(missing.out()).toBe('');
    expect(missing.err()).toContain(dirs.empty);
    expect(missing.err().trim().split('\n')).toHaveLength(1);
    for (const save of [dirs.saves, ledger.save.file]) {
      const c = capture({ AF_SAVE_DIR: dirs.empty });
      expect(await run(['days', '--save', save, '--last', '1', '--json'], c.io), c.err()).toBe(0);
      expect(json(c.out())[0].day).toBe(199);
    }
  });
});


describe('days PNG export', () => {
  let temp: string;
  beforeAll(() => { temp = mkdtempSync(path.join(REPO, '.cache', 'days-png-')); });
  afterAll(() => rmSync(temp, { recursive: true, force: true }));
  const exportRun = async (args: string[]) => {
    const c = capture({ AF_SAVE_DIR: dirs.saves, AF_EXPORT_DIR: temp });
    const code = await run(['days', ...args], c.io);
    return { code, out: c.out(), err: c.err() };
  };

  it('names the image after the displayed range and preserves stdout', async () => {
    for (const partial of [false, true]) {
      const args = ['--last', '3', ...(partial ? ['--partial'] : [])];
      const plain = await invoke(args);
      const result = await exportRun([...args, '--png']);
      expect(result.code, result.err).toBe(0);
      expect(result.out).toBe(plain.out);
      const rows = textRows(result.out).map((s) => Number(s.trim().split(/\s+/)[0]));
      const file = path.join(temp, `1-point-oh-days-${rows[0]}-${rows.at(-1)}${partial ? '-partial' : ''}.png`);
      expect(result.err).toBe(`wrote ${file}\n`);
      expect(readFileSync(file).subarray(0, 8)).toEqual(Buffer.from('89504e470d0a1a0a', 'hex'));
    }
  });

  it('rejects incompatible flags and save destinations', async () => {
    const writer = vi.spyOn(png, 'writePng');
    for (const args of [['--png', '--json'], ['--output', path.join(temp, 'unused.png')], ['--png', '--output', path.join(dirs.saves, 'forbidden.png')]]) {
      const result = await exportRun(args);
      expect(result.code).toBe(2);
      expect(result.out).toBe('');
      expect(result.err).toMatch(/^af-ledger days:/);
    }
    expect(writer).not.toHaveBeenCalled();
  });

  it('uses the no-rows filename for an empty history', async () => {
    vi.spyOn(loader, 'loadLedger').mockResolvedValue({ ...ledger, snapshot: { ...ledger.snapshot, days: [] } });
    const writer = vi.spyOn(png, 'writePng').mockResolvedValue();
    const result = await exportRun(['--png']);
    expect(result.code, result.err).toBe(0);
    expect(writer).toHaveBeenCalledWith(result.out, path.join(temp, '1-point-oh-days.png'));
  });
});
