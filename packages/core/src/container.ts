// Save container: CHAF header (uncompressed tagged properties) + Oodle block chain. See SAVE_FORMAT.md §1.
import { asBag, bool, num, optNum, str } from './access';
import { ByteReader } from './reader';
import { readProps, type PropBag } from './uprop';

import { SaveFormatError, IncompleteSaveError } from './errors';
export { SaveFormatError, IncompleteSaveError } from './errors';

export type SaveHeader = {
  isSandbox: boolean;
  saveDay: number; // 0-based current day
  level: number;
  // Coins in the player's inventory (SAVE_FORMAT.md §1.1): Gold = copper, GoldSilver = silver, GoldGold = gold.
  // Not business money: never used in calculations.
  wallet: { gold?: number; silver?: number; copper?: number };
  name: string;
  desc: string;
  savedAt: Date;
  version: { major: number; minor: number; revision: number; build: number };
  bodyOffset: number;
};

export type BlockInfo = { index: number; dataOffset: number; compressedSize: number; uncompressedSize: number };

const OUTER_SIGNATURE = [0xd5, 0x43, 0x48, 0x41, 0x46];
const PKG_MARKER = [0x50, 0x4b, 0x47];
const OUTER_HEADER_SIZE = 12;
const BODY_MAGIC = [0xb7, 0xcf, 0xd5, 0x50];
const BODY_HEADER_SIZE = 13; // magic, u8 (method?), u32 block count, 4 bytes (checksum?)
const BLOCK_HEADER_SIZE = 20; // u32 compressedSize, u64 uncompressedSize, u64 compressedSize
const KRAKEN_DECODER_TYPE = 6;
const TICKS_AT_UNIX_EPOCH = 621_355_968_000_000_000n;

function hasBytes(buf: Uint8Array, at: number, bytes: number[]): boolean {
  return at + bytes.length <= buf.length && bytes.every((b, i) => buf[at + i] === b);
}

// FDateTime ticks (100 ns since 0001-01-01) holding the PC's local wall-clock time.
export function ticksToLocalDate(ticks: bigint): Date {
  const u = new Date(Number((ticks - TICKS_AT_UNIX_EPOCH) / 10_000n));
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(),
    u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds(), u.getUTCMilliseconds());
}

export function parseHeader(buf: Uint8Array): SaveHeader {
  if (buf.length < OUTER_HEADER_SIZE) throw new IncompleteSaveError(`file is only ${buf.length} bytes`);
  if (!hasBytes(buf, 0, OUTER_SIGNATURE) || !hasBytes(buf, 9, PKG_MARKER)) {
    throw new SaveFormatError('not an Alchemy Factory save (bad CHAF signature or PKG marker)');
  }
  const headerLength = new ByteReader(buf, 5).u32();
  const bodyOffset = OUTER_HEADER_SIZE + headerLength;
  if (bodyOffset > buf.length) {
    throw new IncompleteSaveError(`header ends at ${bodyOffset}, past end of file (${buf.length} bytes)`);
  }
  const r = new ByteReader(buf.subarray(0, bodyOffset), OUTER_HEADER_SIZE);
  let p: PropBag;
  try {
    p = readProps(r, 'header');
  } catch (e) {
    throw new SaveFormatError(`corrupt header: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (r.pos !== bodyOffset) {
    throw new SaveFormatError(`header property list ends at ${r.pos} but header length says ${bodyOffset}`);
  }
  const ticks = p.SaveTime;
  if (typeof ticks !== 'bigint') throw new SaveFormatError('header has no SaveTime');
  const v = asBag(p.Version, 'header.Version');
  return {
    isSandbox: bool(p, 'IsSandbox', 'header'),
    saveDay: num(p, 'Day', 'header'),
    level: num(p, 'Level', 'header'),
    wallet: { copper: optNum(p, 'Gold', 'header'), silver: optNum(p, 'GoldSilver', 'header'), gold: optNum(p, 'GoldGold', 'header') },
    name: str(p, 'Name', 'header', ''),
    desc: str(p, 'Desc', 'header', ''),
    savedAt: ticksToLocalDate(ticks),
    version: {
      major: num(v, 'MajorVersion', 'header.Version'),
      minor: num(v, 'MinorVersion', 'header.Version'),
      revision: num(v, 'Revision', 'header.Version'),
      build: num(v, 'BuildNumber', 'header.Version'),
    },
    bodyOffset: r.pos,
  };
}

export function parseBlockChain(buf: Uint8Array, bodyOffset: number): BlockInfo[] {
  if (bodyOffset + BODY_HEADER_SIZE > buf.length) {
    throw new IncompleteSaveError(`compressed-body header at ${bodyOffset} runs past end of file (${buf.length} bytes)`);
  }
  if (!hasBytes(buf, bodyOffset, BODY_MAGIC)) throw new SaveFormatError(`bad compressed-body magic at ${bodyOffset}`);
  const r = new ByteReader(buf, bodyOffset + 5);
  const count = r.u32();
  const blocks: BlockInfo[] = [];
  let p = bodyOffset + BODY_HEADER_SIZE;
  for (let index = 0; index < count; index++) {
    if (p + BLOCK_HEADER_SIZE > buf.length) {
      throw new IncompleteSaveError(`block ${index} of ${count}: header at ${p} runs past end of file (${buf.length} bytes)`);
    }
    r.pos = p;
    const compressedSize = r.u32();
    const uncompressedSize = r.u64();
    const repeat = r.u64();
    if (compressedSize < 2) {
      throw new SaveFormatError(`block ${index}: invalid compressed size ${compressedSize} (must be at least 2)`);
    }
    if (uncompressedSize === 0n || uncompressedSize > 0x7fffffffn) {
      throw new SaveFormatError(`block ${index}: invalid uncompressed size ${uncompressedSize} (must be 1..2147483647)`);
    }
    if (BigInt(compressedSize) !== repeat) {
      throw new SaveFormatError(`block ${index}: compressed sizes disagree (${compressedSize} vs ${repeat})`);
    }
    const dataOffset = p + BLOCK_HEADER_SIZE;
    if (dataOffset + compressedSize > buf.length) {
      throw new IncompleteSaveError(`block ${index} of ${count}: data ends at ${dataOffset + compressedSize}, past end of file (${buf.length} bytes)`);
    }
    blocks.push({ index, dataOffset, compressedSize, uncompressedSize: Number(uncompressedSize) });
    p = dataOffset + compressedSize;
  }
  if (p !== buf.length) throw new SaveFormatError(`block chain ends at ${p} but file is ${buf.length} bytes`);
  return blocks;
}

// Oodle block header: low nibble of byte 0 is 0xC; byte 1 & 0x7F is the codec (6 = Kraken).
export function assertKraken(buf: Uint8Array, block: BlockInfo): void {
  const b0 = buf[block.dataOffset];
  const b1 = buf[block.dataOffset + 1];
  if ((b0 & 0x0f) !== 0x0c || (b1 & 0x7f) !== KRAKEN_DECODER_TYPE) {
    throw new SaveFormatError(`block ${block.index} is not Oodle Kraken data (starts ${b0?.toString(16)} ${b1?.toString(16)})`);
  }
}
