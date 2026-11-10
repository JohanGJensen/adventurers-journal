import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/client';
import { linkTo, navigate } from '../lib/router';
import { CLASSES, titleCase } from '../lib/rules';
import { toast } from '../lib/toast';
import type { HomebrewSubclass } from '../shared/types';
import { Loader } from './Loader';

/** Strips server-only fields, for export and duplicate. */
export const homebrewBody = ({ id: _id, usedBy: _u, ...rest }: HomebrewSubclass) => rest;

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The homebrew subclass library: grouped by class, with import/export. */
export function HomebrewLibrary() {
  const [list, setList] = useState<HomebrewSubclass[] | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const r = await api<HomebrewSubclass[]>('GET', '/homebrew/subclasses');
    if (r.data) setList(r.data);
    else toast(`Could not load homebrew: ${r.error}`, 'error');
  }, []);

  useEffect(() => {
    document.title = 'Homebrew · Adventurers Journal';
    void refresh();
  }, [refresh]);

  const create = async (body: Omit<HomebrewSubclass, 'id'>, verb: string) => {
    const r = await api<HomebrewSubclass>('POST', '/homebrew/subclasses', body);
    if (r.error !== undefined) return toast(`Could not ${verb}: ${r.error}`, 'error');
    toast(`${verb === 'import' ? 'Imported' : 'Created'} ${r.data.name}`);
    void refresh();
  };

  const importFile = async (f: File) => {
    let data: unknown;
    try {
      data = JSON.parse(await f.text());
    } catch {
      return toast(`${f.name} is not valid JSON`, 'error');
    }
    for (const item of Array.isArray(data) ? data : [data]) await create(homebrewBody(item as HomebrewSubclass), 'import');
  };

  const remove = async (h: HomebrewSubclass) => {
    if (!confirm(`Delete ${h.name}? This can't be undone.`)) return;
    const r = await api('DELETE', `/homebrew/subclasses/${h.id}`);
    if (r.error !== undefined) return toast(r.error, 'error');
    void refresh();
  };

  const classes = Object.keys(CLASSES);

  return (
    <main className="sheet list-page homebrew-page">
      <nav className="sheet-nav">
        <a {...linkTo('/')}>← All characters</a>
      </nav>
      <header className="list-head">
        <h1>Homebrew</h1>
        <div className="char-actions">
          {classes.map((k) => (
            <button key={k} className="btn" onClick={() => navigate(`/homebrew/new?class=${k}`)}>
              New {titleCase(k)} subclass
            </button>
          ))}
          <button className="btn ghost" onClick={() => file.current?.click()}>Import…</button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importFile(f);
            }}
          />
        </div>
      </header>
      <p className="hint">
        Subclasses you make here can be picked at the subclass level by any character of that class. Changes apply to
        characters who already have the subclass.
      </p>

      {list === null ? (
        <Loader label="Searching the library" />
      ) : (
        classes.map((k) => {
          const items = list.filter((h) => h.classKey === k);
          return (
            <section key={k} className="char-group">
              <h2>{titleCase(k)} subclasses</h2>
              {items.length === 0 ? (
                <p className="muted">None yet.</p>
              ) : (
                <div className="char-cards">
                  {items.map((h) => (
                    <article key={h.id} className="card char-card">
                      <a className="char-link" {...linkTo(`/homebrew/${h.id}`)}>
                        <div>
                          <strong>{h.name}</strong>
                          <small>
                            {h.levels.map((l) => l.level).join(' · ') || 'No levels yet'}
                            {h.variants && ` · ${h.variants.label}: ${h.variants.options.map((o) => o.name).join(', ')}`}
                          </small>
                        </div>
                      </a>
                      {h.description && <p className="muted homebrew-blurb">{h.description}</p>}
                      {h.usedBy && h.usedBy.length > 0 && <p className="hint">Used by {h.usedBy.join(', ')}</p>}
                      <div className="char-actions">
                        <button className="btn ghost small" onClick={() => navigate(`/homebrew/${h.id}`)}>Edit</button>
                        <button className="btn ghost small" onClick={() => create({ ...homebrewBody(h), name: `${h.name} (copy)` }, 'duplicate')}>
                          Duplicate
                        </button>
                        <button className="btn ghost small" onClick={() => download(`${h.name}.json`, homebrewBody(h))}>Export</button>
                        <button
                          className="btn ghost small"
                          disabled={!!h.usedBy?.length}
                          title={h.usedBy?.length ? `In use by ${h.usedBy.join(', ')}` : undefined}
                          onClick={() => remove(h)}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          );
        })
      )}
    </main>
  );
}
