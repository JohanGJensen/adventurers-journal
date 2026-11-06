// `bun run dist:linux`: builds the Linux AppImage, plus an .rpm when the rpm tooling is available, into release/.
import { spawnSync } from 'node:child_process';

const io = { stdio: ['inherit', 'inherit', 'inherit'] as ['inherit', 'inherit', 'inherit'] };
const run = async (cmd: string[]) => {
  const code = await Bun.spawn(cmd, io).exited;
  if (code !== 0) process.exit(code);
};

// electron-builder makes the .rpm with rpmbuild and its bundled fpm, whose Ruby needs libcrypt.so.1.
const hasRpmbuild = spawnSync('rpmbuild', ['--version']).status === 0;
const hasLibcrypt = /libcrypt\.so\.1\b/.test(spawnSync('/sbin/ldconfig', ['-p'], { encoding: 'utf8' }).stdout ?? '');
const targets = ['AppImage'];
if (hasRpmbuild && hasLibcrypt) targets.push('rpm');
else console.warn('Skipping the .rpm: it needs rpmbuild and libcrypt.so.1 (Fedora: `sudo dnf install rpm-build libxcrypt-compat`).');

await run(['bun', 'run', 'build']);
await run(['bunx', 'electron-builder', '--linux', ...targets]);
