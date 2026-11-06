import { ByteReader } from '../reader';
import { GameDataError } from '../errors';

export function decodeTexture(asset: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  try {
    const r = new ByteReader(asset, 4);
    const headerSize = r.u32();
    if (headerSize < 8 || headerSize >= asset.length) throw new Error('invalid texture header size');
    const data = Buffer.from(asset.subarray(headerSize));
    const i = data.indexOf('PF_'), end = data.indexOf(0, i);
    if (i < 16 || end < i || data.readUInt32LE(i - 4) !== end - i + 1) throw new Error('pixel format string not found');
    const fmt = data.toString('latin1', i, end);
    if (fmt !== 'PF_B8G8R8A8') throw new Error(`unsupported pixel format ${fmt}`);
    const mip = new ByteReader(data, i - 16);
    const sx = mip.u32(), sy = mip.u32();
    mip.pos = end + 1;
    const first = mip.u32(), count = mip.u32();
    if (!sx || !sy || first > 31 || !count || first + count > 32) throw new Error('invalid texture mip dimensions/count');
    let largest: { width: number; height: number; rgba: Uint8Array } | undefined;
    for (let m = 0; m < count; m++) {
      mip.u32();
      const width = Math.max(1, Math.floor(sx / 2 ** (first + m)));
      const height = Math.max(1, Math.floor(sy / 2 ** (first + m)));
      const bgra = mip.bytes(width * height * 4);
      if (mip.u32() !== width || mip.u32() !== height || mip.u32() !== 1) throw new Error(`mip ${m} size mismatch`);
      if (!largest || width * height > largest.width * largest.height) {
        const rgba = Uint8Array.from(bgra);
        for (let j = 0; j < rgba.length; j += 4) { rgba[j] = bgra[j + 2]; rgba[j + 2] = bgra[j]; }
        largest = { width, height, rgba };
      }
    }
    return largest!;
  } catch (error) { throw new GameDataError((error as Error).message); }
}
