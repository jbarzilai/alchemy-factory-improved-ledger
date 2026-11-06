import { beforeAll, expect, test } from 'vitest';
import { DEFAULT_FLAG_SETTINGS } from '@af-ledger/core';
import { DEFAULT_SELECTION, type DaySelection } from '../client/route';
import { visibleLines, expandedItem, linesTotal, shopChips, selectionTitle, unitPrice, flagSelection, flagSentence, flagKindLabel, noFlagsText } from '../client/dayItems';
import { dayView } from '../server/views/day';
import { fixtureCache } from './helpers';
import type { DayItemLine, DayResponse, FlagView } from '../shared/api';
const sel = (s: Partial<DaySelection>): DaySelection => ({ ...DEFAULT_SELECTION, ...s });
let day: DayResponse;
beforeAll(async () => { day = dayView((await fixtureCache().get()).model, 199); });
const line: DayItemLine = { item: 'Test', name: 'Test', category: null, units: 1, copper: 1, previousUnits: null, previousCopper: null };
test('filters by stream and category', () => {
  expect(visibleLines(day, DEFAULT_SELECTION)).toHaveLength(28);
  expect(visibleLines(day, sel({ category: 'jewelry' })).map(l => l.item)).toEqual(['Malachite', 'Turquoise', 'Diamond2']);
  expect(linesTotal(visibleLines(day, sel({ category: 'sundries' })))).toBe(370750);
  expect(visibleLines(day, sel({ stream: 'orders' }))).toHaveLength(3);
});
test('expandedItem returns null for an item not shown', () => {
  expect(expandedItem(day, sel({ category: 'relic', item: 'Mars' }))).toBe('Mars');
  expect(expandedItem(day, sel({ category: 'sundries', item: 'Mars' }))).toBeNull();
  expect(expandedItem(day, sel({ item: 'NotAnItem' }))).toBeNull();
});
test('linesTotal skips unpriced lines', () => {
  expect(linesTotal([{ ...line, copper: 5 }, { ...line, copper: null }])).toBe(5);
});
test('chips, titles and unit prices', () => {
  expect(shopChips(day).map(c => [c.key, c.copper])).toEqual([['all', 6397045], ['sundries', 370750], ['potion', 619094], ['beverage', 204792], ['jewelry', 66409], ['relic', 5136000]]);
  expect(selectionTitle(sel({ category: 'sundries' }))).toBe('Shop Income · Sundries');
  expect(selectionTitle(sel({ stream: 'purchasing', category: 'all' }))).toBe('Purchasing Cost');
  expect(unitPrice(6, 2688000)).toBe(448000);
  expect([unitPrice(0, 0), unitPrice(4, null), unitPrice(null, null)]).toEqual([null, null, null]);
});
test('flag selection and sentences', () => {
  const mars = day.flags.find(f => f.item === 'Mars')!, diamond = day.flags.find(f => f.item === 'Diamond2')!;
  expect(flagSelection(mars)).toEqual({ stream: 'shop', category: 'relic', item: 'Mars' });
  expect(flagSentence(mars, DEFAULT_FLAG_SETTINGS, String)).toBe('Large money drop. 6 today against a usual 10 (median of Days 196 to 198), -1792000 against usual.');
  expect(flagSentence(diamond, DEFAULT_FLAG_SETTINGS, String)).toBe('Stopped, day 1 of 3. 0 today against a usual 1 before it stopped, -144000 against usual.');
});

test('purchase money-rise label and sentence', () => {
  const flag: FlagView = { stream: 'purchasing', item: 'CoalOre', name: 'Coal Ore', category: null, day: 228,
    kind: 'money-rise', today: 395, usual: 207, copper: 1896000, usualCopper: 993600, impact: -902400 };
  expect(flagKindLabel(flag, DEFAULT_FLAG_SETTINGS)).toBe('Large cost rise');
  expect(flagSentence(flag, DEFAULT_FLAG_SETTINGS, String)).toBe('Large cost rise. 395 today against a usual 207 (median of Days 225 to 227), -902400 against usual.');
});
test('an empty Flags panel says flags are off only when both groups are off', () => {
  const s = DEFAULT_FLAG_SETTINGS;
  expect(noFlagsText(199, { ...s, incomeFlags: false, purchaseFlags: false })).toBe('Flags are off.');
  expect(noFlagsText(199, s)).toBe('No flags for Day 199.');
  expect(noFlagsText(199, { ...s, incomeFlags: false })).toBe('No flags for Day 199.');
  expect(noFlagsText(199, { ...s, purchaseFlags: false })).toBe('No flags for Day 199.');
});
