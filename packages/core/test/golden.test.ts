// Golden numbers transcribed from in-game screenshots (fixtures/*.expected.json) vs. the extractor.
// Without quest pricing, totals exclude quests. With pricing, rewards use the save's current skills.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadGameItems, loadQuestSkills } from '../src/config';
import { dayMoney, type MoneyLine } from '../src/ledger';
import { questBonus } from '../src/quests';
import { REPO, fixtureSnapshot } from './helpers/fixture';

type Coin = 'copper' | 'silver';
type Line = [count: number, coin: Coin, amount: number];
type CoinPair = { silver: number; copper: number };
type Expected = {
  displayDay: number;
  saveDay: number;
  profitCoef: number;
  shopIncome: Record<string, Line>;
  orderIncome: Record<string, Line>;
  purchasingCost: Record<string, Line>;
  questRewards: CoinPair;
  summaryScreen?: { earnings: CoinPair; expenses: CoinPair; profitCopper: number };
  totals: { shopCopperEquiv: number; orderCopperEquiv: number; questCopperEquiv: number; purchasingCopperEquiv: number; netCopperEquiv: number };
};

const QUESTS_SUBMITTED: Record<string, number> = { day100: 0, day199: 2 };

const load = (name: string): Expected =>
  JSON.parse(readFileSync(path.join(REPO, 'fixtures', `${name}.expected.json`), 'utf8'));
const copperOf = (coin: Coin, amount: number) => (coin === 'silver' ? amount * 1000 : amount);
const pairToCopper = (p: CoinPair) => p.silver * 1000 + p.copper;
const expectedLines = (lines: Record<string, Line>) =>
  Object.fromEntries(Object.entries(lines).map(([item, [count, coin, amount]]) => [item, { count, copper: copperOf(coin, amount) }]));
const actualLines = (lines: MoneyLine[]) => Object.fromEntries(lines.map((l) => [l.item, { count: l.count, copper: l.copper }]));

describe.each(['day100', 'day199'])('golden %s', (name) => {
  const fx = load(name);
  const prices = loadGameItems().purchasePrices;
  const get = async () => {
    const day = (await fixtureSnapshot()).days[fx.saveDay];
    return { day, money: dayMoney(day, prices) };
  };

  it('is the expected completed day', async () => {
    const { day } = await get();
    expect(day.displayDay).toBe(fx.displayDay);
    expect(day.complete).toBe(true);
    expect(day.profitCoef).toBeCloseTo(fx.profitCoef, 10);
    expect(day.questsSubmitted).toHaveLength(QUESTS_SUBMITTED[name]);
  });

  it('matches every shop income line', async () => {
    const { money } = await get();
    expect(money.shop.lines).toHaveLength(Object.keys(fx.shopIncome).length);
    expect(actualLines(money.shop.lines)).toEqual(expectedLines(fx.shopIncome));
  });

  it('matches every order income line', async () => {
    const { money } = await get();
    expect(money.orders.lines).toHaveLength(Object.keys(fx.orderIncome).length);
    expect(actualLines(money.orders.lines)).toEqual(expectedLines(fx.orderIncome));
  });

  it('matches every purchasing line, with no unpriced items', async () => {
    const { money } = await get();
    expect(money.purchasing.unpriced).toEqual([]);
    expect(money.purchasing.lines).toHaveLength(Object.keys(fx.purchasingCost).length);
    expect(actualLines(money.purchasing.lines)).toEqual(expectedLines(fx.purchasingCost));
  });

  it('matches the category totals', async () => {
    const { money } = await get();
    expect(money.shop.total).toBe(fx.totals.shopCopperEquiv);
    expect(money.orders.total).toBe(fx.totals.orderCopperEquiv);
    expect(money.purchasing.total).toBe(fx.totals.purchasingCopperEquiv);
    expect(pairToCopper(fx.questRewards)).toBe(fx.totals.questCopperEquiv); // fixture self-check
  });

  it('has quests null and excludes quest awards from earnings/net without quest pricing', async () => {
    const { money } = await get();
    expect(money.quests).toBeNull();
    expect(money.earnings).toBe(fx.totals.shopCopperEquiv + fx.totals.orderCopperEquiv);
    expect(money.net).toBe(fx.totals.netCopperEquiv - fx.totals.questCopperEquiv);
  });

  it('includes computed quests using the fixture skills in earnings and net', async () => {
    const snapshot = await fixtureSnapshot();
    expect(snapshot.skills).toEqual(expect.arrayContaining(['QuestSkill1', 'QuestSkill2', 'QuestSkill3', 'QuestSkill4']));
    const bonus = questBonus(snapshot.skills, loadQuestSkills());
    expect(bonus).toBeCloseTo(1.28, 10);
    const money = dayMoney(snapshot.days[fx.saveDay], prices, { questPrices: loadGameItems().questPrices, bonus });
    expect(money.quests!.unpriced).toEqual([]);
    expect(money.quests!.lines).toHaveLength(QUESTS_SUBMITTED[name]);
    expect(Math.abs(money.quests!.total - fx.totals.questCopperEquiv)).toBeLessThanOrEqual(5);
    expect(money.earnings).toBe(money.shop.total + money.orders.total + money.quests!.total);
    expect(money.net).toBe(money.earnings - money.expenses);
  });
});

describe('golden day100 Daily Summary screen', () => {
  const fx = load('day100');
  it('matches Earnings, Expenses and Profit exactly (no quests that day)', async () => {
    const money = dayMoney((await fixtureSnapshot()).days[fx.saveDay], loadGameItems().purchasePrices);
    expect(money.earnings).toBe(pairToCopper(fx.summaryScreen!.earnings));
    expect(money.expenses).toBe(pairToCopper(fx.summaryScreen!.expenses));
    expect(money.net).toBe(fx.summaryScreen!.profitCopper);
  });

  it('still matches the Daily Summary exactly with quest pricing enabled', async () => {
    const snapshot = await fixtureSnapshot();
    const money = dayMoney(snapshot.days[fx.saveDay], loadGameItems().purchasePrices, {
      questPrices: loadGameItems().questPrices, bonus: questBonus(snapshot.skills, loadQuestSkills()),
    });
    expect(money.quests).toMatchObject({ total: 0, lines: [], unpriced: [] });
    expect(money.earnings).toBe(pairToCopper(fx.summaryScreen!.earnings));
    expect(money.expenses).toBe(pairToCopper(fx.summaryScreen!.expenses));
    expect(money.net).toBe(fx.summaryScreen!.profitCopper);
  });
});
