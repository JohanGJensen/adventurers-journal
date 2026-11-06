// `bun run install:linux [--uninstall]`: installs the built AppImage for the current user, so the desktop
// shows the app with its icon. GNOME on Wayland ignores window icons and matches the window's app_id
// ("adventurers-journal") to an installed .desktop file; the AppImage alone never provides one.
// Installs to ~/Applications, ~/.local/share/applications and ~/.local/share/icons/hicolor (no root needed).
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import pkg from '../package.json';

const ID = pkg.build.executableName; // also the Wayland app_id, via desktopName
const NAME = pkg.build.productName;
const home = homedir();
const data = process.env.XDG_DATA_HOME ?? join(home, '.local', 'share');
const appImage = join(home, 'Applications', `${ID}.AppImage`);
const desktopFile = join(data, 'applications', `${ID}.desktop`);
const iconDir = join(data, 'icons', 'hicolor');
const ICON_SRC = join(import.meta.dirname, '..', 'build', 'icons'); // <size>x<size>.png

const refresh = () => {
  spawnSync('update-desktop-database', [join(data, 'applications')]);
  spawnSync('gtk-update-icon-cache', ['-f', '-t', iconDir]);
};
const icons = () => readdirSync(ICON_SRC).filter((f) => /^\d+x\d+\.png$/.test(f));

if (process.argv.includes('--uninstall')) {
  for (const f of icons()) rmSync(join(iconDir, f.replace('.png', ''), 'apps', `${ID}.png`), { force: true });
  rmSync(desktopFile, { force: true });
  rmSync(appImage, { force: true });
  refresh();
  console.log(`Removed ${NAME} (your data in ~/.config/${ID} is kept).`);
  process.exit(0);
}

const built = join(import.meta.dirname, '..', 'release', `${ID}-${pkg.version}.AppImage`);
if (!existsSync(built)) {
  console.error(`${built} not found; run \`bun run dist:linux\` first.`);
  process.exit(1);
}

mkdirSync(join(home, 'Applications'), { recursive: true });
rmSync(appImage, { force: true }); // replace, even while an old copy is running
copyFileSync(built, appImage);
chmodSync(appImage, 0o755);

for (const f of icons()) {
  const dir = join(iconDir, f.replace('.png', ''), 'apps');
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(ICON_SRC, f), join(dir, `${ID}.png`));
}

mkdirSync(join(data, 'applications'), { recursive: true });
// --no-sandbox: an AppImage can't ship Chromium's setuid sandbox helper (electron-builder's own entry does the same).
writeFileSync(
  desktopFile,
  `[Desktop Entry]
Type=Application
Name=${NAME}
Comment=${pkg.description}
Exec="${appImage}" --no-sandbox %U
TryExec=${appImage}
Icon=${ID}
StartupWMClass=${ID}
Categories=Game;
Terminal=false
`,
);
refresh();
console.log(`Installed ${NAME}: ${appImage}\nIt's in your app grid now (log out and back in if the icon doesn't show yet).`);
