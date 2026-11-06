// Builds synthetic Unreal 5.5 tagged-property bytes for parser tests (SAVE_FORMAT.md §3).
export function concat(...parts: Uint8Array[]): Uint8Array {
  return Uint8Array.from(Buffer.concat(parts));
}

export function u8(n: number): Uint8Array {
  return Uint8Array.of(n);
}

export function i32(n: number): Uint8Array {
  const b = Buffer.alloc(4);
  b.writeInt32LE(n);
  return b;
}

export function f64(n: number): Uint8Array {
  const b = Buffer.alloc(8);
  b.writeDoubleLE(n);
  return b;
}

export function fstr(s: string): Uint8Array {
  if (s === '') return i32(0);
  const wide = [...s].some((c) => c.charCodeAt(0) > 0xff);
  if (!wide) return concat(i32(s.length + 1), Buffer.from(s + '\0', 'latin1'));
  return concat(i32(-(s.length + 1)), Buffer.from(s + '\0', 'utf16le'));
}

export function typeName(name: string, ...params: Uint8Array[]): Uint8Array {
  return concat(fstr(name), i32(params.length), ...params);
}

// Tag + value. `extra` is whatever the flags say follows the flags byte (array index, guid, extensions).
export function tag(name: string, type: Uint8Array, value: Uint8Array, flags = 0, extra: Uint8Array = new Uint8Array()): Uint8Array {
  return concat(fstr(name), type, i32(value.length), u8(flags), extra, value);
}

export const NONE = fstr('None');

// A property list: the tags followed by the None terminator.
export function bag(...tags: Uint8Array[]): Uint8Array {
  return concat(...tags, NONE);
}
