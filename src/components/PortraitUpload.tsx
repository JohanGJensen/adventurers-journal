// Wraps a portrait so it can be replaced from an image file (or removed). Saves through PATCH /characters/:id.
import { useState, type ReactNode } from 'react';
import { api } from '../lib/client';
import { portraitFrom } from '../lib/portrait';
import { toast } from '../lib/toast';
import type { CharacterDto } from '../shared/types';

const Quill = () => (
  <svg className="portrait-upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 4c-6 1-11 5-13 12l-2 4" />
    <path d="M20 4c-1 5-4 9-9 11" />
    <path d="M9 13l3 3" />
  </svg>
);

export function PortraitUpload({
  characterId,
  name,
  hasPortrait,
  onSaved,
  compact = false,
  children,
}: {
  characterId: number;
  name: string;
  hasPortrait: boolean;
  onSaved: (dto: CharacterDto) => void;
  /** a small portrait (list cards): icon-only overlay */
  compact?: boolean;
  /** the portrait image or initials */
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);

  const save = async (portrait: string | null) => {
    setBusy(true);
    try {
      const r = await api<CharacterDto>('PATCH', `/characters/${characterId}`, { portrait });
      if (r.error !== undefined) return toast(`Could not save the portrait: ${r.error}`, 'error');
      onSaved(r.data);
      toast(portrait ? `New portrait for ${name}` : `Portrait removed from ${name}`);
    } finally {
      setBusy(false);
    }
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    let url: string;
    try {
      url = await portraitFrom(file);
    } catch (e) {
      return toast(e instanceof Error ? e.message : String(e), 'error');
    }
    await save(url);
  };

  const label = hasPortrait ? `Change ${name}’s portrait` : `Add a portrait for ${name}`;
  return (
    <div className={`portrait-upload ${compact ? 'compact' : ''} ${busy ? 'busy' : ''}`}>
      <label className="portrait-upload-label" title={label}>
        {children}
        <span className="portrait-upload-overlay" aria-hidden="true">
          <Quill />
          {!compact && <span>{busy ? 'Inking…' : hasPortrait ? 'Change portrait' : 'Add portrait'}</span>}
        </span>
        <input
          type="file"
          accept="image/*"
          className="visually-hidden"
          aria-label={label}
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            void pick(f);
          }}
        />
      </label>
      {hasPortrait && !busy && (
        <button
          type="button"
          className="portrait-remove"
          aria-label={`Remove ${name}’s portrait`}
          title="Remove portrait"
          onClick={() => confirm(`Remove ${name}’s portrait?`) && void save(null)}
        >
          ×
        </button>
      )}
    </div>
  );
}
