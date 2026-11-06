import { expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { decodeTexture, encodePng, iconPackages, iconTocPath, parseEnemiesTable, scaleRgba } from '../src/gamedata';
import { iconTable, texture } from './helpers/icons';

function crc(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); }
  return (c ^ 0xffffffff) >>> 0;
}
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c);
  return x <= y && x <= z ? a : y <= z ? b : c;
}
function roundTrip(width: number, height: number, pixels: Uint8Array) {
  const png = Buffer.from(encodePng(width, height, pixels));
  expect(encodePng(width, height, pixels)).toEqual(png);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts: Buffer[] = [];
  for (let p = 8; p < png.length;) {
    const n = png.readUInt32BE(p), type = png.toString('ascii', p + 4, p + 8);
    expect(png.readUInt32BE(p + 8 + n)).toBe(crc(png.subarray(p + 4, p + 8 + n)));
    if (type === 'IHDR') {
      expect([png.readUInt32BE(p + 8), png.readUInt32BE(p + 12), ...png.subarray(p + 16, p + 21)]).toEqual([width, height, 8, 6, 0, 0, 0]);
    }
    if (type === 'IDAT') parts.push(png.subarray(p + 8, p + 8 + n));
    p += n + 12;
  }
  const raw = inflateSync(Buffer.concat(parts)), result = Buffer.alloc(pixels.length), stride = width * 4;
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    expect(filter).toBeLessThanOrEqual(4);
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x, a = x >= 4 ? result[at - 4] : 0, b = y ? result[at - stride] : 0;
      const c = y && x >= 4 ? result[at - stride - 4] : 0;
      result[at] = raw[y * (stride + 1) + 1 + x] + [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
    }
  }
  expect(result).toEqual(Buffer.from(pixels));
}
it('encodes deterministic PNGs with valid IHDR, CRCs and reversible filters', () => {
  roundTrip(2, 1, Uint8Array.of(255, 0, 0, 64, 0, 20, 255, 255));
  roundTrip(8, 8, Uint8Array.from({ length: 256 }, (_, i) => (i * 73) % 256));
});
it('scales using premultiplied alpha without white fringes', () => {
  expect([...scaleRgba(2, 2, Uint8Array.of(255, 0, 0, 255, 255, 255, 255, 0, 255, 255, 255, 0, 255, 255, 255, 0), 1)]).toEqual([255, 0, 0, 64]);
  const checker = Uint8Array.from({ length: 64 }, (_, i) => i % 4 === 3 ? 255 : ((Math.floor(i / 4) % 4 + Math.floor(i / 16)) % 2) * 255);
  expect([...scaleRgba(4, 4, checker, 2)]).toEqual(Array.from({ length: 4 }, () => [128, 128, 128, 255]).flat());
  for (const n of [128, 512]) expect(scaleRgba(n, n, new Uint8Array(n * n * 4), 64)).toHaveLength(64 * 64 * 4);
  expect(() => scaleRgba(100, 100, new Uint8Array(40000), 64)).toThrow('cannot scale 100×100 to 64');
  expect(() => scaleRgba(128, 256, new Uint8Array(128 * 256 * 4), 64)).toThrow('cannot scale');
  const bytes = Uint8Array.of(1, 2, 3, 4);
  expect(scaleRgba(1, 1, bytes, 1)).toEqual(bytes);
  expect(scaleRgba(1, 1, bytes, 1)).not.toBe(bytes);
});
it('decodes the largest inline BGRA mip and refuses other formats and truncation', () => {
  const decoded = decodeTexture(texture());
  expect([decoded.width, decoded.height]).toEqual([128, 128]);
  expect([...decoded.rgba.subarray(0, 4)]).toEqual([30, 20, 10, 255]);
  expect(() => decodeTexture(texture('PF_DXT5'))).toThrow('unsupported pixel format PF_DXT5');
  expect(() => decodeTexture(texture().subarray(0, 100))).toThrow();
});
it('resolves DisplayIcon package imports and reports invalid references per row', () => {
  const bytes = iconTable(), rows = parseEnemiesTable(bytes);
  expect(rows[0].displayIcon).toBe(-1);
  expect(rows[0].exact).toBe(true);
  const resolved = iconPackages(bytes, rows);
  expect(resolved.packages.size).toBe(150);
  expect(resolved.packages.get('Item0')).toBe('/Game/Arts/UI/Ingredients/T_UI_Shared');
  expect(iconTocPath('/Game/X')).toBe('AlchemyFactory/Content/X.uasset');
  expect(() => iconTocPath('/Engine/X')).toThrow();
  expect(iconPackages(bytes, [{ ...rows[0], displayIcon: null }]).problems.get('Item0')).toContain('no DisplayIcon');
  expect(iconPackages(bytes, [{ ...rows[0], displayIcon: 1 }]).problems.get('Item0')).toContain('not an import');
  expect(iconPackages(bytes, [{ ...rows[0], displayIcon: -9999 }]).problems.size).toBe(1);
});

it('bounds DisplayIcon imports at the export map rather than imported package names', () => {
  const original = Buffer.from(iconTable());
  const exportAt = original.readUInt32LE(32);
  // Export bytes deliberately resemble a valid package import.
  const fakeImport = Buffer.alloc(8); fakeImport.writeBigUInt64LE(2n << 62n);
  const bytes = Buffer.concat([original.subarray(0, exportAt), fakeImport, original.subarray(exportAt)]);
  bytes.writeUInt32LE(original.readUInt32LE(4) + 8, 4);
  bytes.writeUInt32LE(exportAt + 8, 48);
  const rows = parseEnemiesTable(bytes);
  const result = iconPackages(bytes, [rows[0], { ...rows[1], displayIcon: -2 }]);
  expect(result.packages.get('Item0')).toBe('/Game/Arts/UI/Ingredients/T_UI_Shared');
  expect(result.packages.has('Item1')).toBe(false);
  expect(result.problems.get('Item1')).toContain('outside import map');
});
