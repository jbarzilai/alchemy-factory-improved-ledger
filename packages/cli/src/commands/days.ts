import path from 'node:path';
import { exportsDir, exportSlug, outputBlocked, writePng } from '../png';
import type { ExtractOptions } from '@af-ledger/core';
import { reportUnit, money, oneLine, table, type Unit } from '../format';
import { ledgerFailure, loadLedger, type Ledger } from '../load';
import type { Command } from '../run';

// --last limits completed days; --partial appends today afterwards.
export function createDaysCommand(extract?: ExtractOptions): Command {
  return {
    options: {
      save: { type: 'string' }, unit: { type: 'string' }, last: { type: 'string' },
      json: { type: 'boolean' }, partial: { type: 'boolean' },
      png: { type: 'boolean' }, output: { type: 'string' },
    },
    async run({ values }, io) {
      const usage = (message: string) => { io.err(`af-ledger days: ${oneLine(message)}\n`); return 2; };
      if (values.output !== undefined && !values.png) return usage('--output requires --png');
      if (values.png && values.json) return usage('--png cannot be combined with --json');
      const unit = values.unit ?? 'mixed';
      if (!['mixed', 'gold', 'silver', 'copper'].includes(String(unit))) {
        return usage('--unit must be mixed, gold, silver or copper');
      }
      const last = values.last === undefined ? undefined : Number(values.last);
      if (last !== undefined && (!/^\d+$/.test(String(values.last)) || !Number.isSafeInteger(last) || last < 1)) {
        return usage('--last must be a positive integer');
      }
      let ledger: Ledger;
      try {
        ledger = await loadLedger({ save: typeof values.save === 'string' ? values.save : undefined, env: io.env, extract });
      } catch (e) {
        return ledgerFailure('days', e, io);
      }
      const ordered = [...ledger.snapshot.days].sort((a, b) => a.displayDay - b.displayDay);
      let selected = ordered.filter((d) => d.complete);
      if (last !== undefined) selected = selected.slice(-last);
      if (values.partial) selected.push(...ordered.filter((d) => !d.complete));
      const rows = selected.map((day) => {
        const m = ledger.money(day);
        return {
          day: day.displayDay, partial: !day.complete, earnings: m.earnings, expenses: m.expenses, profit: m.net,
          unpricedPurchases: m.purchasing.unpriced.length, unpricedQuests: m.quests?.unpriced.length ?? 0,
        };
      });
      if (values.json) {
        io.out(JSON.stringify(rows) + '\n');
        return 0;
      }
      const first = rows[0];
      const end = rows.at(-1);
      const suffix = first && end ? `-${first.day}-${end.day}${end.partial ? '-partial' : ''}` : '';
      const file = values.png ? path.resolve(typeof values.output === 'string' ? values.output :
        path.join(exportsDir(io.env), `${exportSlug(ledger.snapshot.saveName)}-days${suffix}.png`)) : null;
      if (file) {
        const blocked = outputBlocked(file, ledger.save.file, io.env);
        if (blocked) return usage(blocked);
      }
      const earningsUnit = reportUnit(Math.max(0, ...rows.map((r) => Math.abs(r.earnings))), unit as Unit);
      const expensesUnit = reportUnit(Math.max(0, ...rows.map((r) => Math.abs(r.expenses))), unit as Unit);
      const profitUnit = reportUnit(Math.max(0, ...rows.map((r) => Math.abs(r.profit))), unit as Unit);
      const legends = [
        rows.some((r) => r.unpricedPurchases) ? '$ unpriced purchases excluded from Expenses' : '',
        rows.some((r) => r.unpricedQuests) ? 'q quests excluded for missing quest prices' : '',
        rows.some((r) => r.partial) ? '~ in progress' : '',
      ].filter(Boolean);
      const text = `${oneLine(ledger.snapshot.saveName)}\n${ledger.save.file}\n` +
        `Saved: ${ledger.snapshot.savedAt.toLocaleString()}\nQuest Rewards ${Math.round(ledger.bonus * 100)}% (current)\n\n` +
        table([
          ['Day', 'Earnings', 'Expenses', 'Profit', 'Flags'],
          ...rows.map((r) => [String(r.day), money(r.earnings, earningsUnit), money(r.expenses, expensesUnit),
            money(r.profit, profitUnit), `${r.unpricedPurchases ? '$' : ''}${r.unpricedQuests ? 'q' : ''}${r.partial ? '~' : ''}`]),
        ], ['r', 'r', 'r', 'r', 'l']) + '\n' + (legends.length ? `\n${legends.join('; ')}\n` : '');
      io.out(text);
      if (file) {
        await writePng(text, file);
        io.err(`wrote ${file}\n`);
      }
      return 0;
    },
  };
}

export const days = createDaysCommand();
