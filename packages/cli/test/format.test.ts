import { describe, expect, it } from 'vitest';
import { bar, colorEnabled, reportUnit, delta, money, percentage, questLabel, signed, table, priceText } from '../src/format';

describe('money', () => {
  it.each([
    ['gold', 1289241, '12.89g'], ['silver', 1289241, '1,289.24s'], ['copper', 1289241, '1,289,241c'],
    ['gold', -1289241, '-12.89g'], ['silver', -1289241, '-1,289.24s'], ['copper', -1289241, '-1,289,241c'],
    ['gold', 0, '0.00g'], ['silver', 0, '0.00s'], ['copper', 0, '0c'],
  ] as const)('%s formats %s as %s', (unit, value, expected) => {
    expect(money(value, unit)).toBe(expected);
  });
});

it.each([
  [999999, 'silver'], [1000000, 'gold'], [9999, 'copper'], [10000, 'silver'],
  [-1000000, 'gold'], [0, 'copper'],
] as const)('selects the report unit for %s copper', (scale, expected) => {
  expect(reportUnit(scale, 'mixed')).toBe(expected);
});

it('supports a configurable report threshold and forced units', () => {
  expect(reportUnit(4999999, 'mixed', 50)).toBe('silver');
  expect(reportUnit(5000000, 'mixed', 50)).toBe('gold');
  for (const unit of ['gold', 'silver', 'copper'] as const) {
    for (const scale of [0, 9999, -1000000]) expect(reportUnit(scale, unit)).toBe(unit);
  }
});

it.each([
  [448000, '4.48g'], [4300, '4.30s'], [999, '999c'], [1000, '1.00s'], [100000, '1.00g'],
] as const)('formats each unit price independently: %s', (copper, expected) => {
  expect(priceText(copper, 'mixed')).toBe(expected);
});

it('forces the requested price unit', () => {
  expect(priceText(448000, 'copper')).toBe('448,000c');
  expect(priceText(999, 'gold')).toBe('0.01g');
  expect(priceText(999, 'silver')).toBe('1.00s');
});

it('groups thousands in gold and silver and picks price units from the rounded copper', () => {
  expect(money(1_284_157_000, 'gold')).toBe('12,841.57g');
  expect(money(-12_319_560, 'silver')).toBe('-12,319.56s');
  expect(priceText(999.6, 'mixed')).toBe('1.00s');
});

it('removes signs from values that round to zero', () => {
  expect(money(-1, 'gold')).toBe('0.00g');
  expect(money(-1, 'silver')).toBe('0.00s');
  expect(money(-0.1, 'copper')).toBe('0c');
  expect(money(-0, 'gold')).toBe('0.00g');
  expect(percentage(-0.001)).toBe('0.0%');
  for (const value of [-1, 1]) expect(signed(value, (v) => money(v, 'gold'))).toBe('0.00g');
  expect(signed(0.001, percentage)).toBe('0.0%');
  expect(signed(1, percentage)).toBe('+1.0%');
});

it('disables TTY colour only for non-empty NO_COLOR', () => {
  expect(colorEnabled(true, {})).toBe(true);
  expect(colorEnabled(true, { NO_COLOR: '' })).toBe(true);
  expect(colorEnabled(true, { NO_COLOR: '0' })).toBe(false);
  expect(colorEnabled(true, { NO_COLOR: ' ' })).toBe(false);
  expect(colorEnabled(false, {})).toBe(false);
});

it('pads left and right aligned columns without borders or trailing spaces', () => {
  expect(table([['Item', 'Value'], ['A', '123'], ['Longer', '4']], ['l', 'r']))
    .toBe('Item    Value\nA         123\nLonger      4');
  expect(table([], ['l', 'r'])).toBe('');
});

it.each([
  [0, '░'.repeat(20)], [0.5, '█'.repeat(10) + '░'.repeat(10)], [1, '█'.repeat(20)],
  [-1, '░'.repeat(20)], [2, '█'.repeat(20)],
])('bar clamps %s', (fraction, expected) => expect(bar(Number(fraction))).toBe(expected));

it('supports a custom bar width', () => expect(bar(0.5, 4)).toBe('██░░'));

it('computes differences and percentage points, with absent or zero baselines', () => {
  expect(delta(150, 100)).toEqual({ diff: 50, pct: 50 });
  expect(delta(50, 100)).toEqual({ diff: -50, pct: -50 });
  expect(delta(-50, -100)).toEqual({ diff: 50, pct: 50 });
  expect(delta(0, 100)).toEqual({ diff: -100, pct: -100 });
  expect(delta(10, 0)).toEqual({ diff: 10, pct: null });
  expect(delta(10, null)).toEqual({ diff: null, pct: null });
});

it.each([
  ['Main7', 'Main quest 7'], ['RandomNormal', 'Random quest (Normal)'],
  ['RandomBulk', 'Random quest (Bulk)'], ['RandomUrgent', 'Random quest (Urgent)'],
  ['Carpenter3', 'Carpenter 3'], ['Unrecognised', 'Unrecognised'],
])('labels quest %s as %s', (id, label) => expect(questLabel(id)).toBe(label));
