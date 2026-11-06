// Finds saves using read-only metadata and access checks (save files are read-only).
import { accessSync, constants, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export type SaveFile = { file: string; slot: string; mtimeMs: number; size: number };

export class SaveNotFoundError extends Error {
  override name = 'SaveNotFoundError';
}

const HINT = 'use --save <file|folder>, set AF_SAVE_DIR or run af-ledger bootstrap';

// Code-unit path comparison, so tie order doesn't depend on the locale.
const newestFirst = (a: SaveFile, b: SaveFile) =>
  b.mtimeMs - a.mtimeMs || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0);

export function saveRoots(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (env.AF_SAVE_DIR) return [env.AF_SAVE_DIR];
  if (platform === 'win32') {
    return env.LOCALAPPDATA ? [path.win32.join(env.LOCALAPPDATA, 'AlchemyFactory', 'Saved', 'SaveGames')] : [];
  }
  return [];
}

// *.sav in root (slot '') and in each direct subfolder (slot = folder name); zero-byte files skipped.
export function listSaves(root: string): SaveFile[] {
  const out: SaveFile[] = [];
  const scan = (dir: string, slot: string, descend: boolean) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e);
      try {
        const st = statSync(p);
        if (st.isDirectory()) {
          if (descend) scan(p, e, false);
        } else if (st.isFile() && /\.sav$/i.test(e) && st.size > 0) {
          accessSync(p, constants.R_OK);
          out.push({ file: p, slot, mtimeMs: st.mtimeMs, size: st.size });
        }
      } catch {
        // A rotating autosave or inaccessible profile must not hide its siblings.
      }
    }
  };
  scan(root, '', true);
  return out.sort(newestFirst);
}

export function resolveSave(opts: { save?: string; roots?: string[] } = {}): SaveFile {
  if (opts.save) {
    const p = path.resolve(opts.save);
    let st;
    try {
      st = statSync(p);
      accessSync(p, constants.R_OK);
    } catch {
      throw new SaveNotFoundError(`save not found or unreadable: ${p}; ${HINT}`);
    }
    if (st.isFile()) {
      if (!/\.sav$/i.test(p)) throw new SaveNotFoundError(`not a .sav file: ${p}; ${HINT}`);
      if (st.size === 0) throw new SaveNotFoundError(`save is zero bytes: ${p}; ${HINT}`);
      return { file: p, slot: path.basename(path.dirname(p)), mtimeMs: st.mtimeMs, size: st.size };
    }
    if (!st.isDirectory()) throw new SaveNotFoundError(`not a save file or folder: ${p}; ${HINT}`);
    const newest = listSaves(p)[0];
    if (!newest) throw new SaveNotFoundError(`no .sav files in ${p}; ${HINT}`);
    return newest;
  }
  const roots = opts.roots ?? saveRoots();
  return newestSave(roots.flatMap(listSaves), roots);
}

// Select from a completed discovery pass, preserving resolveSave's error and tie order.
export function newestSave(saves: SaveFile[], roots: string[]): SaveFile {
  const newest = [...saves].sort(newestFirst)[0];
  if (newest) return newest;
  if (roots.length === 0) {
    throw new SaveNotFoundError('no saves folder configured; run af-ledger bootstrap or set AF_SAVE_DIR; use --save <file|folder>');
  }
  throw new SaveNotFoundError(`no .sav files found (searched: ${roots.join(', ')}); ${HINT}`);
}
