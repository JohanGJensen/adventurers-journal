// A few lines of routing on location.pathname + popstate; no dependency.
import { useSyncExternalStore, type MouseEvent } from 'react';

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
window.addEventListener('popstate', emit);

const store = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getSnapshot: () => location.pathname + location.search,
};

export function navigate(to: string, replace = false) {
  if (to === location.pathname + location.search) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', to);
  emit();
  window.scrollTo(0, 0);
}

/** onClick for <a href>: client-side navigation unless modified (new tab etc.). */
export function linkTo(to: string) {
  return {
    href: to,
    onClick(e: MouseEvent<HTMLAnchorElement>) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigate(to);
    },
  };
}

export type Route =
  | { name: 'list' }
  | { name: 'create' }
  | { name: 'sheet'; id: number }
  | { name: 'log'; id: number }
  | { name: 'notes'; query: URLSearchParams }
  | { name: 'homebrew' }
  | { name: 'homebrewEdit'; id: number | 'new'; query: URLSearchParams }
  | { name: 'missing' };

export function parseRoute(path: string): Route {
  const [pathname, search = ''] = path.split('?');
  if (pathname === '/' || pathname === '') return { name: 'list' };
  if (/^\/new\/?$/.test(pathname)) return { name: 'create' };
  let m = /^\/c\/(\d+)\/?$/.exec(pathname);
  if (m) return { name: 'sheet', id: Number(m[1]) };
  m = /^\/c\/(\d+)\/log\/?$/.exec(pathname);
  if (m) return { name: 'log', id: Number(m[1]) };
  if (/^\/notes\/?$/.test(pathname)) return { name: 'notes', query: new URLSearchParams(search) };
  if (/^\/homebrew\/?$/.test(pathname)) return { name: 'homebrew' };
  m = /^\/homebrew\/(new|\d+)\/?$/.exec(pathname);
  if (m) return { name: 'homebrewEdit', id: m[1] === 'new' ? 'new' : Number(m[1]), query: new URLSearchParams(search) };
  return { name: 'missing' };
}

export const useRoute = (): Route => parseRoute(useSyncExternalStore(store.subscribe, store.getSnapshot));
