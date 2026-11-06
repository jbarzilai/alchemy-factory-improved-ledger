import { useEffect, useRef } from 'react';
import type { SaveEvent } from '../server/watch';
import type { Route } from './route';
import type { MetaResponse } from '../shared/api';

// When the save changes, only a Today page showing the latest day moves on to the new latest day.
export function saveUpdate(event: SaveEvent, previous: SaveEvent | null, meta: MetaResponse | null, route: Route) {
  const baseline = previous?.version ?? meta?.version;
  const reload = baseline !== undefined && event.version !== baseline && event.version !== meta?.version;
  const follows = route.page === 'today' && route.day !== null && route.day === (previous?.latestDay ?? meta?.latestDay);
  return { reload, day: reload && follows && event.latestDay > 0 ? event.latestDay : null };
}

export function useSaveEvents(onChange: (event: SaveEvent, previous: SaveEvent | null) => void) {
  const callback = useRef(onChange);
  useEffect(() => { callback.current = onChange; }, [onChange]);
  useEffect(() => {
    const source = new EventSource('/api/events');
    let previous: SaveEvent | null = null;
    source.addEventListener('save', message => {
      const event = JSON.parse((message as MessageEvent).data) as SaveEvent;
      callback.current(event, previous);
      previous = event;
    });
    return () => source.close();
  }, []);
}
