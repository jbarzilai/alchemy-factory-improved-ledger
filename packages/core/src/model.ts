// Game-agnostic output of core. Day numbers: saveDay is 0-based; displayDay = saveDay + 1.
import type { Coins } from './coins';
import type { SaveHeader } from './container';
import type { Decoder } from './decoder/types';

export type ItemDayRecord = {
  item: string; // internal name, e.g. "VitalityPotion"
  soldCount: number; soldValue: Coins; // Shop Income
  dispatchedCount: number; dispatchValue: Coins; // Order Income
  restockCount: number; // Purchasing: count only, the cost is not stored
  producedCount: number;
  consumedCount: number;
};

export type QuestRecord = {
  questId: string; // e.g. RandomNormal, RandomBulk, RandomUrgent, Main7
  isMain: boolean;
  isRandom: boolean;
  acceptDay: number; // 0-based
  submitDay: number; // 0-based
  goldFactor: number; // random quests: 1.3 / 1.6 / 2.0; the payout itself is not stored
  awardGold: Coins; // (0,0,0) for random quests
  requires: { item: string; count: number }[];
};

export type DayLedger = {
  saveDay: number;
  displayDay: number;
  complete: boolean; // false for the in-progress day
  profitCoef: number | null; // "Shop Profit" bonus; null when the save doesn't record it (in-progress day)
  items: ItemDayRecord[];
  questsSubmitted: QuestRecord[];
};

export type SaveSnapshot = {
  file: string;
  savedAt: Date;
  saveName: string;
  level: number;
  currentSaveDay: number;
  secondsIntoDay: number;
  wallet: SaveHeader['wallet']; // coins in the player's inventory; not ledger data, never used in calculations
  decoder: Decoder['name'];
  profitSkills: string[]; // current *Profit levels from the second skill-name list
  skills: string[]; // current UnlockedSkillPointsList; also used for historical quest totals
  days: DayLedger[]; // completed days in order, then the in-progress day
};
