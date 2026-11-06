import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';
import type { Route } from './route';
import { createLedgerLoader, dataRoute, type LedgerData } from './ledgerData';
type State = Omit<LedgerData, 'meta'> & { meta: LedgerData['meta'] | null; loading: boolean; error: string | null; errorStatus: number | null };
export function useLedgerData(route: Route) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<State>({ meta: null, day: null, history: null, items: null, item: null, itemError: null, loading: true, error: null, errorStatus: null });
  const loader = useRef(createLedgerLoader());
  const reload = useCallback(() => setRevision(n => n + 1), []);
  // The Items page's item stays in the key: changing it fetches the item detail.
  const routeKey = JSON.stringify(route.page === 'today' ? dataRoute(route) : route);
  useEffect(() => {
    const controller = new AbortController();
    setState(s => ({ ...s, loading: true, error: null, errorStatus: null }));
    async function load() {
      try {
        const data = await loader.current(route, controller.signal, revision);
        if (!controller.signal.aborted) setState({ ...data, loading: false, error: null, errorStatus: null });
      } catch (error) {
        if (!controller.signal.aborted) setState(s => ({ ...s, loading: false, error: error instanceof Error ? error.message : String(error), errorStatus: error instanceof ApiError ? error.status : null }));
      }
    }
    void load();
    return () => controller.abort();
  }, [routeKey, revision]);
  return { ...state, reload };
}
