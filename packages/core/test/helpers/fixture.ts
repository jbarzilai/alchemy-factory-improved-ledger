import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KdecDecoder } from '../../src/decoder/kdec';
import { extractSnapshot } from '../../src/extract';
import type { SaveSnapshot } from '../../src/model';

export const REPO = fileURLToPath(new URL('../../../../', import.meta.url));

export const fixtureInfo: { file: string; sha256: string } =
  JSON.parse(readFileSync(path.join(REPO, 'fixtures', 'save-fixture.json'), 'utf8'));

export function fixtureSavePath(): string {
  const p = path.join(REPO, 'fixtures', 'saves', fixtureInfo.file);
  if (!existsSync(p)) throw new Error(`${p} is missing; restore it with: git checkout -- fixtures/saves`);
  return p;
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

let snapshot: Promise<SaveSnapshot> | undefined;

// One decode per test worker; tests must not mutate the result.
export function fixtureSnapshot(): Promise<SaveSnapshot> {
  if (!snapshot) {
    // A stale or hand-copied save would otherwise surface as dozens of golden mismatches.
    const p = fixtureSavePath();
    if (sha256(readFileSync(p)) !== fixtureInfo.sha256) {
      throw new Error(`${p} does not match the SHA-256 pinned in fixtures/save-fixture.json; restore it with: git checkout -- fixtures/saves`);
    }
    snapshot = extractSnapshot(p, { decoder: new KdecDecoder() });
  }
  return snapshot;
}
