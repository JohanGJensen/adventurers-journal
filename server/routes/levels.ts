import { body, intParam, json, type Route } from '../http';
import { levelUp, undoLevel } from '../levels';

export const levelRoutes: Route[] = [
  [
    'POST',
    '/api/characters/:id/levels',
    async ({ db, params, req }) => json(levelUp(db, intParam(params.id, 'character id'), await body(req))),
  ],
  ['DELETE', '/api/characters/:id/levels/last', ({ db, params }) => json(undoLevel(db, intParam(params.id, 'character id')))],
];
