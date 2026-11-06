import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toCopper } from '../src/coins';
import { IncompleteSaveError, SaveFormatError, parseBlockChain, parseHeader, type SaveHeader } from '../src/container';
import { KdecDecoder } from '../src/decoder/kdec';
import type { Decoder } from '../src/decoder/types';
import { PropertyError, SaveShapeError } from '../src/errors';
import { buildSnapshot, extractSnapshot, readProfitSkills } from '../src/extract';
import { findProperty } from '../src/locate';
import { bag, concat, fstr, i32, tag, typeName } from './helpers/encode';
import { fixtureSavePath, fixtureSnapshot } from './helpers/fixture';

describe('extractSnapshot on the fixture save', () => {
  it('reads the save identity and current day', async () => {
    const s = await fixtureSnapshot();
    expect(s).toMatchObject({ saveName: '1 Point Oh', level: 6, currentSaveDay: 199, decoder: 'kdec' });
    expect(s.secondsIntoDay).toBeGreaterThanOrEqual(0);
  });

  it('has 199 completed days (UI Days 1-199) plus the in-progress UI Day 200', async () => {
    const { days } = await fixtureSnapshot();
    expect(days).toHaveLength(200);
    expect(days.slice(0, 199).every((d, i) => d.complete && d.saveDay === i && d.displayDay === i + 1)).toBe(true);
    expect(days[199]).toMatchObject({ saveDay: 199, displayDay: 200, complete: false, profitCoef: null });
  });

  it('extracts all four quest skills from the first UnlockedSkillPointsList', async () => {
    const { skills } = await fixtureSnapshot();
    expect(skills).toEqual(expect.arrayContaining(['QuestSkill1', 'QuestSkill2', 'QuestSkill3', 'QuestSkill4']));
    expect(skills.every((s) => typeof s === 'string')).toBe(true);
  });

  it('matches the documented ProfitCoef history', async () => {
    const { days } = await fixtureSnapshot();
    const coef = (d: number) => days[d].profitCoef;
    for (const d of [0, 48]) expect(coef(d)).toBeCloseTo(1.0, 10);
    for (const d of [49, 95]) expect(coef(d)).toBeCloseTo(1.1, 10);
    for (const d of [96, 99, 198]) expect(coef(d)).toBeCloseTo(1.2, 10);
  });

  it('maps ingredient records', async () => {
    const { days } = await fixtureSnapshot();
    const vit = days[198].items.find((r) => r.item === 'VitalityPotion');
    expect(vit).toBeDefined();
    expect(vit!.soldCount).toBe(144);
    expect(toCopper(vit!.soldValue)).toBe(95_040);
    expect(days[198].items.find((r) => r.item === 'GelatinousGridlock')!.restockCount).toBe(14_004);
  });

  it('attaches the two quests submitted on saveDay 198', async () => {
    const { days } = await fixtureSnapshot();
    expect(days[198].questsSubmitted).toHaveLength(2);
    expect(days[198].questsSubmitted.every((q) => q.submitDay === 198 && q.questId !== '')).toBe(true);
  });

  it('maps the verified quest fields and preserves stored multipliers', async () => {
    const { days } = await fixtureSnapshot();
    const normal = days[198].questsSubmitted.find(q => q.questId === 'RandomNormal');
    const bulk = days[198].questsSubmitted.find(q => q.questId === 'RandomBulk');
    expect(normal).toMatchObject({
      isMain: false, isRandom: true, acceptDay: 198, submitDay: 198,
      awardGold: { gold: 0, silver: 0, copper: 0 },
      requires: [{ item: 'Nails', count: 90 }, { item: 'Jupiter', count: 1 }, { item: 'Catalyst1', count: 25 }],
    });
    expect(normal!.goldFactor).toBe(1.2999999523162842);
    expect(bulk).toMatchObject({ isMain: false, isRandom: true, acceptDay: 197, submitDay: 198 });
    expect(bulk!.goldFactor).toBe(1.600000023841858);
  });
});

describe('extractSnapshot retries a save that is still being written', () => {
  const full = () => readFileSync(fixtureSavePath());

  it('succeeds once the file is complete', async () => {
    let calls = 0;
    const readFile = async () => (++calls === 1 ? full().subarray(0, 100_000) : full());
    const s = await extractSnapshot('SaveGame3.sav', { decoder: new KdecDecoder(), readFile, retryDelayMs: 0 });
    expect(calls).toBe(2);
    expect(s.currentSaveDay).toBe(199);
  });

  it('gives up with IncompleteSaveError', async () => {
    const readFile = async () => full().subarray(0, 100_000);
    await expect(extractSnapshot('SaveGame3.sav', { decoder: new KdecDecoder(), readFile, retries: 1, retryDelayMs: 0 }))
      .rejects.toThrow(IncompleteSaveError);
  });

  it('uses exactly the configured extra attempts without decoding incomplete data', async () => {
    let reads = 0;
    let decodes = 0;
    const decoder: Decoder = { name: 'kdec', decompress: async () => { decodes++; return new Uint8Array(); } };
    await expect(extractSnapshot('partial.sav', {
      decoder, retries: 2, retryDelayMs: 0,
      readFile: async () => { reads++; return full().subarray(0, 5); },
    })).rejects.toThrow(IncompleteSaveError);
    expect(reads).toBe(3);
    expect(decodes).toBe(0);
  });

  it('reads once and passes only compressed block 0 to the decoder', async () => {
    const buf = full();
    const [b0] = parseBlockChain(buf, parseHeader(buf).bodyOffset);
    const kdec = new KdecDecoder();
    let reads = 0;
    let decodes = 0;
    const decoder: Decoder = {
      name: 'kdec',
      decompress: async (src, rawSize) => {
        decodes++;
        expect(src.buffer).toBe(buf.buffer);
        expect(src.byteOffset).toBe(buf.byteOffset + b0.dataOffset);
        expect(src.byteLength).toBe(b0.compressedSize);
        expect(rawSize).toBe(b0.uncompressedSize);
        return kdec.decompress(src, rawSize);
      },
    };
    const snapshot = await extractSnapshot('read-only.sav', {
      decoder, readFile: async file => { expect(file).toBe('read-only.sav'); reads++; return buf; },
    });
    expect(reads).toBe(1);
    expect(decodes).toBe(1);
    expect(snapshot.file).toBe('read-only.sav');
    expect(snapshot.decoder).toBe('kdec');
  });

  it('does not retry corrupt saves', async () => {
    let reads = 0;
    await expect(extractSnapshot('corrupt.sav', {
      readFile: async () => { reads++; return new Uint8Array(12); }, retryDelayMs: 0,
    })).rejects.toThrow(/CHAF/);
    expect(reads).toBe(1);
  });

  it('does not retry read errors', async () => {
    const error = new Error('read failed');
    let reads = 0;
    await expect(extractSnapshot('missing.sav', {
      readFile: async () => { reads++; throw error; }, retryDelayMs: 0,
    })).rejects.toBe(error);
    expect(reads).toBe(1);
  });

  it('does not retry decoder failures', async () => {
    const error = new Error('decode failed');
    let reads = 0;
    const decoder: Decoder = { name: 'kdec', decompress: async () => { throw error; } };
    await expect(extractSnapshot('bad-block.sav', {
      decoder, readFile: async () => { reads++; return full(); }, retryDelayMs: 0,
    })).rejects.toBe(error);
    expect(reads).toBe(1);
  });

  it('rejects a decoder result whose length differs from the declared size', async () => {
    const decoder: Decoder = { name: 'kdec', decompress: async () => new Uint8Array() };
    await expect(extractSnapshot('wrong-size.sav', { decoder, readFile: async () => full() }))
      .rejects.toThrow(SaveFormatError);
  });
});

describe('buildSnapshot with omitted default-valued fields', () => {
  const NAME = typeName('NameProperty');
  const INT = typeName('IntProperty');
  const struct = (name: string) => typeName('StructProperty', typeName(name, typeName('/Script/BeltTD')));
  const arrayOf = (inner: Uint8Array) => typeName('ArrayProperty', inner);
  const header: SaveHeader = {
    isSandbox: false, saveDay: 1, level: 1, wallet: {}, name: 'T', desc: '', savedAt: new Date(0),
    version: { major: 1, minor: 4, revision: 1, build: 5024 }, bodyOffset: 0,
  };

  it('treats missing counts and coins as zero and a missing ProfitCoef as unknown', () => {
    const record = bag(tag('IngredientName', NAME, fstr('Salt')), tag('SellCount', INT, i32(3)));
    const records = tag('Records', arrayOf(struct('IngredientRecordData')), concat(i32(1), record));
    const daily = tag('DailyIngredients', arrayOf(struct('IngredientRecordArray')), concat(i32(1), bag(records)));
    const body = concat(fstr('junk before'), daily, tag('GameDays', INT, i32(1)));

    const s = buildSnapshot('t.sav', header, body, 'kdec');
    expect(s.skills).toEqual([]);
    expect(s.currentSaveDay).toBe(1);
    expect(s.days).toHaveLength(2);
    expect(s.days[0].profitCoef).toBeNull();
    expect(s.days[0].items).toEqual([{
      item: 'Salt', soldCount: 3, soldValue: { gold: 0, silver: 0, copper: 0 }, dispatchedCount: 0,
      dispatchValue: { gold: 0, silver: 0, copper: 0 }, restockCount: 0, producedCount: 0, consumedCount: 0,
    }]);
    expect(s.days[1]).toMatchObject({ complete: false, items: [], questsSubmitted: [] });
  });

  it('preserves the first skills list, including its order and duplicates', () => {
    const names = ['QuestSkill4', 'Unknown', 'QuestSkill1', 'QuestSkill1'];
    const body = concat(
      tag('UnlockedSkillPointsList', arrayOf(NAME), concat(i32(names.length), ...names.map(fstr))),
      tag('UnlockedSkillPointsList', arrayOf(NAME), concat(i32(1), fstr('LaterList'))),
    );
    expect(buildSnapshot('t.sav', { ...header, saveDay: 0 }, body, 'kdec').skills).toEqual(names);
  });

  it('rejects a malformed skills list or a non-name entry', () => {
    for (const value of [
      tag('UnlockedSkillPointsList', INT, i32(1)),
      tag('UnlockedSkillPointsList', arrayOf(INT), concat(i32(1), i32(1))),
    ]) {
      expect(() => buildSnapshot('t.sav', { ...header, saveDay: 0 }, value, 'kdec'))
        .toThrow(/UnlockedSkillPointsList/);
    }
  });

  it('defaults omitted quest fields and attaches quests to the in-progress day', () => {
    const quest = bag(tag('QuestID', NAME, fstr('Main7')));
    const body = tag('CompletedQuests', arrayOf(struct('ProcessQuest')), concat(i32(1), quest));
    const s = buildSnapshot('t.sav', { ...header, saveDay: 0 }, body, 'kdec');
    expect(s.secondsIntoDay).toBe(0);
    expect(s.days).toHaveLength(1);
    expect(s.days[0]).toMatchObject({ complete: false, saveDay: 0, displayDay: 1, profitCoef: null });
    expect(s.days[0].questsSubmitted).toEqual([{
      questId: 'Main7', isMain: false, isRandom: false, acceptDay: 0, submitDay: 0,
      goldFactor: 0, awardGold: { gold: 0, silver: 0, copper: 0 }, requires: [],
    }]);
  });
});

describe('findProperty', () => {
  it('skips name-table occurrences that are not followed by a property type', () => {
    const body = concat(fstr('GameDays'), fstr('GameSeconds'), tag('GameDays', typeName('IntProperty'), i32(42)));
    expect(findProperty(body, 'GameDays')).toBe(42);
  });

  it('returns undefined when absent', () => {
    expect(findProperty(new Uint8Array(32), 'GameDays')).toBeUndefined();
  });

  it('skips malformed candidate tags and continues scanning', () => {
    const malformed = concat(fstr('GameDays'), i32(4), Uint8Array.of(65, 66, 67, 68));
    const body = concat(malformed, fstr('GameDays'), tag('GameDays', typeName('IntProperty'), i32(42)));
    expect(findProperty(body, 'GameDays')).toBe(42);
  });

  it('propagates value size errors instead of trying a later matching tag', () => {
    const body = concat(
      tag('GameDays', typeName('IntProperty'), concat(i32(1), i32(2))),
      tag('GameDays', typeName('IntProperty'), i32(42)),
    );
    expect(() => findProperty(body, 'GameDays')).toThrow(PropertyError);
    expect(() => findProperty(body, 'GameDays')).toThrow(/consumed 4 bytes, tag says 8/);
  });

  it('propagates truncated values after finding a real tag', () => {
    const bytes = tag('GameDays', typeName('IntProperty'), i32(42));
    expect(() => findProperty(bytes.subarray(0, bytes.length - 1), 'GameDays')).toThrow(RangeError);
  });

  it('respects the bounds and byte offset of a body view', () => {
    const bytes = concat(tag('GameDays', typeName('IntProperty'), i32(1)), tag('GameDays', typeName('IntProperty'), i32(42)));
    const secondTag = bytes.subarray(bytes.length / 2);
    expect(findProperty(secondTag, 'GameDays')).toBe(42);
    expect(findProperty(secondTag.subarray(secondTag.length), 'GameDays')).toBeUndefined();
  });
});

describe('buildSnapshot refuses a ledger that does not match the current day', () => {
  const INT = typeName('IntProperty');
  const struct = (name: string) => typeName('StructProperty', typeName(name, typeName('/Script/BeltTD')));
  const arrayOf = (inner: Uint8Array) => typeName('ArrayProperty', inner);
  const header: SaveHeader = {
    isSandbox: false, saveDay: 3, level: 1, wallet: {}, name: 'T', desc: '', savedAt: new Date(0),
    version: { major: 1, minor: 4, revision: 1, build: 5024 }, bodyOffset: 0,
  };
  const oneDay = tag('DailyIngredients', arrayOf(struct('IngredientRecordArray')), concat(i32(1), bag()));

  it('throws when DailyIngredients is missing but the save is past day 0', () => {
    expect(() => buildSnapshot('t.sav', header, tag('GameDays', INT, i32(3)), 'kdec')).toThrow(SaveShapeError);
  });

  it('throws when the completed-day count disagrees with GameDays', () => {
    expect(() => buildSnapshot('t.sav', header, concat(oneDay, tag('GameDays', INT, i32(3))), 'kdec'))
      .toThrow(/holds 1 completed days but the save is on day 3/);
  });

  it('throws when GameDays is not a number', () => {
    const body = concat(oneDay, tag('GameDays', typeName('StrProperty'), fstr('3')));
    expect(() => buildSnapshot('t.sav', header, body, 'kdec')).toThrow(/GameDays: expected a number/);
  });
});


it('scans only complete length-prefixed profit FStrings, deduplicating matches', () => {
  const body = concat(fstr('ContractProfit3'), fstr('ContractProfit1'), fstr('ContractProfit3'),
    fstr('PotionProfit5'), fstr('QuestSkill4'), fstr('XContractProfit9'), fstr('ContractProfit2extra'),
    i32(100), Buffer.from('ContractProfit99\0', 'latin1'));
  expect(readProfitSkills(body)).toEqual(['ContractProfit3', 'ContractProfit1', 'PotionProfit5']);
  expect(readProfitSkills(new Uint8Array())).toEqual([]);
});

it('extracts the fixture profit skill levels separately from UnlockedSkillPointsList', async () => {
  const snapshot = await fixtureSnapshot();
  for (const [prefix, level] of Object.entries({ Contract: 3, GeneralGoods: 5, Potion: 5, Liquid: 3, Jewel: 2, Relic: 3, Store: 2 })) {
    expect(snapshot.profitSkills.filter(s => s.startsWith(`${prefix}Profit`)).sort()).toEqual(Array.from({ length: level }, (_, i) => `${prefix}Profit${i + 1}`).sort());
  }
  expect(snapshot.profitSkills).toHaveLength(23);
  expect(snapshot.skills.some(s => /Profit\d+$/.test(s))).toBe(false);
});
