import path from 'node:path';
import type { FlagSettings } from '@af-ledger/core';
import { publicVersion, type LedgerModel } from '../state';
import type { MetaResponse } from '../../shared/api';

export function metaView(model: LedgerModel, stale: boolean, iconItems: string[], flagDefaults: FlagSettings): MetaResponse {
  const { ledger, days, flags, version, settings } = model;
  const completed = ledger.snapshot.days.filter(day => day.complete).sort((a, b) => a.saveDay - b.saveDay);
  const partial = ledger.snapshot.days.find(day => !day.complete);
  return {
    saveName: ledger.snapshot.saveName, file: path.basename(ledger.save.file), savedAt: ledger.snapshot.savedAt.toISOString(),
    version: publicVersion(version), stale, firstDay: completed[0]?.displayDay ?? 0, latestDay: completed.at(-1)?.displayDay ?? 0,
    partialDay: partial?.displayDay ?? null, questBonusPct: Math.round(ledger.bonus * 100), settings, flagDefaults, iconItems,
    days: days.map((money, i) => ({ day: completed[i].displayDay,
      profit: money.net - (money.quests?.total ?? 0), quests: money.quests?.total ?? 0,
      gameProfit: money.net, questCount: money.questsSubmitted, flagCount: flags[i].length })),
  };
}
