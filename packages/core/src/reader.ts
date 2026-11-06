// Little-endian cursor over a byte buffer. Every read is bounds-checked and throws RangeError past the end.
import { PropertyError } from './errors';
export class ByteReader {
  readonly buf: Uint8Array;
  pos: number;
  private readonly view: DataView;

  constructor(buf: Uint8Array, pos = 0) {
    this.buf = buf;
    this.pos = pos;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  private take(n: number): number {
    const at = this.pos;
    if (n < 0 || at + n > this.buf.length) {
      throw new RangeError(`read of ${n} bytes at offset ${at} runs past end (${this.buf.length} bytes)`);
    }
    this.pos = at + n;
    return at;
  }

  u8(): number { return this.buf[this.take(1)]; }
  i16(): number { return this.view.getInt16(this.take(2), true); }
  u16(): number { return this.view.getUint16(this.take(2), true); }
  i32(): number { return this.view.getInt32(this.take(4), true); }
  u32(): number { return this.view.getUint32(this.take(4), true); }
  i64(): bigint { return this.view.getBigInt64(this.take(8), true); }
  u64(): bigint { return this.view.getBigUint64(this.take(8), true); }
  f32(): number { return this.view.getFloat32(this.take(4), true); }
  f64(): number { return this.view.getFloat64(this.take(8), true); }

  bytes(n: number): Uint8Array {
    const at = this.take(n);
    return this.buf.subarray(at, at + n);
  }

  // Unreal FString: i32 length including the NUL; positive = Latin-1, negative = UTF-16LE (length in chars).
  fstr(): string {
    const at = this.pos;
    const n = this.i32();
    if (n === 0) return '';
    const latin1 = n > 0;
    const nulSize = latin1 ? 1 : 2;
    const raw = this.bytes(latin1 ? n : -n * 2);
    if (raw[raw.length - 1] !== 0 || (!latin1 && raw[raw.length - 2] !== 0)) {
      throw new PropertyError(`FString at offset ${at} is not NUL-terminated`);
    }
    const text = Buffer.from(raw.buffer, raw.byteOffset, raw.length - nulSize);
    return text.toString(latin1 ? 'latin1' : 'utf16le');
  }
}
