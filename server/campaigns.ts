import type { Db } from './sqlite';
import type { Campaign } from '../src/shared/types';
import { HttpError } from './http';

interface Row {
  id: number;
  name: string;
  created_at: string;
}
const toCampaign = (r: Row): Campaign => ({ id: r.id, name: r.name, createdAt: r.created_at });

export const listCampaigns = (db: Db): Campaign[] =>
  (db.query('SELECT * FROM campaigns ORDER BY name COLLATE NOCASE').all() as Row[]).map(toCampaign);

export function getCampaign(db: Db, id: number): Campaign {
  const r = db.query('SELECT * FROM campaigns WHERE id = ?').get(id) as Row | null;
  if (!r) throw new HttpError(404, `No campaign ${id}`);
  return toCampaign(r);
}

export const createCampaign = (db: Db, name: string): Campaign =>
  toCampaign(db.query('INSERT INTO campaigns (name) VALUES (?) RETURNING *').get(name) as Row);

/** Finds a campaign by exact (case-insensitive) name, creating it if missing. */
export function campaignByName(db: Db, name: string): Campaign {
  const r = db.query('SELECT * FROM campaigns WHERE lower(name) = lower(?)').get(name) as Row | null;
  return r ? toCampaign(r) : createCampaign(db, name);
}
