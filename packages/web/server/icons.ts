import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from '@af-ledger/core';

export type IconStore = { has(item: string): boolean; file(item: string): string | null; items(): string[] };
export const emptyIconStore: IconStore = { has: () => false, file: () => null, items: () => [] };
export function loadIconStore(dir = path.join(repoRoot(), 'assets/icons')): IconStore {
  const files = new Map<string, string>();
  let index: Record<string, { file?: unknown }>;
  try { index = JSON.parse(readFileSync(path.join(dir, 'index.json'), 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return emptyIconStore;
  }
  const root = realpathSync(dir);
  for (const [item, entry] of Object.entries(index)) {
    if (item.startsWith('_')) continue;
    const file = entry?.file;
    // Index entries must be local PNG names; reject symlinks that escape the icon directory too.
    if (typeof file !== 'string' || !/^[^/\\]+\.png$/.test(file)) continue;
    const resolved = path.join(root, file);
    try {
      if (path.dirname(realpathSync(resolved)) === root) files.set(item, resolved);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return { has: item => files.has(item), file: item => files.get(item) ?? null,
    items: () => [...files.keys()].sort() };
}
