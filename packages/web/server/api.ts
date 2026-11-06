import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_FLAG_SETTINGS, validateFlagSettings, IncompleteSaveError } from '@af-ledger/core';
import { memoryFlagStore, type FlagStore } from './flagStore';
import type { LedgerCache } from './state';
import type { IconStore } from './icons';
import { dayView, dayIndex, range, wholeDay } from './views/day';
import { historyView } from './views/history';
import { itemsView, itemView } from './views/items';
import { metaView } from './views/meta';
import { SaveWatcher, saveEvent, type SaveEvent } from './watch';

export type ApiDeps = { cache: LedgerCache; icons: IconStore; watcher?: SaveWatcher; flags?: FlagStore; host?: string };
export const isApiPath = (url: string) => {
  const pathname = url.split('?')[0];
  return pathname === '/api' || pathname.startsWith('/api/');
};
// A DNS-rebound page is same-origin, so CORS doesn't stop it, but its requests carry its own domain name as Host.
// `configured` is web.host from config/settings.json, so a host name the user chose there keeps working.
export function allowedHost(header: string | undefined, configured?: string): boolean {
  const host = (header ?? '').replace(/:\d+$/, '').replace(/^\[(.*)\]$/, '$1').toLowerCase();
  return host === 'localhost' || isIP(host) !== 0 || (!!configured && host === configured.toLowerCase());
}
export async function registerApi(app: FastifyInstance, { cache, icons, watcher = new SaveWatcher(cache), flags = memoryFlagStore(DEFAULT_FLAG_SETTINGS), host }: ApiDeps): Promise<void> {
  const streams = new Set<() => void>();
  let closing = false;
  // onClose runs after HTTP connections drain; SSE connections must end before that.
  app.addHook('preClose', async () => {
    closing = true;
    watcher.stop();
    for (const close of streams) close();
  });
  const named = host && host.toLowerCase() !== 'localhost' && isIP(host) === 0 ? host : null;
  const refusal = named ? `open the ledger through localhost, an IP address or ${named}` : 'open the ledger through localhost or an IP address';
  // Registered before the client's Vite or static handlers, so it guards pages as well as the API.
  app.addHook('onRequest', async (request, reply) => {
    if (!allowedHost(request.headers.host, host)) return reply.code(403).send({ error: refusal });
    if (isApiPath(request.url) && request.method !== 'GET' &&
        !(request.method === 'PUT' && request.url.split('?')[0] === '/api/settings/flags')) {
      return reply.code(405).send({ error: 'method not allowed' });
    }
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof IncompleteSaveError) {
      return reply.code(503).send({ error: 'the save is being written by the game; try again in a moment' });
    }
    const err = error as Error & { statusCode?: number };
    return reply.code(err.statusCode ?? 500).send({ error: err.message });
  });
  app.put('/api/settings/flags', async (request, reply) => {
    let settings;
    try { settings = validateFlagSettings(request.body, 'request body'); }
    catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
    flags.save(settings);
    cache.updateFlags(settings);
    return { settings };
  });
  app.get('/api/meta', async () => {
    const { model, stale } = await cache.get();
    return metaView(model, stale, icons.items(), flags.defaults);
  });
  app.get('/api/events', async (_request, reply) => {
    let initial: SaveEvent | null = null;
    // A failed first read must still leave EventSource connected for watcher recovery.
    try { initial = saveEvent(await cache.get()); } catch { /* Wait for the next successful poll. */ }
    if (reply.raw.destroyed) return;
    reply.hijack();
    if (closing) { reply.raw.end(); return; }
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive',
    });
    let last: SaveEvent | null = null;
    const send = (event: SaveEvent) => {
      if (reply.raw.destroyed || (last?.version === event.version && last.stale === event.stale)) return;
      last = event;
      reply.raw.write(`event: save\ndata: ${JSON.stringify(event)}\n\n`);
    };
    const unsubscribe = watcher.on(send);
    const ping = setInterval(() => { reply.raw.write(': ping\n\n'); }, 25_000);
    ping.unref();
    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      unsubscribe(); clearInterval(ping); streams.delete(close);
    };
    const close = () => { cleanup(); reply.raw.end(); };
    streams.add(close);
    reply.raw.once('close', cleanup);
    if (initial) send(initial);
    else reply.raw.write(': waiting for save\n\n');
  });
  app.get<{ Params: { item: string } }>('/api/icon/:item', async (request, reply) => {
    const file = icons.file(request.params.item);
    if (!file) return reply.code(404).send({ error: 'icon not found' });
    try { return reply.type('image/png').send(readFileSync(file)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return reply.code(404).send({ error: 'icon not found' });
      throw error;
    }
  });
  app.get<{ Params: { day: string } }>('/api/day/:day', async request => {
    const day = wholeDay(request.params.day);
    const { model } = await cache.get();
    dayIndex(model, day);
    return dayView(model, day);
  });
  app.get<{ Querystring: { from?: string; to?: string } }>('/api/history', async request => {
    const { model } = await cache.get();
    const { from, to } = range(model, request.query.from, request.query.to);
    return historyView(model, from, to);
  });
  app.get<{ Querystring: { from?: string; to?: string } }>('/api/items', async request => {
    const { model } = await cache.get();
    const { from, to } = range(model, request.query.from, request.query.to);
    return itemsView(model, from, to);
  });
  app.get<{ Params: { item: string }; Querystring: { from?: string; to?: string } }>('/api/item/:item', async request => {
    const { model } = await cache.get();
    const { from, to } = range(model, request.query.from, request.query.to);
    return itemView(model, request.params.item, from, to);
  });
  app.get('/api', (_request, reply) => reply.code(404).send({ error: 'unknown API route' }));
  app.get('/api/*', (_request, reply) => reply.code(404).send({ error: 'unknown API route' }));
}
