import { routeHash, type Route } from './route';

export function navigateRange(route: Route, replace = false) {
  const hash = routeHash(route);
  if (location.hash === hash) return;
  if (replace) {
    history.replaceState(null, '', hash);
    dispatchEvent(new HashChangeEvent('hashchange'));
  } else location.hash = hash;
}
