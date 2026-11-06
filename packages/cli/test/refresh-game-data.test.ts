import { toc } from '../../core/test/helpers/toc';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, expect, it, vi } from 'vitest';
import * as core from '@af-ledger/core';
import { KdecDecoder, type Decoder } from '@af-ledger/core';
import { REPO } from '../../core/test/helpers/fixture';
import { concat, i32 } from '../../core/test/helpers/encode';
import { createRefreshGameDataCommand } from '../src/commands/refresh-game-data';
import { loadEnv } from '../src/env';
import { run } from '../src/run';
import { capture } from './helpers';

vi.mock('@af-ledger/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@af-ledger/core')>();
  return { ...actual, parseEnemiesTable: vi.fn(actual.parseEnemiesTable) };
});

mkdirSync(path.join(REPO, '.cache'), { recursive: true });
const temp = mkdtempSync(path.join(REPO, '.cache/refresh-'));
const game = path.join(temp, 'game');
const utoc = path.join(game, 'AlchemyFactory/Content/Paks/AlchemyFactory-Windows.utoc');
mkdirSync(path.dirname(utoc), { recursive: true });
writeFileSync(utoc, 'synthetic TOC metadata');
writeFileSync(utoc.replace('.utoc', '.ucas'), 'synthetic UCAS metadata');
afterAll(() => rmSync(temp, { recursive: true, force: true }));

// Full synthetic zen asset, with unsorted all-default rows and optional malformed rows.
function asset(exact = 150, skipped = 1): Uint8Array {
  const names = Array.from({ length: exact }, (_, i) => `Item${String(exact - i).padStart(3, '0')}`)
    .concat(Array.from({ length: skipped }, (_, i) => `Skipped${i}`));
  const lengths = Buffer.alloc(names.length * 2);
  names.forEach((name, i) => lengths.writeUInt16BE(name.length, i * 2));
  const map = concat(i32(names.length), i32(0), new Uint8Array(8 + names.length * 8), lengths,
    ...names.map((name) => Buffer.from(name)));
  const rows = names.map((_, i) => concat(i32(i), i32(0), Uint8Array.of(0x80, 0x3d),
    i32(0x3fffffff), ...(i >= exact ? [Uint8Array.of(99)] : [])));
  return concat(i32(0), i32(60 + map.length), new Uint8Array(52), map, ...rows);
}

it('writes byte-identical sorted JSON with source metadata and skipped rows', async () => {
  const output = path.join(temp, 'items.json');
  const extract = vi.fn(async (_utoc: string, _suffix: string, _decoder: Decoder) => asset());
  const command = createRefreshGameDataCommand(extract);
  const env = { AF_GAME_DIR: game, AF_KDEC: '/custom/kdec' };
  for (let i = 0; i < 2; i++) {
    const c = capture(env);
    expect(await command.run({ values: { output }, positionals: [] }, c.io), c.err()).toBe(0);
    expect(c.out()).toBe(`150 rows written, 1 rows skipped -> ${output}\n`);
    const bytes = readFileSync(output, 'utf8');
    if (i === 0) writeFileSync(path.join(temp, 'first.json'), bytes);
    else expect(bytes).toBe(readFileSync(path.join(temp, 'first.json'), 'utf8'));
    const data = JSON.parse(bytes);
    expect(bytes).toBe(`${JSON.stringify(data, null, 2)}\n`);
    expect(Object.keys(data.items)).toEqual(Object.keys(data.items).sort());
    expect(data._source).toEqual({ files: [utoc, utoc.replace('.utoc', '.ucas')].map(file => ({ name: path.basename(file), size: statSync(file).size, modified: statSync(file).mtime.toISOString() })), asset: 'DataTables/DT_Enemies.uasset', rows: 151, skipped: ['Skipped0'] });
    expect(data.items).not.toHaveProperty('Skipped0');
  }
  expect(extract).toHaveBeenCalledWith(utoc, 'DataTables/DT_Enemies.uasset', expect.any(KdecDecoder));
  expect((extract.mock.calls[0][2] as KdecDecoder).binPath).toBe('/custom/kdec');
});

it('registers the command and reports missing game-dir as usage with both configuration names', async () => {
  const c = capture();
  expect(await run(['refresh-game-data'], c.io)).toBe(2);
  expect(c.err()).toContain('--game-dir');
  expect(c.err()).toContain('AF_GAME_DIR');
  const help = capture();
  expect(await run(['refresh-game-data', '--help'], help.io)).toBe(0);
  expect(help.out()).toContain('refresh-game-data [--game-dir <dir>] [--output <file>]');
});

it('uses AF_GAME_DIR loaded from .env and allows --game-dir to override it', async () => {
  const file = path.join(temp, 'settings');
  writeFileSync(file, `AF_GAME_DIR=${game}\n`);
  const command = createRefreshGameDataCommand(async () => asset());
  for (const override of [false, true]) {
    const c = capture(override ? { AF_GAME_DIR: '/missing/game' } : loadEnv({ AF_ENV_FILE: file }).env);
    expect(await command.run({ values: { output: path.join(temp, 'env.json'), ...(override ? { 'game-dir': game } : {}) }, positionals: [] }, c.io), c.err()).toBe(0);
  }
});

it('fails before extraction or writing when the .utoc is missing', async () => {
  const output = path.join(temp, 'missing.json');
  const extract = vi.fn(async () => asset());
  const c = capture({ AF_GAME_DIR: path.join(temp, 'no-game') });
  expect(await createRefreshGameDataCommand(extract).run({ values: { output }, positionals: [] }, c.io)).toBe(1);
  expect(c.err()).toContain('AlchemyFactory/Content/Paks');
  expect(extract).not.toHaveBeenCalled();
  expect(existsSync(output)).toBe(false);
});

it.each([[150, 6], [149, 0]])('refuses changed formats (%i exact, %i skipped) without overwriting', async (exact, skipped) => {
  const output = path.join(temp, `invalid-${exact}.json`);
  const command = createRefreshGameDataCommand(async () => asset(exact, skipped));
  const c = capture({ AF_GAME_DIR: game });
  expect(await command.run({ values: { output }, positionals: [] }, c.io)).toBe(1);
  expect(c.err()).toContain('format may have changed');
  expect(existsSync(output)).toBe(false);
  writeFileSync(output, 'keep me');
  expect(await command.run({ values: { output }, positionals: [] }, c.io)).toBe(1);
  expect(readFileSync(output, 'utf8')).toBe('keep me');
});

it('protects game paths case-insensitively, including symlinks, and save paths', async () => {
  const alias = path.join(temp, 'alias');
  symlinkSync(game, alias, 'dir');
  const target = path.join(game, 'existing.json');
  writeFileSync(target, 'untouched');
  const link = path.join(temp, 'file-link.json');
  symlinkSync(target, link);
  const dangling = path.join(temp, 'dangling.json');
  symlinkSync(path.join(game, 'new.json'), dangling);
  const saves = path.join(temp, 'saves');
  mkdirSync(saves);
  const extract = vi.fn(async () => asset());
  const command = createRefreshGameDataCommand(extract);
  const outputs = [game, path.join(game, 'items.json'), path.join(game.toUpperCase(), 'items.json'),
    path.join(alias, 'items.json'), link, dangling, path.join(saves, 'items.json'), path.join(temp, 'save.sav')];
  for (const output of outputs) {
    const c = capture({ AF_GAME_DIR: game, AF_SAVE_DIR: saves });
    expect(await command.run({ values: { output }, positionals: [] }, c.io), output).toBe(1);
    expect(c.err()).toMatch(/output must not/);
  }
  expect(extract).not.toHaveBeenCalled();
  expect(readFileSync(target, 'utf8')).toBe('untouched');
  expect(existsSync(path.join(game, 'new.json'))).toBe(false);
});

it('refuses duplicate row names without writing', async () => {
  const output = path.join(temp, 'duplicate.json');
  // A second row start reusing name index 0 (Item150) at the end of the export data.
  const duplicate = concat(asset(150, 0), i32(0), i32(0), Uint8Array.of(0x80, 0x3d), i32(0x3fffffff));
  const c = capture({ AF_GAME_DIR: game });
  expect(await createRefreshGameDataCommand(async () => duplicate).run({ values: { output }, positionals: [] }, c.io)).toBe(1);
  expect(c.err()).toContain('duplicate DT_Enemies rows: Item150');
  expect(existsSync(output)).toBe(false);
});

it('refuses data the ledger would reject (negative price) without replacing the output', async () => {
  const output = path.join(temp, 'invalid-price.json');
  writeFileSync(output, 'keep me');
  const parse = vi.mocked(core.parseEnemiesTable);
  const actual = parse.getMockImplementation()!;
  parse.mockImplementationOnce((bytes) => {
    const rows = actual(bytes);
    rows[0] = { ...rows[0], item: { ...rows[0].item, stockCost: -1 } };
    return rows;
  });
  const c = capture({ AF_GAME_DIR: game });
  expect(await createRefreshGameDataCommand(async () => asset()).run({ values: { output }, positionals: [] }, c.io)).toBe(1);
  expect(c.err()).toMatch(/extracted game data: invalid items\.Item\d+\.stockCost/);
  expect(readFileSync(output, 'utf8')).toBe('keep me');
});

it('creates missing output folders', async () => {
  const output = path.join(temp, 'new/nested/items.json');
  const c = capture({ AF_GAME_DIR: game });
  expect(await createRefreshGameDataCommand(async () => asset()).run({ values: { output }, positionals: [] }, c.io), c.err()).toBe(0);
  expect(existsSync(output)).toBe(true);
});

it('protects AF_GAME_DIR when --game-dir points at another copy', async () => {
  const copy = path.join(temp, 'game-copy');
  mkdirSync(path.join(copy, 'AlchemyFactory/Content/Paks'), { recursive: true });
  writeFileSync(path.join(copy, 'AlchemyFactory/Content/Paks/AlchemyFactory-Windows.utoc'), 'copy');
  const output = path.join(game, 'from-copy.json');
  const c = capture({ AF_GAME_DIR: game });
  expect(await createRefreshGameDataCommand(async () => asset()).run({ values: { output, 'game-dir': copy }, positionals: [] }, c.io)).toBe(1);
  expect(c.err()).toContain('output must not be inside the game directory');
  expect(existsSync(output)).toBe(false);
});


it.each([true, false])('refuses asset patches before extraction or any write: %s', async (hasAsset) => {
  const patch = path.join(path.dirname(utoc), 'X_P.utoc');
  const output = path.join(temp, `patch-${hasAsset}/items.json`);
  writeFileSync(patch, toc(0, hasAsset ? 'DataTables/DT_Enemies.uasset' : 'DataTables/Other.uasset'));
  const extract = vi.fn(async () => asset());
  const c = capture({ AF_GAME_DIR: game });
  try {
    const code = await createRefreshGameDataCommand(extract).run({ values: { output }, positionals: [] }, c.io);
    expect(code, c.err()).toBe(hasAsset ? 1 : 0);
    if (hasAsset) {
      expect(c.err()).toContain('X_P.utoc');
      expect(c.err()).toContain("patch containers aren't supported yet");
      expect(extract).not.toHaveBeenCalled();
      expect(existsSync(path.dirname(output))).toBe(false);
      writeFileSync(path.join(temp, 'existing-patch.json'), 'keep me');
      expect(await createRefreshGameDataCommand(extract).run({ values: { output: path.join(temp, 'existing-patch.json') }, positionals: [] }, c.io)).toBe(1);
      expect(readFileSync(path.join(temp, 'existing-patch.json'), 'utf8')).toBe('keep me');
    } else expect(existsSync(output)).toBe(true);
  } finally { rmSync(patch); }
});

it('refuses an unreadable patch TOC without writing', async () => {
  const patch = path.join(path.dirname(utoc), 'Broken.utoc');
  const output = path.join(temp, 'broken/items.json');
  writeFileSync(patch, 'invalid TOC');
  const extract = vi.fn(async () => asset());
  const c = capture({ AF_GAME_DIR: game });
  try {
    expect(await createRefreshGameDataCommand(extract).run({ values: { output }, positionals: [] }, c.io)).toBe(1);
    expect(c.err()).toContain('Broken.utoc');
    expect(extract).not.toHaveBeenCalled();
    expect(existsSync(path.dirname(output))).toBe(false);
  } finally { rmSync(patch); }
});
