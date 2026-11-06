// App behaviour only; machine-specific paths live in .env.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defaultConfigDir } from './config';
import { DEFAULT_FLAG_SETTINGS, type FlagSettings } from './flags';

export type WebSettings = { port: number; host: string; watchIntervalMs: number };
export type Settings = { web: WebSettings; flags: FlagSettings };
export const DEFAULT_SETTINGS: Settings = {
  web: { port: 4317, host: 'localhost', watchIntervalMs: 3000 },
  flags: { ...DEFAULT_FLAG_SETTINGS },
};
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const integer = (v: unknown, min: number, max = Infinity) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const rules: Record<string, { valid: (value: unknown) => boolean; message: string }> = {
  'web.port': { valid: v => integer(v, 1, 65535), message: 'an integer 1–65535' },
  'web.host': { valid: v => typeof v === 'string' && v.trim().length > 0, message: 'a non-empty string' },
  'web.watchIntervalMs': { valid: v => integer(v, 500), message: 'an integer ≥ 500' },
  'flags.incomeFlags': { valid: v => typeof v === 'boolean', message: 'true or false' },
  'flags.purchaseFlags': { valid: v => typeof v === 'boolean', message: 'true or false' },
  'flags.windowDays': { valid: v => integer(v, 1), message: 'an integer ≥ 1' },
  'flags.zeroRunDays': { valid: v => integer(v, 1), message: 'an integer ≥ 1' },
  'flags.dropRatio': { valid: v => number(v) && v > 0 && v < 1, message: 'in (0, 1)' },
  'flags.riseRatio': { valid: v => number(v) && v > 1, message: '> 1' },
  'flags.purchaseShopShare': { valid: v => number(v) && v > 0 && v <= 1, message: 'in (0, 1]' },
  'flags.moneyDropShare': { valid: v => number(v) && v > 0 && v <= 1, message: 'in (0, 1]' },
};

export const LOCAL_FLAGS_FILE = 'flags.local.json';

function readSettings(file: string): unknown {
  let text: string;
  try { text = readFileSync(file, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new Error(`${file}: ${(error as Error).message}`);
  }
  try { return JSON.parse(text); }
  catch { throw new Error(`${file}: not valid JSON`); }
}

// settings.json, flags.local.json and the settings API (PUT /api/settings/flags) share these field rules.
// Files may leave out defaults and carry `_` comments; the API needs the complete object and rejects every
// unknown key, comments included.
function applySection(target: object, value: unknown, section: 'web' | 'flags', source: string, comments: boolean): void {
  if (!isObject(value)) throw new Error(`${source}: ${section} must be an object`);
  for (const [key, setting] of Object.entries(value)) {
    if (comments && key.startsWith('_')) continue;
    const field = `${section}.${key}`;
    const rule = Object.hasOwn(rules, field) ? rules[field] : undefined;
    if (!rule) throw new Error(`${source}: unknown setting ${field}`);
    if (!rule.valid(setting)) throw new Error(`${source}: ${field} must be ${rule.message}`);
    Object.assign(target, { [key]: setting });
  }
}

export function loadBaseSettings(file = path.join(defaultConfigDir(), 'settings.json')): Settings {
  const result: Settings = { web: { ...DEFAULT_SETTINGS.web }, flags: { ...DEFAULT_SETTINGS.flags } };
  const raw = readSettings(file);
  if (!isObject(raw)) throw new Error(`${file}: settings must be an object`);
  for (const [section, value] of Object.entries(raw)) {
    if (section.startsWith('_')) continue;
    if (section !== 'web' && section !== 'flags') throw new Error(`${file}: unknown setting ${section}`);
    applySection(result[section], value, section, file, true);
  }
  return result;
}

export function loadSettings(file = path.join(defaultConfigDir(), 'settings.json')): Settings {
  const result = loadBaseSettings(file);
  const local = path.join(path.dirname(file), LOCAL_FLAGS_FILE);
  applySection(result.flags, readSettings(local), 'flags', local, true);
  return result;
}

export function validateFlagSettings(value: unknown, source: string): FlagSettings {
  const result = {} as FlagSettings;
  applySection(result, value, 'flags', source, false);
  for (const key of Object.keys(DEFAULT_FLAG_SETTINGS)) {
    if (!Object.hasOwn(result, key)) throw new Error(`${source}: flags.${key} is required`);
  }
  return result;
}

export function flagOverrides(flags: FlagSettings, base: FlagSettings): Partial<FlagSettings> {
  return Object.fromEntries(Object.entries(flags).filter(([key, value]) => value !== base[key as keyof FlagSettings]));
}
