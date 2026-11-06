import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bundledKdecRel, defaultKdecPath, KdecDecoder } from '../src/decoder/kdec';
import { defaultConfigDir } from '../src/config';
import { repoRoot } from '../src/index';
import { REPO } from './helpers/fixture';

afterEach(() => vi.unstubAllEnvs());

describe('defaultKdecPath', () => {
  it('maps linux-x64 and win32-x64 to the bundled binaries', () => {
    expect(bundledKdecRel('linux', 'x64')).toBe('linux-x64/kdec');
    expect(bundledKdecRel('win32', 'x64')).toBe('win32-x64/kdec.exe');
    expect(defaultKdecPath('linux', 'x64')).toMatch(/native[\\/]bin[\\/]linux-x64[\\/]kdec$/);
    expect(defaultKdecPath('win32', 'x64')).toMatch(/native[\\/]bin[\\/]win32-x64[\\/]kdec\.exe$/);
    expect(defaultKdecPath('linux', 'x64')).toBe(path.join(REPO, 'packages/core/native/bin/linux-x64/kdec'));
  });

  it('names AF_KDEC for other targets', () => {
    expect(() => defaultKdecPath('darwin', 'arm64')).toThrow(/no bundled kdec for darwin-arm64.*AF_KDEC/);
    expect(() => defaultKdecPath('linux', 'arm64')).toThrow(/AF_KDEC/);
  });

  it('treats empty AF_KDEC as unset', () => {
    vi.stubEnv('AF_KDEC', '');
    expect(new KdecDecoder().binPath).toBe(defaultKdecPath());
    vi.stubEnv('AF_KDEC', '/custom/kdec');
    expect(new KdecDecoder().binPath).toBe('/custom/kdec');
  });
});

describe('repoRoot', () => {
  it('finds the root from source and bundle directories and supplies config defaults', () => {
    expect(repoRoot()).toBe(path.resolve(REPO));
    expect(repoRoot(path.join(REPO, 'packages/core/src/decoder'))).toBe(path.resolve(REPO));
    expect(repoRoot(path.join(REPO, 'packages/cli/dist'))).toBe(path.resolve(REPO));
    expect(defaultConfigDir()).toBe(path.join(REPO, 'config'));
  });

  it('uses the nearest matching manifest, skipping other and malformed manifests', () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'af-ledger-root-'));
    try {
      const nested = path.join(tmp, 'nested');
      const start = path.join(nested, 'child');
      mkdirSync(start, { recursive: true });
      expect(() => repoRoot(start)).toThrow(`could not find the af-ledger repository root above ${start}`);
      writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'af-ledger' }));
      writeFileSync(path.join(nested, 'package.json'), JSON.stringify({ name: 'another-package' }));
      writeFileSync(path.join(start, 'package.json'), '{');
      expect(repoRoot(start)).toBe(tmp);
      writeFileSync(path.join(nested, 'package.json'), JSON.stringify({ name: 'af-ledger' }));
      expect(repoRoot(start)).toBe(nested);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
