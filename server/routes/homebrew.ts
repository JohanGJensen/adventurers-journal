import { createHomebrew, deleteHomebrew, getHomebrew, listHomebrew, updateHomebrew } from '../homebrew';
import { body, intParam, json, type Route } from '../http';
import { asHomebrew } from '../validate';

export const homebrewRoutes: Route[] = [
  ['GET', '/api/homebrew/subclasses', ({ db, url }) => json(listHomebrew(db, url.searchParams.get('class') || undefined))],
  ['POST', '/api/homebrew/subclasses', async ({ db, req }) => json(createHomebrew(db, asHomebrew(await body(req))), 201)],
  ['GET', '/api/homebrew/subclasses/:id', ({ db, params }) => json(getHomebrew(db, intParam(params.id, 'subclass id')))],
  [
    'PUT',
    '/api/homebrew/subclasses/:id',
    async ({ db, params, req }) => {
      const id = intParam(params.id, 'subclass id');
      const b = asHomebrew(await body(req));
      return json(db.transaction(() => updateHomebrew(db, id, b))());
    },
  ],
  [
    'DELETE',
    '/api/homebrew/subclasses/:id',
    ({ db, params }) => {
      const id = intParam(params.id, 'subclass id');
      deleteHomebrew(db, id);
      return json({ deleted: id });
    },
  ],
];
