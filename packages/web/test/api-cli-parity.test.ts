import { afterEach, expect, it, vi } from 'vitest';
import { shopByCategory, type DayMoney } from '@af-ledger/core';
import * as loader from '../../cli/src/load';
import { createDayCommand } from '../../cli/src/commands/day';
import { fixtureCache } from './helpers';
import { dayView } from '../server/views/day';
vi.mock('../../cli/src/load', async original => ({ ...await original<typeof import('../../cli/src/load')>() }));
afterEach(() => vi.restoreAllMocks());
it('matches the in-process CLI for every completed fixture day using the same loaded ledger', async () => {
  const { model } = await fixtureCache().get();
  vi.spyOn(loader, 'loadLedger').mockResolvedValue(model.ledger);
  const command = createDayCommand();
  for (const day of model.ledger.snapshot.days.filter(d => d.complete)) {
    let out = '', err = '';
    expect(await command.run({ values: { json: true }, positionals: [String(day.displayDay)] }, { env: {}, out: s => { out += s; }, err: s => { err += s; } })).toBe(0);
    expect(err).toBe('');
    const cli = JSON.parse(out) as { money: DayMoney };
    const api = dayView(model, day.displayDay), money = cli.money;
    expect(api.totals, `Day ${day.displayDay}`).toEqual({ shop: money.shop.total, quests: money.quests?.total ?? 0, beforeQuests: money.dailySummaryProfit - (money.quests?.total ?? 0), dailySummaryProfit: money.dailySummaryProfit, questCount: money.questsSubmitted });
    const cats = shopByCategory(money.shop.lines, model.ledger.categories);
    for (const source of api.sources) expect(source.copper).toBe(source.key === 'orders' ? money.orders.total : cats.get(source.label) ?? 0);
    expect(api.purchasing.unpriced.map(({ item, count }) => ({ item, count }))).toEqual(money.purchasing.unpriced);
    expect(api.quests.unpriced).toEqual(money.quests?.unpriced ?? []);
  }
  expect(loader.loadLedger).toHaveBeenCalledTimes(199);
});
