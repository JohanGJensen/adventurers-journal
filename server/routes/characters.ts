import { listCharacters } from '../characters';
import { json, type Route } from '../http';

export const characterRoutes: Route[] = [['GET', '/api/characters', ({ db }) => json(listCharacters(db))]];
