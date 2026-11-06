import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { REPO } from '../../core/test/helpers/fixture';
import { loadEnv } from '../src/env';
mkdirSync(path.join(REPO, '.cache'), { recursive: true });
const temp = mkdtempSync(path.join(REPO, '.cache/env-'));
afterAll(() => rmSync(temp, { recursive: true, force: true }));
it('merges non-empty process values ahead of non-empty file values', () => {
  const file = path.join(temp, 'settings');
  writeFileSync(file, 'A=file\nB=file\nC=\n');
  expect(loadEnv({ AF_ENV_FILE: file, A: 'process', B: '', D: '' })).toEqual({
    env: { AF_ENV_FILE: file, A: 'process', B: 'file' }, envFile: file,
  });
});
it('reports an unreadable env file instead of throwing', () => {
  expect(loadEnv({ AF_ENV_FILE: temp })).toMatchObject({ envFile: undefined, envError: expect.stringContaining(temp) });
});
it('does not load a disabled or missing file', () => {
  for (const file of ['none', path.join(temp, 'missing')]) {
    expect(loadEnv({ AF_ENV_FILE: file })).toEqual({ env: { AF_ENV_FILE: file }, envFile: undefined });
  }
});
