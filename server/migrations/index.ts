// Every migration, in order. Imported as text so bundles (Electron) carry the SQL with them.
// Add new files here as `NNN_name.sql`.
import m001 from './001_init.sql' with { type: 'text' };

export const MIGRATIONS: { n: number; sql: string }[] = [{ n: 1, sql: m001 }];
