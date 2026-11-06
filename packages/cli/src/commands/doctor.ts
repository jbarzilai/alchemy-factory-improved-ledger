// af-ledger doctor: one ok/FAIL line per check; exit 1 if any check fails.
import { accessSync, constants, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  KdecDecoder, extractSnapshot, listSaves, loadGameItems, loadItemNames, loadQuestSkills, gameSourceFiles, staleGameFiles, patchContainersWithAsset, newestSave, resolveSave, saveRoots,
  kdecMissingHint, repoRoot, type GameSourceFile, type SaveFile,
} from '@af-ledger/core';
import { configDir, kdecPath } from '../paths';
import type { Command } from '../run';

export const doctor: Command = {
  options: { save: { type: 'string' } },
  async run({ values }, io) {
    let failed = false;
    const line = (ok: boolean, what: string, detail: string) => {
      if (!ok) failed = true;
      io.out(`${ok ? 'ok  ' : 'FAIL'}  ${what}: ${detail}\n`);
    };
    const warn = (what: string, detail: string) => io.out(`warn  ${what}: ${detail}\n`);
    const check = <T>(what: string, f: () => T, show: (v: T) => string): T | undefined => {
      try {
        const v = f();
        line(true, what, show(v));
        return v;
      } catch (e) {
        line(false, what, (e as Error).message);
        return undefined;
      }
    };

    const major = Number(process.versions.node.split('.')[0]);
    line(major >= 22, 'node', `${process.version} (${process.platform}-${process.arch}; need >= 22)`);

    if (io.envError) line(false, 'env', io.envError);
    else if (io.envFile) line(true, 'env', io.envFile);
    else if (io.env.AF_ENV_FILE === 'none') warn('env', 'disabled (AF_ENV_FILE=none)');
    else warn('env', 'no .env; run af-ledger bootstrap');
    const game = io.env.AF_GAME_DIR;
    let gameExists = false;
    try { gameExists = Boolean(game && statSync(game).isDirectory()); } catch { /* optional */ }
    if (gameExists) line(true, 'game dir', game!);
    else warn('game dir', game ? `${game} is missing` : 'unset; run af-ledger bootstrap');

    const kdec = check('kdec', () => {
      const p = kdecPath(io.env);
      try {
        if (!statSync(p).isFile()) throw new Error('not a file');
        accessSync(p, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
      } catch {
        throw new Error(`${p} is missing or not executable; ${kdecMissingHint()}, or fix AF_KDEC`);
      }
      return p;
    }, (p) => p);

    const cfg = check('config', () => configDir(), (d) => d);
    if (cfg) {
      const data = check('game data', () => loadGameItems(path.join(cfg, 'game-items.json')),
        (data) => `${data.items.size} items (game files of ${data.source.files[0].modified.slice(0, 10)})`);
      if (gameExists && data) {
        try {
          const stale = staleGameFiles(data.source.files, await gameSourceFiles(game!));
          if (stale.length) warn('game data', `game files changed since extraction (${stale.join(', ')}); run npm run refresh:game-data`);
          const patches = await patchContainersWithAsset(game!, data.source.asset);
          if (patches.length) warn('game data', `patch containers also hold ${data.source.asset} (${patches.join(', ')}); the ledger may use outdated prices`);
        } catch (error) { warn('game data', (error as Error).message); }
      }
      check('item names', () => loadItemNames(path.join(cfg, 'item-names.json')), (names) => `${names.size} items`);
      check('quest skills', () => loadQuestSkills(path.join(cfg, 'quest-skills.json')), (skills) => `${skills.size} items`);
    }

    try {
      const dir = path.join(repoRoot(), 'assets/icons');
      readdirSync(dir);
      const indexPath = path.join(dir, 'index.json');
      let index: { _source?: { files: GameSourceFile[] }; [id: string]: unknown };
      try {
        index = JSON.parse(readFileSync(indexPath, 'utf8'));
        if (!index || typeof index !== 'object' || Array.isArray(index)) throw new Error('expected an index object');
      } catch (error) {
        throw new Error(`${indexPath} missing or unreadable (${(error as Error).message}); the site shows no icons without it; run af-ledger refresh-icons`);
      }
      const count = Object.entries(index).filter(([id, entry]) => !id.startsWith('_') &&
        typeof (entry as { file?: unknown } | null)?.file === 'string' &&
        /^[^/\\]+\.png$/.test((entry as { file: string }).file)).length;
      line(true, 'icons', `${count} in ${dir}`);
      if (gameExists) {
        try {
          if (!index._source) throw new Error('index.json is missing _source metadata');
          const stale = staleGameFiles(index._source.files, await gameSourceFiles(game!));
          if (stale.length) warn('icons', `game files changed since extraction (${stale.join(', ')}); run npm run refresh:game-data`);
        } catch (error) { warn('icons', (error as Error).message); }
      }
    } catch (error) {
      warn('icons', (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? 'bundled icons missing; run af-ledger refresh-icons' : (error as Error).message);
    }

    const save = typeof values.save === 'string' ? values.save : undefined;
    let roots: string[] = [];
    const saves: SaveFile[] = [];
    if (!save) {
      roots = saveRoots(io.env);
      if (roots.length === 0) line(false, 'save roots', 'no saves folder configured; run af-ledger bootstrap or set AF_SAVE_DIR; use --save');
      for (const root of roots) {
        const found = listSaves(root);
        saves.push(...found);
        const slots = new Set(found.map((s) => s.slot)).size;
        line(slots > 0, 'save root', `${root} (${slots} slot(s) with saves)`);
      }
    }
    const found = check('newest save', () => save ? resolveSave({ save }) : newestSave(saves, roots),
      (s) => `${s.file} (${new Date(s.mtimeMs).toLocaleString()}, ${s.size} bytes)`);

    if (found && kdec) {
      try {
        const snap = await extractSnapshot(found.file, { decoder: new KdecDecoder(kdec) });
        line(true, 'read save',
          `"${snap.saveName}", Day ${snap.currentSaveDay + 1} in progress, ${snap.currentSaveDay} completed days`);
      } catch (e) {
        line(false, 'read save', (e as Error).message);
      }
    }
    return failed ? 1 : 0;
  },
};
