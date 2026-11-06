// A small SQLite interface the server is written against, implemented on node:sqlite
// (Electron's main process; also available under Bun for `bun test`).
// Loaded with process.getBuiltinModule so the bundle never statically imports it.

export type Param = string | number | bigint | boolean | null | Uint8Array;

export interface Stmt {
  get(...params: Param[]): unknown;
  all(...params: Param[]): unknown[];
  run(...params: Param[]): unknown;
}

export interface Db {
  query(sql: string): Stmt;
  exec(sql: string): void;
  /** Like bun:sqlite: returns a function that runs `fn` in a transaction (a savepoint when nested). */
  transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R;
  close(): void;
}

type NodeSqlite = typeof import('node:sqlite');

const load = <T>(id: string): T => {
  const m = process.getBuiltinModule?.(id) as T | undefined;
  if (!m) throw new Error(`${id} is not available in this runtime`);
  return m;
};

export function openSqlite(path: string, { readonly = false }: { readonly?: boolean } = {}): Db {
  return openNode(path, readonly);
}

// node:sqlite has no booleans; bind them as 1/0.
const bind = (params: Param[]) => params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p));

function openNode(path: string, readOnly: boolean): Db {
  const { DatabaseSync } = load<NodeSqlite>('node:sqlite');
  const raw = new DatabaseSync(path, { readOnly });
  const cache = new Map<string, Stmt>();
  let depth = 0;

  return {
    query(sql) {
      let s = cache.get(sql);
      if (!s) {
        const st = raw.prepare(sql);
        s = {
          get: (...p) => st.get(...(bind(p) as never[])) ?? null,
          all: (...p) => st.all(...(bind(p) as never[])),
          run: (...p) => st.run(...(bind(p) as never[])),
        };
        cache.set(sql, s);
      }
      return s;
    },
    exec: (sql) => raw.exec(sql),
    transaction(fn) {
      return (...args) => {
        const outer = depth === 0;
        const sp = `sp${depth}`;
        raw.exec(outer ? 'BEGIN' : `SAVEPOINT ${sp}`);
        depth++;
        // Best-effort: SQLite may already have rolled back (e.g. SQLITE_FULL); don't mask the original error.
        const undo = () => {
          try {
            raw.exec(outer ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
          } catch {}
        };
        let r: ReturnType<typeof fn>;
        try {
          r = fn(...args);
        } catch (e) {
          depth--;
          undo();
          throw e;
        }
        depth--;
        try {
          raw.exec(outer ? 'COMMIT' : `RELEASE ${sp}`);
        } catch (e) {
          undo(); // a failed COMMIT (busy, deferred constraint) leaves the transaction open
          throw e;
        }
        return r;
      };
    },
    close: () => raw.close(),
  };
}
