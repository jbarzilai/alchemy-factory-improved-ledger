// Read-only game data, item names and quest skill loaders.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SHOP_CATEGORIES, type ShopCategory } from './shop-categories';
import type { GameItem } from './gamedata/enemies';
import { fileURLToPath } from 'node:url';

export type Prices = ReadonlyMap<string, number>;
export type CategoryMap = ReadonlyMap<string, ShopCategory>;
export type GameSourceFile = { name: string; size: number; modified: string };
export type GameItemsSource = { files: GameSourceFile[]; asset: string; rows: number; skipped: string[] };
export type GameItems = {
  source: GameItemsSource;
  items: ReadonlyMap<string, GameItem>;
  purchasePrices: Prices;
  questPrices: Prices;
  shopBases: Prices;
  categories: CategoryMap;
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
let defaultRoot: string | undefined;

// Bundling changes import.meta.url, so locate the repository by its package name. The default lookup is cached.
export function repoRoot(start = HERE): string {
  if (start === HERE && defaultRoot) return defaultRoot;
  let dir = path.resolve(start);
  for (;;) {
    try {
      if (JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).name === 'af-ledger') {
        if (start === HERE) defaultRoot = dir;
        return dir;
      }
    } catch {
      // Missing, unreadable or malformed manifests do not identify the repository.
    }
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`could not find the af-ledger repository root above ${start}`);
    dir = parent;
  }
}

export function defaultConfigDir(): string {
  return path.join(repoRoot(), 'config');
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function readJsonObject(file: string): Record<string, unknown> {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`${file}: ${(e as Error).message}`);
  }
  if (!isObject(raw)) throw new Error(`${file}: expected a JSON object at the top level`);
  return raw;
}

export function loadGameItems(file = path.join(defaultConfigDir(), 'game-items.json')): GameItems {
  if (!existsSync(file)) throw new Error(`${file}: missing game data; run npm run refresh:game-data`);
  return parseGameItems(readJsonObject(file), file);
}

// Validates parsed game-items JSON; `file` labels errors. The refresh runs it before writing.
export function parseGameItems(raw: Record<string, unknown>, file: string): GameItems {
  const fail = (field: string): never => { throw new Error(`${file}: invalid ${field}`); };
  const uint = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0;
  if (!isObject(raw._source)) fail('_source');
  const src = raw._source as Record<string, unknown>;
  if (!Array.isArray(src.files) || !src.files.length || !src.files.every(v => isObject(v) &&
      typeof v.name === 'string' && uint(v.size) && typeof v.modified === 'string')) fail('_source.files');
  if (typeof src.asset !== 'string') fail('_source.asset');
  if (!uint(src.rows)) fail('_source.rows');
  if (!Array.isArray(src.skipped) || !src.skipped.every(v => typeof v === 'string')) fail('_source.skipped');
  if (!isObject(raw.items)) fail('items');
  const items = new Map<string, GameItem>();
  const purchasePrices = new Map<string, number>(), questPrices = new Map<string, number>(), shopBases = new Map<string, number>();
  const categories = new Map<string, ShopCategory>();
  for (const [key, value] of Object.entries(raw.items as Record<string, unknown>)) {
    if (!isObject(value)) fail(`items.${key}`);
    const v = value as Record<string, unknown>;
    for (const field of ['shopBase', 'questCost', 'stockCost']) {
      if (!uint(v[field])) fail(`items.${key}.${field}`);
    }
    // Signed i32 counts in the game (ClockworkBird's NPC count is -2); the ledger doesn't use them.
    for (const field of ['randomQuestBaseNum', 'npcShoppingBaseNum']) {
      if (!Number.isInteger(v[field])) fail(`items.${key}.${field}`);
    }
    if (v.id !== null && !Number.isInteger(v.id)) fail(`items.${key}.id`);
    if (v.nameKey !== null && typeof v.nameKey !== 'string') fail(`items.${key}.nameKey`);
    if (v.shopCategory !== null && !SHOP_CATEGORIES.includes(v.shopCategory as ShopCategory)) fail(`items.${key}.shopCategory`);
    for (const field of ['allowPortalSupply', 'hideInGame']) if (typeof v[field] !== 'boolean') fail(`items.${key}.${field}`);
    const item = v as GameItem;
    items.set(key, item);
    if (item.stockCost > 0) purchasePrices.set(key, item.stockCost);
    if (item.questCost > 0) questPrices.set(key, item.questCost);
    if (item.shopCategory !== null) {
      categories.set(key, item.shopCategory);
      if (item.shopBase > 0) shopBases.set(key, item.shopBase);
    }
  }
  return { source: src as GameItemsSource, items, purchasePrices, questPrices, shopBases, categories };
}

export function loadItemNames(file = path.join(defaultConfigDir(), 'item-names.json')): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const [item, value] of Object.entries(readJsonObject(file))) {
    if (item.startsWith('_')) continue;
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`${file}: name for ${item} must be a non-empty string, got ${JSON.stringify(value)}`);
    }
    out.set(item, value);
  }
  return out;
}

export function loadQuestSkills(file = path.join(defaultConfigDir(), 'quest-skills.json')): ReadonlyMap<string, number> {
  const raw = readJsonObject(file);
  const out = new Map<string, number>();
  for (const [skill, v] of Object.entries(raw)) {
    if (skill.startsWith('_')) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
      throw new Error(`${file}: bonus for ${skill} must be a finite number in [0, 1], got ${JSON.stringify(v)}`);
    }
    out.set(skill, v);
  }
  return out;
}
