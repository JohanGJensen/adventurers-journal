import type { Character } from '../lib/character';

export function Features({ c }: { c: Character }) {
  return (
    <section className="card">
      <h2>Features &amp; Traits</h2>
      {[...c.features, ...c.tools].map((f) => (
        <details key={f.name} className="feature">
          <summary>{f.name} <small>{f.source}</small></summary>
          <p>{f.description}</p>
        </details>
      ))}
    </section>
  );
}
