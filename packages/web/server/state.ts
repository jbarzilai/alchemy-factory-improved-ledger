import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import {
  IncompleteSaveError, SaveNotFoundError, dayFlags, loadLedger, resolveSave, saveRoots,
  type DayMoney, type Flag, type FlagSettings, type Ledger,
} from '@af-ledger/core';

export type LedgerModel = {
  ledger: Ledger;
  version: string;
  days: DayMoney[];
  flags: Flag[][];
  settings: FlagSettings;
};
type State = { model: LedgerModel; stale: boolean };

// The version the browser sees: it changes whenever LedgerModel.version does, without the save's path in it.
export const publicVersion = (version: string) => createHash('sha256').update(version).digest('hex').slice(0, 16);
type Options = { save?: string; env: NodeJS.ProcessEnv; flags: FlagSettings; load?: typeof loadLedger };

export class LedgerCache {
  private revision = 0;
  private model?: LedgerModel;
  private source?: { file: string; mtimeMs: number };
  private pending?: Promise<State>;
  private unavailableSince?: number;
  constructor(private readonly opts: Options) {}

  get(): Promise<State> {
    if (this.pending) return this.pending;
    this.pending = this.read().finally(() => { this.pending = undefined; });
    return this.pending;
  }

  updateFlags(flags: FlagSettings): void {
    this.opts.flags = { ...flags };
    this.revision++;
    if (this.model) {
      const settings = { ...flags };
      this.model = { ...this.model, settings,
        flags: this.model.days.map((_, index) => dayFlags(this.model!.days, index, settings)),
        version: `${this.model.version.replace(/\|flags\d+$/, '')}|flags${this.revision}` };
    }
  }

  private async read(): Promise<State> {
    try {
      // Discovery skips empty and missing files. If the current save goes empty or missing, keep showing it
      // (stale) for up to 60 seconds while the game rewrites it, instead of falling back to an older save.
      // A newer save is used at once.
      let unavailable = false;
      if (this.source) {
        try { unavailable = statSync(this.source.file).size === 0; }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          unavailable = true;
        }
        if (unavailable) this.unavailableSince ??= Date.now();
        else this.unavailableSince = undefined;
      }
      // Every .sav counts, including rotating autosaves. Resolve again even if the last read was stale.
      const save = resolveSave({ save: this.opts.save, roots: this.opts.save ? [] : saveRoots(this.opts.env) });
      if (this.model && this.source && unavailable && save.file !== this.source.file &&
          save.mtimeMs < this.source.mtimeMs && Date.now() - this.unavailableSince! < 60_000) {
        return { model: this.model, stale: true };
      }
      // Holds the save's full path; only publicVersion() of it may reach the browser.
      const sourceVersion = `${save.file}|${save.size}|${save.mtimeMs}`;
      const version = `${sourceVersion}|flags${this.revision}`;
      if (this.model?.version === version) return { model: this.model, stale: false };
      const ledger = await (this.opts.load ?? loadLedger)({ save: save.file, env: this.opts.env });
      const days = ledger.snapshot.days.filter(day => day.complete)
        .sort((a, b) => a.saveDay - b.saveDay).map(day => ledger.money(day));
      const settings = { ...this.opts.flags };
      const flags = days.map((_, index) => dayFlags(days, index, settings));
      // Read the revision after loading: a PUT may have arrived during the await.
      this.model = { ledger, version: `${sourceVersion}|flags${this.revision}`, days, flags, settings };
      this.source = { file: save.file, mtimeMs: save.mtimeMs };
      this.unavailableSince = undefined;
      return { model: this.model, stale: false };
    } catch (error) {
      // The game may truncate or replace the save while writing it (zero bytes or briefly missing).
      const writing = error instanceof IncompleteSaveError || error instanceof SaveNotFoundError;
      if (writing && this.model) return { model: this.model, stale: true };
      throw error;
    }
  }
}
