import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { dayMoney, loadGameItems, loadQuestSkills, questBonus, questPayout, type DayLedger, type QuestRecord } from '../src/index';

const quest = (overrides: Partial<QuestRecord> = {}): QuestRecord => ({
  questId: 'RandomUrgent', isMain: false, isRandom: true, acceptDay: 0, submitDay: 1,
  goldFactor: 2, awardGold: { gold: 0, silver: 0, copper: 0 },
  requires: [{ item: 'BlastPotion', count: 90 }], ...overrides,
});
const requirements = (items: [string, number][]) => items.map(([item, count]) => ({ item, count }));
const questPrices = loadGameItems().questPrices;

describe('questBonus', () => {
  const skills = loadQuestSkills();
  it('adds all four bonuses, ignoring unknown skills and duplicate names', () => {
    const names = ['QuestSkill1', 'QuestSkill2', 'QuestSkill3', 'QuestSkill4'];
    expect(questBonus(names, skills)).toBeCloseTo(1.28, 10);
    expect(questBonus([...names, 'QuestSkill1', 'Unknown'], skills)).toBeCloseTo(1.28, 10);
  });
  it('returns one for no known quest skills', () => {
    expect(questBonus([], skills)).toBe(1);
    expect(questBonus(['Unknown'], skills)).toBe(1);
  });
});

describe('questPayout', () => {
  it.each([[1.28, 589_133], [1, 460_260]])('matches the Urgent respec check at bonus %s', (bonus, copper) => {
    expect(questPayout(quest(), questPrices, bonus)).toEqual({ copper });
  });

  it.each([[1.28, 800_000], [1, 600_000]])('matches Main7 at bonus %s without requiring quest prices', (bonus, copper) => {
    expect(questPayout(quest({
      questId: 'Main7', isRandom: false, isMain: true, goldFactor: 0,
      awardGold: { gold: 6, silver: 0, copper: 0 },
    }), new Map(), bonus)).toEqual({ copper });
  });

  it('rounds each main-quest coin component before converting to copper', () => {
    expect(questPayout(quest({
      isRandom: false, isMain: true, awardGold: { gold: 1, silver: 2, copper: 3 },
    }), new Map(), 1.28)).toEqual({ copper: 103_004 });
  });

  it('matches the Day 181 Bulk quest within five copper', () => {
    const result = questPayout(quest({
      questId: 'RandomBulk', goldFactor: 1.600000023841858,
      requires: requirements([
        ['BlackPowder', 150], ['GrowthPotion', 60], ['Malachite', 40], ['Glass', 110], ['HealingPotion', 60],
      ]),
    }), questPrices, 1.28);
    expect('copper' in result).toBe(true);
    if ('copper' in result) expect(Math.abs(result.copper - 464_060)).toBeLessThanOrEqual(5);
  });

  // Requirements/Double factors read from the documented SaveGame0.sav SpawnedQuests;
  // UI rewards from SAVE_FORMAT.md. No live saves needed by these tests.
  it.each<{ id: number; factor: number; items: [string, number][]; expected: number }>([
    { id: 356, factor: 1.600000023841858, expected: 1_022_612,
      items: [['GrowthPotion', 60], ['Saturn', 2], ['PerfumedSoap', 32], ['IronIngot', 120], ['PocketWatch', 20]] },
    { id: 357, factor: 1.2999999523162842, expected: 62_733,
      items: [['Brick', 60], ['Catalyst1', 25]] },
    { id: 358, factor: 1.600000023841858, expected: 453_471,
      items: [['CopperBearing', 160], ['BlastPotion', 60], ['Brick', 120], ['Turquoise', 40]] },
    { id: 359, factor: 1.2999999523162842, expected: 195_538,
      items: [['BlastPotion', 30], ['Salt', 160], ['PocketWatch', 10]] },
  ])('matches board offer $id within five copper', ({ factor, items, expected }) => {
    const result = questPayout(quest({ goldFactor: factor, requires: requirements(items) }), questPrices, 1.28);
    expect('copper' in result).toBe(true);
    if ('copper' in result) expect(Math.abs(result.copper - expected)).toBeLessThanOrEqual(5);
  });

  it('uses the stored Double as-is instead of the nominal multiplier', () => {
    expect(questPayout(quest({
      goldFactor: 1.2999999523162842, requires: [{ item: 'Unit', count: 100_000_000 }],
    }), new Map([['Unit', 1]]), 1)).toEqual({ copper: 129_999_995 });
  });

  it('lists each missing item once in requirement order and excludes the whole payout', () => {
    expect(questPayout(quest({ requires: requirements([
      ['ZUnknown', 2], ['BlastPotion', 1], ['AUnknown', 4], ['ZUnknown', 3],
    ]) }), questPrices, 1.28)).toEqual({ missing: ['ZUnknown', 'AUnknown'] });
  });

  it('accepts a configured zero quest price and empty requirements', () => {
    expect(questPayout(quest({ requires: [{ item: 'Free', count: 2 }] }), new Map([['Free', 0]]), 1.28))
      .toEqual({ copper: 0 });
    expect(questPayout(quest({ requires: [] }), new Map(), 1.28)).toEqual({ copper: 0 });
  });

  it('pays a side quest (neither flag, GoldFactor 0) its stored award with the bonus per coin', () => {
    const side = (awardGold: { gold: number; silver: number; copper: number }) =>
      quest({ questId: 'Carpenter5', isRandom: false, goldFactor: 0, awardGold, requires: [{ item: 'NoPrice', count: 100 }] });
    expect(questPayout(side({ gold: 0, silver: 16, copper: 0 }), questPrices, 1.28)).toEqual({ copper: 20_000 });
    expect(questPayout(side({ gold: 0, silver: 0, copper: 600 }), questPrices, 1.28)).toEqual({ copper: 768 });
  });

  it('uses the random formula when neither flag is set but a GoldFactor is', () => {
    expect(questPayout(quest({ isRandom: false, awardGold: { gold: 6, silver: 0, copper: 0 } }), questPrices, 1.28))
      .toEqual({ copper: 589_133 });
  });
});

describe('dayMoney with quest pricing', () => {
  const day: DayLedger = {
    saveDay: 1, displayDay: 2, complete: true, profitCoef: 1, items: [{
      item: 'BlastPotion', soldCount: 1, soldValue: { gold: 0, silver: 1, copper: 5 },
      dispatchedCount: 1, dispatchValue: { gold: 0, silver: 2, copper: 0 },
      restockCount: 2, producedCount: 0, consumedCount: 0,
    }],
    questsSubmitted: [
      quest(),
      quest({ questId: 'Unknown1', requires: [{ item: 'Z', count: 1 }, { item: 'Z', count: 2 }] }),
      quest({ questId: 'Main7', isRandom: false, isMain: true, awardGold: { gold: 6, silver: 0, copper: 0 } }),
      quest({ questId: 'Unknown2', requires: [{ item: 'A', count: 1 }] }),
      quest({ requires: [] }),
    ],
  };

  it('keeps priced and unpriced quests in save order and adds only priced rewards to earnings/Daily Summary Profit', () => {
    const before = structuredClone(day);
    const money = dayMoney(day, new Map([['BlastPotion', 100]]), { questPrices, bonus: 1.28 });
    expect(money.questsSubmitted).toBe(5);
    expect(money.quests).toEqual({
      total: 1_389_133, bonus: 1.28,
      lines: [
        { questId: 'RandomUrgent', isMain: false, copper: 589_133 },
        { questId: 'Main7', isMain: true, copper: 800_000 },
        { questId: 'RandomUrgent', isMain: false, copper: 0 },
      ],
      unpriced: [{ questId: 'Unknown1', missing: ['Z'] }, { questId: 'Unknown2', missing: ['A'] }],
    });
    expect(money.earnings).toBe(1_392_138);
    expect(money.expenses).toBe(200);
    expect(money.dailySummaryProfit).toBe(1_391_938);
    expect(day).toEqual(before);
  });

  it('returns a zero quest total when every quest is unpriced', () => {
    const money = dayMoney({ ...day, questsSubmitted: [day.questsSubmitted[1]] }, new Map(), { questPrices, bonus: 1 });
    expect(money.quests).toEqual({ total: 0, bonus: 1, lines: [], unpriced: [{ questId: 'Unknown1', missing: ['Z'] }] });
    expect(money.earnings).toBe(money.shop.total + money.orders.total);
  });
});

describe('quest configuration loaders', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'af-ledger-quests-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'quest-skills.json');

  it('loads the default quest skills', () => {
    expect(loadQuestSkills()).toEqual(new Map([
      ['QuestSkill1', 0.06], ['QuestSkill2', 0.06], ['QuestSkill3', 0.08], ['QuestSkill4', 0.08],
    ]));
  });

  it.each(['-0.01', '1.01', '"0.06"', '1e999', '-1e999', 'null', 'true', '{}', '[]'])
    ('rejects invalid quest skill value %s, naming the file and key', (raw) => {
      writeFileSync(file, '{ "QuestSkill1": ' + raw + ' }');
      expect(() => loadQuestSkills(file)).toThrow(file);
      expect(() => loadQuestSkills(file)).toThrow('QuestSkill1');
    });

  it('accepts boundary values and skips all underscore keys', () => {
    writeFileSync(file, JSON.stringify({ _comment: 'ignored', _other: {}, Zero: 0, Full: 1 }));
    expect(loadQuestSkills(file)).toEqual(new Map([['Zero', 0], ['Full', 1]]));
  });

  it.each([loadQuestSkills])('rejects malformed JSON and non-object roots with the filename', (load) => {
    for (const raw of ['{ bad', '[]', 'null', '"string"']) {
      writeFileSync(file, raw);
      expect(() => load(file)).toThrow(file);
    }
  });

});
