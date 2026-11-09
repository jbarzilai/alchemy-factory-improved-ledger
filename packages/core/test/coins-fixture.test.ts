import { expect, it } from 'vitest';
import { loadGameItems, loadQuestSkills } from '../src/config';
import { dayMoney } from '../src/ledger';
import { questBonus } from '../src/quests';
import { fixtureFor, fixtureSnapshot } from './helpers/fixture';

it('loads Sand UI Day 24 raw coin records', async () => {
  const snapshot = await fixtureFor('save-fixture-sand.json').snapshot();
  const day = snapshot.days.find((day) => day.displayDay === 24);
  expect(day).toBeDefined();
  const produced = day!.items
    .filter((record) => record.item === 'CopperCoin')
    .reduce((sum, record) => sum + record.producedCount, 0);
  expect(produced).toBe(66000);
});

it('matches Sand UI Day 24 coin minting and both game profit displays', async () => {
  const snapshot = await fixtureFor('save-fixture-sand.json').snapshot();
  const items = loadGameItems();
  const money = dayMoney(snapshot.days.find(d => d.displayDay === 24)!, items.purchasePrices, {
    questPrices: items.questPrices, bonus: questBonus(snapshot.skills, loadQuestSkills()),
  });
  expect(money.minted).toEqual({ total: 13631000, lines: [
    { item: 'GoldCoin', count: 120, copper: 12000000 },
    { item: 'SilverCoin', count: 1565, copper: 1565000 },
    { item: 'CopperCoin', count: 66000, copper: 66000 },
  ] });
  expect(money.melted.total).toBe(0);
  expect(money.dailySummaryProfit).toBe(-73000);
  expect(money.profit).toBe(13558000);
});

it('includes the 1 Point Oh Day 178 melted copper coins in Profit', async () => {
  const snapshot = await fixtureSnapshot();
  const items = loadGameItems();
  const money = dayMoney(snapshot.days.find(d => d.displayDay === 178)!, items.purchasePrices, {
    questPrices: items.questPrices, bonus: questBonus(snapshot.skills, loadQuestSkills()),
  });
  expect(money.melted.lines).toEqual([{ item: 'CopperCoin', count: 84000, copper: 84000 }]);
  expect(money.profit).toBe(money.dailySummaryProfit - 84000);
});
