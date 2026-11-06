import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from '@af-ledger/core';
import { detectGameDir, detectSaveDir } from '../detect';
import { envFilePath } from '../env';
import { outputBlocked } from '../png';
import type { Command } from '../run';

type Deps = {
  detectSaveDir?: typeof detectSaveDir;
  detectGameDir?: typeof detectGameDir;
};

// Single quotes (or backticks, for a path containing ') keep Windows backslashes literal under util.parseEnv.
function quote(value: string): string {
  if (/[\r\n\0]/.test(value) || (value.includes("'") && value.includes('`'))) {
    throw new Error(`detected path cannot be written as an env value: ${value}`);
  }
  return value.includes("'") ? `\`${value}\`` : `'${value}'`;
}

// Replace the detected keys' lines (appending any that are missing); every other line, including values the user set
// by hand and keys that weren't detected, is kept byte-for-byte.
function withDetected(base: string, detected: Record<string, string | null>): string {
  let out = base;
  for (const [key, value] of Object.entries(detected)) {
    if (!value) continue;
    const line = `${key}=${quote(value)}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    out = pattern.test(out) ? out.replace(pattern, () => line) : `${out}${out.endsWith('\n') || !out ? '' : '\n'}${line}\n`;
  }
  return out;
}

export function createBootstrapCommand(deps: Deps = {}): Command {
  return {
    options: { force: { type: 'boolean' } },
    async run({ values }, io) {
      const file = envFilePath(io.env);
      if (!file) {
        io.err('af-ledger bootstrap: AF_ENV_FILE=none disables the env file\n');
        return 2;
      }
      const saves = (deps.detectSaveDir || detectSaveDir)({ env: io.env });
      const game = (deps.detectGameDir || detectGameDir)();
      io.out(`saves: ${saves || `not found; set AF_SAVE_DIR in ${file}`}\n`);
      io.out(`game: ${game || `not found; set AF_GAME_DIR in ${file} (only needed for refresh-game-data)`}\n`);
      // Include detected roots as well as configured roots; no selected save is needed here.
      const protectedEnv = saves ? { ...io.env, AF_SAVE_DIR: saves } : io.env;
      if (outputBlocked(file, '', io.env) || outputBlocked(file, '', protectedEnv)) {
        io.err('af-ledger bootstrap: env file must not be a .sav file or inside a saves folder\n');
        return 2;
      }
      const exists = existsSync(file);
      const base = readFileSync(exists ? file : path.join(repoRoot(), '.env.example'), 'utf8');
      const content = withDetected(base, { AF_SAVE_DIR: saves, AF_GAME_DIR: game });
      if (exists && !values.force) {
        io.out(`would write:\n${content}\n${file} exists; to update it run af-ledger bootstrap --force ` +
          `(or npm run bootstrap -- --force); settings other than the detected paths are kept\n`);
        return 1;
      }
      writeFileSync(file, content, { flag: values.force ? 'w' : 'wx' });
      io.out(`wrote ${file}\n`);
      return saves ? 0 : 1;
    },
  };
}
export const bootstrap = createBootstrapCommand();
