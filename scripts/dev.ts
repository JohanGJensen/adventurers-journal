// Runs the API (with --watch) and Vite together; Ctrl+C stops both.
export {};
const procs = [
  Bun.spawn(['bun', '--watch', 'server/index.ts'], { stdio: ['inherit', 'inherit', 'inherit'] }),
  Bun.spawn(['bunx', '--bun', 'vite'], { stdio: ['inherit', 'inherit', 'inherit'] }),
];
const stop = () => {
  for (const p of procs) p.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
await Promise.race(procs.map((p) => p.exited));
stop();
