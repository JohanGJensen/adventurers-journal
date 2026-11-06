import type { Database } from 'bun:sqlite';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};

export interface Ctx {
  req: Request;
  url: URL;
  params: Record<string, string>;
  db: Database;
}

export type Handler = (ctx: Ctx) => Response | Promise<Response>;
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Route = [Method, string, Handler];

interface Compiled {
  method: Method;
  re: RegExp;
  keys: string[];
  handler: Handler;
}

function compile([method, pattern, handler]: Route): Compiled {
  const keys: string[] = [];
  const re = new RegExp(
    '^' +
      pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:(\w+)/g, (_, k) => {
        keys.push(k);
        return '([^/]+)';
      }) +
      '/?$',
  );
  return { method, re, keys, handler };
}

export function createRouter(routes: Route[]) {
  const compiled = routes.map(compile);
  return async (req: Request, db: Database): Promise<Response | null> => {
    const url = new URL(req.url);
    let pathMatched = false;
    for (const r of compiled) {
      const m = r.re.exec(url.pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== req.method) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return r.handler({ req, url, params, db });
    }
    return pathMatched ? json({ error: 'Method not allowed' }, 405) : null;
  };
}

export async function body(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'Body must be JSON');
  }
}

export const intParam = (v: string | null | undefined, name: string): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, `Invalid ${name}`);
  return n;
};
