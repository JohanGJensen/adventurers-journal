import { useEffect, useRef, useState } from 'react';

/** Hit points as liquid in a glass vial: class colour when healthy, gilt when hurt, wax red when low. Shakes on damage. */
export function Vial({ value, max, temp = 0, label = 'Hit points' }: { value: number; max: number; temp?: number; label?: string }) {
  const last = useRef(value);
  const [hit, setHit] = useState(false);
  useEffect(() => {
    if (value < last.current) {
      setHit(true);
      const t = setTimeout(() => setHit(false), 500);
      last.current = value;
      return () => clearTimeout(t);
    }
    last.current = value;
  }, [value]);
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const tempPct = max > 0 ? Math.min(100 - pct, (temp / max) * 100) : 0;
  const band = pct > 60 ? 'high' : pct > 30 ? 'mid' : 'low';
  return (
    <div className={`k-vial ${hit ? 'hit' : ''}`} role="img" aria-label={`${label} ${value} of ${max}${temp ? `, ${temp} temporary` : ''}`}>
      <span className={`k-liquid ${band}`} style={{ width: `${pct}%` }}>
        <span className="k-bubble" style={{ left: '20%' }} />
        <span className="k-bubble" style={{ left: '45%', animationDelay: '1.1s' }} />
        <span className="k-bubble" style={{ left: '70%', animationDelay: '2s' }} />
      </span>
      {tempPct > 0 && <span className="k-temp" style={{ left: `${pct}%`, width: `${tempPct}%` }} />}
    </div>
  );
}
