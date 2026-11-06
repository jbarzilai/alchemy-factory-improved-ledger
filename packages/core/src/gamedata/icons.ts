import { ByteReader } from '../reader';
import { GameDataError } from '../errors';
import type { ParsedRow } from './enemies';

export function iconTocPath(pkg: string): string {
  if (!/^\/Game\/(?:[A-Za-z0-9_]+\/)*[A-Za-z0-9_]+$/.test(pkg)) throw new GameDataError(`invalid icon package path ${pkg}`);
  return `AlchemyFactory/Content/${pkg.slice(6)}.uasset`;
}

export function iconPackages(dtEnemies: Uint8Array, rows: ParsedRow[]): { packages: Map<string, string>; problems: Map<string, string> } {
  const r = new ByteReader(dtEnemies, 28);
  const importMap = r.u32();
  const exportMap = r.u32();
  r.pos = 48;
  const namesAt = r.u32();
  r.pos = 4;
  const headerSize = r.u32();
  if (headerSize > dtEnemies.length || importMap < 60 || exportMap < importMap || namesAt < exportMap || namesAt > headerSize) {
    throw new GameDataError('invalid icon import map offsets');
  }
  r.pos = namesAt;
  const n = r.u32();
  r.bytes(12 + n * 8);
  const lengths = Array.from({ length: n }, () => (r.u8() << 8) | r.u8());
  const names = lengths.map(length => Buffer.from(r.bytes((length & 0x7fff) * (length & 0x8000 ? 2 : 1)))
    .toString(length & 0x8000 ? 'utf16le' : 'latin1'));
  if (r.pos > headerSize) throw new GameDataError('imported package names exceed zen header');
  const packages = new Map<string, string>(), problems = new Map<string, string>();
  for (const { row, displayIcon } of rows) {
    try {
      if (displayIcon === null) throw new Error('no DisplayIcon');
      if (displayIcon >= 0) throw new Error('DisplayIcon is not an import');
      const at = importMap + 8 * (-displayIcon - 1);
      if (at + 8 > exportMap) throw new Error('DisplayIcon import outside import map');
      r.pos = at;
      const v = r.u64();
      if (v >> 62n !== 2n) throw new Error(`import is not a package import: ${v.toString(16)}`);
      const pkg = names[Number((v >> 32n) & 0x3fffffffn)];
      if (!pkg) throw new Error('package name index outside imported names');
      iconTocPath(pkg);
      packages.set(row, pkg);
    } catch (error) { problems.set(row, (error as Error).message); }
  }
  return { packages, problems };
}
