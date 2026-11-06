import { HttpError, json, type Route } from '../http';
import { getClassSpellList, getDetail, KINDS, UpstreamError } from '../srd';
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

export const srdRoutes: Route[] = [
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
    '/api/srd/:kind/:slug',
    async ({ db, params }) => {
      if (!KINDS.includes(params.kind as Kind)) throw new HttpError(400, 'kind must be spells or equipment');
      if (!SLUG.test(params.slug)) throw new HttpError(400, 'Invalid slug');
      const detail = await upstream(() => getDetail(db, params.kind as Kind, params.slug));
      return detail ? json(detail) : json({ error: 'Not in the SRD' }, 404);
    },
  ],
];
