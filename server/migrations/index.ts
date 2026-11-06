// Every migration, in order. Imported as text so bundles (Electron) carry the SQL with them.
// Add new files here as `NNN_name.sql`.
import m001 from './001_init.sql' with { type: 'text' };
import m002 from './002_levels.sql' with { type: 'text' };
import m003 from './003_homebrew.sql' with { type: 'text' };

export const MIGRATIONS: { n: number; sql: string }[] = [
  { n: 1, sql: m001 },
  { n: 2, sql: m002 },
  { n: 3, sql: m003 },
];
