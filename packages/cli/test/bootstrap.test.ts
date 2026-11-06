import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { REPO } from '../../core/test/helpers/fixture';
import { createBootstrapCommand } from '../src/commands/bootstrap';
let temp: string;
beforeEach(() => {
  mkdirSync(path.join(REPO, '.cache'), { recursive: true });
  temp = mkdtempSync(path.join(REPO, '.cache/bootstrap-'));
});
afterEach(() => rmSync(temp, { recursive: true, force: true }));
const saves = 'C:\\Users\\a b\\AppData\\Local\\AlchemyFactory\\Saved\\SaveGames';
const game = '/mnt/d/Games/steamapps/common/Alchemy Factory';
async function bootstrap(saveDir: string | null = saves, gameDir: string | null = game, force = false, file = path.join(temp, 'env')) {
  let out = '';
  const command = createBootstrapCommand({ detectSaveDir: () => saveDir, detectGameDir: () => gameDir });
  const code = await command.run({ values: { force }, positionals: [] }, {
    env: { AF_ENV_FILE: file }, out: (s) => { out += s; }, err: (s) => { out += s; },
  });
  return { code, out, file };
}
it('writes the template, preserving comments and literal paths', async () => {
  const r = await bootstrap();
  expect(r.code).toBe(0);
  expect(r.out).toContain('wrote');
  const content = readFileSync(r.file, 'utf8');
  expect(parseEnv(content)).toMatchObject({ AF_SAVE_DIR: saves, AF_GAME_DIR: game });
  expect(content).toBe(readFileSync(path.join(REPO, '.env.example'), 'utf8')
    .replace('AF_SAVE_DIR=', `AF_SAVE_DIR='${saves}'`).replace('AF_GAME_DIR=', `AF_GAME_DIR='${game}'`));
});
it('refuses overwrite unless forced', async () => {
  const file = path.join(temp, 'env');
  writeFileSync(file, 'original');
  expect(await bootstrap()).toMatchObject({ code: 1, out: expect.stringContaining('--force') });
  expect(readFileSync(file, 'utf8')).toBe('original');
  expect((await bootstrap(saves, game, true)).code).toBe(0);
  expect(readFileSync(file, 'utf8')).toBe(`original\nAF_SAVE_DIR='${saves}'\nAF_GAME_DIR='${game}'\n`);
});
it('--force keeps hand-set values and only replaces detected paths', async () => {
  const file = path.join(temp, 'env');
  writeFileSync(file, "# mine\nAF_SAVE_DIR='/manual/saves'\nAF_GAME_DIR=\nAF_KDEC='/opt/kdec'\nAF_EXPORT_DIR='/tmp/x'\n");
  expect((await bootstrap(null, game, true)).code).toBe(1);
  expect(readFileSync(file, 'utf8')).toBe(`# mine\nAF_SAVE_DIR='/manual/saves'\nAF_GAME_DIR='${game}'\nAF_KDEC='/opt/kdec'\nAF_EXPORT_DIR='/tmp/x'\n`);
});
it('writes a path containing an apostrophe with backticks', async () => {
  const odd = "C:\\Users\\O'Brien\\new\\SaveGames";
  const r = await bootstrap(odd);
  expect(r.code).toBe(0);
  expect(parseEnv(readFileSync(r.file, 'utf8')).AF_SAVE_DIR).toBe(odd);
});
it('writes blanks for failed detection and only saves determine success', async () => {
  expect((await bootstrap(null)).code).toBe(1);
  expect(parseEnv(readFileSync(path.join(temp, 'env'), 'utf8')).AF_SAVE_DIR).toBe('');
  expect((await bootstrap(saves, null, true)).code).toBe(0);
});
it('rejects disabled env files', async () => {
  expect((await bootstrap(saves, game, false, 'none')).code).toBe(2);
});
it('protects detected save folders and symlink targets even with force', async () => {
  const root = path.join(temp, 'saves');
  mkdirSync(root);
  const file = path.join(root, 'env');
  expect((await bootstrap(root, game, true, file)).code).toBe(2);
  const link = path.join(temp, 'link');
  symlinkSync(root, link);
  expect((await bootstrap(root, game, true, path.join(link, 'env'))).code).toBe(2);
  expect((await bootstrap(saves, game, true, path.join(temp, 'x.sav'))).code).toBe(2);
});
