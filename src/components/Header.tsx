import type { Character } from '../lib/character';

export function Header({ c }: { c: Character }) {
  return (
    <header className="hero">
      {c.portrait ? (
        <img className="portrait" src={c.portrait} alt={`Portrait of ${c.name}`} />
      ) : (
        <div className="portrait portrait-initials" aria-hidden="true">
          {c.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('')}
        </div>
      )}
      <div className="hero-text">
        <h1>{c.name}</h1>
        <p className="subtitle">
          {c.race} · {c.className} {c.level}
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
