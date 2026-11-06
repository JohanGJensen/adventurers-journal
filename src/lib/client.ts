// Typed fetch wrapper for the in-process API (served by Electron's app:// protocol).

export type Result<T> = { data: T; error?: undefined; status: number } | { data?: undefined; error: string; status: number; body?: any };

/** status 0 = the request itself failed. Never throws. */
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
    return { error: e instanceof Error ? e.message : 'Network error', status: 0 };
  }
  let parsed: any = null;
  try {
    parsed = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) return { error: parsed?.error ?? `HTTP ${res.status}`, status: res.status, body: parsed };
  return { data: parsed as T, status: res.status };
}

