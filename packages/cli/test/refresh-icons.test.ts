import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, expect, it, vi } from 'vitest';
import { REPO } from '../../core/test/helpers/fixture';
import { iconTable, texture } from '../../core/test/helpers/icons';
import { toc } from '../../core/test/helpers/toc';
import { createRefreshIconsCommand } from '../src/commands/refresh-icons';
import { capture } from './helpers';
import * as core from '@af-ledger/core';
import { loadIconStore } from '../../web/server/icons';

vi.mock('@af-ledger/core', async original => ({ ...await original<typeof import('@af-ledger/core')>() }));

mkdirSync(path.join(REPO, '.cache'), { recursive: true });
const temp = mkdtempSync(path.join(REPO, '.cache/icons-'));
const game = path.join(temp, 'game'), paks = path.join(game, 'AlchemyFactory/Content/Paks');
mkdirSync(paks, { recursive: true });
for (const ext of ['utoc', 'ucas']) writeFileSync(path.join(paks, `AlchemyFactory-Windows.${ext}`), 'synthetic metadata');
afterAll(() => rmSync(temp, { recursive: true, force: true }));
const seam = (count = 150) => vi.fn(async (_utoc: string, suffix: string) => suffix === 'DataTables/DT_Enemies.uasset' ? iconTable(count) : texture());

it('extracts shared textures once, writes deterministic indexed PNGs and removes stale PNGs', async () => {
  const output = path.join(temp, 'output');
  mkdirSync(output); writeFileSync(path.join(output, 'stale.png'), 'old');
  writeFileSync(path.join(output, 'index.json'), JSON.stringify({ Old: { file: 'stale.png' } }));
  writeFileSync(path.join(output, 'keep.txt'), 'keep');
  let previous = '';
  for (let n = 0; n < 2; n++) {
    const extract = seam(), c = capture({ AF_GAME_DIR: game });
    expect(await createRefreshIconsCommand(extract).run({ values: { output }, positionals: [] }, c.io), c.err()).toBe(0);
    expect(extract.mock.calls.map(call => call[1])).toEqual(['DataTables/DT_Enemies.uasset', 'AlchemyFactory/Content/Arts/UI/Ingredients/T_UI_Shared.uasset']);
    expect(c.out()).toContain('icons: 150 written, 0 problems');
    const text = readFileSync(path.join(output, 'index.json'), 'utf8'), index = JSON.parse(text);
    if (n) expect(text).toBe(previous);
    previous = text;
    expect(index._source).toEqual({ asset: 'DataTables/DT_Enemies.uasset', rows: 150, skipped: [], files: ['utoc', 'ucas'].map(ext => {
      const name = `AlchemyFactory-Windows.${ext}`, stat = statSync(path.join(paks, name));
      return { name, size: stat.size, modified: stat.mtime.toISOString() };
    }) });
    expect(index.Item0).toEqual({ file: 'Item0.png', texturePath: '/Game/Arts/UI/Ingredients/T_UI_Shared', sourceWidth: 128, sourceHeight: 128 });
    const png = readFileSync(path.join(output, 'Item0.png'));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([64, 64]);
    expect(loadIconStore(output).items()).toHaveLength(150);
  }
  expect(existsSync(path.join(output, 'stale.png'))).toBe(false);
  expect(readFileSync(path.join(output, 'keep.txt'), 'utf8')).toBe('keep');
});
it('writes nothing below the threshold, including when output already exists', async () => {
  const output = path.join(temp, 'few');
  const c = capture({ AF_GAME_DIR: game }), command = createRefreshIconsCommand(seam(149));
  expect(await command.run({ values: { output }, positionals: [] }, c.io)).toBe(1);
  expect(c.err()).toContain('149');
  expect(existsSync(output)).toBe(false);
  mkdirSync(output); writeFileSync(path.join(output, 'index.json'), 'keep');
  expect(await command.run({ values: { output }, positionals: [] }, c.io)).toBe(1);
  expect(readdirSync(output)).toEqual(['index.json']);
  expect(readFileSync(path.join(output, 'index.json'), 'utf8')).toBe('keep');
});
it('reports decode problems and writes nothing if textures cannot be decoded', async () => {
  const c = capture({ AF_GAME_DIR: game });
  const extract = vi.fn(async (_: string, suffix: string) => suffix.startsWith('DataTables') ? iconTable() : texture('PF_DXT5'));
  const output = path.join(temp, 'bad-textures');
  expect(await createRefreshIconsCommand(extract).run({ values: { output }, positionals: [] }, c.io)).toBe(1);
  expect(c.out() + c.err()).toContain('unsupported pixel format PF_DXT5');
  expect(extract).toHaveBeenCalledTimes(2);
  expect(existsSync(output)).toBe(false);
});
it('guards output folders and individual symlinked files before writing', async () => {
  const saves = path.join(temp, 'saves'); mkdirSync(saves);
  const alias = path.join(temp, 'alias'); symlinkSync(game, alias);
  const extract = seam();
  for (const output of [game, path.join(game, 'icons'), alias, saves]) {
    const c = capture({ AF_GAME_DIR: game, AF_SAVE_DIR: saves });
    expect(await createRefreshIconsCommand(extract).run({ values: { output }, positionals: [] }, c.io)).toBe(1);
    expect(c.err()).toContain('output must not');
  }
  expect(extract).not.toHaveBeenCalled();
  const output = path.join(temp, 'linked'); mkdirSync(output);
  const target = path.join(game, 'untouched'); writeFileSync(target, 'keep');
  symlinkSync(target, path.join(output, 'Item0.png'));
  const c = capture({ AF_GAME_DIR: game });
  expect(await createRefreshIconsCommand(extract).run({ values: { output }, positionals: [] }, c.io)).toBe(1);
  expect(readFileSync(target, 'utf8')).toBe('keep');
  expect(existsSync(path.join(output, 'index.json'))).toBe(false);
});
it.each(['DataTables/DT_Enemies.uasset', 'AlchemyFactory/Content/Arts/UI/Ingredients/T_UI_Shared.uasset'])('refuses patch containers holding %s', async asset => {
  const patch = path.join(paks, 'Patch_P.utoc'), output = path.join(temp, 'patch-output');
  writeFileSync(patch, toc(0, asset));
  try {
    const c = capture({ AF_GAME_DIR: game });
    expect(await createRefreshIconsCommand(seam()).run({ values: { output }, positionals: [] }, c.io)).toBe(1);
    expect(c.err()).toContain("patch containers aren't supported yet");
    expect(existsSync(output)).toBe(false);
  } finally { rmSync(patch); }
});
it('validates size and requires a game directory', async () => {
  const c = capture({});
  expect(await createRefreshIconsCommand().run({ values: {}, positionals: [] }, c.io)).toBe(2);
  for (const size of ['0', '-1', '1.5', 'NaN']) {
    expect(await createRefreshIconsCommand(seam()).run({ values: { 'game-dir': game, output: path.join(temp, 'size'), size }, positionals: [] }, c.io)).toBe(1);
  }
});
it.skipIf(!process.env.AF_GAME_DIR)('extracts the documented real-install icon set', async () => {
  const output = path.join(temp, 'real'), c = capture({ AF_GAME_DIR: process.env.AF_GAME_DIR });
  expect(await createRefreshIconsCommand().run({ values: { output }, positionals: [] }, c.io), c.err()).toBe(0);
  const index = JSON.parse(readFileSync(path.join(output, 'index.json'), 'utf8'));
  const entries = Object.entries(index).filter(([id]) => !id.startsWith('_')) as [string, { file: string }][];
  expect(entries).toHaveLength(180);
  for (const [, entry] of entries) {
    const png = readFileSync(path.join(output, entry.file));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([64, 64]);
  }
  expect(index.ManaPotion.sourceWidth).toBe(512); expect(index.Brandy.sourceWidth).toBe(128);
  expect(index.GoldDust3.texturePath).toBe(index.GoldDust.texturePath);
  expect(index.GoldDust3.texturePath).toMatch(/\/T_UI_GoldDust$/);
  expect(readdirSync(output).reduce((sum, name) => sum + statSync(path.join(output, name)).size, 0)).toBeLessThan(2_000_000);
});

it('keeps icons from partially parsed rows and reports unresolved rows alongside successful output', async () => {
  const bytes = Buffer.from(iconTable(151));
  // Last row has no DisplayIcon, with its old reference left as unparsed trailing data.
  bytes.writeUInt32LE(0x3fffffff, bytes.length - 8);
  const output = path.join(temp, 'partial'), c = capture({ AF_GAME_DIR: game });
  expect(await createRefreshIconsCommand(async (_, suffix) => suffix.startsWith('DataTables') ? bytes : texture())
    .run({ values: { output }, positionals: [] }, c.io), c.err()).toBe(0);
  expect(c.out()).toContain('icons: 150 written, 1 problems');
  expect(c.out()).toContain('Item150: no DisplayIcon');
  const index = JSON.parse(readFileSync(path.join(output, 'index.json'), 'utf8'));
  expect(index._source.skipped).toEqual(['Item150']);
  expect(index.Item150).toBeUndefined();
  // A trailing property mismatch after field 2 must not discard an already parsed icon.
  const partial = Buffer.concat([Buffer.from(iconTable()), Buffer.from([99])]);
  const other = path.join(temp, 'parsed-icon');
  expect(await createRefreshIconsCommand(async (_, suffix) => suffix.startsWith('DataTables') ? partial : texture())
    .run({ values: { output: other }, positionals: [] }, c.io), c.err()).toBe(0);
  expect(JSON.parse(readFileSync(path.join(other, 'index.json'), 'utf8'))._source.skipped).toEqual(['Item149']);
});

it('reports an invalid row ID without discarding valid icons', async () => {
  const bytes = Buffer.from(iconTable(151));
  const rows = core.parseEnemiesTable(bytes);
  rows.find(row => row.row === 'Item150')!.row = 'Bad_150';
  // The table scanner currently filters these IDs; exercise the command's per-row guard directly.
  vi.spyOn(core, 'parseEnemiesTable').mockReturnValueOnce(rows);
  const output = path.join(temp, 'invalid-id'), c = capture({ AF_GAME_DIR: game });
  expect(await createRefreshIconsCommand(async (_, suffix) => suffix.startsWith('DataTables') ? bytes : texture())
    .run({ values: { output }, positionals: [] }, c.io), c.err()).toBe(0);
  expect(c.out()).toContain('icons: 150 written, 1 problems');
  expect(c.out()).toContain('Bad_150: invalid item ID Bad_150');
  expect(loadIconStore(output).items()).toHaveLength(150);
  expect(existsSync(path.join(output, 'Bad_150.png'))).toBe(false);
});

it('names an incompatible --size in the error and writes nothing', async () => {
  const output = path.join(temp, 'incompatible-size'), c = capture({ AF_GAME_DIR: game });
  expect(await createRefreshIconsCommand(seam()).run({ values: { output, size: '48' }, positionals: [] }, c.io)).toBe(1);
  expect(c.err()).toContain('--size 48');
  expect(c.err()).not.toContain('game data format may have changed');
  expect(existsSync(output)).toBe(false);
});

it.each([false, true])('preserves unrelated PNGs with previous index: %s', async previous => {
  const output = path.join(temp, `unrelated-${previous}`); mkdirSync(output);
  writeFileSync(path.join(output, 'photo.png'), 'personal photo');
  writeFileSync(path.join(output, 'old.png'), 'old icon');
  if (previous) writeFileSync(path.join(output, 'index.json'), JSON.stringify({ Old: { file: 'old.png' } }));
  const c = capture({ AF_GAME_DIR: game });
  expect(await createRefreshIconsCommand(seam()).run({ values: { output }, positionals: [] }, c.io), c.err()).toBe(0);
  expect(readFileSync(path.join(output, 'photo.png'), 'utf8')).toBe('personal photo');
  expect(existsSync(path.join(output, 'old.png'))).toBe(!previous);
});

it('never deletes a previously indexed case variant of a freshly written icon', async () => {
  const output = path.join(temp, 'case-variant'); mkdirSync(output);
  writeFileSync(path.join(output, 'Item0.PNG'), 'previous');
  writeFileSync(path.join(output, 'index.json'), JSON.stringify({ Item0: { file: 'Item0.PNG' } }));
  const c = capture({ AF_GAME_DIR: game });
  expect(await createRefreshIconsCommand(seam()).run({ values: { output }, positionals: [] }, c.io), c.err()).toBe(0);
  // On a case-insensitive filesystem these are the same file. On Linux the old name must survive too.
  expect(existsSync(path.join(output, 'Item0.PNG'))).toBe(true);
  expect(readFileSync(path.join(output, 'Item0.png')).readUInt32BE(16)).toBe(64);
});
