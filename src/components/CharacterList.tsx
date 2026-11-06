import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/client';
import { linkTo, navigate } from '../lib/router';
import { toast } from '../lib/toast';
import type { Campaign, CharacterDto, CharacterSummary } from '../shared/types';

const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('');

export function CharacterList() {
  const [chars, setChars] = useState<CharacterSummary[] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [newCampaign, setNewCampaign] = useState('');
  const [importCampaign, setImportCampaign] = useState<number | ''>('');

  const refresh = useCallback(async () => {
    const [c, k] = await Promise.all([api<CharacterSummary[]>('GET', '/characters'), api<Campaign[]>('GET', '/campaigns')]);
    if (c.data) setChars(c.data);
    if (k.data) setCampaigns(k.data);
  }, []);

  useEffect(() => {
    document.title = 'Characters · D&D Tool';
    void refresh();
  }, [refresh]);

  const upload = async (file: File) => {
    let sheet: unknown;
    try {
      sheet = JSON.parse(await file.text());
    } catch {
      return toast(`${file.name} is not valid JSON`, 'error');
    }
    const r = await api<CharacterDto>('POST', '/characters', { sheet, campaignId: importCampaign || null });
    if (r.error !== undefined) return toast(r.error, 'error');
    toast(`Added ${r.data.name}`);
    navigate(`/c/${r.data.id}`);
  };

  const addCampaign = async () => {
    if (!newCampaign.trim()) return;
    const r = await api<Campaign>('POST', '/campaigns', { name: newCampaign });
    if (r.error !== undefined) return toast(r.error, 'error');
    setNewCampaign('');
    void refresh();
  };

  const assign = async (id: number, campaignId: number | null) => {
    const r = await api('PATCH', `/characters/${id}`, { campaignId });
    if (r.error !== undefined) toast(r.error, 'error');
    void refresh();
  };

  const remove = async (c: CharacterSummary) => {
    if (!confirm(`Delete ${c.name}? Their play state, inventory, history and notes are deleted too.`)) return;
    const r = await api('DELETE', `/characters/${c.id}`);
    if (r.error !== undefined) toast(r.error, 'error');
    void refresh();
  };

  const removeCampaign = async (k: Campaign) => {
    if (!confirm(`Delete campaign “${k.name}”? Its notes are deleted; characters stay.`)) return;
    await api('DELETE', `/campaigns/${k.id}`);
    void refresh();
  };

  const groups: { key: string; title: string; items: CharacterSummary[] }[] = [
    ...campaigns.map((k) => ({ key: `k${k.id}`, title: k.name, items: (chars ?? []).filter((c) => c.campaignId === k.id) })),
    { key: 'none', title: campaigns.length ? 'No campaign' : 'Characters', items: (chars ?? []).filter((c) => c.campaignId === null) },
  ].filter((g) => g.items.length || g.key !== 'none' || !campaigns.length);

  return (
    <main className="sheet list-page">
      <header className="list-head">
        <h1>Characters</h1>
        <nav className="topnav">
          <a {...linkTo('/notes')}>Campaign notes</a>
        </nav>
      </header>

      {chars === null ? (
        <div className="loading">Loading…</div>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="char-group">
            <h2>{g.title}</h2>
            {!g.items.length && <p className="hint">No characters yet.</p>}
            <div className="char-cards">
              {g.items.map((c) => (
                <article key={c.id} className="card char-card">
                  <a className="char-link" {...linkTo(`/c/${c.id}`)}>
                    {c.portrait ? <img className="mini-portrait" src={c.portrait} alt="" /> : <span className="mini-portrait portrait-initials">{initials(c.name)}</span>}
                    <span>
                      <strong>{c.name}</strong>
                      <small>{c.subtitle}</small>
                    </span>
                  </a>
                  <div className="char-actions">
                    <select
                      aria-label={`Campaign for ${c.name}`}
                      value={c.campaignId ?? ''}
                      onChange={(e) => assign(c.id, e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">No campaign</option>
                      {campaigns.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                    </select>
                    <a className="btn ghost small" {...linkTo(`/c/${c.id}/log`)}>History</a>
                    <button className="btn ghost small" onClick={() => remove(c)} aria-label={`Delete ${c.name}`}>Delete</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))
      )}

      <div className="list-tools">
        <section className="card">
          <h2>Import a character</h2>
          <p className="hint">A character sheet export (JSON, same format as faelan.json).</p>
          <div className="row-form">
            <select aria-label="Campaign for the imported character" value={importCampaign} onChange={(e) => setImportCampaign(e.target.value ? Number(e.target.value) : '')}>
              <option value="">No campaign</option>
              {campaigns.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
            <label className="btn">
              Choose file…
              <input type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} />
            </label>
          </div>
        </section>

        <section className="card">
          <h2>Campaigns</h2>
          <ul className="plain">
            {campaigns.map((k) => (
              <li key={k.id}>
                <a {...linkTo(`/notes?campaign=${k.id}`)}>{k.name}</a>{' '}
                <button className="btn ghost small" onClick={() => removeCampaign(k)} aria-label={`Delete campaign ${k.name}`}>×</button>
              </li>
            ))}
          </ul>
          <form className="row-form" onSubmit={(e) => { e.preventDefault(); void addCampaign(); }}>
            <input value={newCampaign} onChange={(e) => setNewCampaign(e.target.value)} placeholder="New campaign name" aria-label="New campaign name" />
            <button className="btn" disabled={!newCampaign.trim()}>Add</button>
          </form>
        </section>
      </div>
    </main>
  );
}
