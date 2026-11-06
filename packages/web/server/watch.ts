import { loadBaseSettings } from '@af-ledger/core';
import { publicVersion, type LedgerCache } from './state';

export type SaveEvent = { version: string; latestDay: number; partialDay: number | null; stale: boolean };

export function saveEvent({ model, stale }: Awaited<ReturnType<LedgerCache['get']>>): SaveEvent {
  const days = model.ledger.snapshot.days;
  return {
    version: publicVersion(model.version), stale,
    latestDay: Math.max(0, ...days.filter(day => day.complete).map(day => day.displayDay)),
    partialDay: days.find(day => !day.complete)?.displayDay ?? null,
  };
}

export class SaveWatcher {
  private timer?: ReturnType<typeof setInterval>;
  private event: SaveEvent | null = null;
  private listeners = new Set<(event: SaveEvent) => void>();
  private errors = new Set<string>();
  private generation = 0;
  private polling = false;
  constructor(private readonly cache: Pick<LedgerCache, 'get'>, private readonly opts: { intervalMs?: number } = {}) {}

  start(): void {
    if (this.timer) return;
    const generation = ++this.generation;
    this.timer = setInterval(() => { void this.poll(generation); }, this.opts.intervalMs ?? loadBaseSettings().web.watchIntervalMs);
    this.timer.unref();
    void this.poll(generation);
  }
  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.generation++;
  }
  current(): SaveEvent | null { return this.event; }
  on(listener: (event: SaveEvent) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  private async poll(generation: number): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const next = saveEvent(await this.cache.get());
      if (generation !== this.generation) return;
      if (next.version !== this.event?.version || next.stale !== this.event?.stale) {
        this.event = next;
        for (const listener of this.listeners) listener(next);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!this.errors.has(message)) {
        this.errors.add(message);
        console.warn(`Save watcher: ${message}`);
      }
    } finally { this.polling = false; }
  }
}
