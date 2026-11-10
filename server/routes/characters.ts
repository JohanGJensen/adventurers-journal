import { getCampaign } from '../campaigns';
import { getCharacter, insertCharacter, listCharacters } from '../characters';
import { body, HttpError, intParam, json, type Route } from '../http';
import { asExtras, asPortrait, bad, isObj, optCampaignId } from '../validate';
import { buildCharacter } from '../../src/lib/character';

export const characterRoutes: Route[] = [
  ['GET', '/api/characters', ({ db }) => json(listCharacters(db))],
  [
    'POST',
    '/api/characters',
    async ({ db, req }) => {
      const b = await body(req);
      if (!isObj(b) || b.sheet === undefined) bad('Body must be { sheet, extras?, campaignId? }');
      const { sheet, extras, campaignId } = b as Record<string, unknown>;
      const cid = optCampaignId(campaignId);
      if (cid) getCampaign(db, cid);
      const id = insertCharacter(db, sheet, { extras: asExtras(extras), campaignId: cid });
      return json(getCharacter(db, id), 201);
    },
  ],
  ['GET', '/api/characters/:id', ({ db, params }) => json(getCharacter(db, intParam(params.id, 'character id')))],
  [
    'PATCH',
    '/api/characters/:id',
    async ({ db, params, req }) => {
      const current = getCharacter(db, intParam(params.id, 'character id'));
      const b = await body(req);
      if (!isObj(b)) bad('Body must be an object');
      const p = b as Record<string, unknown>;
      const name = p.name === undefined ? current.name : typeof p.name === 'string' && p.name.trim() ? p.name.trim() : bad('name must be a non-empty string');
      const campaignId = optCampaignId(p.campaignId);
      if (campaignId) getCampaign(db, campaignId);
      let extras = p.extras === undefined ? current.extras : asExtras(p.extras);
      // `portrait` changes just the portrait (null removes it), keeping the other extras.
      if (p.portrait === null) {
        const { portrait: _removed, ...rest } = extras;
        extras = rest;
      } else if (p.portrait !== undefined) extras = { ...extras, portrait: asPortrait(p.portrait) };
      try {
        buildCharacter(current.sheet, extras, current.levels, current.homebrew);
      } catch (e) {
        throw new HttpError(400, `Extras don't fit the sheet: ${e instanceof Error ? e.message : e}`);
      }
      db.query(
        `UPDATE characters SET name = ?, campaign_id = ?, extras_json = ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(name, campaignId === undefined ? current.campaignId : campaignId, JSON.stringify(extras), current.id);
      return json(getCharacter(db, current.id));
    },
  ],
  [
    'DELETE',
    '/api/characters/:id',
    ({ db, params }) => {
      const { id } = getCharacter(db, intParam(params.id, 'character id'));
      db.query('DELETE FROM characters WHERE id = ?').run(id);
      return json({ deleted: id });
    },
  ],
];
