// `bun run dist:mac`: builds the macOS .dmg (arm64 + x64). electron-builder can only make a .dmg on macOS.
// The result is unsigned: on first launch, right-click the app → Open (or `xattr -dr com.apple.quarantine`).
if (process.platform !== 'darwin') {
  console.error('dist:mac must run on macOS (electron-builder cannot build a .dmg on this platform). Use `bun run dist:linux` here.');
  process.exit(1);
}
const io = { stdio: ['inherit', 'inherit', 'inherit'] as ['inherit', 'inherit', 'inherit'] };
for (const cmd of [
  ['bun', 'run', 'build'],
  ['bunx', 'electron-builder', '--mac', 'dmg', '--arm64', '--x64'],
]) {
  const code = await Bun.spawn(cmd, io).exited;
  if (code !== 0) process.exit(code);
}
export {};
