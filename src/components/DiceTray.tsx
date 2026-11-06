import { useState } from 'react';
import { useDice } from '../lib/dice';

const DICE = [4, 6, 8, 10, 12, 20, 100];

export function DiceTray() {
  const { log, roll, clear, active, cinematic, setCinematic } = useDice();
  const [open, setOpen] = useState(false);
  const last = log[0];

  return (
    <div className={`tray ${open ? 'open' : ''}`}>
      {last && !open && !active && (
        <button className={`toast ${crit(last.natural)}`} onClick={() => setOpen(true)} key={last.id}>
          <span>{last.label}</span>
          <strong>{last.total}</strong>
        </button>
      )}
      {open && (
        <div className="tray-panel">
          <div className="tray-mode" role="radiogroup" aria-label="Roll style">
            <button role="radio" aria-checked={cinematic} className={`chip ${cinematic ? 'sel' : ''}`} onClick={() => setCinematic(true)}>Cinematic</button>
            <button role="radio" aria-checked={!cinematic} className={`chip ${!cinematic ? 'sel' : ''}`} onClick={() => setCinematic(false)}>Quick</button>
          </div>
          <div className="tray-dice">
            {DICE.map((d) => (
              <button key={d} className="die" onClick={() => roll(`d${d}`, d)}>d{d}</button>
            ))}
          </div>
          <ul className="log">
            {log.length === 0 && <li className="muted">No rolls yet</li>}
            {log.map((r) => (
              <li key={r.id} className={crit(r.natural)}>
                <div>
                  <span className="log-label">{r.label}</span>
                  <span className="log-expr">
                    {r.mode !== 'normal' && <em>{r.mode === 'advantage' ? 'adv' : 'dis'} </em>}
                    [{r.dice.join(', ')}]{r.mode !== 'normal' ? ` → ${r.kept[0]}` : ''}
                    {r.modifier ? (r.modifier > 0 ? ` + ${r.modifier}` : ` − ${-r.modifier}`) : ''}
                  </span>
                </div>
                <strong>{r.total}</strong>
              </li>
            ))}
          </ul>
          {log.length > 0 && <button className="btn ghost small" onClick={clear}>Clear log</button>}
        </div>
      )}
      <button className="tray-toggle" onClick={() => setOpen((o) => !o)} aria-label="Dice tray">🎲</button>
    </div>
  );
}

const crit = (n?: number) => (n === 20 ? 'nat20' : n === 1 ? 'nat1' : '');
