import type { Character } from '../lib/character';
import { MAX_LEVEL } from '../lib/rules';
import type { CharacterDto } from '../shared/types';
import { ClassEmblem } from './ClassEmblem';
import { PortraitUpload } from './PortraitUpload';

export function Header({
  c,
  onLevelUp,
  characterId,
  onPortraitSaved,
}: {
  c: Character;
  onLevelUp?: () => void;
  /** with onPortraitSaved: the portrait can be replaced from an image file */
  characterId?: number;
  onPortraitSaved?: (dto: CharacterDto) => void;
}) {
  const portrait = c.portrait ? (
    <img className="portrait" src={c.portrait} alt={`Portrait of ${c.name}`} />
  ) : (
    <div className="portrait portrait-initials" aria-hidden="true">
      {c.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('')}
    </div>
  );
  return (
    <header className="hero">
      <div className="portrait-frame">
        {characterId !== undefined && onPortraitSaved ? (
          <PortraitUpload characterId={characterId} name={c.name} hasPortrait={!!c.portrait} onSaved={onPortraitSaved}>
            {portrait}
          </PortraitUpload>
        ) : (
          portrait
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
