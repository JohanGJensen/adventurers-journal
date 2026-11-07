// `bun run dist`: checks and builds the app, then packages it for this platform into release/.
// Linux: an AppImage, plus an .rpm when the rpm tooling is available. macOS: a .dmg for arm64 + x64
// (unsigned: on first launch, right-click the app → Open, or `xattr -dr com.apple.quarantine`).
import { spawnSync } from 'node:child_process';

const io = { stdio: ['inherit', 'inherit', 'inherit'] as ['inherit', 'inherit', 'inherit'] };
const run = async (cmd: string[]) => {
  const code = await Bun.spawn(cmd, io).exited;
  if (code !== 0) process.exit(code);
};

function linuxTargets() {
  // electron-builder makes the .rpm with rpmbuild and its bundled fpm, whose Ruby needs libcrypt.so.1.
  const hasRpmbuild = spawnSync('rpmbuild', ['--version']).status === 0;
  const hasLibcrypt = /libcrypt\.so\.1\b/.test(spawnSync('/sbin/ldconfig', ['-p'], { encoding: 'utf8' }).stdout ?? '');
  if (hasRpmbuild && hasLibcrypt) return ['AppImage', 'rpm'];
  console.warn('Skipping the .rpm: it needs rpmbuild and libcrypt.so.1 (Fedora: `sudo dnf install rpm-build libxcrypt-compat`).');
  return ['AppImage'];
}

let builderArgs: string[];
if (process.platform === 'linux') builderArgs = ['--linux', ...linuxTargets()];
// electron-builder can only make a .dmg on macOS.
else if (process.platform === 'darwin') builderArgs = ['--mac', 'dmg', '--arm64', '--x64'];
else {
  console.error(`dist supports Linux and macOS, not ${process.platform}. Use \`bun run start\` to run from source.`);
  process.exit(1);
}

await run(['bun', 'run', 'check']);
await run(['bun', 'run', 'build']);
await run(['bunx', 'electron-builder', ...builderArgs]);
