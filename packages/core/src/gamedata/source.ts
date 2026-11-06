import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { GameSourceFile } from '../config';
import { GameDataError } from '../errors';
import { findIoStoreFile, readIoStoreToc } from './iostore';

export const GAME_TOC = 'AlchemyFactory-Windows.utoc';
export const GAME_PAKS = 'AlchemyFactory/Content/Paks';

export async function gameSourceFiles(gameDir: string): Promise<GameSourceFile[]> {
  return Promise.all([GAME_TOC, GAME_TOC.replace(/\.utoc$/, '.ucas')].map(async (name) => {
    const source = await stat(path.join(gameDir, GAME_PAKS, name));
    return { name, size: source.size, modified: source.mtime.toISOString() };
  }));
}

export function staleGameFiles(stamped: GameSourceFile[], current: GameSourceFile[]): string[] {
  return stamped.filter((file) => {
    const now = current.find((v) => v.name === file.name);
    return !now || now.size !== file.size || now.modified !== file.modified;
  }).map((file) => file.name);
}

export async function patchContainersWithAsset(gameDir: string, asset: string): Promise<string[]> {
  const paks = path.join(gameDir, GAME_PAKS);
  const names = (await readdir(paks)).filter((name) => /\.utoc$/i.test(name) &&
    ![GAME_TOC.toLowerCase(), 'global.utoc'].includes(name.toLowerCase())).sort();
  const matches: string[] = [];
  for (const name of names) {
    try {
      const toc = readIoStoreToc(await readFile(path.join(paks, name)));
      // An absent suffix is expected. Ambiguous matches remain errors, as in extraction.
      if (toc.files.some((file) => file.path === asset || file.path.endsWith(`/${asset}`))) {
        findIoStoreFile(toc.files, asset);
        matches.push(name);
      }
    } catch (error) {
      throw new GameDataError(`${name}: ${(error as Error).message}`);
    }
  }
  return matches;
}
