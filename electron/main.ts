// Electron main process: runs the API in-process on node:sqlite and serves the UI and /api over a
// private app:// protocol (see protocol.ts), so no port is opened.
import { app, BrowserWindow, session, shell } from 'electron';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { APP_ORIGIN, createApp } from '../server/app';
import { openDb } from '../server/db';
import { seedIfEmpty } from '../server/seed';
import { openSqlite, type Db } from '../server/sqlite';
import { buildMenu } from './menu';
import { handleProtocol, registerScheme } from './protocol';

registerScheme();

// Same data dir for `bun run dev`, `bun run start` and the packaged app, whatever productName says.
app.setPath('userData', join(app.getPath('appData'), 'dnd-tool'));

// app.quit() is async and would still let whenReady run (opening the DB, flashing a window).
if (!app.requestSingleInstanceLock()) app.exit(0);

/** Set by `bun run dev`: the UI comes from Vite with HMR. Ignored in packaged builds. */
const DEV_SERVER = !app.isPackaged ? (process.env.DND_DEV_SERVER ?? null) : null;
const DIST = join(app.getAppPath(), 'dist');
const ICON = join(app.getAppPath(), DEV_SERVER ? 'public' : 'dist', 'faelanmosswalker.png');

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

function openDatabase(): Db {
  const dbPath = process.env.DND_DB ?? join(app.getPath('userData'), 'dnd.sqlite');
  copyExistingDb(dbPath);
  const db = openDb(dbPath);
  if (seedIfEmpty(db)) console.log('Seeded Faelan into a new database');
  console.log(`dnd-tool ${DEV_SERVER ? `dev (UI from ${DEV_SERVER})` : 'desktop'} (db: ${dbPath})`);
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
    icon: ICON,
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(APP_ORIGIN + '/')) return;
    e.preventDefault();
    openExternal(url);
  });
  if (DEV_SERVER) win.webContents.openDevTools({ mode: 'detach' });
  void win.loadURL(`${APP_ORIGIN}/`);
  return win;
}

app.whenReady().then(() => {
  if (!DEV_SERVER && !existsSync(join(DIST, 'index.html'))) {
    console.error('dist/ is missing; run `bun run build` first (or use `bun run start`).');
    app.exit(1);
    return;
  }
  // Electron grants permission requests (camera, notifications, …) by default; the app needs none.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  const db = openDatabase();
  handleProtocol({ api: createApp(db), dist: DIST, devServer: DEV_SERVER });

  let win: BrowserWindow | null = createWindow();
  const mainWindow = (from?: BrowserWindow) => {
    if (from && !from.isDestroyed()) return from;
    if (!win || win.isDestroyed()) win = createWindow();
    return win;
  };
  buildMenu({ db, window: mainWindow });

  app.on('second-instance', () => {
    const w = mainWindow();
    if (w.isMinimized()) w.restore();
    w.focus();
  });
  // macOS: clicking the dock icon with no windows open reopens one.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow();
  });
  // macOS apps stay running with no windows; elsewhere closing the last window quits.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  // Close the DB once, on the way out, however the quit was triggered (menu, Cmd+Q, last window).
  app.on('will-quit', () => db.close());
});
