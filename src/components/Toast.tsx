import { useSyncExternalStore } from 'react';
import { dismissToast, toastStore } from '../lib/toast';

export function Toasts() {
  const items = useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot);
  if (!items.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <button key={t.id} className={`toast k-slip ${t.tone}`} onClick={() => dismissToast(t.id)}>
          <span className="k-slip-wax" aria-hidden="true" />
          {t.text}
        </button>
      ))}
    </div>
  );
}
