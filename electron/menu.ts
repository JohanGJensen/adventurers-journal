// The native application menu: standard roles plus the desktop-only actions (import, backup, data folder).
import { app, BrowserWindow, dialog, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_ORIGIN } from '../server/app';
import { backup } from '../server/backup';
import { insertCharacter } from '../server/characters';
import type { Db } from '../server/sqlite';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Options {
  db: Db;
  /** The window actions apply to: the one the menu was used from, else the main one (created if needed). */
  window: (from?: BrowserWindow) => BrowserWindow;
}

async function importCharacter({ db, window }: Options, from?: BrowserWindow) {
  const win = window(from);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Import character',
    buttonLabel: 'Import',
    filters: [{ name: 'Character sheet (JSON)', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return;
  try {
    const sheet = JSON.parse(readFileSync(filePaths[0], 'utf8'));
    const id = db.transaction(() => insertCharacter(db, sheet))();
    void win.loadURL(`${APP_ORIGIN}/c/${id}`);
  } catch (e) {
    dialog.showErrorBox('Import failed', message(e));
  }
}

async function backupDatabase({ db, window }: Options, from?: BrowserWindow) {
  const win = window(from);
  const dir = join(app.getPath('userData'), 'backups');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Back up database',
    defaultPath: join(dir, `dnd-${stamp}.sqlite`),
    filters: [{ name: 'SQLite database', extensions: ['sqlite'] }],
  });
  if (canceled || !filePath) return;
  try {
    backup(db, filePath);
    await dialog.showMessageBox(win, { type: 'info', message: 'Backup saved', detail: filePath });
  } catch (e) {
    dialog.showErrorBox('Backup failed', message(e));
  }
}

export function buildMenu(opts: Options) {
  const isMac = process.platform === 'darwin';
  const win = (w: unknown) => (w instanceof BrowserWindow ? w : undefined);
  const file: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      { label: 'Import Character…', accelerator: 'CmdOrCtrl+O', click: (_i, w) => void importCharacter(opts, win(w)) },
      { label: 'Back Up Database…', accelerator: 'CmdOrCtrl+Shift+S', click: (_i, w) => void backupDatabase(opts, win(w)) },
      { type: 'separator' },
      { label: 'Show Data Folder', click: () => void shell.openPath(app.getPath('userData')) },
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit' },
    ],
  };
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' } as const] : []),
    file,
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
