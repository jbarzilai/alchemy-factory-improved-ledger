import { concat, fstr, i32 } from './encode';

// Two 8-byte blocks; target is logical bytes [5, 12), crossing their boundary.
export function toc(method = 0, asset = 'DataTables/DT_Enemies.uasset'): Uint8Array {
  const directory = concat(fstr('../../../'), i32(1), i32(-1), i32(-1), i32(-1), i32(0),
    i32(1), i32(0), i32(-1), i32(0), i32(1), fstr(asset));
  const header = Buffer.alloc(144);
  header.set(Buffer.from('-==--==--==--==-'));
  header[16] = 8;
  for (const [offset, value] of [[20, 144], [24, 1], [28, 2], [32, 12], [36, method ? 1 : 0],
    [40, 16], [44, 8], [48, directory.length], [52, 1]]) header.writeUInt32LE(value, offset);
  const offLen = Buffer.alloc(10);
  offLen.writeUIntBE(5, 0, 5);
  offLen.writeUIntBE(7, 5, 5);
  const blocks = [0, 8].map((offset) => {
    const b = Buffer.alloc(12);
    b.writeUIntLE(offset, 0, 5); b.writeUIntLE(8, 5, 3); b.writeUIntLE(8, 8, 3); b[11] = method;
    return b;
  });
  const methods = method ? Buffer.alloc(16) : Buffer.alloc(0);
  if (method) methods.set(Buffer.from('Oodle'));
  return concat(header, new Uint8Array(12), offLen, ...blocks, methods, directory);
}

