// The app:// protocol: /api/* goes to the in-process API, everything else is the UI. The UI comes from
// dist/ when built, or from the Vite dev server (with HMR) during `bun run dev`. The page origin is
// app://dnd either way, so dev and prod behave alike, and no port is opened by the app itself.
import { net, protocol } from 'electron';
import { statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_ORIGIN } from '../server/app';

const SCHEME = 'app';
const HOST = new URL(APP_ORIGIN).host;

/** Must run before app 'ready'. */
export function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);
}

/** The UI loads Google Fonts; everything else is same-origin (the API proxies dnd5eapi). */
function csp(devServer: string | null) {
  // Dev only: Vite injects an inline React-refresh preamble and talks to its HMR websocket.
  const devWs = devServer ? devServer.replace(/^http/, 'ws') : '';
  return [
    "default-src 'self'",
    devServer ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data:",
    devServer ? `connect-src 'self' ${devServer} ${devWs}` : "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
  ].join('; ');
}

const isFile = (p: string) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

interface Options {
  api: { fetch(req: Request): Promise<Response> };
  /** Built UI directory (dist/). */
  dist: string;
  /** Vite dev server URL; when set, the UI is proxied from it instead of read from `dist`. */
  devServer: string | null;
}

export function handleProtocol({ api, dist, devServer }: Options) {
  const policy = csp(devServer);
  const withCsp = (res: Response) => {
    const headers = new Headers(res.headers);
    headers.set('Content-Security-Policy', policy);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };

  protocol.handle(SCHEME, async (req) => {
    const { host, pathname, search } = new URL(req.url);
    if (host !== HOST) return new Response('Not found', { status: 404 });
    if (pathname.startsWith('/api/')) return api.fetch(req);
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });

    if (devServer) {
      try {
        return withCsp(await net.fetch(devServer + pathname + search));
      } catch {
        return new Response(`Vite dev server not reachable at ${devServer}`, { status: 502 });
      }
    }

    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    const file = resolve(dist, '.' + decoded);
    if (file !== dist && !file.startsWith(dist + sep)) return new Response('Forbidden', { status: 403 });
    // Unknown paths get index.html: the UI routes client-side.
    return withCsp(await net.fetch(pathToFileURL(isFile(file) ? file : join(dist, 'index.html')).toString()));
  });
}
