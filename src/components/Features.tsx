import type { Character } from '../lib/character';

export function Features({ c, variant }: { c: Character; variant?: string | null }) {
  return (
    <section className="card">
      <h2>Features &amp; Traits</h2>
      {[...c.features, ...c.tools].map((f) => (
        <details key={`${f.name}|${f.source}`} className="feature">
          <summary>
            {f.name}
            {variant && c.subclass && f.name === c.subclass.name && <span className="land-tag">{variant}</span>}{' '}
            <small>{f.source}</small>
          </summary>
          <p className="pre">{f.description}</p>
        </details>
      ))}
    </section>
  );
}
