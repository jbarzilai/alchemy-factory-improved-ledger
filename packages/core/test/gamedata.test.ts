import { toc } from './helpers/toc';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { extractIoStoreFile, findIoStoreFile, GameDataError, parseEnemiesTable, readIoStoreToc, zenNames, type Decoder } from '../src';
import { concat, f64, fstr, i32, u8 } from './helpers/encode';
import { REPO } from './helpers/fixture';

function asset(names: string[], data: Uint8Array = new Uint8Array()): Uint8Array {
  const lengths = Buffer.alloc(names.length * 2);
  const strings = names.map((name, i) => {
    const wide = /[^\u0000-\u00ff]/.test(name);
    lengths.writeUInt16BE(name.length | (wide ? 0x8000 : 0), i * 2);
    return Buffer.from(name, wide ? 'utf16le' : 'latin1');
  });
  const map = concat(i32(names.length), i32(0), new Uint8Array(8 + names.length * 8), lengths, ...strings);
  const headerSize = 60 + map.length;
  return concat(i32(0), i32(headerSize), new Uint8Array(52), map, data);
}

function row(fields: Record<number, Uint8Array> = {}): Uint8Array {
  let mask = 0x3fffffff;
  for (const key of Object.keys(fields)) mask &= ~(1 << Number(key));
  return concat(Uint8Array.of(0x80, 0x3d), i32(mask), ...Object.entries(fields).sort(([a], [b]) => +a - +b).map(([, v]) => v));
}
const start = (idx: number, bytes: Uint8Array, num = 0) => concat(i32(idx), i32(num), bytes);
const parse = (bytes: Uint8Array) => parseEnemiesTable(asset(['Bandage'], start(0, bytes)))[0];

describe('zen names and DT_Enemies rows', () => {
  it('reads big-endian latin1 and UTF-16 lengths and the export offset', () => {
    const b = asset(['Café', '药水'], Uint8Array.of(99));
    expect(zenNames(b)).toEqual({ headerSize: b.length - 1, names: ['Café', '药水'] });
    b[0] = 1;
    expect(() => zenNames(b)).toThrow(GameDataError);
    expect(() => zenNames(new Uint8Array(4))).toThrow(GameDataError);
  });

  it('defaults every absent field', () => {
    expect(parse(row())).toEqual({ row: 'Bandage', exact: true, displayIcon: null, item: {
      id: null, nameKey: null, shopCategory: null, shopBase: 0, questCost: 0, stockCost: 0,
      randomQuestBaseNum: 0, npcShoppingBaseNum: 0, allowPortalSupply: false, hideInGame: false,
    } });
  });

  it('decodes economy fields while consuming every other property in order', () => {
    const key = Buffer.from('Ingredient_Name_Bandage\0');
    const fields: Record<number, Uint8Array> = {
      0: i32(101), 1: concat(new Uint8Array(4), u8(0x0b), new Uint8Array(8), i32(key.length), key),
      2: i32(5), 3: i32(6), 4: new Uint8Array(4), 5: concat(i32(2), new Uint8Array(16)),
      6: u8(1), 7: i32(100), 8: concat(i32(0), i32(16), i32(0)), 9: u8(3),
      10: concat(i32(0), i32(150), i32(0)), 11: f64(1), 12: f64(2), 13: f64(3),
      14: u8(1), 15: u8(0), 16: i32(160), 17: i32(10), 18: concat(i32(2), i32(1), i32(2)),
      19: concat(i32(1), i32(3)), 20: new Uint8Array(8), 21: u8(1),
      22: f64(4), 23: f64(5), 24: f64(6), 25: f64(7), 26: i32(4222), 27: i32(2), 28: i32(3), 29: u8(1),
    };
    expect(parse(row(fields))).toEqual({ row: 'Bandage', exact: true, displayIcon: 5, item: {
      id: 101, nameKey: 'Ingredient_Name_Bandage', shopCategory: 'Potion', shopBase: 150000,
      questCost: 4222, stockCost: 16000, randomQuestBaseNum: 160, npcShoppingBaseNum: 10,
      allowPortalSupply: true, hideInGame: true,
    } });
  });

  it.each([[0, null], [1, 'Sundries'], [2, 'Jewelry'], [3, 'Potion'], [4, 'Relic'], [5, null], [6, 'Beverage']])(
    'maps SellType %s to %s', (sell, category) => {
      expect(parse(row({ 9: u8(sell as number) })).item.shopCategory).toBe(category);
    });

  it('marks extra bytes, truncated properties, negative arrays and bad FText inexact without aborting', () => {
    const truncated = row({ 0: i32(1) }).subarray(0, 7);
    for (const bytes of [concat(row(), u8(1)), truncated, row({ 5: i32(-1) }), row({ 1: new Uint8Array(5) })]) {
      expect(parse(bytes).exact).toBe(false);
    }
    const b = asset(['Broken', 'Good'], concat(start(0, truncated), start(1, row())));
    expect(parseEnemiesTable(b).map((r) => [r.row, r.exact])).toEqual([['Broken', false], ['Good', true]]);
  });

  it('splits rows, ignores nonmatching names and numbered FNames, and sorts by code units', () => {
    const b = asset(['Zebra', 'bad_name', 'Alpha', 'Numbered'], concat(
      start(1, row()), start(3, row(), 1), start(0, row()), start(2, row()),
    ));
    expect(parseEnemiesTable(b).map((r) => [r.row, r.exact])).toEqual([['Alpha', true], ['Zebra', true]]);
  });
});

mkdirSync(path.join(REPO, '.cache'), { recursive: true });
const temp = mkdtempSync(path.join(REPO, '.cache/gamedata-'));
afterAll(() => rmSync(temp, { recursive: true, force: true }));

describe('IoStore extraction', () => {
  it('extracts across uncompressed blocks and rejects an unknown suffix', async () => {
    const file = path.join(temp, 'plain.utoc');
    const b = toc();
    writeFileSync(file, b);
    writeFileSync(file.replace('.utoc', '.ucas'), Buffer.from('abcdefghijklmnop'));
    expect(readIoStoreToc(b).files).toEqual([{ path: '../../../DataTables/DT_Enemies.uasset', offset: 5, length: 7 }]);
    const decoder: Decoder = { name: 'kdec', decompress: vi.fn() };
    expect(Buffer.from(await extractIoStoreFile(file, 'DT_Enemies.uasset', decoder)).toString()).toBe('fghijkl');
    expect(decoder.decompress).not.toHaveBeenCalled();
    await expect(extractIoStoreFile(file, 'unknown', decoder)).rejects.toThrow(GameDataError);
  });

  it('uses Decoder for Oodle blocks and verifies decoded length', async () => {
    const file = path.join(temp, 'compressed.utoc');
    writeFileSync(file, toc(1));
    writeFileSync(file.replace('.utoc', '.ucas'), Buffer.from('abcdefghijklmnop'));
    const decoder: Decoder = { name: 'kdec', decompress: vi.fn(async (src) => src) };
    expect(Buffer.from(await extractIoStoreFile(file, 'DT_Enemies.uasset', decoder)).toString()).toBe('fghijkl');
    expect(decoder.decompress).toHaveBeenCalledTimes(2);
    expect(decoder.decompress).toHaveBeenCalledWith(Buffer.from('abcdefgh'), 8);
    decoder.decompress = async () => new Uint8Array(1);
    await expect(extractIoStoreFile(file, 'DT_Enemies.uasset', decoder)).rejects.toThrow(GameDataError);
  });

  it('matches whole path segments and refuses an ambiguous suffix', () => {
    const at = (p: string) => ({ path: p, offset: 0, length: 1 });
    const base = at('../../../AlchemyFactory/Content/DataTables/DT_Enemies.uasset');
    expect(findIoStoreFile([at('../../../Old/OldDataTables/DT_Enemies.uasset'), base], 'DataTables/DT_Enemies.uasset')).toBe(base);
    expect(() => findIoStoreFile([base], 'Enemies.uasset')).toThrow(/not found/);
    expect(() => findIoStoreFile([at('../../../Plugins/X/Content/DataTables/DT_Enemies.uasset'), base], 'DataTables/DT_Enemies.uasset'))
      .toThrow(/ambiguous/);
  });

  it.each([[2, /encrypted/], [4, /signed/]])('rejects container flags %i', (flag, message) => {
    const b = Buffer.from(toc());
    b[80] = flag;
    expect(() => readIoStoreToc(b)).toThrow(message);
  });

  it('rejects malformed headers, cycles, unsupported methods and truncated blocks', async () => {
    expect(() => readIoStoreToc(new Uint8Array(4))).toThrow(GameDataError);
    const cyclic = Buffer.from(toc());
    // Directory starts after header, chunk ID, offset/length and two blocks; sibling points to self.
    cyclic.writeUInt32LE(0, 144 + 12 + 10 + 24 + fstr('../../../').length + 4 + 8);
    expect(() => readIoStoreToc(cyclic)).toThrow(/cyclic/);
    const file = path.join(temp, 'bad.utoc');
    writeFileSync(file, toc(2));
    writeFileSync(file.replace('.utoc', '.ucas'), Buffer.from('short'));
    const decoder: Decoder = { name: 'kdec', decompress: vi.fn() };
    await expect(extractIoStoreFile(file, 'DT_Enemies.uasset', decoder)).rejects.toThrow(/unsupported/);
    writeFileSync(file, toc());
    await expect(extractIoStoreFile(file, 'DT_Enemies.uasset', decoder)).rejects.toThrow(/truncated/);
  });
});
