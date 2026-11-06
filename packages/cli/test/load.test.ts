import * as config from '../../core/src/config';
import * as extract from '../../core/src/extract';
import * as saves from '../../core/src/saves';
import { afterEach, expect, it, vi } from 'vitest';
import { loadLedger } from '../src/load';

vi.mock('../../core/src/config', async original => ({ ...await original<typeof import('../../core/src/config')>() }));
vi.mock('../../core/src/extract', async original => ({ ...await original<typeof import('../../core/src/extract')>() }));
vi.mock('../../core/src/saves', async original => ({ ...await original<typeof import('../../core/src/saves')>() }));
afterEach(() => vi.restoreAllMocks());

it.each(['loadGameItems', 'loadItemNames', 'loadQuestSkills'] as const)(
  'validates %s before reading or decoding the save', async (name) => {
    const decode = vi.spyOn(extract, 'extractSnapshot');
    const resolve = vi.spyOn(saves, 'resolveSave');
    vi.spyOn(config, name).mockImplementation(() => { throw new Error('invalid config'); });
    await expect(loadLedger({ env: {}, save: '/not-a-save.sav' })).rejects.toThrow('invalid config');
    expect(resolve).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
  },
);

it('uses the requested completed coefficient and the latest completed coefficient for a partial day', async () => {
  const { fixtureSnapshot, fixtureSavePath } = await import('../../core/test/helpers/fixture');
  const snapshot = await fixtureSnapshot();
  const historical = { ...snapshot.days[198], saveDay: 0, displayDay: 1, profitCoef: 1 };
  const latest = { ...snapshot.days[198], saveDay: 1, displayDay: 2, profitCoef: 1.2000000476837158 };
  const partial = { ...snapshot.days[198], saveDay: 2, displayDay: 3, complete: false, profitCoef: null };
  // Unsorted input ensures fallback is by day, rather than array position.
  vi.spyOn(extract, 'extractSnapshot').mockResolvedValue({ ...snapshot, days: [partial, latest, historical] });
  const data = vi.spyOn(config, 'loadGameItems');
  const ledger = await loadLedger({ env: {}, save: fixtureSavePath() });
  expect(ledger.bonuses(historical).shopProfit).toBe(100);
  expect(ledger.bonuses(partial)).toEqual({
    shopProfit: 120, categories: { Sundries: 180, Potion: 180, Beverage: 140, Relic: 140, Jewelry: 124 }, orderIncomePct: 30, questRewards: 128,
  });
  ledger.money(latest);
  ledger.bonuses(latest);
  expect(data).toHaveBeenCalledTimes(1);
});

it('returns null Shop and category bonuses without a completed day', async () => {
  const { fixtureSnapshot, fixtureSavePath } = await import('../../core/test/helpers/fixture');
  const snapshot = await fixtureSnapshot();
  const partial = { ...snapshot.days[198], complete: false, profitCoef: null };
  vi.spyOn(extract, 'extractSnapshot').mockResolvedValue({ ...snapshot, days: [partial] });
  const ledger = await loadLedger({ env: {}, save: fixtureSavePath() });
  expect(ledger.bonuses(partial)).toEqual({
    shopProfit: null, categories: { Sundries: null, Potion: null, Beverage: null, Relic: null, Jewelry: null }, orderIncomePct: 30, questRewards: 128,
  });
});


it('loads game data, names and quest skills in order before resolving the save', async () => {
  const calls: string[] = [];
  for (const name of ['loadGameItems', 'loadItemNames', 'loadQuestSkills'] as const) {
    const original = config[name];
    vi.spyOn(config, name).mockImplementation((() => { calls.push(name); return original(); }) as typeof original);
  }
  vi.spyOn(saves, 'resolveSave').mockImplementation(() => { calls.push('resolveSave'); throw new Error('stop before decode'); });
  await expect(loadLedger({ env: {}, save: '/missing.sav' })).rejects.toThrow('stop before decode');
  expect(calls).toEqual(['loadGameItems', 'loadItemNames', 'loadQuestSkills', 'resolveSave']);
});


it.each([{ profitSkills: [] }, { profitSkills: ['ContractProfit1', 'ContractProfit3', 'ContractProfit2', 'PotionProfit5'] }])('maps the highest ContractProfit level to its pay percent, defaulting to zero (%j)', async ({ profitSkills }) => {
  const { fixtureSnapshot, fixtureSavePath } = await import('../../core/test/helpers/fixture');
  const snapshot = await fixtureSnapshot();
  vi.spyOn(extract, 'extractSnapshot').mockResolvedValue({ ...snapshot, profitSkills });
  const ledger = await loadLedger({ env: {}, save: fixtureSavePath() });
  expect(ledger.bonuses(snapshot.days[198]).orderIncomePct).toBe(profitSkills.length ? 30 : 0);
});
