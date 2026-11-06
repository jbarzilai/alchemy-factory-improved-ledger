import { deflateSync } from 'node:zlib';

function validate(width: number, height: number, rgba: Uint8Array): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || rgba.length !== width * height * 4) {
    throw new Error('invalid RGBA dimensions or byte length');
  }
}

export function scaleRgba(width: number, height: number, rgba: Uint8Array, size: number): Uint8Array {
  if (!Number.isSafeInteger(size) || size <= 0 || width !== height || width < size || width % size !== 0) {
    throw new Error(`cannot scale ${width}×${height} to ${size}`);
  }
  validate(width, height, rgba);
  if (size === width) return Uint8Array.from(rgba);
  const out = new Uint8Array(size * size * 4), step = width / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let a = 0, r = 0, g = 0, b = 0;
    for (let yy = 0; yy < step; yy++) for (let xx = 0; xx < step; xx++) {
      const i = ((y * step + yy) * width + x * step + xx) * 4, alpha = rgba[i + 3];
      a += alpha; r += rgba[i] * alpha; g += rgba[i + 1] * alpha; b += rgba[i + 2] * alpha;
    }
    const i = (y * size + x) * 4;
    out[i] = a ? Math.round(r / a) : 0;
    out[i + 1] = a ? Math.round(g / a) : 0;
    out[i + 2] = a ? Math.round(b / a) : 0;
    out[i + 3] = Math.round(a / (step * step));
  }
  return out;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length);
  out.set(Buffer.from(type, 'ascii'), 4); out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, out.length - 4)), out.length - 4);
  return out;
}
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c);
  return x <= y && x <= z ? a : y <= z ? b : c;
}
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  validate(width, height, rgba);
  const stride = width * 4, rows = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    let best: Uint8Array | undefined, bestScore = Infinity, bestFilter = 0;
    for (let filter = 0; filter <= 4; filter++) {
      const candidate = new Uint8Array(stride);
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const i = y * stride + x, a = x >= 4 ? rgba[i - 4] : 0, b = y ? rgba[i - stride] : 0;
        const c = y && x >= 4 ? rgba[i - stride - 4] : 0;
        const prediction = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
        candidate[x] = rgba[i] - prediction;
        score += Math.abs(candidate[x] < 128 ? candidate[x] : candidate[x] - 256);
      }
      if (score < bestScore) { best = candidate; bestScore = score; bestFilter = filter; }
    }
    rows[y * (stride + 1)] = bestFilter;
    rows.set(best!, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', new Uint8Array())]);
}
