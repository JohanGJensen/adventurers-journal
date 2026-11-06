import { freshPlayState } from '../../src/shared/state';
import { deriveCharacter } from '../characters';
import { body, HttpError, intParam, json, type Route } from '../http';
import { readPlay, writePlay } from '../play';
import { asEvents, asPlayState, isObj } from '../validate';

export const playRoutes: Route[] = [
  [
    'GET',
    '/api/characters/:id/play',
    ({ db, params }) => {
      const { state, version } = readPlay(db, intParam(params.id, 'character id'));
      return json({ state, version });
    },
  ],
  [
    'PUT',
    '/api/characters/:id/play',
    async ({ db, params, req }) => {
      const id = intParam(params.id, 'character id');
      const b = await body(req);
      if (!isObj(b) || !Number.isInteger(b.version)) throw new HttpError(400, 'Body must be { state, version, events? }');
      const state = asPlayState(b.state);
      const events = asEvents(b.events);
      const version = db.transaction(() => {
        const current = readPlay(db, id);
        if (current.version !== b.version)
          throw new HttpError(409, 'Play state changed elsewhere', { state: current.state, version: current.version });
        return writePlay(db, id, state, events);
      })();
      return json({ version });
    },
  ],
  [
    'POST',
    '/api/characters/:id/play/reset',
    ({ db, params }) => {
      const id = intParam(params.id, 'character id');
      const state = freshPlayState(deriveCharacter(db, id));
      const version = db.transaction(() => writePlay(db, id, state, [{ type: 'rest', summary: 'Reset play state' }]))();
      return json({ state, version });
    },
  ],
];
