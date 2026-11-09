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

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

type Fixture = { savePath: () => string; snapshot: () => Promise<SaveSnapshot> };
const fixtures = new Map<string, Fixture>();

// One decode per pin file per test worker; tests must not mutate the result.
export function fixtureFor(pinFile: string): Fixture {
  const cached = fixtures.get(pinFile);
  if (cached) return cached;

  const info: { file: string; sha256: string } =
    JSON.parse(readFileSync(path.join(REPO, 'fixtures', pinFile), 'utf8'));
  let snapshot: Promise<SaveSnapshot> | undefined;
  const fixture: Fixture = {
    savePath() {
      const p = path.join(REPO, 'fixtures', 'saves', info.file);
      if (!existsSync(p)) throw new Error(`${p} is missing (pinned in fixtures/${pinFile}); restore it with: git checkout -- fixtures/saves`);
      return p;
    },
    snapshot() {
      if (!snapshot) {
        // A stale or hand-copied save would otherwise surface as dozens of golden mismatches.
        const p = fixture.savePath();
        if (sha256(readFileSync(p)) !== info.sha256) {
          throw new Error(`${p} does not match the SHA-256 pinned in fixtures/${pinFile}; restore it with: git checkout -- fixtures/saves`);
        }
        snapshot = extractSnapshot(p, { decoder: new KdecDecoder() });
      }
      return snapshot;
    },
  };
  fixtures.set(pinFile, fixture);
  return fixture;
}

export const fixtureSavePath = () => fixtureFor('save-fixture.json').savePath();
export const fixtureSnapshot = () => fixtureFor('save-fixture.json').snapshot();
