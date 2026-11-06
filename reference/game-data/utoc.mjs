// Read-only IoStore .utoc reader: header, chunk offsets, compression blocks, directory index.
import { readFileSync } from 'node:fs';
export function readToc(file) {
  const b = readFileSync(file);
  const u32 = (o) => b.readUInt32LE(o);
  if (b.toString('latin1', 0, 16) !== '-==--==--==--==-') throw new Error('bad magic');
  const h = {
    version: b[16], headerSize: u32(20), entryCount: u32(24), blockCount: u32(28), blockEntrySize: u32(32),
    methodCount: u32(36), methodLen: u32(40), blockSize: u32(44), dirIndexSize: u32(48), partitionCount: u32(52),
    flags: b[80], seedsCount: u32(84), noHashCount: u32(96),
  };
  let o = h.headerSize;
  const chunkIdsAt = o; o += h.entryCount * 12;
  const offLen = []; for (let i = 0; i < h.entryCount; i++, o += 10) {
    const be = (p, n) => { let v = 0; for (let k = 0; k < n; k++) v = v * 256 + b[p + k]; return v; };
    offLen.push({ offset: be(o, 5), length: be(o + 5, 5) });
  }
  o += h.seedsCount * 4 + h.noHashCount * 4;
  const blocks = []; for (let i = 0; i < h.blockCount; i++, o += 12) {
    const off = b.readUIntLE(o, 5), csize = b.readUIntLE(o + 5, 3), usize = b.readUIntLE(o + 8, 3), method = b[o + 11];
    blocks.push({ off, csize, usize, method });
  }
  const methods = []; for (let i = 0; i < h.methodCount; i++, o += h.methodLen) methods.push(b.toString('latin1', o, o + h.methodLen).replace(/\0.*$/, ''));
  // directory index
  const d = o; let p = d;
  const fstr = () => { const n = b.readInt32LE(p); p += 4; if (n === 0) return ''; if (n > 0) { const s = b.toString('latin1', p, p + n - 1); p += n; return s; } const s = b.toString('utf16le', p, p + (-n - 1) * 2); p += -n * 2; return s; };
  const mount = fstr();
  const nDir = u32(p); p += 4; const dirs = []; for (let i = 0; i < nDir; i++, p += 16) dirs.push({ name: u32(p), child: u32(p + 4), sib: u32(p + 8), file: u32(p + 12) });
  const nFile = u32(p); p += 4; const files = []; for (let i = 0; i < nFile; i++, p += 12) files.push({ name: u32(p), next: u32(p + 4), toc: u32(p + 8) });
  const nStr = u32(p); p += 4; const strs = []; for (let i = 0; i < nStr; i++) strs.push(fstr());
  const NONE = 0xffffffff; const out = [];
  const walk = (di, prefix) => {
    const dd = dirs[di]; const name = dd.name === NONE ? '' : strs[dd.name];
    const path = prefix + (name ? name + '/' : '');
    for (let f = dd.file; f !== NONE; f = files[f].next) out.push({ path: mount + path + strs[files[f].name], toc: files[f].toc });
    for (let c = dd.child; c !== NONE; c = dirs[c].sib) walk(c, path);
  };
  if (nDir) walk(0, '');
  return { h, offLen, blocks, methods, files: out };
}
