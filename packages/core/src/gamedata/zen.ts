import { GameDataError } from '../errors';
import { ByteReader } from '../reader';

// Zen's name lengths are big-endian even though the package summary is little-endian.
export function zenNames(asset: Uint8Array): { headerSize: number; names: string[] } {
  try {
    const r = new ByteReader(asset);
    if (r.u32() !== 0) throw new GameDataError('zen versioning info present');
    const headerSize = r.u32();
    r.bytes(52);
    const count = r.u32();
    r.bytes(12); // string byte count and hash version
    r.bytes(count * 8); // name hashes
    const lengths = Array.from({ length: count }, () => (r.u8() << 8) | r.u8());
    const names = lengths.map((length) => {
      const wide = Boolean(length & 0x8000);
      return Buffer.from(r.bytes((length & 0x7fff) * (wide ? 2 : 1))).toString(wide ? 'utf16le' : 'latin1');
    });
    if (headerSize < r.pos || headerSize > asset.length) throw new GameDataError('invalid zen header size');
    return { headerSize, names };
  } catch (error) {
    if (error instanceof GameDataError) throw error;
    throw new GameDataError(`invalid zen name map: ${(error as Error).message}`);
  }
}
