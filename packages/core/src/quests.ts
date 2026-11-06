// Quest rewards are recomputed with the save's current skills (SAVE_FORMAT.md §4).
import { toCopper } from './coins';
import type { Prices } from './config';
import type { QuestRecord } from './model';

export function questBonus(skills: readonly string[], questSkills: ReadonlyMap<string, number>): number {
  let bonus = 1;
  for (const skill of new Set(skills)) bonus += questSkills.get(skill) ?? 0;
  return bonus;
}

export function questPayout(q: QuestRecord, questPrices: Prices, bonus: number): { copper: number } | { missing: string[] } {
  // Main and side quests (Carpenter1-6, Contract1: neither flag, GoldFactor 0) pay their stored award.
  if (q.isMain || (!q.isRandom && !(q.goldFactor > 0))) {
    return { copper: toCopper({
      gold: Math.round(q.awardGold.gold * bonus),
      silver: Math.round(q.awardGold.silver * bonus),
      copper: Math.round(q.awardGold.copper * bonus),
    }) };
  }
  let copper = 0;
  const missing = new Set<string>();
  for (const { item, count } of q.requires) {
    const base = questPrices.get(item);
    if (base === undefined) missing.add(item);
    else copper += count * base * q.goldFactor * bonus;
  }
  return missing.size > 0 ? { missing: [...missing] } : { copper: Math.round(copper) };
}

export function questLabel(id: string): string {
  if (/^Main\d+$/.test(id)) return id.replace(/^Main(\d+)$/, 'Main quest $1');
  if (/^Random(Normal|Bulk|Urgent)$/.test(id)) return id.replace(/^Random(.+)$/, 'Random quest ($1)');
  return id.replace(/^(.*?)(\d+)$/, '$1 $2');
}
