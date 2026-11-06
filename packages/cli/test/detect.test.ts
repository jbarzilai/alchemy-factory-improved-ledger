import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { REPO } from '../../core/test/helpers/fixture';
import { detectGameDir, detectSaveDir, parseLibraryFolders, parseSteamPath, type Runner } from '../src/detect';
mkdirSync(path.join(REPO, '.cache'), { recursive: true });
const temp = mkdtempSync(path.join(REPO, '.cache/detect-'));
afterAll(() => rmSync(temp, { recursive: true, force: true }));
const vdf = String.raw`"libraryfolders" { "0" { "path" "C:\\Program Files (x86)\\Steam" } "1" { "path" "D:\\Games" } }`;
it('parses registry and VDF paths', () => {
  expect(parseSteamPath('HKEY_CURRENT_USER\\Software\\Valve\\Steam\n    SteamPath    REG_SZ    c:/program files (x86)/steam\r\n'))
    .toBe('c:/program files (x86)/steam');
  expect(parseSteamPath('garbage')).toBeNull();
  expect(parseLibraryFolders(vdf)).toEqual(['C:\\Program Files (x86)\\Steam', 'D:\\Games']);
});
it('finds the game in the second converted library and falls back when registry fails', () => {
  const root = path.join(temp, 'steam');
  const second = path.join(temp, 'second');
  const game = path.join(second, 'steamapps/common/Alchemy Factory');
  mkdirSync(path.join(root, 'steamapps'), { recursive: true });
  mkdirSync(game, { recursive: true });
  writeFileSync(path.join(root, 'steamapps/libraryfolders.vdf'), vdf);
  for (const registry of [' SteamPath REG_SZ C:\\Program Files (x86)\\Steam', null]) {
    const run: Runner = (cmd, args) => cmd === 'reg.exe' ? registry
      : args[1] === 'C:\\Program Files (x86)\\Steam' ? root : args[1] === 'D:\\Games' ? second : null;
    expect(detectGameDir({ platform: 'linux', run })).toBe(game);
    expect(detectGameDir({ platform: 'linux', run, isDir: () => false })).toBeNull();
  }
  expect(detectGameDir({ platform: 'linux', run: () => null })).toBeNull();
});
it('detects saves on Windows and Linux with injected commands', () => {
  const local = 'C:\\Users\\a b\\AppData\\Local';
  expect(detectSaveDir({ platform: 'win32', env: { LOCALAPPDATA: local }, isDir: () => true }))
    .toBe(local + '\\AlchemyFactory\\Saved\\SaveGames');
  const run: Runner = (cmd, args) => cmd === 'cmd.exe' ? local : args[1] === local ? temp : null;
  expect(detectSaveDir({ platform: 'linux', run, isDir: () => true }))
    .toBe(path.join(temp, 'AlchemyFactory/Saved/SaveGames'));
  expect(detectSaveDir({ platform: 'linux', run, isDir: () => false })).toBeNull();
  for (const value of [null, '%LOCALAPPDATA%']) {
    expect(detectSaveDir({ platform: 'linux', run: () => value, isDir: () => true })).toBeNull();
  }
});
