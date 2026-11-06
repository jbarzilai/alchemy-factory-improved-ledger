// Kraken decoder: the native kdec helper (packages/core/native) as a child process.
// The block goes in on stdin ("-"), so the save is read once and kdec never opens it.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { repoRoot } from '../config';
import type { Decoder } from './types';

const DEFAULT_TIMEOUT_MS = 60_000;

const BUNDLED: Record<string, string> = { 'linux-x64': 'linux-x64/kdec', 'win32-x64': 'win32-x64/kdec.exe' };

// Path of the bundled kdec under packages/core/native/bin/.
export function bundledKdecRel(platform: NodeJS.Platform = process.platform, arch: string = process.arch): string {
  const rel = BUNDLED[`${platform}-${arch}`];
  if (!rel) throw new Error(`no bundled kdec for ${platform}-${arch}; build one (packages/core/native) and set AF_KDEC=<path>`);
  return rel;
}

// What to do when kdec is missing. kdec.exe is committed; building it needs WSL's g++ and mingw, so Windows gets a restore hint.
export function kdecMissingHint(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32'
    ? 'it ships with the repo; restore it with: git checkout -- packages/core/native/bin/win32-x64/kdec.exe'
    : 'run: npm run build:native';
}

export function defaultKdecPath(platform: NodeJS.Platform = process.platform, arch: string = process.arch): string {
  return path.join(repoRoot(), 'packages', 'core', 'native', 'bin', bundledKdecRel(platform, arch));
}

export class KdecDecoder implements Decoder {
  readonly name = 'kdec' as const;

  constructor(
    readonly binPath: string = process.env.AF_KDEC || defaultKdecPath(),
    readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  decompress(src: Uint8Array, rawSize: number): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      // rawSize is known up front: fill one buffer instead of collecting chunks and concatenating.
      const out = Buffer.allocUnsafe(rawSize);
      let got = 0;
      let failure: Error | undefined;
      const err: Buffer[] = [];
      const child = spawn(this.binPath, ['-', '0', String(src.length), String(rawSize)]);
      // Settle at once: a killed kdec's grandchildren could keep stdout open and delay 'close'.
      const fail = (e: Error) => {
        if (failure) return;
        failure = e;
        clearTimeout(timer);
        child.kill();
        reject(e);
      };
      const timer = setTimeout(() => fail(new Error(`kdec timed out after ${this.timeoutMs} ms`)), this.timeoutMs);
      child.stdout.on('data', (c: Buffer) => {
        if (got + c.length > rawSize) return fail(new Error(`kdec produced more than ${rawSize} bytes`));
        c.copy(out, got);
        got += c.length;
      });
      child.stderr.on('data', (c: Buffer) => err.push(c));
      child.stdin.on('error', () => {}); // kdec may exit before reading everything; its exit code reports why
      child.on('error', (e: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        reject(e.code === 'ENOENT' ? new Error(`kdec not found at ${this.binPath}; ${kdecMissingHint()}`) : e);
      });
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        if (failure) return;
        if (code !== 0) {
          const why = signal ? `signal ${signal}` : `code ${code}`;
          return reject(new Error(`kdec exited with ${why}: ${Buffer.concat(err).toString().trim()}`));
        }
        if (got !== rawSize) return reject(new Error(`kdec produced ${got} bytes, expected ${rawSize}`));
        resolve(new Uint8Array(out.buffer, out.byteOffset, rawSize));
      });
      child.stdin.end(src);
    });
  }
}
