import { HttpError, json, type Route } from '../http';
import { getClassSpellList, getDetail, getLevelUpInfo, KINDS, UpstreamError } from '../srd';
import { getCreateBackground, getCreateClass, getCreateOptions, getCreateSpecies } from '../creation';
import type { Kind } from '../../src/shared/types';

const SLUG = /^[a-z0-9-]+$/;

const upstream = async <T>(fn: () => Promise<T>) => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UpstreamError) throw new HttpError(502, e.message);
    throw e;
  }
};

/** GET /api/srd/create/<kind>/:slug for one creation lookup; 404 when the SRD doesn't have it. */
const createRoute = (kind: string, fn: (db: Parameters<typeof getCreateClass>[0], slug: string) => Promise<unknown>): Route => [
  'GET',
  `/api/srd/create/${kind}/:slug`,
  async ({ db, params }) => {
    if (!SLUG.test(params.slug)) throw new HttpError(400, `Invalid ${kind}`);
    const out = await upstream(() => fn(db, params.slug));
    return out ? json(out) : json({ error: `No SRD ${kind} ${params.slug}` }, 404);
  },
];

export const srdRoutes: Route[] = [
  ['GET', '/api/srd/create/options', async ({ db }) => json(await upstream(() => getCreateOptions(db)))],
  createRoute('class', getCreateClass),
  createRoute('species', getCreateSpecies),
  createRoute('background', getCreateBackground),
  [
    'GET',
    '/api/srd/classlist/:cls',
    async ({ db, params }) => {
      if (!SLUG.test(params.cls)) throw new HttpError(400, 'Invalid class');
      const list = await upstream(() => getClassSpellList(db, params.cls));
      return list ? json(list) : json({ error: `No SRD spell list for ${params.cls}` }, 404);
    },
  ],
  [
    'GET',
    '/api/srd/levelup/:cls/:level',
    async ({ db, params, url }) => {
      if (!SLUG.test(params.cls)) throw new HttpError(400, 'Invalid class');
      const level = Number(params.level);
      if (!Number.isInteger(level) || level < 2 || level > 20) throw new HttpError(400, 'level must be 2–20');
      const subclass = url.searchParams.get('subclass') || undefined;
      if (subclass && !SLUG.test(subclass)) throw new HttpError(400, 'Invalid subclass');
      const info = await upstream(() => getLevelUpInfo(db, params.cls, level, subclass));
      return info ? json(info) : json({ error: `No SRD level table for ${params.cls}` }, 404);
    },
  ],
  [
    'GET',
    '/api/srd/:kind/:slug',
    async ({ db, params }) => {
      if (!KINDS.includes(params.kind as Kind)) throw new HttpError(400, 'kind must be spells or equipment');
      if (!SLUG.test(params.slug)) throw new HttpError(400, 'Invalid slug');
      const detail = await upstream(() => getDetail(db, params.kind as Kind, params.slug));
      return detail ? json(detail) : json({ error: 'Not in the SRD' }, 404);
    },
  ],
];
