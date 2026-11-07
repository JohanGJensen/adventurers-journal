import type { Character } from '../lib/character';
import { MAX_LEVEL } from '../lib/rules';
import { ClassEmblem } from './ClassEmblem';

export function Header({ c, onLevelUp }: { c: Character; onLevelUp?: () => void }) {
  return (
    <header className="hero">
      <div className="portrait-frame">
        {c.portrait ? (
          <img className="portrait" src={c.portrait} alt={`Portrait of ${c.name}`} />
        ) : (
          <div className="portrait portrait-initials" aria-hidden="true">
            {c.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('')}
          </div>
        )}
        <span className="emblem-badge"><ClassEmblem classKey={c.classKey} title={c.className} /></span>
      </div>
      <div className="hero-text">
        <h1>{c.name}</h1>
        <p className="subtitle">
          {c.race} · {c.className} {c.level}
          {c.subclass && <> · {c.subclass.name}</>}
          {onLevelUp && c.level < MAX_LEVEL && (
            <button className="btn small level-up-btn" onClick={onLevelUp}>Level up</button>
          )}
        </p>
        <dl className="tags">
          <div><dt>Background</dt><dd>{c.background}</dd></div>
          <div title={c.alignmentDescription}><dt>Alignment</dt><dd>{c.alignment}</dd></div>
          <div><dt>Proficiency</dt><dd>+{c.profBonus}</dd></div>
        </dl>
      </div>
    </header>
  );
}
