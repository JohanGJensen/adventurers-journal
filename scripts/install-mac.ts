// `bun run install:mac`: installs the built .dmg for this Mac's architecture into /Applications,
// replacing the old copy, and removes the unpacked .app bundles electron-builder leaves in release/,
// so Spotlight finds only the installed app. Quits the app first if it's running. Your data is untouched.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import pkg from '../package.json';

if (process.platform !== 'darwin') {
  console.error('install:mac only runs on macOS (on Linux use `bun run install:linux`).');
  process.exit(1);
}

const root = join(import.meta.dirname, '..');
const release = join(root, 'release');
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const dmg = join(release, `${pkg.name}-${pkg.version}-${arch}.dmg`);
if (!existsSync(dmg)) {
  console.error(`${dmg} not found; run \`bun run dist\` first.`);
  process.exit(1);
}

const sh = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  return r.stdout;
};

// Quit a running copy so its files can be replaced (ignored when it isn't running).
spawnSync('osascript', ['-e', `quit app "${pkg.build.productName}"`]);
spawnSync('pkill', ['-x', pkg.name]);

const out = sh('hdiutil', ['attach', '-nobrowse', '-readonly', dmg]);
const mount = out.trim().split('\n').pop()!.split('\t').pop()!.trim();
let installed = '';
try {
  const app = readdirSync(mount).find((f) => f.endsWith('.app'));
  if (!app) throw new Error(`No .app in ${dmg}`);
  installed = join('/Applications', app);
  rmSync(installed, { recursive: true, force: true });
  sh('ditto', [join(mount, app), installed]);
} finally {
  spawnSync('hdiutil', ['detach', '-quiet', mount]);
}
// Unsigned and built here, but clear the flag anyway so the first launch isn't blocked.
spawnSync('xattr', ['-dr', 'com.apple.quarantine', installed]);

for (const d of readdirSync(release)) if (/^mac(-.+)?$/.test(d)) rmSync(join(release, d), { recursive: true, force: true });
spawnSync('mdimport', [installed]);

console.log(`Installed ${pkg.build.productName} ${pkg.version} (${arch}) to ${installed}.`);
