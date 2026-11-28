import { useEffect, useMemo, useState, type CSSProperties } from 'react';

/** The same scatter every render: a cheap seeded random. */
const rnd = (i: number) => {
  const x = Math.sin(i * 9301 + 49297) * 233280;
  return x - Math.floor(x);
};

/** Embers drifting up the wall behind the page. Paused while the window is hidden; gone with reduced motion. */
export function Embers({ count = 12 }: { count?: number }) {
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  const embers = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: `${Math.round(rnd(i) * 100)}%`,
        '--dur': `${(10 + rnd(i + 50) * 9).toFixed(1)}s`,
        '--del': `${(-rnd(i + 99) * 18).toFixed(1)}s`,
        '--drift': `${Math.round((rnd(i + 7) - 0.5) * 160)}px`,
      })),
    [count],
  );
  return (
    <div className={`k-embers ${hidden ? 'paused' : ''}`} aria-hidden="true">
      {embers.map((style, i) => (
        <span key={i} className="k-ember" style={style as CSSProperties} />
      ))}
    </div>
  );
}
