import { expect, test } from 'vitest';
import { summaryLines, earlierEndIndex, moneyChange, percentSetting, questCount } from '../client/today';

test.each([[14, 13], [19, 13], [28, 14], [13, 13]])('earlier page from index %i ends at %i', (index, expected) => {
  expect(earlierEndIndex(index)).toBe(expected);
});
test.each([400, -400, 0])('rounded-zero change %i is neutral without arrow or sign', change => {
  expect(moneyChange(change, { text: '0.00', suffix: 'g' })).toEqual({ text: '0.00', suffix: 'g', arrow: '', color: 'text-muted' });
});
test('visible changes retain direction and expense colours', () => {
  expect(moneyChange(600, { text: '+0.01', suffix: 'g' })).toEqual({ text: '+0.01', suffix: 'g', arrow: '↑', color: 'text-gain' });
  expect(moneyChange(-600, { text: '−0.01', suffix: 'g' }, true).color).toBe('text-gain');
  expect(moneyChange(600, { text: '+0.01', suffix: 'g' }, true).color).toBe('text-loss');
});
test('settings percentages discard floating point noise but retain tenths', () => {
  expect(percentSetting(0.29)).toBe('29%');
  expect(percentSetting(0.105)).toBe('10.5%');
  expect(percentSetting(0)).toBe('0%');
});
test('quest counts use singular only for one', () => {
  expect(questCount(0)).toBe('0 quests');
  expect(questCount(1)).toBe('1 quest');
  expect(questCount(2)).toBe('2 quests');
});

test('summary Profit copies the core total and only item rows carry streams', async () => {
  const { fixtureCache } = await import('./helpers');
  const { dayView } = await import('../server/views/day');
  const { model } = await fixtureCache().get();
  const day = dayView(model, 178);
  const lines = summaryLines(day);
  expect(lines.at(-1)).toMatchObject({ copper: day.totals.profit, previous: day.previousTotals!.profit, final: true });
  expect(lines.map(line => [line.label, line.stream])).toEqual([
    ['Shop Income', 'shop'], ['Order Income', 'orders'], ['Purchasing Cost', 'purchasing'],
    ['Subtotal before quests', undefined], ['Quest Rewards', undefined], ['Profit', undefined],
  ]);
});
