import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, expect, it } from 'vitest';
import { REPO } from '../../core/test/helpers/fixture';
import { ansiToSvg, exportSlug, exportsDir, outputBlocked, writePng } from '../src/png';

mkdirSync(path.join(REPO, '.cache'), { recursive: true });
const temp = mkdtempSync(path.join(REPO, '.cache', 'png-test-'));
afterAll(() => rmSync(temp, { recursive: true, force: true }));

it('escapes XML, preserves spaces and converts bold and sign colours', () => {
  const { svg } = ansiToSvg('a\x1b[1mB\x1b[0m <&>\n');
  expect(svg).not.toContain('\x1b');
  expect(svg).toContain('&lt;&amp;&gt;');
  expect(svg).toMatch(/<tspan[^>]*font-weight="bold"[^>]*>B<\/tspan>/);
  expect(svg).toContain('xml:space="preserve"');
  expect(svg.match(/<text /g)).toHaveLength(1);
  const signs = ansiToSvg('\x1b[31m-\x1b[0m1 \x1b[32m+\x1b[0m2\x1b[4m').svg;
  expect(signs).toContain('fill="#f14c4c">-');
  expect(signs).toContain('fill="#23d18b">+');
  expect(signs).not.toContain('\x1b');
});

it('sizes by visible code points and drops trailing newlines', () => {
  expect(ansiToSvg('1234567890\n\x1b[32m1234\x1b[m\n\n')).toMatchObject({ width: Math.ceil(10 * .602 * 16 + 56), height: 100 });
  expect(ansiToSvg('█░→😀').width).toBe(Math.ceil(4 * .602 * 16 + 56));
});

it('writes a PNG at double SVG dimensions, creating parents', async () => {
  const file = path.join(temp, 'sub', 'test.png');
  await writePng('hello\nworld', file);
  expect(readFileSync(file).subarray(0, 8)).toEqual(Buffer.from('89504e470d0a1a0a', 'hex'));
  const svg = ansiToSvg('hello\nworld');
  expect(await sharp(file).metadata()).toMatchObject({ width: svg.width * 2, height: svg.height * 2 });
});

it('selects export directories and safe slugs', () => {
  expect(exportSlug('1 Point Oh')).toBe('1-point-oh');
  expect(exportSlug('--')).toBe('save');
  expect(exportsDir({})).toBe(path.join(REPO, 'exports'));
  expect(exportsDir({ AF_EXPORT_DIR: temp })).toBe(temp);
  expect(exportsDir({ AF_EXPORT_DIR: '' })).toBe(path.join(REPO, 'exports'));
});

it('blocks save roots, selected save directories, game paths and symlink aliases', () => {
  const root = path.join(temp, 'saves');
  mkdirSync(root);
  const save = path.join(root, 'slot', 'test.sav');
  expect(outputBlocked(path.join(temp, 'ok.png'), save, {})).toBeNull();
  for (const file of [path.join(root, 'x.png'), path.join(root, 'slot', 'sub', 'x.png'), '/x/AlchemyFactory/Saved/a.png', '/x/alchemyfactory/saved/a.png', path.join(temp, 'test.sav')]) {
    expect(outputBlocked(file, save, { AF_SAVE_DIR: root })).toBeTypeOf('string');
  }
  const alias = path.join(temp, 'alias');
  symlinkSync(root, alias);
  expect(outputBlocked(path.join(alias, 'new', 'x.png'), save, { AF_SAVE_DIR: root })).toBeTypeOf('string');
  const fileAlias = path.join(temp, 'alias.png');
  symlinkSync(path.join(root, 'future.png'), fileAlias);
  expect(outputBlocked(fileAlias, save, { AF_SAVE_DIR: root })).toBeTypeOf('string');
  expect(outputBlocked(path.join(temp, 'saves-other', 'x.png'), save, { AF_SAVE_DIR: root })).toBeNull();
});

it('compares save roots case-insensitively', () => {
  const root = path.join(temp, 'CaseSaves');
  mkdirSync(root);
  const lower = path.join(temp, 'casesaves', 'x.png');
  expect(outputBlocked(lower, path.join(root, 'slot', 'a.sav'), { AF_SAVE_DIR: root })).toBeTypeOf('string');
});

it('protects a save outside any save root only in its own folder, not subfolders', () => {
  const broad = path.join(temp, 'broad');
  const save = path.join(broad, 'copy.sav');
  expect(outputBlocked(path.join(broad, 'x.png'), save, {})).toBeTypeOf('string');
  expect(outputBlocked(path.join(broad, 'repo', 'exports', 'x.png'), save, {})).toBeNull();
});

it('drops control characters instead of producing invalid XML', async () => {
  const text = 'a\x01b\x1b[1mc\x7f\x1b[0m';
  expect(ansiToSvg(text).svg).not.toMatch(/[\x00-\x08\x0b-\x1f\x7f]/);
  expect(ansiToSvg(text).width).toBe(ansiToSvg('abc').width);
  await writePng(text, path.join(temp, 'control.png'));
});
