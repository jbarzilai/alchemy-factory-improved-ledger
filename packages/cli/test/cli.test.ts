import * as fs from 'node:fs';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { REPO, fixtureSnapshot } from '../../core/test/helpers/fixture';
import { toc as syntheticToc } from '../../core/test/helpers/toc';
import { defaultConfigDir, defaultKdecPath } from '@af-ledger/core';
import * as paths from '../src/paths';
import { configDir, kdecPath } from '../src/paths';
import { run } from '../src/run';
import { VERSION } from '../src/version';
import { capture, makeSaveDirs } from './helpers';

vi.mock('../src/paths', async (original) => ({ ...await original<typeof import('../src/paths')>() }));

vi.mock('node:fs', async (importOriginal) => ({ ...await importOriginal<typeof import('node:fs')>() }));

let dirs: ReturnType<typeof makeSaveDirs>;
beforeAll(() => { dirs = makeSaveDirs(); });
afterAll(() => dirs.cleanup());
afterEach(() => vi.restoreAllMocks());

describe('af-ledger run()', () => {
  it('delegates paths to core and treats empty AF_KDEC as unset', () => {
    expect(kdecPath({ AF_KDEC: '' })).toBe(defaultKdecPath());
    expect(kdecPath({ AF_KDEC: '/custom/kdec' })).toBe('/custom/kdec');
    expect(configDir()).toBe(defaultConfigDir());
  });

  it('prints usage for --help and for no arguments', async () => {
    for (const argv of [['--help'], ['-h'], []]) {
      const c = capture();
      expect(await run(argv, c.io)).toBe(0);
      expect(c.out()).toContain('doctor');
      expect(c.out()).toContain('day [N]');
      expect(c.out()).toContain('days [--save');
      expect(c.out()).toContain('day [N] [--save <file|folder>] [--unit mixed|gold|silver|copper] [--top <n>]');
    }
  });

  it('prints the package version', async () => {
    const pkg = JSON.parse(readFileSync(path.join(REPO, 'packages/cli/package.json'), 'utf8'));
    expect(VERSION).toBe(pkg.version);
    const c = capture();
    expect(await run(['--version'], c.io)).toBe(0);
    expect(c.out()).toBe(`${VERSION}\n`);
  });

  it.each(['--help', '-h'])('prints usage for doctor %s without running checks', async (help) => {
    const c = capture({ AF_KDEC: '/nonexistent/kdec' });
    expect(await run(['doctor', help], c.io)).toBe(0);
    expect(c.out()).toContain('usage: af-ledger');
    expect(c.out()).not.toContain('FAIL');
    expect(c.err()).toBe('');
  });

  it('doctor scans each root only once', async () => {
    const readdir = vi.spyOn(fs, 'readdirSync');
    const c = capture({ AF_SAVE_DIR: dirs.saves });
    expect(await run(['doctor'], c.io), c.out()).toBe(0);
    expect(readdir.mock.calls.filter(([p]) => p === dirs.saves)).toHaveLength(1);
    expect(readdir.mock.calls.filter(([p]) => p === path.join(dirs.saves, 'Slot A'))).toHaveLength(1);
    expect(c.out()).toContain(path.join(dirs.saves, 'Slot A/SaveGame3.sav'));
  });

  it('rejects unknown commands and flags with exit 2', async () => {
    const a = capture();
    expect(await run(['nope'], a.io)).toBe(2);
    expect(a.err()).toContain('unknown command "nope"');
    expect(a.err()).toContain('usage:');
    const b = capture();
    expect(await run(['doctor', '--bogus'], b.io)).toBe(2);
    const c = capture();
    expect(await run(['toString'], c.io)).toBe(2);
  });

  it('doctor passes against a copy of the fixture save', async () => {
    const snap = await fixtureSnapshot();
    const c = capture({ AF_SAVE_DIR: dirs.saves });
    expect(await run(['doctor'], c.io), c.out()).toBe(0);
    expect(c.out()).not.toContain('FAIL');
    expect(c.out()).toContain(`${process.platform}-${process.arch}`);
    expect(c.out()).toContain(snap.saveName);
    expect(c.out()).toContain(`Day ${snap.currentSaveDay + 1} in progress`);
  });

  it('doctor warns about the optional env file without failing', async () => {
    const c = capture({ AF_SAVE_DIR: dirs.saves });
    expect(await run(['doctor'], c.io)).toBe(0);
    expect(c.out()).toMatch(/warn\s+env: no .env; run af-ledger bootstrap/);
    expect(c.out()).toMatch(/warn\s+game dir:/);
  });

  it('doctor reports the loaded env file and optional game directory', async () => {
    const c = capture({ AF_SAVE_DIR: dirs.saves, AF_GAME_DIR: dirs.empty });
    c.io.envFile = path.join(dirs.empty, 'settings');
    expect(await run(['doctor'], c.io)).toBe(0);
    expect(c.out()).toContain(`ok    env: ${c.io.envFile}`);
    expect(c.out()).toContain(`ok    game dir: ${dirs.empty}`);
    const missing = capture({ AF_SAVE_DIR: dirs.saves, AF_GAME_DIR: path.join(dirs.empty, 'missing') });
    expect(await run(['doctor'], missing.io)).toBe(0);
    expect(missing.out()).toMatch(/warn\s+game dir: .* is missing/);
  });

  it.skipIf(process.platform !== 'linux')('requires bootstrap without a configured save root', async () => {
    const c = capture({});
    expect(await run(['doctor'], c.io)).toBe(1);
    expect(c.out()).toMatch(/FAIL\s+save roots: .*af-ledger bootstrap/);
    const daily = capture({});
    expect(await run(['day'], daily.io)).toBe(1);
    expect(daily.err()).toContain('af-ledger bootstrap');
  });

  it('doctor fails and names an empty save root', async () => {
    const c = capture({ AF_SAVE_DIR: dirs.empty });
    expect(await run(['doctor'], c.io)).toBe(1);
    expect(c.out()).toMatch(new RegExp(`^FAIL\\s+save root: ${dirs.empty.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm'));
  });

  it('doctor --save names a missing file', async () => {
    const c = capture();
    expect(await run(['doctor', '--save', path.join(dirs.empty, 'x.sav')], c.io)).toBe(1);
    expect(c.out()).toMatch(/FAIL\s+newest save: save not found/);
    expect(c.out()).toContain('--save <file|folder>');
    expect(c.out()).toContain('AF_SAVE_DIR');
  });

  it('doctor --save overrides AF_SAVE_DIR', async () => {
    const c = capture({ AF_SAVE_DIR: dirs.empty });
    expect(await run(['doctor', '--save', dirs.saves], c.io), c.out()).toBe(0);
    expect(c.out()).not.toContain('FAIL');
    expect(c.out()).not.toContain(dirs.empty);
  });

  it('doctor reports a missing AF_KDEC override', async () => {
    const missing = path.join(dirs.empty, 'kdec');
    const c = capture({ AF_SAVE_DIR: dirs.saves, AF_KDEC: missing });
    expect(await run(['doctor'], c.io)).toBe(1);
    expect(c.out()).toContain(missing);
    expect(c.out()).toContain('npm run build:native');
    expect(c.out()).toMatch(/FAIL\s+kdec:/);
    expect(c.out()).not.toContain('read save:');
  });

  it.skipIf(process.platform === 'win32')('doctor rejects an existing kdec without execute permission', async () => {
    const binary = path.join(dirs.empty, 'not-executable');
    writeFileSync(binary, '#!/bin/sh\nexit 0\n');
    chmodSync(binary, 0o644);
    const c = capture({ AF_SAVE_DIR: dirs.saves, AF_KDEC: binary });
    expect(await run(['doctor'], c.io)).toBe(1);
    expect(c.out()).toMatch(/FAIL\s+kdec: .*not executable/);
    expect(c.out()).toContain(binary);
    expect(c.out()).toContain('npm run build:native');
    expect(c.out()).toContain('AF_KDEC');
    expect(c.out()).not.toContain('read save:');
  });
});


it.each(['matching', 'changed', 'invalid', 'absent', 'missing containers', 'patch'] as const)(
  'doctor checks game data with isolated config and game: %s', async (state) => {
    const temp = fs.mkdtempSync(path.join(REPO, '.cache/doctor-data-'));
    const game = path.join(temp, 'game');
    const cfg = path.join(temp, 'config');
    const paks = path.join(game, 'AlchemyFactory/Content/Paks');
    fs.mkdirSync(paks, { recursive: true });
    fs.mkdirSync(cfg);
    const { gameSourceFiles } = await import('@af-ledger/core');
    const toc = path.join(paks, 'AlchemyFactory-Windows.utoc');
    fs.writeFileSync(toc, 'toc');
    fs.writeFileSync(toc.replace('.utoc', '.ucas'), 'ucas');
    const data = JSON.parse(fs.readFileSync(path.join(defaultConfigDir(), 'game-items.json'), 'utf8'));
    data._source.files = await gameSourceFiles(game);
    for (const name of ['item-names.json', 'quest-skills.json']) {
      fs.writeFileSync(path.join(cfg, name), fs.readFileSync(path.join(defaultConfigDir(), name)));
    }
    fs.writeFileSync(path.join(cfg, 'game-items.json'), state === 'invalid' ? '{}' : JSON.stringify(data));
    if (state === 'changed') fs.writeFileSync(toc, 'changed size');
    if (state === 'missing containers') fs.rmSync(toc);
    if (state === 'patch') fs.writeFileSync(path.join(paks, 'AlchemyFactory-Windows_0_P.utoc'), syntheticToc(0, 'DataTables/DT_Enemies.uasset'));
    vi.spyOn(paths, 'configDir').mockReturnValue(cfg);
    const c = capture({ AF_SAVE_DIR: dirs.saves, ...(state === 'absent' ? {} : { AF_GAME_DIR: game }) });
    try {
      expect(await run(['doctor'], c.io), c.out()).toBe(state === 'invalid' ? 1 : 0);
      expect(c.out()).toMatch(/ok\s+item names: 179 items/);
      expect(c.out()).toMatch(/ok\s+quest skills: 4 items/);
      if (state === 'invalid') expect(c.out()).toMatch(/FAIL\s+game data: .*game-items.json/);
      else expect(c.out()).toContain(`179 items (game files of ${data._source.files[0].modified.slice(0, 10)})`);
      if (state === 'changed') {
        expect(c.out()).toMatch(/warn\s+game data: game files changed since extraction \(AlchemyFactory-Windows.utoc\)/);
        expect(c.out()).toContain('npm run refresh:game-data');
      } else if (state === 'missing containers') expect(c.out()).toMatch(/warn\s+game data: .*ENOENT/);
      else if (state === 'patch') expect(c.out()).toMatch(/warn\s+game data: patch containers also hold DataTables\/DT_Enemies.uasset \(AlchemyFactory-Windows_0_P.utoc\)/);
      else expect(c.out()).not.toMatch(/warn\s+game data:/);
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  },
);

it.each(['matching', 'changed', 'missing'] as const)('doctor reports optional bundled icons: %s', async state => {
  const temp = fs.mkdtempSync(path.join(REPO, '.cache/doctor-icons-'));
  const paks = path.join(temp, 'AlchemyFactory/Content/Paks');
  fs.mkdirSync(paks, { recursive: true });
  const utoc = path.join(paks, 'AlchemyFactory-Windows.utoc');
  fs.writeFileSync(utoc, 'toc'); fs.writeFileSync(utoc.replace('.utoc', '.ucas'), 'ucas');
  const { gameSourceFiles } = await import('@af-ledger/core');
  const files = await gameSourceFiles(temp);
  if (state === 'changed') fs.writeFileSync(utoc, 'new size');
  const icons = path.join(REPO, 'assets/icons');
  const realRead = fs.readFileSync, realList = fs.readdirSync;
  vi.spyOn(fs, 'readdirSync').mockImplementation(((dir: fs.PathLike, options?: unknown) => {
    if (String(dir) === icons) {
      if (state === 'missing') throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return ['Item.png', 'Other.png', 'index.json'];
    }
    return realList(dir, options as never);
  }) as typeof fs.readdirSync);
  vi.spyOn(fs, 'readFileSync').mockImplementation(((file: fs.PathOrFileDescriptor, options?: unknown) => {
    if (String(file) === path.join(icons, 'index.json')) return JSON.stringify({ _source: { files }, Item: { file: 'Item.png' } });
    return realRead(file, options as never);
  }) as typeof fs.readFileSync);
  try {
    const c = capture({ AF_SAVE_DIR: dirs.saves, AF_GAME_DIR: temp });
    expect(await run(['doctor'], c.io), c.out()).toBe(0);
    if (state === 'missing') expect(c.out()).toMatch(/warn\s+icons: bundled icons missing/);
    else expect(c.out()).toContain(`icons: 1 in ${icons}`);
    if (state === 'changed') expect(c.out()).toMatch(/warn\s+icons: game files changed since extraction \(AlchemyFactory-Windows.utoc\)/);
    if (state === 'matching') expect(c.out()).not.toMatch(/warn\s+icons:/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

it.each(['missing', 'unreadable', 'invalid'].flatMap(state => [false, true].map(game => ({ state, game }))))(
  'doctor names an unusable icon index: $state, game directory: $game', async ({ state, game }) => {
    const icons = path.join(REPO, 'assets/icons'), indexPath = path.join(icons, 'index.json');
    const realRead = fs.readFileSync, realList = fs.readdirSync;
    vi.spyOn(fs, 'readdirSync').mockImplementation(((dir: fs.PathLike, options?: unknown) =>
      String(dir) === icons ? ['Loose.png'] : realList(dir, options as never)) as typeof fs.readdirSync);
    vi.spyOn(fs, 'readFileSync').mockImplementation(((file: fs.PathOrFileDescriptor, options?: unknown) => {
      if (String(file) !== indexPath) return realRead(file, options as never);
      if (state === 'invalid') return '{broken';
      throw Object.assign(new Error(state), { code: state === 'missing' ? 'ENOENT' : 'EACCES' });
    }) as typeof fs.readFileSync);
    const c = capture({ AF_SAVE_DIR: dirs.saves, ...(game ? { AF_GAME_DIR: dirs.empty } : {}) });
    expect(await run(['doctor'], c.io), c.out()).toBe(0);
    expect(c.out()).toMatch(/warn\s+icons: .*index.json.*site shows no icons/);
    expect(c.out()).not.toMatch(/ok\s+icons:/);
  },
);
