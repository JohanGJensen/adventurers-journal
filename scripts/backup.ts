// bun scripts/backup.ts [--db data/dnd.sqlite]
import { parseArgs } from 'node:util';
import { backup } from '../server/backup';
import { defaultDbPath, openDb } from '../server/db';

const { values } = parseArgs({ options: { db: { type: 'string' } } });
const path = values.db ?? defaultDbPath();
console.log(`Backed up to ${backup(openDb(path), path)}`);
