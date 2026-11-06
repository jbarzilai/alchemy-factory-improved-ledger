// Shared, read-only save/config loading for CLI and web.
import path from 'node:path';
import { KdecDecoder, defaultKdecPath } from './decoder/kdec';
import { dayMoney, type DayMoney } from './ledger';
import { extractSnapshot, type ExtractOptions } from './extract';
import { defaultConfigDir, loadGameItems, loadItemNames, loadQuestSkills, type CategoryMap } from './config';
import { questBonus } from './quests';
import { resolveSave, saveRoots, type SaveFile } from './saves';
import { categoryBonusPct, orderPayPct, shopProfitPct, SHOP_CATEGORIES, type ShopCategory } from './bonuses';
import type { DayLedger, SaveSnapshot } from './model';

export type Bonuses = {
  shopProfit: number | null;
  categories: Record<ShopCategory, number | null>;
  orderIncomePct: number;
  questRewards: number;
};

export type Ledger = {
  save: SaveFile;
  snapshot: SaveSnapshot;
  bonus: number;
  categories: CategoryMap;
  name(id: string): string;
  money(day: DayLedger): DayMoney;
  bonuses(day: DayLedger): Bonuses;
};

export async function loadLedger(opts: {
  save?: string; env: NodeJS.ProcessEnv; extract?: ExtractOptions;
}): Promise<Ledger> {
  const cfg = defaultConfigDir();
  const { purchasePrices, questPrices, shopBases, categories } = loadGameItems(path.join(cfg, 'game-items.json'));
  const names = loadItemNames(path.join(cfg, 'item-names.json'));
  const questSkills = loadQuestSkills(path.join(cfg, 'quest-skills.json'));
  const save = resolveSave({ save: opts.save, roots: opts.save ? [] : saveRoots(opts.env) });
  const snapshot = await extractSnapshot(save.file, {
    ...opts.extract, decoder: new KdecDecoder(opts.env.AF_KDEC || defaultKdecPath()),
  });
  const bonus = questBonus(snapshot.skills, questSkills);
  const orderIncomePct = orderPayPct(Math.max(0, ...snapshot.profitSkills.flatMap(skill => {
    const match = /^ContractProfit(\d+)$/.exec(skill);
    return match ? [Number(match[1])] : [];
  })));
  const latestCompleted = snapshot.days.filter((day) => day.complete)
    .sort((a, b) => b.saveDay - a.saveDay)[0];
  return { save, snapshot, bonus, categories, name: (id) => names.get(id) ?? id,
    money: (day) => dayMoney(day, purchasePrices, { questPrices, bonus }),
    bonuses: (day) => {
      const coef = day.complete ? day.profitCoef : latestCompleted?.profitCoef ?? null;
      const shopProfit = coef === null ? null : shopProfitPct(coef);
      // ProfitCoef is stored once per day; on a day it changed, sales may predate it, so categories stay unknown.
      const prevCoef = snapshot.days.find((d) => d.saveDay === day.saveDay - 1)?.profitCoef ?? null;
      const changed = day.complete && prevCoef !== null && shopProfit !== null && shopProfitPct(prevCoef) !== shopProfit;
      const inferred = shopProfit === null || changed ? new Map<string, number | null>() : categoryBonusPct(day, shopProfit, shopBases, categories);
      return {
        shopProfit,
        orderIncomePct,
        categories: Object.fromEntries(SHOP_CATEGORIES.map((category) => [category, inferred.get(category) ?? null])) as Bonuses['categories'],
        questRewards: Math.round(bonus * 100),
      };
    },
  };
}

