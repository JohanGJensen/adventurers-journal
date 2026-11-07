import { useEffect, useState } from 'react';
import { lookup, type Detail, type Kind } from '../lib/api';
import { SchoolIcon } from './SchoolIcon';

export interface Selection { kind: Kind; name: string }

type Status = { state: 'loading' } | { state: 'done'; detail: Detail | null } | { state: 'error'; message: string };

export function DetailDrawer({ selection, onClose }: { selection: Selection | null; onClose: () => void }) {
  const [status, setStatus] = useState<Status>({ state: 'loading' });

  useEffect(() => {
    if (!selection) return;
    let live = true;
    setStatus({ state: 'loading' });
    lookup(selection.kind, selection.name)
      .then((detail) => live && setStatus({ state: 'done', detail }))
      .catch((e: Error) => live && setStatus({ state: 'error', message: e.message }));
    return () => { live = false; };
  }, [selection]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!selection) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer tome" role="dialog" aria-label={selection.name}>
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        {/* scrolls inside the drawer so the tome frame stays put */}
        <div className="drawer-scroll">
        <h2>
          {status.state === 'done' && status.detail?.spell && <SchoolIcon school={status.detail.spell.school} className="school-icon drawer-school" />}
          {status.state === 'done' && status.detail ? status.detail.name : selection.name}
        </h2>
        {status.state === 'loading' && <p className="muted">Consulting the archives…</p>}
        {status.state === 'error' && <p className="muted">Couldn’t reach the API: {status.message}</p>}
        {status.state === 'done' && !status.detail && <p className="muted">No SRD entry for this one.</p>}
        {status.state === 'done' && status.detail && (
          <>
            <span className="source-tag">{status.detail.source}</span>
            <dl className="meta">
              {status.detail.meta.map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
            {status.detail.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          </>
        )}
        </div>
      </aside>
    </>
  );
}
