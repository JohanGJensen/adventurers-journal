// Every migration, in order. Imported as text so bundles (Electron) carry the SQL with them.
// Add new files here as `NNN_name.sql`.
import m001 from './001_init.sql' with { type: 'text' };
import m002 from './002_levels.sql' with { type: 'text' };
import m003 from './003_homebrew.sql' with { type: 'text' };
import m004 from './004_maps.sql' with { type: 'text' };
import m005 from './005_map_drawing.sql' with { type: 'text' };
import m006 from './006_lore.sql' with { type: 'text' };

export const MIGRATIONS: { n: number; sql: string }[] = [
  { n: 1, sql: m001 },
  { n: 2, sql: m002 },
  { n: 3, sql: m003 },
  { n: 4, sql: m004 },
  { n: 5, sql: m005 },
  { n: 6, sql: m006 },
];
