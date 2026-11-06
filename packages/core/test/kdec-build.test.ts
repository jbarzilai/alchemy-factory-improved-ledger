// kdec.exe is committed so a Windows clone runs without a cross-compiler (building it needs WSL's g++ and mingw).
// These tests keep the committed file tracked, free of build-machine paths, and equal to a fresh build of the source.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultKdecPath, kdecMissingHint } from '../src/decoder/kdec';
import { REPO, sha256 } from './helpers/fixture';

const committed = defaultKdecPath('win32', 'x64');
const has = (cmd: string) => {
  try {
    execFileSync('bash', ['-c', `command -v ${cmd}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
const canBuild = process.platform === 'linux' && has('g++') && has('x86_64-w64-mingw32-g++');

describe('committed kdec.exe', () => {
  it('is tracked by git', () => {
    const rel = path.relative(REPO, committed).split(path.sep).join('/');
    expect(execFileSync('git', ['ls-files', '--', rel], { cwd: REPO, encoding: 'utf8' }).trim()).toBe(rel);
  });

  it('embeds no absolute build paths', () => {
    const text = readFileSync(committed).toString('latin1');
    for (const marker of ['/home/', '/Users/', '/mnt/', '/tmp/', 'C:\\Users', 'C:/Users']) expect(text).not.toContain(marker);
  });

  it.skipIf(!canBuild)('equals a fresh build:native of the current source', () => {
    const out = mkdtempSync(path.join(os.tmpdir(), 'af-ledger-kdec-'));
    try {
      execFileSync('bash', [path.join(REPO, 'packages/core/native/build.sh'), out], { stdio: 'ignore' });
      expect(sha256(readFileSync(path.join(out, 'win32-x64', 'kdec.exe')))).toBe(sha256(readFileSync(committed)));
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 300_000);
});

describe('kdecMissingHint', () => {
  it('points Linux at build:native', () => {
    expect(kdecMissingHint('linux')).toMatch(/npm run build:native/);
  });

  it('points Windows at the committed file, not a build it cannot run', () => {
    const hint = kdecMissingHint('win32');
    expect(hint).not.toMatch(/build:native/);
    expect(hint).toContain('git checkout -- packages/core/native/bin/win32-x64/kdec.exe');
  });
});
