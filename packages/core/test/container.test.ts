import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  IncompleteSaveError, SaveFormatError, assertKraken, parseBlockChain, parseHeader, ticksToLocalDate,
} from '../src/container';
import { fixtureInfo, fixtureSavePath, sha256 } from './helpers/fixture';
import { bag, concat, fstr, i32, tag, typeName } from './helpers/encode';

function syntheticHeader(): Uint8Array {
  const struct = (name: string) => typeName('StructProperty', typeName(name));
  const ticks = Buffer.alloc(8);
  ticks.writeBigInt64LE(621_355_968_000_000_000n);
  const props = bag(
    tag('Name', typeName('StrProperty'), fstr('Sand')),
    tag('SaveTime', struct('DateTime'), ticks, 0x08),
    tag('Version', struct('SaveGameVersion'), bag(tag('MajorVersion', typeName('IntProperty'), i32(1)))),
  );
  return concat(Uint8Array.of(0xd5, 0x43, 0x48, 0x41, 0x46), i32(props.length), Buffer.from('PKG'),
    props, Uint8Array.of(0xb7, 0xcf, 0xd5, 0x50, 3), new Uint8Array(8));
}

let buf: Uint8Array;
beforeAll(() => {
  buf = readFileSync(fixtureSavePath());
});

describe('fixture save', () => {
  it('is the pinned file', () => {
    expect(sha256(buf)).toBe(fixtureInfo.sha256);
  });
});

describe('parseHeader', () => {
  it('uses the declared length for a different save name', () => {
    const bytes = syntheticHeader();
    const length = new DataView(bytes.buffer).getUint32(5, true);
    expect(parseHeader(bytes)).toMatchObject({ name: 'Sand', bodyOffset: 12 + length });
    expect(parseBlockChain(bytes, 12 + length)).toEqual([]);
  });

  it('reports a declared header longer than the file as incomplete', () => {
    const bytes = syntheticHeader();
    new DataView(bytes.buffer).setUint32(5, bytes.length, true);
    expect(() => parseHeader(bytes)).toThrow(IncompleteSaveError);
  });

  it('treats corrupt inner sizes in a complete header as format errors', () => {
    const bytes = Uint8Array.from(buf);
    const nameTag = concat(fstr('Name'), typeName('StrProperty'));
    const at = Buffer.from(bytes).indexOf(nameTag);
    expect(at).toBeGreaterThan(12);
    new DataView(bytes.buffer).setInt32(at + nameTag.length, 0x7fffffff, true);
    expect(() => parseHeader(bytes)).toThrow(SaveFormatError);
    expect(() => parseHeader(bytes)).not.toThrow(IncompleteSaveError);
    expect(() => parseHeader(bytes)).toThrow(/header.Name.*runs past end/);
  });

  it('rejects a property list ending before the declared header end', () => {
    const bytes = Uint8Array.from(buf);
    new DataView(bytes.buffer).setUint32(5, 816, true);
    expect(() => parseHeader(bytes)).toThrow(SaveFormatError);
    expect(() => parseHeader(bytes)).toThrow(/ends at 827 but header length says 828/);
  });

  it('rejects a bad PKG marker', () => {
    const bytes = Uint8Array.from(buf);
    bytes[9] = 0;
    expect(() => parseHeader(bytes)).toThrow(SaveFormatError);
    expect(() => parseHeader(bytes)).toThrow(/CHAF/);
  });

  it('reads the uncompressed header properties', () => {
    const h = parseHeader(buf);
    expect(h).toMatchObject({
      isSandbox: false, saveDay: 199, level: 6, name: '1 Point Oh', desc: '',
      wallet: { copper: 0, silver: 3322, gold: 0 },
      version: { major: 1, minor: 4, revision: 1, build: 5024 },
      bodyOffset: 827,
    });
  });

  it('reads SaveTime as local wall-clock time', () => {
    const t = parseHeader(buf).savedAt;
    expect([t.getFullYear(), t.getMonth() + 1, t.getDate(), t.getHours(), t.getMinutes(), t.getSeconds(), t.getMilliseconds()])
      .toEqual([2026, 10, 25, 12, 44, 52, 32]);
  });

  it('rejects files without the CHAF magic', () => {
    const bad = Uint8Array.from(buf);
    bad[1] = 0;
    expect(() => parseHeader(bad)).toThrow(SaveFormatError);
    expect(() => parseHeader(bad)).toThrow(/CHAF/);
  });

  it('reports a file cut off inside the header as incomplete', () => {
    expect(() => parseHeader(buf.subarray(0, 500))).toThrow(IncompleteSaveError);
    expect(() => parseHeader(buf.subarray(0, 5))).toThrow(IncompleteSaveError);
  });
});

describe('parseBlockChain', () => {
  it.each([0n, 0x80000000n, 0xffffffffffffffffn])('rejects invalid uncompressed size %s before conversion', (size) => {
    const bytes = Uint8Array.from(buf);
    new DataView(bytes.buffer).setBigUint64(827 + 13 + 4, size, true);
    expect(() => parseBlockChain(bytes, 827)).toThrow(SaveFormatError);
    expect(() => parseBlockChain(bytes, 827)).toThrow(/block 0: .*uncompressed size/);
    expect(() => parseBlockChain(bytes, 827)).not.toThrow(IncompleteSaveError);
  });

  it.each([0, 1])('rejects compressed size %i with no room for a codec header', (size) => {
    const bytes = Uint8Array.from(buf);
    const view = new DataView(bytes.buffer);
    view.setUint32(827 + 13, size, true);
    view.setBigUint64(827 + 13 + 12, BigInt(size), true);
    expect(() => parseBlockChain(bytes, 827)).toThrow(SaveFormatError);
    expect(() => parseBlockChain(bytes, 827)).toThrow(/block 0: .*compressed size/);
    expect(() => parseBlockChain(bytes, 827)).not.toThrow(IncompleteSaveError);
  });

  it('walks all 68 blocks and covers the file exactly', () => {
    const blocks = parseBlockChain(buf, 827);
    expect(blocks).toHaveLength(68);
    expect(blocks[0]).toEqual({ index: 0, dataOffset: 860, compressedSize: 562_608, uncompressedSize: 58_684_292 });
    const last = blocks[blocks.length - 1];
    expect(last.dataOffset + last.compressedSize).toBe(buf.length);
    assertKraken(buf, blocks[0]);
  });

  it('reports a truncated block chain as incomplete (partially written save)', () => {
    expect(() => parseBlockChain(buf.subarray(0, 100_000), 827)).toThrow(IncompleteSaveError);
    expect(() => parseBlockChain(buf.subarray(0, buf.length - 1), 827)).toThrow(IncompleteSaveError);
  });

  it('rejects trailing bytes after the chain as a format error, not incomplete', () => {
    const longer = new Uint8Array(buf.length + 1);
    longer.set(buf);
    const run = () => parseBlockChain(longer, 827);
    expect(run).toThrow(/block chain ends at/);
    expect(run).not.toThrow(IncompleteSaveError);
  });

  it('rejects a bad body magic', () => {
    expect(() => parseBlockChain(buf, 828)).toThrow(/compressed-body magic/);
  });
});

describe('assertKraken', () => {
  it('rejects data that is not an Oodle Kraken stream', () => {
    const zeros = new Uint8Array(64);
    expect(() => assertKraken(zeros, { index: 0, dataOffset: 0, compressedSize: 64, uncompressedSize: 100 }))
      .toThrow(/not Oodle Kraken/);
  });
});

describe('ticksToLocalDate', () => {
  it('maps 0001-01-01 + ticks to local components', () => {
    const d = ticksToLocalDate(621_355_968_000_000_000n); // 1970-01-01 00:00 wall-clock
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([1970, 0, 1, 0]);
  });
});
