import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { REPO, fixtureSavePath } from '../../core/test/helpers/fixture';
import type { IO } from '../src/run';

// A temp save root under .cache/ holding a COPY of the fixture save in one slot, plus an empty root.
export function makeSaveDirs(): { saves: string; empty: string; cleanup(): void } {
  mkdirSync(path.join(REPO, '.cache'), { recursive: true });
  const base = mkdtempSync(path.join(REPO, '.cache', 'cli-test-'));
  const saves = path.join(base, 'saves');
  const empty = path.join(base, 'empty');
  mkdirSync(path.join(saves, 'Slot A'), { recursive: true });
  mkdirSync(empty);
  copyFileSync(fixtureSavePath(), path.join(saves, 'Slot A', 'SaveGame3.sav'));
  return { saves, empty, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

export function capture(env: NodeJS.ProcessEnv = {}, color = false): { io: IO; out(): string; err(): string } {
  let out = '';
  let err = '';
  return {
    io: { out: (s) => { out += s; }, err: (s) => { err += s; }, env, color },
    out: () => out,
    err: () => err,
  };
}
