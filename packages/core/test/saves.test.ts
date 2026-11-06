import * as fs from 'node:fs';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveNotFoundError, listSaves, resolveSave, saveRoots } from '../src/saves';
import { REPO } from './helpers/fixture';

vi.mock('node:fs', async (importOriginal) => ({ ...await importOriginal<typeof import('node:fs')>() }));

let tmp: string;
beforeEach(() => {
  mkdirSync(path.join(REPO, '.cache'), { recursive: true });
  tmp = mkdtempSync(path.join(REPO, '.cache', 'test-saves-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tmp, { recursive: true, force: true });
});

const canChmod = process.platform !== 'win32' && process.getuid?.() !== 0;

// Creates a save-like file with a given mtime (seconds since epoch).
function save(rel: string, mtime: number, bytes = 16): string {
  const p = path.join(tmp, rel);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, Buffer.alloc(bytes, 1));
  utimesSync(p, mtime, mtime);
  return p;
}

describe('listSaves', () => {
  it('lists .sav files in the root and one level of slots, newest first', () => {
    const a = save('Slot A/SaveGame0.sav', 1000);
    const b = save('Slot B/AutoSave1.SAV', 3000);
    const c = save('Loose.sav', 2000);
    save('Slot A/notes.txt', 4000);
    save('Slot A/Empty.sav', 5000, 0);
    save('Slot A/deeper/Too.sav', 6000);
    const list = listSaves(tmp);
    expect(list.map((s) => s.file)).toEqual([b, c, a]);
    expect(list.map((s) => s.slot)).toEqual(['Slot B', '', 'Slot A']);
    expect(list[0]!.size).toBe(16);
  });

  it('breaks mtime ties by path', () => {
    const b = save('B/x.sav', 1000);
    const a = save('A/x.sav', 1000);
    expect(listSaves(tmp).map((s) => s.file)).toEqual([a, b]);
  });

  it('returns [] for a missing root', () => {
    expect(listSaves(path.join(tmp, 'nope'))).toEqual([]);
  });

  it.skipIf(!canChmod)('skips a chmod 000 sibling slot', () => {
    save('Blocked/x.sav', 2000);
    const good = save('Readable/x.sav', 1000);
    const blocked = path.join(tmp, 'Blocked');
    chmodSync(blocked, 0o000);
    try {
      expect(listSaves(tmp).map((s) => s.file)).toEqual([good]);
    } finally {
      chmodSync(blocked, 0o700);
    }
  });

  it('follows symlinked slots and .sav files and skips broken or looping links', () => {
    const original = save('Original/x.sav', 1000);
    symlinkSync(path.dirname(original), path.join(tmp, 'Linked Slot'), 'dir');
    symlinkSync(original, path.join(tmp, 'linked.SAV'), 'file');
    symlinkSync(path.join(tmp, 'missing'), path.join(tmp, 'broken.sav'), 'file');
    symlinkSync(path.join(tmp, 'loop.sav'), path.join(tmp, 'loop.sav'), 'file');
    expect(listSaves(tmp).map((s) => [s.file, s.slot])).toEqual([
      [path.join(tmp, 'Linked Slot/x.sav'), 'Linked Slot'],
      [original, 'Original'],
      [path.join(tmp, 'linked.SAV'), ''],
    ]);
  });

  it.each(['ENOENT', 'EACCES', 'EPERM', 'ELOOP', 'EIO'])('skips any stat/readdir failure (%s) across entries and roots', (code) => {
    const bad = save('Bad Slot/bad.sav', 3000);
    const good = save('Good Slot/good.sav', 1000);
    const rootFile = save('bad.sav', 2000);
    const realStat = fs.statSync;
    const realReadDir = fs.readdirSync;
    const error = Object.assign(new Error(code), { code });
    vi.spyOn(fs, 'statSync').mockImplementation(((p: fs.PathLike) => {
      if (p === rootFile) throw error;
      return realStat(p);
    }) as typeof fs.statSync);
    vi.spyOn(fs, 'readdirSync').mockImplementation(((p: fs.PathLike) => {
      if (p === path.dirname(bad) || p === path.join(tmp, 'bad-root')) throw error;
      return realReadDir(p);
    }) as typeof fs.readdirSync);
    expect(listSaves(tmp).map((s) => s.file)).toEqual([good]);
    expect(resolveSave({ roots: [path.join(tmp, 'bad-root'), tmp] }).file).toBe(good);
  });
});

describe('resolveSave', () => {
  it('picks the newest save across all roots', () => {
    const r1 = path.join(tmp, 'r1');
    const r2 = path.join(tmp, 'r2');
    save('r1/Slot/SaveGame0.sav', 1000);
    const newest = save('r2/Other/AutoSave0.sav', 2000);
    expect(resolveSave({ roots: [r1, r2] }).file).toBe(newest);
  });

  it('accepts --save <file> and --save <folder>', () => {
    const old = save('Slot/SaveGame0.sav', 1000);
    const nu = save('Slot/SaveGame1.sav', 2000);
    expect(resolveSave({ save: old }).file).toBe(old);
    expect(resolveSave({ save: path.join(tmp, 'Slot') }).file).toBe(nu);
    const upper = save('Upper.SAV', 3000);
    expect(resolveSave({ save: upper }).file).toBe(upper);
  });

  it('names a missing --save path', () => {
    const missing = path.join(tmp, 'missing.sav');
    expect(() => resolveSave({ save: missing })).toThrow(SaveNotFoundError);
    expect(() => resolveSave({ save: missing })).toThrow(missing);
    expect(() => resolveSave({ save: missing })).toThrow(/--save.*AF_SAVE_DIR/);
  });

  it('names every root and the overrides when nothing is found', () => {
    const r1 = path.join(tmp, 'r1');
    const r2 = path.join(tmp, 'r2');
    mkdirSync(r1);
    let message = '';
    try {
      resolveSave({ roots: [r1, r2] });
    } catch (e) {
      expect(e).toBeInstanceOf(SaveNotFoundError);
      message = (e as Error).message;
    }
    expect(message).toContain(r1);
    expect(message).toContain(r2);
    expect(message).toContain('AF_SAVE_DIR');
    expect(message).toContain('--save');
  });

  it('names an empty --save folder and the overrides', () => {
    expect(() => resolveSave({ save: tmp })).toThrow(SaveNotFoundError);
    expect(() => resolveSave({ save: tmp })).toThrow('no .sav files in');
    expect(() => resolveSave({ save: tmp })).toThrow(tmp);
    expect(() => resolveSave({ save: tmp })).toThrow(/--save.*AF_SAVE_DIR/);
  });

  it.each([
    ['notes.txt', 16, 'not a .sav file'],
    ['empty.sav', 0, 'save is zero bytes'],
  ] as const)('rejects explicit %s with a path and reason', (name, bytes, reason) => {
    const file = save(name, 1000, bytes);
    expect(() => resolveSave({ save: file })).toThrow(SaveNotFoundError);
    expect(() => resolveSave({ save: file })).toThrow(`${reason}: ${file}`);
  });

  it.skipIf(!canChmod)('names unreadable explicit files and folders', () => {
    const file = save('blocked.sav', 1000);
    const folder = path.join(tmp, 'blocked');
    mkdirSync(folder);
    for (const p of [file, folder]) {
      chmodSync(p, 0o000);
      try {
        expect(() => resolveSave({ save: p })).toThrow(SaveNotFoundError);
        expect(() => resolveSave({ save: p })).toThrow(`save not found or unreadable: ${p}`);
      } finally {
        chmodSync(p, 0o700);
      }
    }
  });

  it('never modifies the saves it looks at', () => {
    const p = save('Slot/SaveGame0.sav', 1000);
    const before = { bytes: readFileSync(p), mtime: statSync(p).mtimeMs };
    resolveSave({ roots: [tmp] });
    resolveSave({ save: p });
    expect(readFileSync(p).equals(before.bytes)).toBe(true);
    expect(statSync(p).mtimeMs).toBe(before.mtime);
  });
});

describe('saveRoots', () => {
  it('uses AF_SAVE_DIR alone when set', () => {
    for (const platform of ['linux', 'win32'] as const) {
      expect(saveRoots({ AF_SAVE_DIR: '/x/y', LOCALAPPDATA: 'C:\\Local' }, platform)).toEqual(['/x/y']);
    }
  });

  it('requires configuration on Linux', () => {
    expect(saveRoots({}, 'linux')).toEqual([]);
    expect(() => resolveSave({ roots: [] })).toThrow(SaveNotFoundError);
    expect(() => resolveSave({ roots: [] })).toThrow('af-ledger bootstrap');
  });

  it('uses LOCALAPPDATA on Windows', () => {
    expect(saveRoots({ LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' }, 'win32'))
      .toEqual(['C:\\Users\\a\\AppData\\Local\\AlchemyFactory\\Saved\\SaveGames']);
  });

});
