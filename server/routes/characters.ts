import { getCharacter, listCharacters } from '../characters';
import { intParam, json, type Route } from '../http';

export const characterRoutes: Route[] = [
  ['GET', '/api/characters', ({ db }) => json(listCharacters(db))],
  ['GET', '/api/characters/:id', ({ db, params }) => json(getCharacter(db, intParam(params.id, 'character id')))],
];
