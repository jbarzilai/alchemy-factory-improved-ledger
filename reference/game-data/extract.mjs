// Extract one file from the IoStore container (read-only) by path suffix; decompress blocks with kdec.
import { execFileSync } from 'node:child_process';
import { readFileSync, openSync, readSync, closeSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readToc } from './utoc.mjs';
const [utoc, suffix, out] = process.argv.slice(2);
const ucas = utoc.replace(/\.utoc$/, '.ucas');
const KDEC = process.env.AF_KDEC || fileURLToPath(new URL('../../packages/core/native/bin/linux-x64/kdec', import.meta.url));
const t = readToc(utoc);
const f = t.files.find((x) => x.path.endsWith(suffix));
if (!f) throw new Error('not found: ' + suffix);
const { offset, length } = t.offLen[f.toc];
const bs = t.h.blockSize, first = Math.floor(offset / bs), last = Math.floor((offset + length - 1) / bs);
const parts = [];
const fd = openSync(ucas, 'r');
for (let i = first; i <= last; i++) {
  const blk = t.blocks[i];
  const csize = Math.ceil(blk.csize / 16) * 16 >= blk.csize ? blk.csize : blk.csize;
  if (blk.method === 0) { const buf = Buffer.alloc(blk.usize); readSync(fd, buf, 0, blk.usize, blk.off); parts.push(buf); }
  else {
    const src = Buffer.alloc(blk.csize); readSync(fd, src, 0, blk.csize, blk.off);
    parts.push(execFileSync(KDEC, ['-', '0', String(blk.csize), String(blk.usize)], { input: src, maxBuffer: 1 << 26 }));
  }
}
closeSync(fd);
const all = Buffer.concat(parts);
const start = offset - first * bs;
writeFileSync(out, all.subarray(start, start + length));
console.log(f.path, length, 'bytes ->', out);
