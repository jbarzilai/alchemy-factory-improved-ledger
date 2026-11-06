import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from 'vitest';
import { build } from 'vite';
import { REPO } from '../../core/test/helpers/fixture';
test('client builds offline with design tokens and component utilities', async () => {
  await mkdir(path.join(REPO, '.cache'), { recursive: true });
  const outDir = await mkdtemp(path.join(REPO, '.cache/client-build-'));
  try {
    await build({ configFile: path.join(REPO, 'packages/web/vite.config.ts'), build: { outDir }, logLevel: 'silent' });
    const assets = path.join(outDir, 'assets');
    const css = (await Promise.all((await readdir(assets)).filter(f => f.endsWith('.css')).map(f => readFile(path.join(assets, f), 'utf8')))).join('\n');
    const js = (await Promise.all((await readdir(assets)).filter(f => f.endsWith('.js')).map(f => readFile(path.join(assets, f), 'utf8')))).join('\n');
    expect(js).toContain('Item economics');
    expect(js).toContain('Money by day');
    expect(css).toContain('--series-relic');
    expect(css).toMatch(/\.bg-panel\s*\{/);
    expect(css).toMatch(/\.pb-6\s*\{/); // Utility used only by the client, outside design/components.
    expect(await readFile(path.join(outDir, 'index.html'), 'utf8')).toContain('assets/');
  } finally { await rm(outDir, { recursive: true, force: true }); }
}, 60_000);
