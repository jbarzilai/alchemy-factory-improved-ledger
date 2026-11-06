import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_FLAG_SETTINGS, loadLedger } from '@af-ledger/core';
import { REPO, fixtureSavePath } from '../../core/test/helpers/fixture';
import { LedgerCache } from '../server/state';

export function tempDir() {
  mkdirSync(path.join(REPO, '.cache'), { recursive: true });
  const dir = mkdtempSync(path.join(REPO, '.cache/web-test-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
export function saveDir() {
  const temp = tempDir();
  const file = path.join(temp.dir, 'SaveGame0.sav');
  copyFileSync(fixtureSavePath(), file);
  return { ...temp, file };
}
export const fixtureCache = () => new LedgerCache({ save: fixtureSavePath(), env: {}, flags: DEFAULT_FLAG_SETTINGS });
export const fixtureLedger = () => loadLedger({ save: fixtureSavePath(), env: {} });
