import { percentSetting } from '../today';
import type { DayResponse, MetaResponse } from '../../shared/api';
export function PageNotes({ meta, day, page = 'today' }: { meta: MetaResponse; day?: DayResponse; page?: 'today' | 'history' | 'items' }) {
  const s = meta.settings;
  return <footer className="border-t border-line pt-4"><h2 className="type-label text-muted mb-2">Notes</h2><ul className="type-small text-muted list-disc pl-4 space-y-1">
    {(page !== 'today' || (day && day.totals.questCount > 0)) && <li>≈ Quest Rewards are computed, not read from the save: they use the save's current Quest Rewards bonus ({day?.bonuses.questRewards ?? meta.questBonusPct}%), as the game's own ledger does.</li>}
    {page !== 'today' && <li>The save keeps which upgrades you own but not when you bought them. Category and Order Income changes are dated by prices: each shows on the first day with a sale or order at the new price.</li>}
    {page === 'history' && <li>Profit = Shop Income + Order Income + Quest Rewards − Purchasing Cost, the game's own Profit.</li>}
    {page === 'items' && <li>Rising and falling: ranked by the change in income a day between the two halves of the range. Shares are shown for context only: when one item falls, the others' shares rise even if their income didn't.</li>}
    <li>Bonuses: Shop Profit is stored per day. Category bonuses are worked out from the day's sale prices and match the save's skill levels. Quest Rewards and Order Income are the save's current values.</li>
    <li>Flags: usual = median of the previous {s.windowDays} days. {s.incomeFlags ? `Shop and orders: ${percentSetting(s.dropRatio)} or less of usual units, or an income drop of ${percentSetting(s.moneyDropShare)} or more of usual earnings. A stopped item is flagged for its first ${s.zeroRunDays} days at zero.` : 'Shop and orders: off.'} {s.purchaseFlags ? `Purchases: ${s.riseRatio}× or more, or extra spend of ${percentSetting(s.purchaseShopShare)} or more of usual Shop Income.` : 'Purchases: off.'} Largest money impact first.</li>
  </ul></footer>;
}
