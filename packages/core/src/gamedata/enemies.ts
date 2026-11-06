import type { ShopCategory } from '../shop-categories';
import { ByteReader } from '../reader';
import { zenNames } from './zen';

export type GameItem = {
  id: number | null;
  nameKey: string | null;
  shopCategory: ShopCategory | null;
  shopBase: number;
  questCost: number;
  stockCost: number;
  randomQuestBaseNum: number;
  npcShoppingBaseNum: number;
  allowPortalSupply: boolean;
  hideInGame: boolean;
};
export type ParsedRow = { row: string; item: GameItem; exact: boolean; displayIcon: number | null };
const CATEGORIES: Partial<Record<number, ShopCategory>> = {
  1: 'Sundries', 2: 'Jewelry', 3: 'Potion', 4: 'Relic', 6: 'Beverage',
};

function parseRow(row: string, bytes: Uint8Array): ParsedRow {
  const item: GameItem = {
    id: null, nameKey: null, shopCategory: null, shopBase: 0, questCost: 0, stockCost: 0,
    randomQuestBaseNum: 0, npcShoppingBaseNum: 0, allowPortalSupply: false, hideInGame: false,
  };
  let displayIcon: number | null = null;
  try {
    const r = new ByteReader(bytes);
    r.u16(); // fragment header, already checked by the row scan
    const mask = r.u32();
    const present = (i: number) => !(mask & (1 << i));
    const coins = () => r.i32() * 100000 + r.i32() * 1000 + r.i32();
    for (let i = 0; i < 30; i++) {
      if (!present(i)) continue;
      switch (i) {
        case 0: item.id = r.i32(); break;
        case 1: {
          r.bytes(4);
          if (r.u8() !== 0x0b) throw new Error('bad FText marker');
          r.bytes(8);
          const length = r.i32();
          if (length < 1) throw new Error('invalid FText key length');
          item.nameKey = Buffer.from(r.bytes(length).subarray(0, length - 1)).toString('utf8');
          break;
        }
        case 2: displayIcon = r.i32(); break;
        case 5: r.bytes(r.i32() * 8); break;
        case 6: item.hideInGame = Boolean(r.u8()); break;
        case 8: item.stockCost = coins(); break;
        case 9: item.shopCategory = CATEGORIES[r.u8()] ?? null; break;
        case 10: item.shopBase = coins(); break;
        case 16: item.randomQuestBaseNum = r.i32(); break;
        case 17: item.npcShoppingBaseNum = r.i32(); break;
        case 18: case 19: r.bytes(r.i32() * 4); break;
        case 20: r.bytes(8); break;
        case 21: item.allowPortalSupply = Boolean(r.u8()); break;
        case 26: item.questCost = r.i32(); break;
        case 11: case 12: case 13: case 22: case 23: case 24: case 25: r.f64(); break;
        case 14: case 15: case 29: r.u8(); break;
        default: r.bytes(4); // object refs, color, stack size, quest/shopping tiers
      }
    }
    return { row, item, displayIcon, exact: r.pos === bytes.length };
  } catch {
    return { row, item, displayIcon, exact: false };
  }
}

export function parseEnemiesTable(asset: Uint8Array): ParsedRow[] {
  const { headerSize, names } = zenNames(asset);
  const data = asset.subarray(headerSize);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const starts: { offset: number; row: string }[] = [];
  // Match the reference's scan window exactly (range(len(data) - 12)).
  for (let i = 0; i < data.length - 12; i++) {
    const idx = view.getUint32(i, true);
    if (idx < names.length && view.getUint32(i + 4, true) === 0 &&
        /^[A-Z][A-Za-z0-9]*$/.test(names[idx]) && data[i + 8] === 0x80 && data[i + 9] === 0x3d) {
      starts.push({ offset: i, row: names[idx] });
    }
  }
  return starts.map(({ offset, row }, i) => parseRow(row, data.subarray(offset + 8, starts[i + 1]?.offset ?? data.length)))
    .sort((a, b) => a.row < b.row ? -1 : a.row > b.row ? 1 : 0);
}
