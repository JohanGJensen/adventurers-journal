import { describe, expect, test } from 'bun:test';
import { buildLinkIndex, refersTo, renameLinks, segmentText, wikiLinks } from '../src/shared/noteLinks';
import type { NoteRef } from '../src/shared/types';

const ref = (id: number, title: string, extra: Partial<NoteRef> = {}): NoteRef => ({
  id,
  title,
  kind: 'place',
  aliases: [],
  tags: [],
  updatedAt: '',
  campaignId: null,
  characterId: 1,
  fields: {},
  ...extra,
});

const refs = [
  ref(1, 'Neverwinter', { aliases: ['City of Skilled Hands'] }),
  ref(2, 'Neverwinter Wood'),
  ref(3, 'Sildar Hallwinter', { kind: 'npc' }),
  ref(4, 'Ox'),
  ref(5, 'Château Blanc'),
];
const links = (segs: ReturnType<typeof segmentText>) => segs.filter((s) => s.t !== 'text');

describe('note links', () => {
  test('explicit, labelled and missing links', () => {
    const idx = buildLinkIndex(refs);
    expect(wikiLinks('See [[Neverwinter]] and [[ thundertree |the ruin]].')).toEqual(['Neverwinter', 'thundertree']);
    expect(links(segmentText('Go to [[neverwinter|the city]], then [[Thundertree]].', idx))).toEqual([
      { t: 'link', id: 1, text: 'the city', auto: false },
      { t: 'missing', target: 'Thundertree', text: 'Thundertree' },
    ]);
  });

  test('auto-mentions: aliases, longest match, word boundaries, accents, first only', () => {
    const idx = buildLinkIndex(refs);
    const segs = segmentText('Through the Neverwinter Wood to the City of  Skilled Hands. Neverwinters, Neverwinter, ox, Château Blanc.', idx);
    expect(links(segs)).toEqual([
      { t: 'link', id: 2, text: 'Neverwinter Wood', auto: true },
      { t: 'link', id: 1, text: 'City of  Skilled Hands', auto: true },
      { t: 'link', id: 5, text: 'Château Blanc', auto: true },
    ]);
    expect(segs.map((s) => s.text).join('')).toBe('Through the Neverwinter Wood to the City of  Skilled Hands. Neverwinters, Neverwinter, ox, Château Blanc.');
    // short names still link explicitly
    expect(links(segmentText('[[Ox]]', idx))).toEqual([{ t: 'link', id: 4, text: 'Ox', auto: false }]);
  });

  test('explicit link suppresses a later auto-mention; the note never auto-links itself', () => {
    expect(links(segmentText('[[Neverwinter]] is big. Neverwinter is old.', buildLinkIndex(refs)))).toHaveLength(1);
    expect(links(segmentText('Neverwinter is old.', buildLinkIndex(refs, refs[0])))).toEqual([]);
  });

  test('same-owner note wins a name clash', () => {
    const two = [ref(10, 'Tavern', { characterId: 1 }), ref(11, 'Tavern', { characterId: null, campaignId: 7 })];
    expect(buildLinkIndex(two).byName.get('tavern')?.id).toBe(10);
    expect(buildLinkIndex(two, { id: 99, campaignId: 7, characterId: null }).byName.get('tavern')?.id).toBe(11);
  });

  test('refersTo and renames', () => {
    const idx = buildLinkIndex(refs);
    const n = (body: string, fields: Record<string, string> = {}, kind: NoteRef['kind'] = 'note') => ({ id: 50, kind, fields, body });
    expect(refersTo(n('', { location: 'neverwinter' }, 'quest'), idx, 1)).toBe(true);
    expect(refersTo(n('Back to the city of skilled hands'), idx, 1)).toBe(true);
    expect(refersTo(n('[[Neverwinter Wood]] and Neverwinter Wood'), idx, 1)).toBe(false);
    expect(refersTo(n('Neverwinters'), idx, 1)).toBe(false);
    expect(refersTo({ ...n('Neverwinter'), id: 1 }, idx, 1)).toBe(false);
    expect(renameLinks('[[neverwinter]], [[Neverwinter|home]], [[Neverwinter Wood]]', 'Neverwinter', 'Waterdeep')).toBe(
      '[[Waterdeep]], [[Waterdeep|home]], [[Neverwinter Wood]]',
    );
  });
});
