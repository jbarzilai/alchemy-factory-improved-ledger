import { concat, i32, fstr } from './encode';

export function texture(format = 'PF_B8G8R8A8', size = 128): Uint8Array {
  const header = Buffer.alloc(64);
  header.writeUInt32LE(64, 4);
  const mips = [size, size / 2].map((n, i) => concat(i32(i),
    Uint8Array.from({ length: n * n * 4 }, (_, j) => [10, 20, 30, 255][j % 4]), i32(n), i32(n), i32(1)));
  return concat(header, new Uint8Array(20), i32(size), i32(size), i32(0), fstr(format), i32(0), i32(2), ...mips);
}

export function iconTable(count = 150): Uint8Array {
  const names = Array.from({ length: count }, (_, i) => `Item${i}`);
  const batch = (names: string[]) => {
    const lengths = Buffer.alloc(names.length * 2);
    names.forEach((name, i) => lengths.writeUInt16BE(name.length, i * 2));
    return concat(i32(names.length), new Uint8Array(12 + names.length * 8), lengths, ...names.map(n => Buffer.from(n)));
  };
  const nameMap = batch(names);
  const imports = Buffer.alloc(8);
  imports.writeBigUInt64LE(2n << 62n);
  const importedNames = batch(['/Game/Arts/UI/Ingredients/T_UI_Shared']);
  const header = Buffer.alloc(60);
  header.writeUInt32LE(60 + nameMap.length + imports.length + importedNames.length, 4);
  header.writeUInt32LE(60 + nameMap.length, 28);
  header.writeUInt32LE(60 + nameMap.length + imports.length, 32);
  header.writeUInt32LE(60 + nameMap.length + imports.length, 48);
  const rows = names.map((_, i) => concat(i32(i), i32(0), Uint8Array.of(0x80, 0x3d), i32(0x3ffffffb), i32(-1)));
  return concat(header, nameMap, imports, importedNames, ...rows);
}
