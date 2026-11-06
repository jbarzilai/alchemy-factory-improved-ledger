import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { REPO, fixtureSavePath, fixtureSnapshot } from '../../core/test/helpers/fixture';
import { inCodexSandbox } from '../../core/test/helpers/sandbox';
import { makeSaveDirs } from './helpers';

const exec = promisify(execFile);

let dirs: ReturnType<typeof makeSaveDirs>;
beforeAll(() => { dirs = makeSaveDirs(); });
afterAll(() => dirs.cleanup());

it.skipIf(inCodexSandbox)('the bundled CLI finds kdec and config/ when run from outside the repo', async () => {
  await exec('npm', ['run', 'build'], { cwd: REPO });

  const cwd = mkdtempSync(path.join(os.tmpdir(), 'af-ledger-cwd-'));
  try {
    const { AF_KDEC: _ignored, ...env } = process.env;
    const r = await exec(process.execPath, [path.join(REPO, 'packages/cli/dist/af-ledger.mjs'), 'doctor'], {
      cwd, encoding: 'utf8', env: { ...env, AF_ENV_FILE: 'none', AF_SAVE_DIR: dirs.saves },
    });
    expect(r.stdout).toMatch(/^ok\s+kdec: /m);
    expect(r.stdout).toMatch(/^ok\s+game data: /m);

    const daily = await exec(process.execPath, [path.join(REPO, 'packages/cli/dist/af-ledger.mjs'), 'day', '--unit', 'copper', '100'], {
      cwd, encoding: 'utf8', env: { ...env, AF_ENV_FILE: 'none', AF_SAVE_DIR: dirs.saves },
    });
    expect(daily.stderr).toBe('');
    expect(daily.stdout).toContain('Day 100');
    expect(daily.stdout).toMatch(/Earnings\s+1,289,241c/);
    expect(daily.stdout).toMatch(/Expenses\s+979,800c/);
    expect(daily.stdout).toMatch(/Profit\s+309,441c/);
    expect(daily.stdout).toMatch(/Shop Profit\s+120%/);
    expect(daily.stdout).toMatch(/Quest Rewards\s+128% \(current\)/);

    const history = await exec(process.execPath, [path.join(REPO, 'packages/cli/dist/af-ledger.mjs'), 'days', '--last', '3'], {
      cwd, encoding: 'utf8', env: { ...env, AF_ENV_FILE: 'none', AF_SAVE_DIR: dirs.saves },
    });
    expect(history.stderr).toBe('');
    expect(history.stdout).toContain('Quest Rewards 128% (current)');
    const rows = history.stdout.split('\n').filter((line) => /^\s*\d+\s+-?\d/.test(line));
    expect(rows).toHaveLength(3);
    expect(rows.map((line) => Number(line.trim().split(/\s+/)[0]))).toEqual([197, 198, 199]);

    const link = path.join(cwd, 'af-ledger');
    symlinkSync(path.join(REPO, 'packages/cli/dist/af-ledger.mjs'), link);
    const linked = await exec(process.execPath, [link, 'doctor'], {
      cwd, encoding: 'utf8', env: { ...env, AF_ENV_FILE: 'none', AF_SAVE_DIR: dirs.saves },
    });
    expect(linked.stdout).toMatch(/^ok\s+kdec: /m);
    expect(linked.stdout).toMatch(/^ok\s+game data: /m);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

it.skipIf(inCodexSandbox)('bundled core extracts and loads prices with defaults, including empty AF_KDEC', async () => {
  mkdirSync(path.join(REPO, '.cache'), { recursive: true });
  const bundled = mkdtempSync(path.join(REPO, '.cache', 'core-defaults-'));
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'af-ledger-defaults-cwd-'));
  try {
    const outfile = path.join(bundled, 'defaults.mjs');
    await build({
      stdin: {
        contents: `import { extractSnapshot, loadItemNames, loadGameItems } from './packages/core/src/index.ts';
          const snapshot = await extractSnapshot(process.argv[2]);
          console.log(JSON.stringify({ saveName: snapshot.saveName, day: snapshot.currentSaveDay,
            prices: [...loadGameItems().purchasePrices], names: [...loadItemNames()] }));`,
        resolveDir: REPO,
      },
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      outfile,
    });
    const { AF_KDEC: _ignored, AF_DECODER: _decoder, ...env } = process.env;
    const expected = await fixtureSnapshot();
    for (const override of [{}, { AF_KDEC: '' }]) {
      const r = await exec(process.execPath, [outfile, fixtureSavePath()], {
        cwd, encoding: 'utf8', env: { ...env, AF_ENV_FILE: 'none', ...override },
      });
      const result = JSON.parse(r.stdout);
      expect(result.saveName).toBe(expected.saveName);
      expect(result.day).toBe(expected.currentSaveDay);
      expect(result.prices).toContainEqual(['Limestone', 600]);
      expect(result.names).toContainEqual(['Catalyst2', 'Fertile Catalyst']);
    }
  } finally {
    rmSync(bundled, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
});


it.skipIf(inCodexSandbox)('exports a PNG from an external cwd and doctor never loads sharp', async () => {
  await exec('npm', ['run', 'build'], { cwd: REPO });
  const temp = mkdtempSync(path.join(REPO, '.cache', 'bundle-png-'));
  try {
    const file = path.join(temp, 'x.png');
    const bundle = path.join(REPO, 'packages/cli/dist/af-ledger.mjs');
    const env = { ...process.env, AF_ENV_FILE: 'none', AF_SAVE_DIR: dirs.saves, AF_EXPORT_DIR: temp };
    const result = await exec(process.execPath, [bundle, 'day', '100', '--png', '--output', file], {
      cwd: os.tmpdir(), encoding: 'utf8', env,
    });
    expect(result.stderr).toBe(`wrote ${file}\n`);
    expect(result.stdout).toContain('Day 100');
    expect(readFileSync(file).subarray(0, 8)).toEqual(Buffer.from('89504e470d0a1a0a', 'hex'));
    const loader = path.join(temp, 'deny-sharp.mjs');
    writeFileSync(loader, `export async function resolve(specifier, context, next) {
      if (specifier === 'sharp') throw new Error('sharp must stay lazy');
      return next(specifier, context);
    }`);
    const doctor = await exec(process.execPath, ['--experimental-loader', loader, bundle, 'doctor'], {
      cwd: os.tmpdir(), encoding: 'utf8', env,
    });
    expect(doctor.stdout).toMatch(/^ok\s+kdec: /m);
    // Confirm the loader would actually catch an eager import.
    await expect(exec(process.execPath, ['--experimental-loader', loader, bundle, 'day', '100', '--png'], {
      cwd: os.tmpdir(), encoding: 'utf8', env,
    })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('sharp must stay lazy') });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

it.skipIf(inCodexSandbox)('loads saves from a local env file when bundled', async () => {
  await exec('npm', ['run', 'build'], { cwd: REPO });
  const temp = mkdtempSync(path.join(REPO, '.cache', 'bundle-env-'));
  try {
    const file = path.join(temp, 'env');
    writeFileSync(file, `AF_SAVE_DIR='${dirs.saves}'\n`);
    const { AF_SAVE_DIR: _ignored, ...env } = process.env;
    const result = await exec(process.execPath, [path.join(REPO, 'packages/cli/dist/af-ledger.mjs'), 'days', '--last', '1'], {
      cwd: os.tmpdir(), encoding: 'utf8', env: { ...env, AF_ENV_FILE: file },
    });
    expect(result.stderr).toBe('');
    expect(result.stdout.split('\n').filter((line) => /^\s*\d+\s+-?\d/.test(line))).toHaveLength(1);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
