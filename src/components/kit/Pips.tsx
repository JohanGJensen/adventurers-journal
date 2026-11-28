import { useEffect, useRef, useState } from 'react';

/** Slots or uses as pips. When one is spent it flares and burns out. */
export function Pips({ total, filled, label }: { total: number; filled: number; label?: string }) {
  const last = useRef(filled);
  const [burn, setBurn] = useState<number | null>(null);
  useEffect(() => {
    if (filled < last.current) {
      setBurn(filled);
      const t = setTimeout(() => setBurn(null), 1600);
      last.current = filled;
      return () => clearTimeout(t);
    }
    last.current = filled;
  }, [filled]);
  return (
    <span className="k-pips" role="img" aria-label={label ?? `${filled} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`k-pip ${i < filled ? 'on' : ''} ${i === burn ? 'burn' : ''}`} />
      ))}
    </span>
  );
}
