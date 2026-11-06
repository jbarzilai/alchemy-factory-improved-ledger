import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  extractIoStoreFile, GAME_PAKS, GAME_TOC, gameSourceFiles, patchContainersWithAsset,
  KdecDecoder, parseEnemiesTable, iconPackages, iconTocPath, decodeTexture, scaleRgba, encodePng, repoRoot, type Decoder,
} from '@af-ledger/core';
import { kdecPath } from '../paths';
import { outputBlocked } from '../png';
import { oneLine } from '../format';
import type { Command } from '../run';

const ASSET = 'DataTables/DT_Enemies.uasset';
type Extract = (utoc: string, suffix: string, decoder: Decoder) => Promise<Uint8Array>;
type Icon = { file: string; texturePath: string; sourceWidth: number; sourceHeight: number };

export function createRefreshIconsCommand(extract: Extract = extractIoStoreFile): Command {
  return {
    options: { 'game-dir': { type: 'string' }, output: { type: 'string' }, size: { type: 'string' } },
    async run({ values }, io) {
      const game = values['game-dir'] as string | undefined || io.env.AF_GAME_DIR;
      if (!game) {
        io.err('af-ledger refresh-icons: provide --game-dir <dir> or AF_GAME_DIR\n');
        return 2;
      }
      try {
        const output = path.resolve(values.output as string | undefined || path.join(repoRoot(), 'assets/icons'));
        const guard = (file: string) => {
          const blocked = outputBlocked(file, '', io.env, { label: 'output', gameDirs: [game, io.env.AF_GAME_DIR ?? ''] });
          if (blocked) throw new Error(blocked);
        };
        guard(output);
        const size = values.size === undefined ? 64 : Number(values.size);
        if (!Number.isSafeInteger(size) || size <= 0) throw new Error('size must be a positive integer');
        const refusePatches = async (suffix: string) => {
          const patches = await patchContainersWithAsset(game, suffix);
          if (patches.length) throw new Error(`patch containers aren't supported yet: ${patches.join(', ')}`);
        };
        await refusePatches(ASSET);
        const files = await gameSourceFiles(game), utoc = path.join(game, GAME_PAKS, GAME_TOC);
        const decoder = new KdecDecoder(kdecPath(io.env));
        const dt = await extract(utoc, ASSET, decoder), rows = parseEnemiesTable(dt);
        if (new Set(rows.map(r => r.row)).size !== rows.length) throw new Error('duplicate DT_Enemies rows; game data format may have changed');
        const { packages, problems } = iconPackages(dt, rows);
        const textures = new Map<string, { png: Uint8Array; width: number; height: number } | string>();
        // Check every resolved texture for patches before extraction, even if decoding it will fail.
        for (const pkg of new Set(packages.values())) await refusePatches(iconTocPath(pkg));
        const entries: Record<string, Icon> = {}, images = new Map<string, Uint8Array>();
        let scalingFailed = false;
        for (const [id, pkg] of packages) {
          if (!/^[A-Za-z0-9]+$/.test(id)) { problems.set(id, `invalid item ID ${id}`); continue; }
          if (!textures.has(pkg)) {
            try {
              const { width, height, rgba } = decodeTexture(await extract(utoc, iconTocPath(pkg), decoder));
              let scaled: Uint8Array;
              try { scaled = scaleRgba(width, height, rgba, size); }
              catch (error) { scalingFailed = true; throw new Error(`--size ${size}: ${(error as Error).message}`); }
              textures.set(pkg, { width, height, png: encodePng(size, size, scaled) });
            } catch (error) { textures.set(pkg, (error as Error).message); }
          }
          const texture = textures.get(pkg)!;
          if (typeof texture === 'string') { problems.set(id, texture); continue; }
          entries[id] = { file: `${id}.png`, texturePath: pkg, sourceWidth: texture.width, sourceHeight: texture.height };
          images.set(`${id}.png`, texture.png);
        }
        const report = (written: number) => {
          io.out(`icons: ${written} written, ${problems.size} problems\n`);
          for (const [id, problem] of problems) io.out(`  ${id}: ${oneLine(problem)}\n`);
        };
        if (images.size < 150) {
          report(0);
          const reason = scalingFailed ? `scaling failed for --size ${size}; choose a size that divides every source texture` : 'game data format may have changed';
          throw new Error(`only ${images.size} icons resolve (need >=150); ${reason}; nothing written`);
        }
        const index = { _source: { files, asset: ASSET, rows: rows.length, skipped: rows.filter(r => !r.exact).map(r => r.row) }, ...entries };
        // Preflight each file too: a safe folder can contain a symlink into the install/saves.
        for (const file of [...images.keys(), 'index.json']) guard(path.join(output, file));
        const old = new Set<string>();
        try {
          const previous = JSON.parse(await readFile(path.join(output, 'index.json'), 'utf8')) as Record<string, Icon>;
          for (const [id, entry] of Object.entries(previous)) {
            if (!id.startsWith('_') && typeof entry?.file === 'string' && /^[^/\\]+\.png$/i.test(entry.file)) old.add(entry.file);
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        await mkdir(output, { recursive: true });
        for (const [file, png] of images) await writeFile(path.join(output, file), png);
        await writeFile(path.join(output, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
        const written = new Set([...images.keys()].map(file => file.toLowerCase()));
        for (const file of old) if (!written.has(file.toLowerCase())) {
          try { await unlink(path.join(output, file)); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        }
        report(images.size);
        return 0;
      } catch (error) {
        io.err(`af-ledger refresh-icons: ${oneLine((error as Error).message)}\n`);
        return 1;
      }
    },
  };
}
export const refreshIcons = createRefreshIconsCommand();
