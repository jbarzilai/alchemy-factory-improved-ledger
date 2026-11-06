import { useEffect, useState } from 'react';
import { Button, NavTabs, Notice, Panel } from '@design/components';
import { parseRoute } from './route';
import { useLedgerData } from './useLedgerData';
import { FlagSettingsDialog } from './parts/FlagSettingsDialog';
import { TodayPage } from './pages/TodayPage';
import { HistoryPage } from './pages/HistoryPage';
import { ItemsPage } from './pages/ItemsPage';
import { saveUpdate, useSaveEvents } from './useSaveEvents';
import { navigateRange } from './navigation';
export function App() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const change = () => setRoute(parseRoute(location.hash));
    addEventListener('hashchange', change);
    return () => removeEventListener('hashchange', change);
  }, []);
  const { meta, day, history, items, item, itemError, loading, error, errorStatus, reload } = useLedgerData(route);
  const [saveStale, setSaveStale] = useState<boolean | null>(null);
  useSaveEvents((event, previous) => {
    setSaveStale(event.stale);
    // Read the hash at delivery time, including navigation before React's next render.
    const todayRoute = parseRoute(location.hash);
    const update = saveUpdate(event, previous, meta, todayRoute);
    if (update.day !== null && todayRoute.page === 'today') {
      navigateRange({ ...todayRoute, day: update.day }, true);
    }
    if (update.reload) reload();
  });
  const needsInitialData = !meta || (route.page === 'today' ? !day : meta.latestDay > 0 && (route.page === 'history' ? !history : !items));
  const unavailableDay = route.page === 'today' && errorStatus === 404;
  return <div className="app-shell flex flex-col gap-6 p-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1"><span className="type-title text-accent-ink">Alchemy Ledger</span>
        {meta && <p className="type-small text-muted break-words">{meta.saveName} · saved <time dateTime={meta.savedAt} className="text-ink">{new Date(meta.savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time> · <span className="type-code">{meta.file}</span></p>}
      </div>
      <NavTabs items={[{ id: '/today', label: 'Today' }, { id: '/history', label: 'History' }, { id: '/items', label: 'Item economics' }]} active={`/${route.page}`} />
    </header>
    {(saveStale ?? meta?.stale) && <Notice>The game is writing the save; showing the last complete read.</Notice>}
    {loading && !error && !needsInitialData && <span role="status" className="type-small text-muted">{route.page === 'today' ? 'Loading day…' : 'Loading ledger…'}</span>}
    {error ? <Panel title={unavailableDay ? 'Day unavailable' : 'Could not load the ledger'}><p role="alert">{error}</p>{unavailableDay ? <a href="#/today" className="mt-3 inline-block text-accent-ink underline">Go to latest day</a> : <Button onClick={reload} className="mt-3">Try again</Button>}</Panel>
      : loading && needsInitialData ? <p role="status" className="text-muted">Loading ledger…</p>
      : meta && route.page === 'today' ? day ? <TodayPage meta={meta} day={day} route={route} onCustomizeFlags={() => setDialogOpen(true)} /> : <Panel title="Today">No completed days yet.</Panel>
      : meta && route.page === 'history' ? <HistoryPage meta={meta} history={history} route={route} />
      : meta && route.page === 'items' && <ItemsPage meta={meta} items={items} item={item} itemError={itemError} route={route} />}
    {dialogOpen && meta && <FlagSettingsDialog meta={meta} onClose={() => setDialogOpen(false)} onSaved={reload} />}
  </div>;
}
