import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseBlockChain, parseHeader } from '../src/container';
import { KdecDecoder, defaultKdecPath } from '../src/decoder/kdec';
import { fixtureSavePath, sha256 } from './helpers/fixture';
import { inCodexSandbox } from './helpers/sandbox';

let block0: Uint8Array;
let rawSize: number;
beforeAll(() => {
  const buf = readFileSync(fixtureSavePath());
  const [b0] = parseBlockChain(buf, parseHeader(buf).bodyOffset);
  block0 = buf.subarray(b0.dataOffset, b0.dataOffset + b0.compressedSize);
  rawSize = b0.uncompressedSize;
});

describe('KdecDecoder', () => {
  it('decodes block 0 of the fixture to its declared size', async () => {
    const out = await new KdecDecoder().decompress(block0, rawSize);
    expect(out.length).toBe(58_684_292);
    // Block 0 opens with the name table (SAVE_FORMAT.md §2).
    expect(Buffer.from(out.subarray(0, 256)).includes('UGameSaveLoadSubsystem')).toBe(true);
  });

  it('passes kdec\'s own error message through when decoding fails', async () => {
    await expect(new KdecDecoder().decompress(new Uint8Array(16), 1024))
      .rejects.toThrow(/kdec exited with code 1: kdec: decompression failed/);
  });

  it('explains how to build kdec when the binary is missing', async () => {
    await expect(new KdecDecoder('/nonexistent/kdec').decompress(block0, rawSize))
      .rejects.toThrow(/npm run build:native/);
  });

// Needs both binaries and WSL interop to run kdec.exe, so it never runs under Windows node (test:win) or on Linux
// outside WSL. Newer WSL builds register the interop handler as WSLInterop-late.
const wslInterop = ['WSLInterop', 'WSLInterop-late'].some(name => existsSync(`/proc/sys/fs/binfmt_misc/${name}`));
const canCrossCheck = process.platform === 'linux' && process.env.AF_SKIP_WIN !== '1' && !inCodexSandbox && wslInterop
  && existsSync(defaultKdecPath('linux')) && existsSync(defaultKdecPath('win32'));

// A stand-in "kdec" shell script, for failure modes the real binary can't be made to show.
function fakeKdec(body: string): string {
  const p = path.join(mkdtempSync(path.join(os.tmpdir(), 'af-fake-kdec-')), 'kdec');
  writeFileSync(p, `#!/bin/sh\n${body}\n`);
  chmodSync(p, 0o755);
  return p;
}

describe.skipIf(process.platform === 'win32')('KdecDecoder child-process limits', () => {
  it('kills a kdec that hangs and reports a timeout', async () => {
    await expect(new KdecDecoder(fakeKdec('sleep 10'), 200).decompress(new Uint8Array(4), 10))
      .rejects.toThrow(/timed out after 200 ms/);
  });

  it('rejects as soon as kdec writes more than the declared size', async () => {
    await expect(new KdecDecoder(fakeKdec('head -c 100 /dev/zero')).decompress(new Uint8Array(4), 10))
      .rejects.toThrow(/more than 10 bytes/);
  });
});

it.skipIf(!canCrossCheck)('Windows kdec.exe output is byte-identical (via WSL interop)', async () => {
    const linux = await new KdecDecoder(defaultKdecPath('linux')).decompress(block0, rawSize);
    const win = await new KdecDecoder(defaultKdecPath('win32')).decompress(block0, rawSize);
    expect(sha256(win)).toBe(sha256(linux));
  });
});
