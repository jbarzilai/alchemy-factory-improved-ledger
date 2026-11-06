// Typed reads from parsed property bags. Unreal omits properties equal to their defaults,
// so a missing key means "default" (0, false, zero coins) rather than an error.
import { coinsFromIntVector, type Coins } from './coins';
import { Unparsed, type PropBag, type PropValue } from './uprop';

import { SaveShapeError } from './errors';
export { SaveShapeError } from './errors';

function describe(v: PropValue | undefined): string {
  if (v === undefined) return 'nothing';
  if (Array.isArray(v)) return 'an array';
  if (v instanceof Unparsed) return `an unparsed ${v.type}`;
  if (v instanceof Uint8Array) return 'raw bytes';
  return typeof v;
}

export function isBag(v: PropValue | undefined): v is PropBag {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Uint8Array) && !(v instanceof Unparsed);
}

export function asBag(v: PropValue | undefined, where: string): PropBag {
  if (!isBag(v)) throw new SaveShapeError(`${where}: expected a struct, got ${describe(v)}`);
  return v;
}

export function asArray(v: PropValue | undefined, where: string): PropValue[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new SaveShapeError(`${where}: expected an array, got ${describe(v)}`);
  return v;
}

export function optNum(b: PropBag, key: string, where: string): number | undefined {
  const v = Object.hasOwn(b, key) ? b[key] : undefined;
  if (v === undefined) return undefined;
  if (typeof v !== 'number') throw new SaveShapeError(`${where}.${key}: expected a number, got ${describe(v)}`);
  return v;
}

export function num(b: PropBag, key: string, where: string): number {
  return optNum(b, key, where) ?? 0;
}

export function bool(b: PropBag, key: string, where: string): boolean {
  const v = Object.hasOwn(b, key) ? b[key] : undefined;
  if (v === undefined) return false;
  if (typeof v !== 'boolean') throw new SaveShapeError(`${where}.${key}: expected a bool, got ${describe(v)}`);
  return v;
}

export function str(b: PropBag, key: string, where: string, fallback?: string): string {
  const v = Object.hasOwn(b, key) ? b[key] : undefined;
  if (v === undefined && fallback !== undefined) return fallback;
  if (typeof v !== 'string') throw new SaveShapeError(`${where}.${key}: expected a string, got ${describe(v)}`);
  return v;
}

export function coins(b: PropBag, key: string, where: string): Coins {
  const v = Object.hasOwn(b, key) ? b[key] : undefined;
  if (v === undefined) return { gold: 0, silver: 0, copper: 0 };
  if (!Array.isArray(v) || v.length !== 3 || !v.every((x) => typeof x === 'number')) {
    throw new SaveShapeError(`${where}.${key}: expected an IntVector, got ${describe(v)}`);
  }
  return coinsFromIntVector(v as number[]);
}
