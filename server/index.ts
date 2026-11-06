import { existsSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { createApp } from './app';
import { defaultDbPath, openDb } from './db';
import { seedIfEmpty } from './seed';

const prod = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT ?? (prod ? 3000 : 3001));
const DIST = join(import.meta.dirname, '..', 'dist');

const db = openDb();
if (seedIfEmpty(db)) console.log('Seeded Faelan into a new database');
const app = createApp(db);

async function serveStatic(pathname: string): Promise<Response> {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = Bun.file(join(DIST, rel));
  if (rel !== '/' && (await file.exists())) return new Response(file);
  return new Response(Bun.file(join(DIST, 'index.html')));
}

if (prod && !existsSync(join(DIST, 'index.html'))) {
  console.error('dist/ is missing; run `bun run build` first (or use `bun run start`).');
  process.exit(1);
}

const server = Bun.serve({
  hostname: '127.0.0.1',
  port,
  fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith('/api/')) return app.fetch(req);
    if (prod) return serveStatic(pathname);
    return new Response('API server; the UI runs on Vite in dev', { status: 404 });
  },
});

console.log(`dnd-tool ${prod ? '' : 'API '}on http://${server.hostname}:${server.port} (db: ${defaultDbPath()})`);
