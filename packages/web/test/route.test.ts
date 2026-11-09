import { expect, test } from 'vitest';
import { parseRoute, routeHash, rangeDays, DEFAULT_SELECTION, type DaySelection, type Route } from '../client/route';
test.each<Route>([
  { page: 'today', day: null, items: DEFAULT_SELECTION }, { page: 'today', day: 199, items: DEFAULT_SELECTION },
  { page: 'history', range: { last: 7 } }, { page: 'history', range: { from: 170, to: 199 } },
  { page: 'items', range: { last: 3 }, item: 'BlastPotion' },
  { page: 'items', range: { from: 1, to: 199 }, item: null },
  { page: 'items', range: { last: 7 }, item: 'space & slash/' },
])('round trips $page', route => expect(parseRoute(routeHash(route))).toEqual(route));
test.each(['junk', '#/what', '#/today/0', '#/today/abc', '#/today/1.5', '#/today/199/extra'])('junk %s goes to latest', hash => {
  expect(parseRoute(hash)).toEqual({ page: 'today', day: null, items: DEFAULT_SELECTION });
});
test.each(['', '?last=0', '?last=abc', '?from=199&to=170', '?from=1', '?last=1.5', '?last=2&last=3'])('invalid range %s defaults', query => {
  expect(parseRoute(`#/history${query}`)).toEqual({ page: 'history', range: { last: 7 } });
});
test('ranges clamp to available days', () => {
  expect(rangeDays({ last: 7 }, 199)).toEqual({ from: 193, to: 199 });
  expect(rangeDays({ last: 500 }, 199)).toEqual({ from: 1, to: 199 });
  expect(rangeDays({ from: 190, to: 220 }, 199)).toEqual({ from: 190, to: 199 });
});
test('no completed days has an explicit empty range', () => {
  expect(rangeDays({ last: 7 }, 0)).toBeNull();
  expect(rangeDays({ from: 1, to: 10 }, 0)).toBeNull();
});

const sel = (s: Partial<DaySelection>): DaySelection => ({ ...DEFAULT_SELECTION, ...s });
test.each<Route>([
  { page: 'today', day: null, items: sel({ category: 'sundries', item: 'BronzeRivet' }) },
  { page: 'today', day: 198, items: sel({ stream: 'orders', item: 'Catalyst2' }) },
  { page: 'today', day: null, items: sel({ stream: 'purchasing' }) },
  { page: 'today', day: 199, items: sel({ item: 'space & slash/' }) },
])('round trips today selection %#', route => expect(parseRoute(routeHash(route))).toEqual(route));
test('default selection adds no query', () => {
  expect(routeHash({ page: 'today', day: null, items: DEFAULT_SELECTION })).toBe('#/today');
  expect(routeHash({ page: 'today', day: 5, items: DEFAULT_SELECTION })).toBe('#/today/5');
  expect(routeHash({ page: 'today', day: 5, items: sel({ category: 'relic', item: 'Mars' }) })).toBe('#/today/5?cat=relic&item=Mars');
});
test.each([
  ['?items=bogus&cat=relic', sel({ category: 'relic' })],
  ['?cat=orders', sel({})],
  ['?items=orders&cat=relic&item=Bandage', sel({ stream: 'orders', item: 'Bandage' })],
  ['?items=orders&items=shop', sel({})],
  ['?item=', sel({})],
])('bad today query %s falls back per field', (query, items) => expect(parseRoute(`#/today${query}`)).toEqual({ page: 'today', day: null, items }));


test.each(['minted', 'melted'] as const)('round trips coin stream %s', stream => {
  const route: Route = { page: 'today', day: 178, items: sel({ stream, item: 'CopperCoin' }) };
  expect(parseRoute(routeHash(route))).toEqual(route);
});
