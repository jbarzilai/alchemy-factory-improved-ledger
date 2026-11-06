// Save file → SaveSnapshot. Reads the file once (read-only), decodes block 0 only, maps the ledger.
import { readFile as fsReadFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { SaveShapeError, asArray, asBag, bool, coins, num, optNum, str } from './access';
import {
  IncompleteSaveError, SaveFormatError, assertKraken, parseBlockChain, parseHeader, type BlockInfo, type SaveHeader,
} from './container';
import { selectDecoder } from './decoder/select';
import type { Decoder } from './decoder/types';
import { findProperty } from './locate';
import type { DayLedger, ItemDayRecord, QuestRecord, SaveSnapshot } from './model';
import type { PropValue } from './uprop';

export type ExtractOptions = {
  decoder?: Decoder;
  retries?: number; // extra attempts when the file looks partially written
  retryDelayMs?: number;
  readFile?: (file: string) => Promise<Uint8Array>;
};

function toItem(v: PropValue, where: string): ItemDayRecord {
  const b = asBag(v, where);
  return {
    item: str(b, 'IngredientName', where),
    soldCount: num(b, 'SellCount', where),
    soldValue: coins(b, 'SellProfit', where),
    dispatchedCount: num(b, 'DispatchedCount', where),
    dispatchValue: coins(b, 'DispatchProfit', where),
    restockCount: num(b, 'RestockCount', where),
    producedCount: num(b, 'ProduceCount', where),
    consumedCount: num(b, 'ConsumeCount', where),
  };
}

function toQuest(v: PropValue, where: string): QuestRecord {
  const b = asBag(v, where);
  const awardsAt = `${where}.Awards`;
  const awards = b.Awards === undefined ? {} : asBag(b.Awards, awardsAt);
  return {
    questId: str(b, 'QuestID', where),
    isMain: bool(b, 'IsMain', where),
    isRandom: bool(b, 'IsRandom', where),
    acceptDay: num(b, 'AcceptDate', where),
    submitDay: num(b, 'SubmitData', where),
    goldFactor: num(awards, 'GoldFactor', awardsAt),
    awardGold: coins(awards, 'Gold', awardsAt),
    requires: asArray(b.RequireProducts, `${where}.RequireProducts`).map((p, i) => {
      const at = `${where}.RequireProducts[${i}]`;
      const pb = asBag(p, at);
      return { item: str(pb, 'IngredientName', at), count: num(pb, 'Count', at) };
    }),
  };
}

// Profit names occur only in the second skill-name list. Require a complete, length-prefixed FString.
export function readProfitSkills(body: Uint8Array): string[] {
  const bytes = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  const text = bytes.toString('latin1');
  const skills = new Set<string>();
  for (const match of text.matchAll(/(?:GeneralGoods|Potion|Liquid|Jewel|Relic|Store|Contract)Profit\d+\0/g)) {
    const offset = match.index;
    if (offset >= 4 && bytes.readInt32LE(offset - 4) === match[0].length) skills.add(match[0].slice(0, -1));
  }
  return [...skills];
}

export function buildSnapshot(file: string, header: SaveHeader, body: Uint8Array, decoder: Decoder['name']): SaveSnapshot {
  const daily = asArray(findProperty(body, 'DailyIngredients'), 'DailyIngredients');
  const today = asArray(findProperty(body, 'IngredientCounts'), 'IngredientCounts');
  const skills = asArray(findProperty(body, 'UnlockedSkillPointsList'), 'UnlockedSkillPointsList').map((v, i) => {
    if (typeof v !== 'string') throw new SaveShapeError(`UnlockedSkillPointsList[${i}]: expected a name`);
    return v;
  });
  const quests = asArray(findProperty(body, 'CompletedQuests'), 'CompletedQuests')
    .map((q, i) => toQuest(q, `CompletedQuests[${i}]`));
  const gameDays = findProperty(body, 'GameDays');
  const gameSeconds = findProperty(body, 'GameSeconds');
  if (gameDays !== undefined && typeof gameDays !== 'number') throw new SaveShapeError('GameDays: expected a number');
  if (gameSeconds !== undefined && typeof gameSeconds !== 'number') throw new SaveShapeError('GameSeconds: expected a number');
  const currentSaveDay = gameDays ?? header.saveDay;
  // A short or missing history must not look like a valid (empty) ledger.
  if (daily.length !== currentSaveDay) {
    throw new SaveShapeError(`DailyIngredients holds ${daily.length} completed days but the save is on day ${currentSaveDay} (0-based)`);
  }
  const questsOn = (saveDay: number) => quests.filter((q) => q.submitDay === saveDay);

  const days: DayLedger[] = daily.map((d, saveDay) => {
    const where = `DailyIngredients[${saveDay}]`;
    const b = asBag(d, where);
    return {
      saveDay,
      displayDay: saveDay + 1,
      complete: true,
      profitCoef: optNum(b, 'ProfitCoef', where) ?? null,
      items: asArray(b.Records, `${where}.Records`).map((r, i) => toItem(r, `${where}.Records[${i}]`)),
      questsSubmitted: questsOn(saveDay),
    };
  });
  const current = days.length;
  days.push({
    saveDay: current,
    displayDay: current + 1,
    complete: false,
    profitCoef: null,
    items: today.map((r, i) => toItem(r, `IngredientCounts[${i}]`)),
    questsSubmitted: questsOn(current),
  });

  return {
    file,
    savedAt: header.savedAt,
    saveName: header.name,
    level: header.level,
    currentSaveDay,
    secondsIntoDay: gameSeconds ?? 0,
    wallet: header.wallet,
    decoder,
    skills,
    profitSkills: readProfitSkills(body),
    days,
  };
}

export async function extractSnapshot(file: string, opts: ExtractOptions = {}): Promise<SaveSnapshot> {
  const read = opts.readFile ?? ((f: string) => fsReadFile(f));
  const retries = opts.retries ?? 3;
  const delay = opts.retryDelayMs ?? 500;
  const decoder = opts.decoder ?? selectDecoder();
  for (let attempt = 0; ; attempt++) {
    const buf = await read(file);
    let header: SaveHeader;
    let blocks: BlockInfo[];
    try {
      header = parseHeader(buf);
      blocks = parseBlockChain(buf, header.bodyOffset);
    } catch (e) {
      if (e instanceof IncompleteSaveError && attempt < retries) {
        await sleep(delay);
        continue;
      }
      throw e;
    }
    const b0 = blocks[0];
    if (!b0) throw new SaveFormatError(`${file}: save has no compressed blocks`);
    assertKraken(buf, b0);
    const body = await decoder.decompress(buf.subarray(b0.dataOffset, b0.dataOffset + b0.compressedSize), b0.uncompressedSize);
    if (body.length !== b0.uncompressedSize) {
      throw new SaveFormatError(`${file}: block 0 decoded to ${body.length} bytes, expected ${b0.uncompressedSize}`);
    }
    return buildSnapshot(file, header, body, decoder.name);
  }
}
