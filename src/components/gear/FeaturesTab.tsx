import type { Character } from '../../lib/character';
import type { Feature } from '../../data/supplement';
import type { PlayApi } from '../../hooks/usePlayState';
import { Parchment, Pips } from '../kit';

/** "Druid 3" → "Druid"; "Circle of the Land 3" → "Circle of the Land"; others as they are. */
const groupOf = (source: string) => source.replace(/\s+\d+$/, '').trim() || 'Other';

/**
 * The Features tab: features grouped by where they come from (class, subclass, species, background and feats), each
 * opening to its text under an illuminated initial. Features with limited uses show their pips and a Use button.
 */
export function FeaturesTab({ c, play }: { c: Character; play: PlayApi }) {
  const { state } = play;
  const groups = new Map<string, Feature[]>();
  for (const f of c.features) {
    const g = groupOf(f.source);
    groups.set(g, [...(groups.get(g) ?? []), f]);
  }
  // Class first, then the subclass, then everything else in the order it came.
  const rank = (g: string) => (g === c.className ? 0 : c.subclass && g === c.subclass.name ? 1 : 2);
  const ordered = [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));

  const usesOf = (f: Feature) => {
    if (/^wild shape$/i.test(f.name) && c.wildShapeUses > 0)
      return { left: c.wildShapeUses - state.wildShapeUsed, max: c.wildShapeUses, use: play.useWildShape, regain: play.restoreWildShape, note: 'short rest: one back' };
    const r = c.resources.find((x) => x.name.toLowerCase() === f.name.toLowerCase());
    if (r) return { left: r.max - (state.resourcesUsed[r.key] ?? 0), max: r.max, use: () => play.useResource(r.key), regain: () => play.restoreResource(r.key), note: `${r.recharge} rest` };
    return null;
  };

  return (
    <div className="k-features">
      {ordered.map(([group, features]) => (
        <Parchment as="section" gilt corners="top" className="k-card" key={group} aria-label={group}>
          <h2 className="k-h2">
            {group}
            <span className="k-h2-hint">{features.length} feature{features.length === 1 ? '' : 's'}</span>
          </h2>
          {features.map((f) => {
            const uses = usesOf(f);
            const variant = state.variant && c.subclass && f.name === c.subclass.name ? state.variant : null;
            return (
              <details key={`${f.name}|${f.source}`} className="k-feature">
                <summary>
                  <span className="k-feature-name">{f.name}</span>
                  {variant && <span className="k-chip">{variant}</span>}
                  <small>{f.source}</small>
                </summary>
                {uses && (
                  <div className="k-feature-uses">
                    <Pips total={uses.max} filled={uses.left} label={`${f.name}: ${uses.left} of ${uses.max} left`} />
                    <small>{uses.left} of {uses.max} · {uses.note}</small>
                    <button className="btn small" disabled={uses.left <= 0} onClick={uses.use}>Use</button>
                    <button className="k-x" disabled={uses.left >= uses.max} onClick={uses.regain} aria-label={`Regain a use of ${f.name}`} title="Regain one">+</button>
                  </div>
                )}
                {f.description && <p className="k-drop k-feature-text">{f.description}</p>}
              </details>
            );
          })}
        </Parchment>
      ))}
      {!c.features.length && <p className="k-hint">No features yet.</p>}
    </div>
  );
}
