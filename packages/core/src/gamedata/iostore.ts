import { open, readFile } from 'node:fs/promises';
import type { Decoder } from '../decoder/types';
import { GameDataError } from '../errors';
import { ByteReader } from '../reader';

export type IoStoreFile = { path: string; offset: number; length: number };
type Block = { offset: number; compressedSize: number; rawSize: number; method: number };
export type IoStoreToc = { blockSize: number; files: IoStoreFile[]; blocks: Block[]; methods: string[] };

export function readIoStoreToc(utoc: Uint8Array): IoStoreToc {
  try {
    const r = new ByteReader(utoc);
    if (Buffer.from(r.bytes(16)).toString('latin1') !== '-==--==--==--==-') throw new GameDataError('bad IoStore magic');
    const version = r.u8();
    r.bytes(3);
    const headerSize = r.u32(), entryCount = r.u32(), blockCount = r.u32(), blockEntrySize = r.u32();
    const methodCount = r.u32(), methodLen = r.u32(), blockSize = r.u32(), dirIndexSize = r.u32();
    const partitionCount = r.u32();
    r.bytes(24);
    const flags = r.u8();
    r.bytes(3);
    const seedsCount = r.u32();
    r.bytes(8);
    const noHashCount = r.u32();
    if (version !== 8 || headerSize < r.pos || blockEntrySize !== 12 || !blockSize ||
        partitionCount > 1 || (methodCount > 0 && methodLen === 0)) {
      throw new GameDataError('unsupported IoStore header (requires v8, single partition)');
    }
    // EIoContainerFlags: Encrypted = 2, Signed = 4. Signature data would sit before the directory index.
    if (flags & 2) throw new GameDataError('unsupported IoStore container: encrypted');
    if (flags & 4) throw new GameDataError('unsupported IoStore container: signed');
    r.bytes(headerSize - r.pos);
    r.bytes(entryCount * 12); // chunk IDs
    const be = (n: number) => [...r.bytes(n)].reduce((v, b) => v * 256 + b, 0);
    const le = (n: number) => [...r.bytes(n)].reduce((v, b, i) => v + b * 256 ** i, 0);
    const chunks = Array.from({ length: entryCount }, () => ({ offset: be(5), length: be(5) }));
    r.bytes(seedsCount * 4 + noHashCount * 4);
    const blocks = Array.from({ length: blockCount }, () => ({
      offset: le(5), compressedSize: le(3), rawSize: le(3), method: r.u8(),
    }));
    const methods = Array.from({ length: methodCount }, () =>
      Buffer.from(r.bytes(methodLen)).toString('latin1').replace(/\0.*$/, ''));
    // A bounded reader prevents corrupt directory counts from spilling into subsequent sections.
    const d = new ByteReader(r.bytes(dirIndexSize));
    const mount = d.fstr();
    const dirs = Array.from({ length: d.u32() }, () => ({ name: d.u32(), child: d.u32(), sibling: d.u32(), file: d.u32() }));
    const files = Array.from({ length: d.u32() }, () => ({ name: d.u32(), next: d.u32(), toc: d.u32() }));
    const strings = Array.from({ length: d.u32() }, () => d.fstr());
    const NONE = 0xffffffff;
    const string = (idx: number) => {
      if (idx >= strings.length) throw new GameDataError('invalid IoStore string index');
      return strings[idx];
    };
    const out: IoStoreFile[] = [];
    const seenDirs = new Set<number>(), seenFiles = new Set<number>();
    const pending = dirs.length ? [{ index: 0, prefix: '' }] : [];
    while (pending.length) {
      const { index, prefix } = pending.pop()!;
      if (seenDirs.has(index) || !dirs[index]) throw new GameDataError('invalid or cyclic IoStore directory index');
      seenDirs.add(index);
      const dir = dirs[index];
      const path = prefix + (dir.name === NONE ? '' : `${string(dir.name)}/`);
      for (let f = dir.file; f !== NONE; f = files[f].next) {
        if (seenFiles.has(f) || !files[f]) throw new GameDataError('invalid or cyclic IoStore file index');
        seenFiles.add(f);
        const file = files[f], chunk = chunks[file.toc];
        if (!chunk) throw new GameDataError('invalid IoStore chunk index');
        out.push({ path: mount + path + string(file.name), ...chunk });
      }
      if (dir.sibling !== NONE) pending.push({ index: dir.sibling, prefix });
      if (dir.child !== NONE) pending.push({ index: dir.child, prefix: path });
    }
    return { blockSize, files: out, blocks, methods };
  } catch (error) {
    if (error instanceof GameDataError) throw error;
    throw new GameDataError(`invalid IoStore TOC: ${(error as Error).message}`);
  }
}

// Match whole path segments, and refuse ambiguity: a patch could add a second copy elsewhere in the container.
export function findIoStoreFile(files: IoStoreFile[], pathSuffix: string): IoStoreFile {
  const matches = files.filter((f) => f.path === pathSuffix || f.path.endsWith(`/${pathSuffix}`));
  if (matches.length > 1) {
    throw new GameDataError(`IoStore path ${pathSuffix} is ambiguous: ${matches.map((f) => f.path).join(', ')}`);
  }
  if (!matches[0]) throw new GameDataError(`IoStore file not found: ${pathSuffix}`);
  return matches[0];
}

export async function extractIoStoreFile(utocPath: string, pathSuffix: string, decoder: Decoder): Promise<Uint8Array> {
  if (!/\.utoc$/i.test(utocPath)) throw new GameDataError('expected a .utoc path');
  const toc = readIoStoreToc(await readFile(utocPath));
  const file = findIoStoreFile(toc.files, pathSuffix);
  if (file.length === 0) return new Uint8Array();
  const first = Math.floor(file.offset / toc.blockSize);
  const last = Math.floor((file.offset + file.length - 1) / toc.blockSize);
  const ucasPath = utocPath.replace(/\.utoc$/i, '.ucas');
  const handle = await open(ucasPath, 'r');
  try {
    const parts: Uint8Array[] = [];
    for (let i = first; i <= last; i++) {
      const block = toc.blocks[i];
      if (!block) throw new GameDataError(`missing IoStore block ${i}`);
      if (block.method !== 0 && toc.methods[block.method - 1] !== 'Oodle') {
        throw new GameDataError(`unsupported IoStore compression method ${block.method}`);
      }
      const src = Buffer.alloc(block.method === 0 ? block.rawSize : block.compressedSize);
      let got = 0;
      while (got < src.length) {
        const { bytesRead } = await handle.read(src, got, src.length - got, block.offset + got);
        if (!bytesRead) throw new GameDataError(`truncated IoStore block ${i}`);
        got += bytesRead;
      }
      const raw = block.method === 0 ? src : await decoder.decompress(src, block.rawSize);
      if (raw.length !== block.rawSize || (i < last && raw.length !== toc.blockSize)) {
        throw new GameDataError(`invalid decoded IoStore block ${i} length`);
      }
      parts.push(raw);
    }
    const start = file.offset - first * toc.blockSize;
    const all = Buffer.concat(parts);
    if (start + file.length > all.length) throw new GameDataError('IoStore file extends beyond its blocks');
    return all.subarray(start, start + file.length);
  } finally {
    await handle.close();
  }
}
