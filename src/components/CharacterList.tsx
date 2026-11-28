import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/client';
import { buildCharacter } from '../lib/character';
import { linkTo, navigate } from '../lib/router';
import { toast } from '../lib/toast';
import type { Campaign, CharacterDto, CharacterSummary, PlayState } from '../shared/types';
import { ClassEmblem } from './ClassEmblem';
import { PortraitUpload } from './PortraitUpload';
import { Loader } from './Loader';
import { openPalette } from './CommandPalette';
import { CandleLight, Embers, Parchment, ParchmentPlaque, Plaque, ThemeSwitch } from './kit';

const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('');
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];

type Vitals = { hp: number; max: number; temp: number; conditions: string[]; concentration: string | null; className: string; level: number };

/** HP, conditions and class for each hero, so you see who's hurt before opening them. */
function useVitals(ids: number[]) {
  const [vitals, setVitals] = useState<Record<number, Vitals>>({});
  const key = ids.join(',');
  useEffect(() => {
    let live = true;
    for (const id of ids) {
      Promise.all([api<CharacterDto>('GET', `/characters/${id}`), api<{ state: PlayState }>('GET', `/characters/${id}/play`)]).then(([d, p]) => {
        if (!live || !d.data || !p.data) return;
        try {
          const c = buildCharacter(d.data.sheet, d.data.extras, d.data.levels, d.data.homebrew);
          const s = p.data.state;
          setVitals((v) => ({ ...v, [id]: { hp: s.hp, max: c.hitPoints, temp: s.tempHp, conditions: s.conditions, concentration: s.concentration, className: c.className, level: c.level } }));
        } catch {
          // A sheet that can't be built still gets its frame, just without vitals.
        }
      });
    }
    return () => {
      live = false;
    };
    // Refetch only when the set of heroes changes.
  }, [key]);
  return vitals;
}

/** The home page: every hero hangs in a gilt frame, grouped under their campaign's brass plaque. */
export function CharacterList() {
  const [chars, setChars] = useState<CharacterSummary[] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [newCampaign, setNewCampaign] = useState('');
  const [importCampaign, setImportCampaign] = useState<number | ''>('');
  const vitals = useVitals((chars ?? []).map((c) => c.id));

  const refresh = useCallback(async () => {
    const [c, k] = await Promise.all([api<CharacterSummary[]>('GET', '/characters'), api<Campaign[]>('GET', '/campaigns')]);
    if (c.data) setChars(c.data);
    if (k.data) setCampaigns(k.data);
  }, []);

  useEffect(() => {
    document.title = 'The Hall of Heroes · Adventurers Journal';
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
    if (!confirm(`Delete ${c.name}? Their play state, inventory and history are deleted too. Campaign notes stay.`)) return;
    const r = await api('DELETE', `/characters/${c.id}`);
    if (r.error !== undefined) toast(r.error, 'error');
    void refresh();
  };
  const removeCampaign = async (k: Campaign) => {
    if (!confirm(`Delete campaign “${k.name}”? Its notes are deleted; characters stay.`)) return;
    await api('DELETE', `/campaigns/${k.id}`);
    void refresh();
  };

  const all = chars ?? [];
  const groups = [
    ...campaigns.map((k) => ({ key: `k${k.id}`, campaign: k as Campaign | null, title: k.name, items: all.filter((c) => c.campaignId === k.id) })),
    { key: 'none', campaign: null, title: campaigns.length ? 'Wanderers' : 'Heroes', items: all.filter((c) => c.campaignId === null) },
  ].filter((g) => g.items.length || g.key !== 'none' || !campaigns.length);

  return (
    <main className="sheet k-hall">
      <Embers />
      <ParchmentPlaque title="The Hall of Heroes" subtitle={chars ? `${all.length} hero${all.length === 1 ? '' : 'es'} in ${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'}` : ' '}>
        <div className="k-hall-actions">
          <a className="btn" {...linkTo('/new')}>+ Raise a new hero</a>
          <a className="btn ghost" {...linkTo('/homebrew')}>Homebrew</a>
          <button className="btn ghost" onClick={openPalette}>Find &amp; roll <kbd>Ctrl K</kbd></button>
          <ThemeSwitch />
        </div>
      </ParchmentPlaque>

      {chars === null ? (
        <Loader size="page" label="Gathering the company" />
      ) : (
        groups.map((g) => {
          const member = g.items[0];
          return (
            <Parchment as="section" gilt key={g.key} className="k-hall-group" aria-labelledby={`g-${g.key}`}>
              <Plaque
                id={`g-${g.key}`}
                title={g.title}
                subtitle={g.campaign ? `${g.items.length} hero${g.items.length === 1 ? '' : 'es'}` : 'not in a campaign'}
              />
              {g.campaign && (
                <div className="k-hall-group-acts">
                  {member && <a className="btn ghost small" {...linkTo(`/c/${member.id}/notes`)}>Campaign notes</a>}
                  <button className="btn ghost small" onClick={() => removeCampaign(g.campaign!)} aria-label={`Delete campaign ${g.title}`}>Delete campaign</button>
                </div>
              )}
              <div className="k-frames">
                {g.items.map((c) => (
                  <Hero key={c.id} c={c} v={vitals[c.id]} campaigns={campaigns} onSaved={() => void refresh()} onAssign={(k) => assign(c.id, k)} onRemove={() => remove(c)} />
                ))}
                {g.campaign && (
                  <a className="k-hero empty" {...linkTo(`/new?campaign=${g.campaign.id}`)}>
                    <span className="k-frame"><span className="k-canvas"><span className="k-wax" aria-hidden="true">+</span></span></span>
                    <span className="k-hero-name">Add a hero to {g.title}</span>
                    <span className="k-hero-sub">They’ll share its notes</span>
                  </a>
                )}
              </div>
              {!g.items.length && !g.campaign && <p className="k-hint">No heroes yet.</p>}
            </Parchment>
          );
        })
      )}

      <div className="k-hall-tools">
        <Parchment as="section" gilt className="k-card">
          <h2 className="k-h2">Campaigns</h2>
          <form className="k-row-form" onSubmit={(e) => { e.preventDefault(); void addCampaign(); }}>
            <label className="k-sr" htmlFor="k-new-campaign">New campaign name</label>
            <input id="k-new-campaign" value={newCampaign} onChange={(e) => setNewCampaign(e.target.value)} placeholder="New campaign name" />
            <button className="btn" disabled={!newCampaign.trim()}>Start a campaign</button>
          </form>
        </Parchment>
        <Parchment as="section" gilt className="k-card">
          <h2 className="k-h2">Import a hero</h2>
          <p className="k-hint">A character sheet export (JSON, the same format as faelan.json).</p>
          <div className="k-row-form">
            <select aria-label="Campaign for the imported hero" value={importCampaign} onChange={(e) => setImportCampaign(e.target.value ? Number(e.target.value) : '')}>
              <option value="">No campaign</option>
              {campaigns.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
            <label className="btn ghost">
              Choose file…
              <input type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} />
            </label>
          </div>
        </Parchment>
      </div>
    </main>
  );
}

function Hero({ c, v, campaigns, onSaved, onAssign, onRemove }: { c: CharacterSummary; v?: Vitals; campaigns: Campaign[]; onSaved: () => void; onAssign: (k: number | null) => void; onRemove: () => void }) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('mousedown', close);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('mousedown', close);
    };
  }, [menu]);

  const pct = v && v.max ? Math.max(0, Math.min(100, (v.hp / v.max) * 100)) : 100;
  const hurt = v ? v.hp < v.max : false;
  return (
    <div className="k-hero" data-class={c.classKey ?? undefined}>
      <span className="k-frame">
        <span className="k-canvas">
          <PortraitUpload characterId={c.id} name={c.name} hasPortrait={!!c.portrait} onSaved={onSaved}>
            {c.portrait ? <img src={c.portrait} alt={`Portrait of ${c.name}`} /> : <span className="k-canvas-ini" aria-hidden="true">{initials(c.name)}</span>}
          </PortraitUpload>
          <CandleLight />
        </span>
      </span>
      <span className="k-hero-pennant" aria-hidden="true">
        <ClassEmblem classKey={c.classKey} className="emblem" />
        <b>{v ? ROMAN[v.level] ?? v.level : ''}</b>
      </span>
      <a className="k-hero-name" {...linkTo(`/c/${c.id}`)}>{c.name}</a>
      <span className="k-hero-sub">{c.subtitle}</span>
      {v && (
        <>
          <span className="k-hpbar" role="img" aria-label={`Hit points ${v.hp} of ${v.max}`}><i style={{ width: `${pct}%` }} className={pct <= 30 ? 'low' : pct <= 60 ? 'mid' : ''} /></span>
          <span className="k-hero-vit">
            <span className={`k-chip ${hurt ? 'red' : ''}`}>HP <strong>{v.hp}</strong>/{v.max}</span>
            {v.temp > 0 && <span className="k-chip blue">+{v.temp} temp</span>}
            {v.concentration && <span className="k-chip blue">C: {v.concentration}</span>}
            {v.conditions.map((x) => <span key={x} className="k-chip red">{x}</span>)}
          </span>
        </>
      )}
      <div className="k-hero-menu" ref={ref}>
        <button className="btn ghost small" aria-haspopup="true" aria-expanded={menu} aria-label={`More for ${c.name}: campaign, history, delete`} onClick={() => setMenu((m) => !m)}>⋯</button>
        {menu && (
          <div className="k-menu k-parch" role="menu">
            <label className="k-menu-field">
              <span className="k-vl">Campaign</span>
              <select value={c.campaignId ?? ''} onChange={(e) => { onAssign(e.target.value ? Number(e.target.value) : null); setMenu(false); }}>
                <option value="">No campaign</option>
                {campaigns.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </label>
            <a role="menuitem" {...linkTo(`/c/${c.id}/log`)}>History</a>
            <button role="menuitem" onClick={() => { setMenu(false); onRemove(); }}>Delete {c.name}</button>
          </div>
        )}
      </div>
    </div>
  );
}
