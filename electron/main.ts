// Electron main process: runs the API in-process on node:sqlite and serves the UI and /api
// over a private app:// protocol, so no port is opened.
import { app, BrowserWindow, net, protocol, session, shell } from 'electron';
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp } from '../server/app';
import { openDb } from '../server/db';
import { seedIfEmpty } from '../server/seed';
import { openSqlite } from '../server/sqlite';

const SCHEME = 'app';
const ORIGIN = `${SCHEME}://dnd`;

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// Same data dir for `bun run desktop` and the packaged app, whatever productName says.
app.setPath('userData', join(app.getPath('appData'), 'dnd-tool'));

// app.quit() is async and would still let whenReady run (opening the DB, flashing a window).
if (!app.requestSingleInstanceLock()) app.exit(0);

// The UI loads Google Fonts; everything else is same-origin (the API proxies dnd5eapi).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
].join('; ');

const DIST = join(app.getAppPath(), 'dist');

/** On first launch, copy an existing DB (DND_IMPORT_FROM, or the repo's data/dnd.sqlite when unpackaged). */
function copyExistingDb(target: string) {
  if (existsSync(target)) return;
  const source = process.env.DND_IMPORT_FROM ?? (app.isPackaged ? null : join(app.getAppPath(), 'data', 'dnd.sqlite'));
  if (!source || !existsSync(source)) return;
  mkdirSync(dirname(target), { recursive: true });
  // Into a temp file first, so a failed copy never leaves a partial DB that later launches would open.
  const tmp = `${target}.importing`;
  rmSync(tmp, { force: true });
  const src = openSqlite(source, { readonly: true });
  try {
    src.query('VACUUM INTO ?').run(tmp); // consistent snapshot, WAL included
    renameSync(tmp, target);
    console.log(`Copied ${source} to ${target}`);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  } finally {
    src.close();
  }
}

const isFile = (p: string) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

function startBackend() {
  const dbPath = process.env.DND_DB ?? join(app.getPath('userData'), 'dnd.sqlite');
  copyExistingDb(dbPath);
  const db = openDb(dbPath);
  if (seedIfEmpty(db)) console.log('Seeded Faelan into a new database');
  const api = createApp(db, [], { origin: ORIGIN });

  protocol.handle(SCHEME, async (req) => {
    const { host, pathname } = new URL(req.url);
    if (host !== 'dnd') return new Response('Not found', { status: 404 });
    if (pathname.startsWith('/api/')) return api.fetch(req);
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    const file = resolve(DIST, '.' + decoded);
    if (file !== DIST && !file.startsWith(DIST + sep)) return new Response('Forbidden', { status: 403 });
    const res = await net.fetch(pathToFileURL(isFile(file) ? file : join(DIST, 'index.html')).toString());
    const headers = new Headers(res.headers);
    headers.set('Content-Security-Policy', CSP);
    return new Response(res.body, { status: res.status, headers });
  });
  console.log(`dnd-tool desktop (db: ${dbPath})`);
  return db;
}

function openExternal(url: string) {
  if (/^https?:\/\//.test(url)) void shell.openExternal(url);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    title: 'D&D Tool',
    icon: join(DIST, 'faelanmosswalker.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(ORIGIN + '/')) return;
    e.preventDefault();
    openExternal(url);
  });
  void win.loadURL(`${ORIGIN}/`);
  return win;
}

app.whenReady().then(() => {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('dist/ is missing; run `bun run build` first (or use `bun run desktop`).');
    app.exit(1);
    return;
  }
  // Electron grants permission requests (camera, notifications, …) by default; the app needs none.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  const db = startBackend();
  let win = createWindow();
  app.on('second-instance', () => {
    if (win.isDestroyed()) win = createWindow();
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) win = createWindow();
  });
  app.on('window-all-closed', () => {
    db.close();
    app.quit();
  });
});
