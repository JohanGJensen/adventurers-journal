// The character creation wizard (/new): class → species → background → abilities → skills → equipment
// → spells → details → review, then POST /characters with a sheet built by lib/create.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildCharacter, type Character } from '../../lib/character';
import {
  CUSTOM_BACKGROUND,
  STEP_LABEL,
  buildSheet,
  customBackground,
  emptyDraft,
  finalScores,
  stepIssues,
  stepsFor,
  type CreateData,
  type CreateDraft,
  type Step,
} from '../../lib/create';
import { fetchCreate } from '../../lib/api';
import { api } from '../../lib/client';
import { linkTo, navigate } from '../../lib/router';
import { toast } from '../../lib/toast';
import { ABILITIES, fmt, modifier } from '../../lib/rules';
import type { Campaign, CharacterDto, CreateBackground, CreateClass, CreateOptions, CreateSpecies } from '../../shared/types';
import { ClassEmblem } from '../ClassEmblem';
import { DetailDrawer, type Selection } from '../DetailDrawer';
import {
  AbilitiesStep,
  BackgroundStep,
  ClassStep,
  DetailsStep,
  EquipmentStep,
  ReviewStep,
  SkillsStep,
  SpeciesStep,
  SpellsStep,
} from './steps';
import { Loader } from '../Loader';

const DRAFT_KEY = 'create-draft-v1';

interface Saved {
  draft: CreateDraft;
  step: Step;
  campaignId: number | '';
}

function loadSaved(): Saved {
  const fresh: Saved = { draft: emptyDraft(), step: 'class', campaignId: '' };
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return fresh;
    const s = JSON.parse(raw) as Partial<Saved>;
    return { draft: { ...fresh.draft, ...s.draft }, step: s.step ?? 'class', campaignId: s.campaignId ?? '' };
  } catch {
    return fresh;
  }
}

function clearSaved() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* storage unavailable */
  }
}

type Load<T> = { state: 'idle' } | { state: 'loading' } | { state: 'done'; data: T } | { state: 'error'; message: string };

/** Loads a creation lookup when `path` is set; `attempt` retries after an error. */
function useCreate<T>(path: string | null, attempt: number): Load<T> {
  const [s, setS] = useState<Load<T>>({ state: 'idle' });
  useEffect(() => {
    if (!path) return setS({ state: 'idle' });
    let live = true;
    setS({ state: 'loading' });
    fetchCreate<T>(path)
      .then((data) => live && setS({ state: 'done', data }))
      .catch((e: Error) => live && setS({ state: 'error', message: e.message }));
    return () => {
      live = false;
    };
  }, [path, attempt]);
  return s;
}

const dataOf = <T,>(l: Load<T>) => (l.state === 'done' ? l.data : null);

export function CreateCharacter() {
  const [saved] = useState(loadSaved);
  const [d, setD] = useState<CreateDraft>(saved.draft);
  const [step, setStep] = useState<Step>(saved.step);
  const [campaignId, setCampaignId] = useState<number | ''>(saved.campaignId);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);

  const patch = useCallback((p: Partial<CreateDraft>) => setD((prev) => ({ ...prev, ...p })), []);

  useEffect(() => {
    document.title = 'New character · Adventurers Journal';
    api<Campaign[]>('GET', '/campaigns').then((r) => r.data && setCampaigns(r.data));
  }, []);

  // Keep the draft across reloads and visits; cleared on create or "Start over".
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ draft: d, step, campaignId } satisfies Saved));
    } catch {
      /* storage unavailable: the draft lives only in this page */
    }
  }, [d, step, campaignId]);

  // The page wears the chosen class's colours, like the sheet.
  useEffect(() => {
    const root = document.documentElement;
    if (d.classIndex) root.dataset.class = d.classIndex;
    else delete root.dataset.class;
    return () => {
      delete root.dataset.class;
    };
  }, [d.classIndex]);

  const optionsLoad = useCreate<CreateOptions>('options', attempt);
  const clsLoad = useCreate<CreateClass>(d.classIndex ? `class/${d.classIndex}` : null, attempt);
  const speciesLoad = useCreate<CreateSpecies>(d.speciesIndex ? `species/${d.speciesIndex}` : null, attempt);
  const bgLoad = useCreate<CreateBackground>(
    d.backgroundIndex && d.backgroundIndex !== CUSTOM_BACKGROUND ? `background/${d.backgroundIndex}` : null,
    attempt,
  );
  const options = dataOf(optionsLoad);
  const loadError = [optionsLoad, clsLoad, speciesLoad, bgLoad].find((l) => l.state === 'error') as
    | { state: 'error'; message: string }
    | undefined;

  const data: CreateData = useMemo(() => {
    const originFeats = options?.originFeats ?? [];
    return {
      cls: dataOf(clsLoad),
      species: dataOf(speciesLoad),
      background: d.backgroundIndex === CUSTOM_BACKGROUND ? customBackground(d.custom, originFeats) : dataOf(bgLoad),
      originFeats,
      alignments: options?.alignments ?? [],
    };
  }, [options, clsLoad, speciesLoad, bgLoad, d.backgroundIndex, d.custom]);

  const steps = stepsFor(d, data);
  const issues = stepIssues(d, data);
  const current = steps.includes(step) ? step : steps[Math.min(steps.length - 1, steps.indexOf('details'))];
  const idx = steps.indexOf(current);
  // A step is reachable when every step before it is done.
  const firstOpen = steps.findIndex((s) => issues[s].length > 0);
  const reachable = (i: number) => firstOpen === -1 || i <= firstOpen;
  const go = (s: Step) => {
    setStep(s);
    window.scrollTo(0, 0);
  };

  // The derived sheet, as the app will show it. Null until class, species and background are known.
  const preview: Character | null = useMemo(() => {
    try {
      const { sheet, extras } = buildSheet(d, data);
      return buildCharacter(sheet, extras);
    } catch {
      return null;
    }
  }, [d, data]);

  const create = async () => {
    setSaving(true);
    try {
      const { sheet, extras } = buildSheet(d, data);
      const r = await api<CharacterDto>('POST', '/characters', { sheet, extras, campaignId: campaignId || null });
      if (r.error !== undefined) return toast(`Could not create: ${r.error}`, 'error');
      clearSaved();
      toast(`${r.data.name} joins the journal`);
      navigate(`/c/${r.data.id}`);
    } finally {
      setSaving(false);
    }
  };

  const startOver = () => {
    if (!confirm('Start over? Your choices so far are discarded.')) return;
    clearSaved();
    setD(emptyDraft());
    setCampaignId('');
    go('class');
  };

  const openSpell = useCallback((name: string) => setSelection({ kind: 'spells', name }), []);
  const closeDrawer = useCallback(() => setSelection(null), []);

  const stepProps = options ? { d, data, options, patch } : null;

  return (
    <main className="sheet create-page">
      <nav className="sheet-nav">
        <a {...linkTo('/')}>← All characters</a>
      </nav>
      <header className="list-head">
        <h1>New character</h1>
        <button type="button" className="btn ghost small start-over" onClick={startOver}>
          Start over
        </button>
      </header>

      <ol className="create-steps" aria-label="Steps">
        {steps.map((s, i) => {
          // Done only once every step before it is done too (Equipment has no issues before a class is chosen).
          const done = issues[s].length === 0 && s !== 'review' && (firstOpen === -1 || i < firstOpen);
          return (
            <li key={s} className={`${s === current ? 'now' : ''} ${done ? 'done' : ''}`}>
              <button type="button" disabled={!reachable(i)} aria-current={s === current ? 'step' : undefined} onClick={() => go(s)}>
                <span className="step-num">{done ? '✓' : i + 1}</span>
                <span className="step-name">{STEP_LABEL[s]}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {loadError && (
        <div className="card create-error">
          <p>Couldn’t reach the rules archive ({loadError.message}).</p>
          <button type="button" className="btn ghost small" onClick={() => setAttempt((a) => a + 1)}>
            Retry
          </button>
        </div>
      )}

      <div className="create-layout">
        <div className="create-main">
          {!stepProps ? (
            !loadError && <Loader size="page" label="Consulting the archives" />
          ) : (
            <>
              {current === 'class' && <ClassStep {...stepProps} />}
              {current === 'species' && <SpeciesStep {...stepProps} />}
              {current === 'background' && <BackgroundStep {...stepProps} />}
              {current === 'abilities' && <AbilitiesStep {...stepProps} />}
              {current === 'skills' && <SkillsStep {...stepProps} />}
              {current === 'equipment' && <EquipmentStep {...stepProps} />}
              {current === 'spells' && <SpellsStep {...stepProps} preview={preview} onOpenSpell={openSpell} />}
              {current === 'details' && (
                <DetailsStep {...stepProps} campaigns={campaigns} campaignId={campaignId} onCampaign={setCampaignId} />
              )}
              {current === 'review' && (
                <ReviewStep c={preview}>
                  {firstOpen !== -1 && steps[firstOpen] !== 'review' && (
                    <p className="hint warn">
                      Still to do: {steps.filter((s) => issues[s].length).map((s) => STEP_LABEL[s]).join(', ')}.
                    </p>
                  )}
                </ReviewStep>
              )}
            </>
          )}

          <footer className="create-foot">
            {issues[current].length > 0 && <span className="hint">{issues[current][0]}</span>}
            <button type="button" className="btn ghost" disabled={idx === 0 || saving} onClick={() => go(steps[idx - 1])}>
              Back
            </button>
            {current === 'review' ? (
              <button type="button" className="btn" disabled={firstOpen !== -1 && steps[firstOpen] !== 'review' || saving || !preview} onClick={create}>
                {saving ? 'Creating…' : 'Create character'}
              </button>
            ) : (
              <button type="button" className="btn" disabled={issues[current].length > 0} onClick={() => go(steps[idx + 1])}>
                Next: {STEP_LABEL[steps[idx + 1]]}
              </button>
            )}
          </footer>
        </div>

        <Summary d={d} data={data} preview={preview} />
      </div>

      <DetailDrawer selection={selection} onClose={closeDrawer} />
    </main>
  );
}

/** "Character so far": what's picked, with live scores. */
function Summary({ d, data, preview }: { d: CreateDraft; data: CreateData; preview: Character | null }) {
  const scores = finalScores(d, data.background);
  const lineage = data.species?.lineages.find((l) => l.index === d.lineage);
  return (
    <aside className="card create-summary" aria-label="Character so far">
      <div className="summary-head">
        {d.portrait ? (
          <img className="mini-portrait" src={d.portrait} alt="" />
        ) : (
          <span className="mini-portrait portrait-initials">
            <ClassEmblem classKey={d.classIndex || null} className="emblem" />
          </span>
        )}
        <div>
          <strong>{d.name.trim() || 'Unnamed'}</strong>
          <small>
            {[
              data.species ? (lineage && data.species.index !== 'goliath' ? `${lineage.label} ${data.species.name}` : data.species.name) : null,
              data.cls ? `${data.cls.name} 1` : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'Nothing chosen yet'}
          </small>
          {data.background && d.backgroundIndex && <small>{data.background.name}</small>}
        </div>
      </div>
      <div className="summary-scores">
        {ABILITIES.map((k) => (
          <div key={k}>
            <small>{k}</small>
            <strong>{scores[k]}</strong>
            <span>{fmt(modifier(scores[k]))}</span>
          </div>
        ))}
      </div>
      {preview && (
        <dl className="facts">
          <div><dt>HP</dt><dd>{preview.hitPoints}</dd></div>
          <div><dt>AC</dt><dd>{preview.armorClass}</dd></div>
          <div><dt>Speed</dt><dd>{preview.speed} ft.</dd></div>
          <div><dt>Skills</dt><dd>{preview.skills.filter((s) => s.proficient).length}</dd></div>
        </dl>
      )}
    </aside>
  );
}
