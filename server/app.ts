import type { Db } from './sqlite';
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

/**
 * By default requests must pass the loopback Host/Origin check. `origin` replaces it for transports that
 * aren't network-reachable (Electron's app:// protocol): only requests with no Origin or exactly that one pass.
 */
export function createApp(db: Db, extra: Route[] = [], { origin }: { origin?: string } = {}) {
  const route = createRouter([...characterRoutes, ...campaignRoutes, ...playRoutes, ...inventoryRoutes, ...srdRoutes, ...importRoutes, ...eventRoutes, ...noteRoutes, ...extra]);
  const check = origin === undefined ? rejectReason : (req: Request) => {
    const o = req.headers.get('origin');
    return o === null || o === origin ? null : 'Origin not allowed';
  };
  return {
    async fetch(req: Request): Promise<Response> {
      const refused = check(req);
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
