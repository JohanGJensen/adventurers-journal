import { createCampaign, getCampaign, listCampaigns } from '../campaigns';
import { body, intParam, json, type Route } from '../http';
import { bad, isObj } from '../validate';

const nameOf = (b: unknown) =>
  isObj(b) && typeof b.name === 'string' && b.name.trim() ? b.name.trim() : bad('Body must be { name }');

export const campaignRoutes: Route[] = [
  ['GET', '/api/campaigns', ({ db }) => json(listCampaigns(db))],
  ['POST', '/api/campaigns', async ({ db, req }) => json(createCampaign(db, nameOf(await body(req))), 201)],
  [
    'PATCH',
    '/api/campaigns/:id',
    async ({ db, params, req }) => {
      const { id } = getCampaign(db, intParam(params.id, 'campaign id'));
      db.query('UPDATE campaigns SET name = ? WHERE id = ?').run(nameOf(await body(req)), id);
      return json(getCampaign(db, id));
    },
  ],
  [
    'DELETE',
    '/api/campaigns/:id',
    ({ db, params }) => {
      const { id } = getCampaign(db, intParam(params.id, 'campaign id'));
      db.query('DELETE FROM campaigns WHERE id = ?').run(id);
      return json({ deleted: id });
    },
  ],
];
