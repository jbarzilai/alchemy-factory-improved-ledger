import { describe, expect, it } from 'vitest';
import { ByteReader } from '../src/reader';
import { PropertyError } from '../src/uprop';
import { concat, fstr, i32 } from './helpers/encode';

describe('ByteReader', () => {
  it('reads little-endian integers and advances', () => {
    const r = new ByteReader(Uint8Array.of(0xc7, 0, 0, 0, 0xff, 0xff, 0xff, 0xff, 0x2a));
    expect(r.i32()).toBe(199);
    expect(r.i32()).toBe(-1);
    expect(r.u8()).toBe(42);
    expect(r.pos).toBe(9);
  });

  it('reads 64-bit values as bigint', () => {
    const r = new ByteReader(Uint8Array.of(0x00, 0x1c, 0x70, 0xc3, 0x95, 0x32, 0xdf, 0x08));
    expect(r.i64()).toBe(0x08df3295c3701c00n);
  });

  it('reads Latin-1, UTF-16 and empty FStrings', () => {
    const r = new ByteReader(concat(fstr('1 Point Oh'), fstr('Café'), fstr('Tea ☕'), fstr('')));
    expect(r.fstr()).toBe('1 Point Oh');
    expect(r.fstr()).toBe('Café');
    expect(r.fstr()).toBe('Tea ☕');
    expect(r.fstr()).toBe('');
  });

  it('throws RangeError when a read runs past the end', () => {
    expect(() => new ByteReader(Uint8Array.of(1, 2)).i32()).toThrow(RangeError);
    expect(() => new ByteReader(i32(1000)).fstr()).toThrow(RangeError);
  });

  it('rejects FStrings that are not NUL-terminated', () => {
    expect(() => new ByteReader(concat(i32(3), Uint8Array.of(0x61, 0x62, 0x63))).fstr()).toThrow(/NUL/);
    expect(() => new ByteReader(concat(i32(3), Uint8Array.of(0x61, 0x62, 0x63))).fstr()).toThrow(PropertyError);
    expect(() => new ByteReader(concat(i32(-2), Uint8Array.of(0x61, 0, 0x62, 0))).fstr()).toThrow(PropertyError);
  });
});
