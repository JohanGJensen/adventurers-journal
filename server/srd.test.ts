import { afterEach, describe, expect, mock, test } from 'bun:test';
import { createApp } from './app';
import { openDb } from './db';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockUpstream(handler: (url: string) => Response) {
  const fn = mock(async (input: string | URL | Request) => handler(String(input)));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

const get = (app: ReturnType<typeof createApp>, path: string) => app.fetch(new Request(`http://x${path}`));

describe('SRD proxy', () => {
  test('miss fetches and caches; hit does not refetch', async () => {
    const db = openDb(':memory:');
    const app = createApp(db);
    const fn = mockUpstream(() =>
      Response.json({ name: 'Shillelagh', level: 0, school: { name: 'Transmutation' }, casting_time: '1 bonus action', range: 'Self', duration: '1 minute' }),
    );
    const r1 = await get(app, '/api/srd/spells/shillelagh');
    expect(r1.status).toBe(200);
    expect(((await r1.json()) as any).spell.school).toBe('Transmutation');
    expect(fn).toHaveBeenCalledTimes(1);
    const r2 = await get(app, '/api/srd/spells/shillelagh');
    expect(((await r2.json()) as any).source).toBe('2024 SRD');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('404 in both versions caches a known miss', async () => {
    const db = openDb(':memory:');
    const app = createApp(db);
    const fn = mockUpstream(() => new Response('nope', { status: 404 }));
    expect((await get(app, '/api/srd/equipment/mystery-box')).status).toBe(404);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(db.query("SELECT data_json FROM srd_cache WHERE slug='mystery-box'").get()).toEqual({ data_json: null });
    expect((await get(app, '/api/srd/equipment/mystery-box')).status).toBe(404);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('upstream failure is 502 and not cached', async () => {
    const db = openDb(':memory:');
    mockUpstream(() => {
      throw new Error('offline');
    });
    expect((await get(createApp(db), '/api/srd/spells/fog-cloud')).status).toBe(502);
    expect(db.query('SELECT count(*) AS n FROM srd_cache').get()).toEqual({ n: 0 });
  });

  test('local details win without fetching; bad kind is 400', async () => {
    const fn = mockUpstream(() => new Response('', { status: 500 }));
    const app = createApp(openDb(':memory:'));
    expect(((await (await get(app, '/api/srd/spells/gust')).json()) as any).source).toBe('Local');
    expect(fn).not.toHaveBeenCalled();
    expect((await get(app, '/api/srd/monsters/goblin')).status).toBe(400);
  });

  test('class list falls back to 2014', async () => {
    const fn = mockUpstream((url) =>
      url.includes('/2024/') ? new Response('', { status: 404 }) : Response.json({ results: [{ index: 'gust', name: 'Gust', level: 0 }] }),
    );
    const r = await get(createApp(openDb(':memory:')), '/api/srd/classlist/druid');
    expect(await r.json()).toEqual([{ index: 'gust', name: 'Gust', level: 0 }]);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
