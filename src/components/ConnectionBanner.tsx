import { useSyncExternalStore } from 'react';
import { connection, ping } from '../lib/client';

export function ConnectionBanner() {
  const online = useSyncExternalStore(connection.subscribe, connection.getSnapshot);
  if (online) return null;
  return (
    <div className="conn-banner" role="alert">
      Server not running: start it with <code>bun run start</code> (or <code>bun run dev</code>). Changes made now are not saved.
      <button className="btn small" onClick={() => void ping()}>Retry</button>
    </div>
  );
}
