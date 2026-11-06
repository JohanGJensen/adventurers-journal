import { useState } from 'react';
import { forceImport } from '../lib/autoImport';
import { downloadLocalExport, markMigrated } from '../lib/localExport';
import type { LocalExport } from '../shared/types';

/** Shown when this browser has old local data but the server already has data for the character. */
export function ImportConflictDialog({
  characterId,
  payload,
  onDone,
}: {
  characterId: number;
  payload: LocalExport;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const p = payload.playState;
  return (
    <div className="modal-backdrop">
      <div className="modal card" role="dialog" aria-modal="true" aria-labelledby="import-conflict-title">
        <h2 id="import-conflict-title">Server already has data for this character</h2>
        <p>
          This browser still has play state and inventory saved from before the server existed
          {p?.hp !== undefined ? ` (HP ${p.hp})` : ''}. Which copy should be kept?
        </p>
        <div className="modal-actions">
          <button
            className="btn danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              if (await forceImport(characterId, payload)) onDone();
              setBusy(false);
            }}
          >
            Overwrite with this browser’s data
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() => {
              markMigrated();
              onDone();
            }}
          >
            Keep server data
          </button>
          <button className="btn ghost" disabled={busy} onClick={() => downloadLocalExport()}>
            Download local data
          </button>
        </div>
        <small>Either way the local copy is kept in this browser under a “.migrated” name.</small>
      </div>
    </div>
  );
}
