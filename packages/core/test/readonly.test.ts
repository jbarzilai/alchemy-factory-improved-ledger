// Acceptance: run the extractor on a copy of a save and assert bytes and mtime are unchanged.
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import { KdecDecoder } from '../src/decoder/kdec';
import { extractSnapshot } from '../src/extract';
import { REPO, fixtureSavePath, sha256 } from './helpers/fixture';

it('extracting does not modify the save file', async () => {
  await mkdir(path.join(REPO, '.cache'), { recursive: true });
  const dir = await mkdtemp(path.join(REPO, '.cache', 'test-readonly-'));
  try {
    const copy = path.join(dir, path.basename(fixtureSavePath()));
    await copyFile(fixtureSavePath(), copy);
    // Read-only on disk too, so any attempt to open the save for writing fails the test.
    await chmod(copy, 0o444);
    const fingerprint = async () => ({ sha: sha256(await readFile(copy)), mtimeMs: (await stat(copy)).mtimeMs });

    const before = await fingerprint();
    await extractSnapshot(copy, { decoder: new KdecDecoder() });
    expect(await fingerprint()).toEqual(before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
