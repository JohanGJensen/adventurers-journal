// The arcane sigil shown while something loads: a ring of runes turns, a circle and a star ink themselves in,
// and the core glows in the class colour. Drawn from strokes (no runic font needed).

/** Elder Futhark shapes in a 6×10 box centred on 0,0: fehu, raidho, thurisaz, ansuz, algiz, mannaz, dagaz, othala. */
const RUNES = [
  'M-2 5V-5M-2-1.5L2-4.5M-2 2L2-1',
  'M-2 5V-5L2-2.5L-2 0L2 5',
  'M-2 5V-5M-2-2.5L1.5 0L-2 2.5',
  'M-2 5V-5L2-2M-2-1L2 2',
  'M0 5V-5M0-.5L-3-4.5M0-.5L3-4.5',
  'M-2.5 5V-5L2.5 0M2.5 5V-5L-2.5 0',
  'M-3-5L3 5V-5L-3 5Z',
  'M-3 5L2.5-.5L0-4.5L-2.5-.5L3 5',
];

/** Two interlaced triangles inscribed in a circle of radius 26 around 50,50. */
const TRI_UP = '50,24 72.5,63 27.5,63';
const TRI_DOWN = '50,76 72.5,37 27.5,37';

export function Loader({ label, size = 'inline' }: { label: string; size?: 'page' | 'inline' }) {
  return (
    <div className={`loader loader-${size}`} role="status" aria-live="polite">
      <svg className="loader-sigil" viewBox="0 0 100 100" aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <g className="sigil-runes" strokeWidth="1.2">
          <circle cx="50" cy="50" r="47" strokeWidth=".6" strokeDasharray="1.5 3" opacity=".6" />
          {RUNES.map((d, i) => (
            <path key={i} d={d} transform={`rotate(${i * 45} 50 50) translate(50 10)`} />
          ))}
          <circle cx="50" cy="50" r="36" strokeWidth=".6" opacity=".6" />
        </g>
        <circle className="sigil-draw" cx="50" cy="50" r="30" pathLength={1} strokeWidth="1.4" />
        <polygon className="sigil-draw d2" points={TRI_UP} pathLength={1} strokeWidth="1.1" />
        <polygon className="sigil-draw d3" points={TRI_DOWN} pathLength={1} strokeWidth="1.1" />
        <circle className="sigil-draw d4" cx="50" cy="50" r="11" pathLength={1} strokeWidth="1" />
        <circle className="sigil-core" cx="50" cy="50" r="5" stroke="none" />
      </svg>
      <span className="loader-label">{label}</span>
    </div>
  );
}
