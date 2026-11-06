import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { categoryBonusPct, GameDataError, GAME_PAKS, GAME_TOC, gameSourceFiles, loadGameItems, loadQuestSkills, dayMoney, patchContainersWithAsset, questBonus, staleGameFiles } from '../src';
import { REPO, fixtureSnapshot } from './helpers/fixture';
import { toc } from './helpers/toc';

mkdirSync(path.join(REPO, '.cache'), { recursive: true });
const temp = mkdtempSync(path.join(REPO, '.cache/game-items-'));
afterAll(() => rmSync(temp, { recursive: true, force: true }));
const raw = () => JSON.parse(readFileSync(path.join(REPO, 'config/game-items.json'), 'utf8'));

it('derives all four maps from the committed game data, omitting zero and non-shop bases', () => {
  const data = loadGameItems();
  expect(data.items.size).toBe(179);
  expect(data.questPrices.get('Catalyst2')).toBe(4222);
  expect(data.questPrices.get('Salt')).toBe(130);
  expect(data.shopBases.get('Salt')).toBe(100);
  expect(data.shopBases.get('Saturn')).toBe(150000);
  expect(data.categories.get('Salt')).toBe('Sundries');
  expect(data.categories.get('Saturn')).toBe('Relic');
  expect(data.purchasePrices.get('CashRegister')).toBe(3000);
  expect(data.purchasePrices.get('AdPortalSigil')).toBe(16000);
  expect(data.categories.has('Diamond1')).toBe(false);
  expect(data.questPrices.has('Aloe')).toBe(false);
  expect(data.shopBases.has('Catalyst2')).toBe(false);
  expect(data.items.get('ClockworkBird')!.npcShoppingBaseNum).toBe(-2);
});

it.each([
  ['shopCategory', 'Invalid'], ['stockCost', -1], ['questCost', 0.5], ['shopBase', undefined],
  ['id', undefined], ['nameKey', 4], ['allowPortalSupply', 1], ['npcShoppingBaseNum', 1.5],
])('rejects invalid item field %s and names the file and field', (field, value) => {
  const data = raw();
  data.items.Salt[field] = value;
  const file = path.join(temp, 'invalid.json');
  writeFileSync(file, JSON.stringify(data));
  expect(() => loadGameItems(file)).toThrow(file);
  expect(() => loadGameItems(file)).toThrow(`items.Salt.${field}`);
});

it('rejects missing source files and malformed roots, and gives the refresh hint for missing files', () => {
  const file = path.join(temp, 'source.json');
  const data = raw();
  delete data._source.files;
  writeFileSync(file, JSON.stringify(data));
  expect(() => loadGameItems(file)).toThrow(`${file}: invalid _source.files`);
  for (const json of ['{ bad', '[]', 'null']) {
    writeFileSync(file, json);
    expect(() => loadGameItems(file)).toThrow(file);
  }
  expect(() => loadGameItems(path.join(temp, 'missing.json'))).toThrow('npm run refresh:game-data');
});

it('prices quests and purchases on all 199 fixture days and preserves inferred bonuses', async () => {
  const data = loadGameItems();
  const snapshot = await fixtureSnapshot();
  const bonus = questBonus(snapshot.skills, loadQuestSkills());
  const money = snapshot.days.filter(d => d.complete).map(d => dayMoney(d, data.purchasePrices, { questPrices: data.questPrices, bonus }));
  expect(money).toHaveLength(199);
  for (const day of money) {
    expect(day.quests!.unpriced).toEqual([]);
    expect(day.purchasing.unpriced).toEqual([]);
  }
  expect(money[8].quests!.total).toBe(26734);
  expect(money[33].expenses).toBe(101900);
  expect(Object.fromEntries(categoryBonusPct(snapshot.days[198], 120, data.shopBases, data.categories)))
    .toEqual({ Sundries: 180, Potion: 180, Beverage: 140, Relic: 140, Jewelry: 124 });
});

it('compares size, modification time and missing files', () => {
  const stamped = [{ name: GAME_TOC, size: 5, modified: '2026-10-16T16:54:07.547Z' }];
  expect(staleGameFiles(stamped, structuredClone(stamped))).toEqual([]);
  for (const current of [[{ ...stamped[0], size: 6 }], [{ ...stamped[0], modified: 'other' }], []]) {
    expect(staleGameFiles(stamped, current)).toEqual([GAME_TOC]);
  }
});

it('stamps TOC then UCAS and checks other TOCs case-insensitively with whole-path suffix semantics', async () => {
  const paks = path.join(temp, GAME_PAKS);
  mkdirSync(paks, { recursive: true });
  writeFileSync(path.join(paks, GAME_TOC), toc());
  writeFileSync(path.join(paks, GAME_TOC.replace('.utoc', '.ucas')), 'payload');
  writeFileSync(path.join(paks, 'global.utoc'), 'ignored invalid global');
  writeFileSync(path.join(paks, 'X_P.UTOC'), toc());
  writeFileSync(path.join(paks, 'Unrelated.utoc'), toc(0, 'OldDataTables/DT_Enemies.uasset'));
  const files = await gameSourceFiles(temp);
  expect(files.map(f => f.name)).toEqual([GAME_TOC, 'AlchemyFactory-Windows.ucas']);
  expect(files[1].size).toBe(7);
  expect(await patchContainersWithAsset(temp, 'DataTables/DT_Enemies.uasset')).toEqual(['X_P.UTOC']);
  writeFileSync(path.join(paks, 'Broken.utoc'), 'invalid TOC');
  await expect(patchContainersWithAsset(temp, 'DataTables/DT_Enemies.uasset')).rejects.toThrow(GameDataError);
  await expect(patchContainersWithAsset(temp, 'DataTables/DT_Enemies.uasset')).rejects.toThrow('Broken.utoc');
  rmSync(path.join(paks, 'Broken.utoc'));
  mkdirSync(path.join(paks, 'Unreadable.utoc'));
  await expect(patchContainersWithAsset(temp, 'DataTables/DT_Enemies.uasset')).rejects.toThrow(GameDataError);
  await expect(patchContainersWithAsset(temp, 'DataTables/DT_Enemies.uasset')).rejects.toThrow('Unreadable.utoc');
});
