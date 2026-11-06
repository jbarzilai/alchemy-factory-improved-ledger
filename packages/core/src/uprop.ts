// Unreal 5.5 tagged-property parser ("complete type name" tags). Ported from the original Python prototype; see SAVE_FORMAT.md §3.
// Every value must consume exactly the size its tag declares, otherwise PropertyError.
import { ByteReader } from './reader';
import { PropertyError } from './errors';
export { PropertyError } from './errors';

export type TypeName = { name: string; params: TypeName[] };
export type PropValue = boolean | number | bigint | string | Uint8Array | Unparsed | PropBag | PropValue[];
export interface PropBag { [name: string]: PropValue }
export type PropertyTag = { name: string; type: TypeName; size: number; flags: number; arrayIndex: number };

// A value skipped by its declared size because we don't decode that type (e.g. TextProperty).
export class Unparsed {
  constructor(readonly type: string, readonly size: number) {}
}

const FLAG_ARRAY_INDEX = 0x01;
const FLAG_GUID = 0x02;
const FLAG_EXTENSIONS = 0x04;
const FLAG_NATIVE = 0x08;
const FLAG_BOOL_TRUE = 0x10;
const KNOWN_FLAGS = 0x1f; // native serialization has no extra tag bytes
const MAX_TYPE_PARAMS = 16;

const NATIVE_STRUCTS: Record<string, (r: ByteReader) => PropValue> = {
  IntVector: (r) => [r.i32(), r.i32(), r.i32()],
  IntPoint: (r) => [r.i32(), r.i32()],
  Vector: (r) => [r.f64(), r.f64(), r.f64()],
  Vector2D: (r) => [r.f64(), r.f64()],
  Rotator: (r) => [r.f64(), r.f64(), r.f64()],
  Quat: (r) => [r.f64(), r.f64(), r.f64(), r.f64()],
  LinearColor: (r) => [r.f32(), r.f32(), r.f32(), r.f32()],
  Color: (r) => [r.u8(), r.u8(), r.u8(), r.u8()],
  DateTime: (r) => r.i64(),
  Timespan: (r) => r.i64(),
  Guid: (r) => r.bytes(16).slice(),
};

const ELEMENT_TYPES = new Set([
  'StructProperty', 'IntProperty', 'Int64Property', 'UInt32Property', 'UInt64Property', 'FloatProperty',
  'DoubleProperty', 'StrProperty', 'NameProperty', 'EnumProperty', 'ByteProperty', 'BoolProperty', 'ObjectProperty',
]);

export function readTypeName(r: ByteReader): TypeName {
  const name = r.fstr();
  const count = r.i32();
  if (count < 0 || count > MAX_TYPE_PARAMS) throw new PropertyError(`type ${name}: bad parameter count ${count}`);
  const params: TypeName[] = [];
  for (let i = 0; i < count; i++) params.push(readTypeName(r));
  return { name, params };
}

export function readTag(r: ByteReader): PropertyTag | null {
  const name = r.fstr();
  if (name === 'None') return null;
  const type = readTypeName(r);
  const size = r.i32();
  const flags = r.u8();
  if (size < 0) throw new PropertyError(`${name}: negative size ${size}`);
  if (flags & ~KNOWN_FLAGS) throw new PropertyError(`${name}: unknown tag flags 0x${flags.toString(16)}`);
  let arrayIndex = 0;
  if (flags & FLAG_ARRAY_INDEX) arrayIndex = r.i32();
  if (flags & FLAG_GUID) r.bytes(16);
  if (flags & FLAG_EXTENSIONS) {
    const ext = r.u8();
    if (ext !== 0) throw new PropertyError(`${name}: unsupported property extensions 0x${ext.toString(16)}`);
  }
  return { name, type, size, flags, arrayIndex };
}

function param(type: TypeName, i: number, path: string): TypeName {
  const p = type.params[i];
  if (!p) throw new PropertyError(`${path}: ${type.name} is missing type parameter ${i}`);
  return p;
}

function readStruct(r: ByteReader, structName: string, path: string): PropValue {
  const native = Object.hasOwn(NATIVE_STRUCTS, structName) ? NATIVE_STRUCTS[structName] : undefined;
  return native ? native(r) : readProps(r, path);
}

function readElement(r: ByteReader, type: TypeName, path: string): PropValue {
  switch (type.name) {
    case 'StructProperty': return readStruct(r, param(type, 0, path).name, path);
    case 'IntProperty': return r.i32();
    case 'Int64Property': return r.i64();
    case 'UInt32Property': return r.u32();
    case 'UInt64Property': return r.u64();
    case 'FloatProperty': return r.f32();
    case 'DoubleProperty': return r.f64();
    case 'StrProperty':
    case 'NameProperty':
    case 'EnumProperty':
    case 'ObjectProperty': return r.fstr();
    case 'ByteProperty': return r.u8();
    case 'BoolProperty': return r.u8() !== 0;
  }
  throw new PropertyError(`${path}: unsupported element type ${type.name}`);
}

export function readValue(r: ByteReader, type: TypeName, size: number, flags: number, path: string): PropValue {
  const start = r.pos;
  const end = start + size;
  if (end > r.buf.length) throw new RangeError(`${path}: value of ${size} bytes at offset ${start} runs past end (${r.buf.length} bytes)`);
  let v: PropValue;
  switch (type.name) {
    case 'BoolProperty': v = (flags & FLAG_BOOL_TRUE) !== 0; break;
    case 'IntProperty': v = r.i32(); break;
    case 'Int64Property': v = r.i64(); break;
    case 'UInt32Property': v = r.u32(); break;
    case 'UInt64Property': v = r.u64(); break;
    case 'Int16Property': v = r.i16(); break;
    case 'UInt16Property': v = r.u16(); break;
    case 'FloatProperty': v = r.f32(); break;
    case 'DoubleProperty': v = r.f64(); break;
    case 'StrProperty':
    case 'NameProperty': v = r.fstr(); break;
    case 'ByteProperty':
    case 'EnumProperty': {
      // Enum-typed values are names; plain bytes are u8.
      const isName = type.name === 'EnumProperty' || (type.params.length > 0 && type.params[0].name !== 'None');
      v = isName && size !== 1 ? r.fstr() : r.u8();
      break;
    }
    case 'StructProperty': {
      const name = param(type, 0, path).name;
      if (!Object.hasOwn(NATIVE_STRUCTS, name) && (flags & FLAG_NATIVE)) {
        r.pos = end;
        v = new Unparsed(`StructProperty<${name}>`, size);
      } else {
        v = readStruct(r, name, path);
      }
      break;
    }
    case 'ArrayProperty':
    case 'SetProperty': {
      const inner = param(type, 0, path);
      if (!ELEMENT_TYPES.has(inner.name)) {
        r.pos = end;
        v = new Unparsed(`${type.name}<${inner.name}>`, size);
        break;
      }
      if (type.name === 'SetProperty') r.i32(); // number of elements to remove
      const count = r.i32();
      if (count < 0) throw new PropertyError(`${path}: negative element count ${count}`);
      if (count > end - r.pos) throw new PropertyError(`${path}: element count ${count} exceeds remaining value bytes (${end - r.pos})`);
      const items: PropValue[] = [];
      for (let i = 0; i < count; i++) items.push(readElement(r, inner, `${path}[${i}]`));
      v = items;
      break;
    }
    case 'MapProperty': {
      const keyType = param(type, 0, path);
      const valueType = param(type, 1, path);
      if (!ELEMENT_TYPES.has(keyType.name) || !ELEMENT_TYPES.has(valueType.name)) {
        r.pos = end;
        v = new Unparsed(`MapProperty<${keyType.name},${valueType.name}>`, size);
        break;
      }
      r.i32(); // number of keys to remove
      const count = r.i32();
      if (count < 0) throw new PropertyError(`${path}: negative entry count ${count}`);
      if (count * 2 > end - r.pos) throw new PropertyError(`${path}: entry count ${count} exceeds remaining value bytes (${end - r.pos})`);
      const entries: PropValue[] = [];
      for (let i = 0; i < count; i++) {
        entries.push([readElement(r, keyType, `${path}{${i}}`), readElement(r, valueType, `${path}{${i}}`)]);
      }
      v = entries;
      break;
    }
    default:
      r.pos = end;
      v = new Unparsed(type.name, size);
  }
  if (r.pos !== end) throw new PropertyError(`${path}: ${type.name} consumed ${r.pos - start} bytes, tag says ${size}`);
  return v;
}

export function readProps(r: ByteReader, path = ''): PropBag {
  const out: PropBag = Object.create(null);
  for (;;) {
    const tag = readTag(r);
    if (!tag) return out;
    const key = tag.arrayIndex > 0 ? `${tag.name}[${tag.arrayIndex}]` : tag.name;
    const where = path ? `${path}.${key}` : key;
    if (Object.hasOwn(out, key)) throw new PropertyError(`${where}: duplicate property ${key}`);
    out[key] = readValue(r, tag.type, tag.size, tag.flags, where);
  }
}
