// Find a property inside block 0 by searching for its name tag (SAVE_FORMAT.md §2):
// u32(len+1) name NUL, then a type name ending in "Property". Other matches (e.g. the name table) are skipped.
import { ByteReader } from './reader';
import { PropertyError, readTag, readValue, type PropValue, type PropertyTag } from './uprop';

export function findProperty(body: Uint8Array, name: string): PropValue | undefined {
  const hay = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  const key = Buffer.alloc(4 + name.length + 1);
  key.writeInt32LE(name.length + 1, 0);
  key.set(Buffer.from(name, 'latin1'), 4);
  for (let at = hay.indexOf(key); at >= 0; at = hay.indexOf(key, at + 1)) {
    const r = new ByteReader(body, at);
    let tag: PropertyTag | null = null;
    try {
      tag = readTag(r);
    } catch (e) {
      if (!(e instanceof PropertyError || e instanceof RangeError)) throw e;
    }
    // Once a real tag is found, value errors are real errors: let them propagate.
    if (tag && tag.type.name.endsWith('Property')) return readValue(r, tag.type, tag.size, tag.flags, name);
  }
  return undefined;
}
