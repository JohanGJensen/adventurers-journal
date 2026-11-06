// Typed fetch wrapper for the local API, plus an "is the server reachable" store.

export type Result<T> = { data: T; error?: undefined; status: number } | { data?: undefined; error: string; status: number; body?: any };

let online = true;
const listeners = new Set<() => void>();
const setOnline = (v: boolean) => {
  if (v === online) return;
  online = v;
  listeners.forEach((l) => l());
};

export const connection = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getSnapshot: () => online,
};

/** status 0 = network error (server not running). Never throws. */
export async function api<T>(method: string, path: string, body?: unknown, init?: RequestInit): Promise<Result<T>> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...init,
    });
  } catch (e) {
    setOnline(false);
    return { error: e instanceof Error ? e.message : 'Network error', status: 0 };
  }
  // Vite's proxy answers 502/504 when the API process is down.
  if ((res.status === 502 || res.status === 504) && !res.headers.get('content-type')?.includes('json')) {
    setOnline(false);
    return { error: 'Server not running', status: 0 };
  }
  setOnline(true);
  let parsed: any = null;
  try {
    parsed = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) return { error: parsed?.error ?? `HTTP ${res.status}`, status: res.status, body: parsed };
  return { data: parsed as T, status: res.status };
}

/** Checks reachability now (used by the banner's retry). */
export const ping = () => api('GET', '/characters');
