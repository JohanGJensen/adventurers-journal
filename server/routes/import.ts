import { body, HttpError, json, type Route } from '../http';
import { importLocalData } from '../import';
import { isObj } from '../validate';

export const importRoutes: Route[] = [
  [
    'POST',
    '/api/import/local',
    async ({ db, req }) => {
      const b = await body(req);
      if (!isObj(b) || !Number.isInteger(b.characterId)) throw new HttpError(400, 'Body must be { characterId, payload, force? }');
      const r = importLocalData(db, b.payload, { characterId: b.characterId as number, force: b.force === true, source: 'browser' });
      if (r.status === 'conflict') throw new HttpError(409, 'Server already has data for this character', { before: r.before, after: r.after });
      return json({ ...r, already: r.status === 'already' });
    },
  ],
];
