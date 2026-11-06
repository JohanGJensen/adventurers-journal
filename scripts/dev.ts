// `bun run dev`: Vite (HMR for the UI) + a watching build of the Electron main process + Electron itself.
// Electron restarts when main-process/server code changes; closing the window or Ctrl+C stops everything.
import { readFileSync, watch } from 'node:fs';
import { join } from 'node:path';

const DEV_SERVER = 'http://localhost:5173';
const MAIN = join('dist-electron', 'main.js');
const BUILD = ['bun', 'build', 'electron/main.ts', '--target=node', '--format=esm', '--outdir', 'dist-electron', '--external', 'electron'];
const io = { stdio: ['inherit', 'inherit', 'inherit'] as ['inherit', 'inherit', 'inherit'] };

const vite = Bun.spawn(['bunx', '--bun', 'vite', '--port', '5173', '--strictPort'], io);
let electron: ReturnType<typeof Bun.spawn> | null = null;
let builder: ReturnType<typeof Bun.spawn> | null = null;
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const p of [electron, builder, vite]) p?.kill();
  process.exit(code);
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
void vite.exited.then((c) => stop(c || 1));

async function waitForVite() {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(DEV_SERVER);
      return;
    } catch {
      await Bun.sleep(100);
    }
  }
  console.error(`Vite did not start on ${DEV_SERVER}`);
  stop(1);
}

let restarting = false;
async function startElectron() {
  if (electron) {
    restarting = true;
    electron.kill();
    await electron.exited;
    restarting = false;
  }
  const p = Bun.spawn(['node_modules/.bin/electron', '.'], { ...io, env: { ...process.env, DND_DEV_SERVER: DEV_SERVER } });
  electron = p;
  void p.exited.then((c) => {
    if (!restarting && electron === p) stop(c ?? 0); // the window was closed: end the dev session
  });
}

// One build up front so Electron starts on fresh code, then a watcher for later edits.
if ((await Bun.spawn(BUILD, io).exited) !== 0) stop(1);
await waitForVite();
await startElectron();
builder = Bun.spawn([...BUILD, '--watch', '--no-clear-screen'], io);

// The watcher rewrites main.js on start and on unrelated saves; only restart when the bundle changed.
const hash = () => {
  try {
    return Bun.hash(readFileSync(MAIN)).toString();
  } catch {
    return ''; // mid-write
  }
};
let built = hash();
let timer: ReturnType<typeof setTimeout> | undefined;
watch(MAIN, () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const now = hash();
    if (now === built) return;
    built = now;
    console.log('[dev] main process rebuilt, restarting Electron');
    void startElectron();
  }, 200);
});
