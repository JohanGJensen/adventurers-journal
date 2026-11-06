import type { Db } from './sqlite';
import { createRouter, HttpError, json, type Route } from './http';
import { campaignRoutes } from './routes/campaigns';
import { characterRoutes } from './routes/characters';
import { eventRoutes } from './routes/events';
import { inventoryRoutes } from './routes/inventory';
import { noteRoutes } from './routes/notes';
import { homebrewRoutes } from './routes/homebrew';
import { levelRoutes } from './routes/levels';
import { playRoutes } from './routes/play';
import { srdRoutes } from './routes/srd';

/** The origin the UI is served from (Electron's private app:// protocol). */
export const APP_ORIGIN = 'app://dnd';

/**
 * The API, as a fetch handler. It is only reachable through Electron's app:// protocol (no port is opened),
 * so the one check is that a request comes from the app's own page: no Origin, or exactly APP_ORIGIN.
 */
export function createApp(db: Db, extra: Route[] = []) {
  const route = createRouter([...characterRoutes, ...campaignRoutes, ...playRoutes, ...levelRoutes, ...homebrewRoutes, ...inventoryRoutes, ...srdRoutes, ...eventRoutes, ...noteRoutes, ...extra]);
  return {
    async fetch(req: Request): Promise<Response> {
      const origin = req.headers.get('origin');
      if (origin !== null && origin !== APP_ORIGIN) return json({ error: 'Origin not allowed' }, 403);
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
