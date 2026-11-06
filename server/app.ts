import type { Database } from 'bun:sqlite';
import { rejectReason } from './guard';
import { createRouter, HttpError, json, type Route } from './http';
import { campaignRoutes } from './routes/campaigns';
import { characterRoutes } from './routes/characters';
import { eventRoutes } from './routes/events';
import { importRoutes } from './routes/import';
import { inventoryRoutes } from './routes/inventory';
import { noteRoutes } from './routes/notes';
import { playRoutes } from './routes/play';
import { srdRoutes } from './routes/srd';

export function createApp(db: Database, extra: Route[] = []) {
  const route = createRouter([...characterRoutes, ...campaignRoutes, ...playRoutes, ...inventoryRoutes, ...srdRoutes, ...importRoutes, ...eventRoutes, ...noteRoutes, ...extra]);
  return {
    async fetch(req: Request): Promise<Response> {
      const refused = rejectReason(req);
      if (refused) return json({ error: refused }, 403);
      try {
        return (await route(req, db)) ?? json({ error: 'Not found' }, 404);
      } catch (e) {
        if (e instanceof HttpError) return json({ error: e.message, ...e.extra }, e.status);
        console.error(e);
        return json({ error: e instanceof Error ? e.message : 'Internal error' }, 500);
      }
    },
  };
}
