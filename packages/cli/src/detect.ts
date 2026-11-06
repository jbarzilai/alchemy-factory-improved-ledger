import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export type Runner = (cmd: string, args: string[]) => string | null;
export const defaultRunner: Runner = (cmd, args) => {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
      cwd: process.platform === 'linux' && existsSync('/mnt/c') ? '/mnt/c' : undefined,
    }).trim() || null;
  } catch { return null; }
};
export const isDirectory = (file: string): boolean => {
  try { return statSync(file).isDirectory(); } catch { return false; }
};
type Detection = { platform?: NodeJS.Platform; run?: Runner; isDir?: (file: string) => boolean };

export function detectSaveDir({
  platform = process.platform, env = process.env, run = defaultRunner, isDir = isDirectory,
}: Detection & { env?: NodeJS.ProcessEnv } = {}): string | null {
  let local: string | null = null;
  if (platform === 'win32') local = env.LOCALAPPDATA || null;
  else if (platform === 'linux') {
    const windows = run('cmd.exe', ['/c', 'echo %LOCALAPPDATA%'])?.trim();
    if (windows && !windows.includes('%LOCALAPPDATA%')) local = run('wslpath', ['-u', windows]);
  }
  if (!local) return null;
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const result = paths.join(local, 'AlchemyFactory', 'Saved', 'SaveGames');
  return isDir(result) ? result : null;
}

export function parseSteamPath(output: string): string | null {
  return output.match(/^\s*SteamPath\s+REG_SZ\s+(.+?)\s*$/im)?.[1] || null;
}
export function parseLibraryFolders(vdf: string): string[] {
  return [...vdf.matchAll(/"path"\s*"((?:\\.|[^"\\])*)"/gi)]
    .map((m) => m[1].replace(/\\([\\"])/g, '$1'));
}

export function detectGameDir({
  platform = process.platform, run = defaultRunner, isDir = isDirectory,
  readFile = (file: string) => readFileSync(file, 'utf8'),
}: Detection & { readFile?: (file: string) => string } = {}): string | null {
  const steam = parseSteamPath(run('reg.exe', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath']) || '')
    || 'C:\\Program Files (x86)\\Steam';
  const convert = (file: string) => platform === 'linux' ? run('wslpath', ['-u', file]) : file;
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const root = convert(steam);
  let libraries: string[] = [];
  if (root) {
    try { libraries = parseLibraryFolders(readFile(paths.join(root, 'steamapps', 'libraryfolders.vdf'))); }
    catch { /* Steam may not be installed. */ }
  }
  const seen = new Set<string>();
  for (const library of [steam, ...libraries]) {
    const key = library.replace(/\//g, '\\').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const local = library === steam ? root : convert(library);
    if (!local) continue;
    const game = paths.join(local, 'steamapps', 'common', 'Alchemy Factory');
    if (isDir(game)) return game;
  }
  return null;
}
