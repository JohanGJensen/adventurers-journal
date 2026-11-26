// Lets the player frame a portrait before it is saved: drag the picture inside the round frame, zoom with the
// slider, the wheel or +/-. The chosen square is what gets stored, so the sheet shows exactly what they framed.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cropPortrait, defaultCrop, loadImage } from '../lib/portrait';

/** Largest on-screen size of the round frame, in CSS pixels; phones get a smaller one. */
const MAX_VIEW = 260;
const MAX_ZOOM = 4;
/** How far one arrow key press moves the picture, in screen pixels. */
const STEP = 10;

interface View {
  zoom: number;
  /** top-left corner of the picture relative to the frame, in screen pixels (always <= 0) */
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function PortraitCropper({ image, onDone, onCancel }: { image: HTMLImageElement; onDone: (url: string) => void; onCancel: () => void }) {
  const [VIEW] = useState(() => clamp(window.innerWidth - 112, 160, MAX_VIEW));
  /** screen pixels per image pixel at zoom 1: the picture's short side just fills the frame */
  const base = VIEW / Math.min(image.width, image.height);

  /** Keeps the picture covering the whole frame. */
  const fit = useCallback(
    (v: View): View => {
      const zoom = clamp(v.zoom, 1, MAX_ZOOM);
      const s = base * zoom;
      return { zoom, x: clamp(v.x, VIEW - image.width * s, 0), y: clamp(v.y, VIEW - image.height * s, 0) };
    },
    [base, image, VIEW],
  );

  const [view, setView] = useState<View>(() => {
    const c = defaultCrop(image);
    return { zoom: 1, x: -c.x * base, y: -c.y * base };
  });

  /** Zooms around the centre of the frame, so what is in the middle stays there. */
  const zoomTo = useCallback(
    (zoom: number) =>
      setView((v) => {
        const z = clamp(zoom, 1, MAX_ZOOM);
        const ratio = z / v.zoom;
        return fit({ zoom: z, x: VIEW / 2 - (VIEW / 2 - v.x) * ratio, y: VIEW / 2 - (VIEW / 2 - v.y) * ratio });
      }),
    [fit, VIEW],
  );

  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; px: number; py: number; x: number; y: number } | null>(null);

  // The wheel needs a non-passive listener, or the page scrolls behind the dialog.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((v) => {
        const z = clamp(v.zoom * Math.exp(-e.deltaY * 0.0015), 1, MAX_ZOOM);
        const ratio = z / v.zoom;
        return fit({ zoom: z, x: VIEW / 2 - (VIEW / 2 - v.x) * ratio, y: VIEW / 2 - (VIEW / 2 - v.y) * ratio });
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [fit, VIEW]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const use = () => {
    const s = base * view.zoom;
    const side = VIEW / s;
    onDone(cropPortrait(image, { x: -view.x / s, y: -view.y / s, side }));
  };

  const s = base * view.zoom;
  return createPortal(
    <>
      <div className="scrim" onClick={onCancel} />
      <div className="dialog tome portrait-cropper" role="dialog" aria-label="Frame the portrait">
        <h2>Frame the portrait</h2>
        <p className="muted">Drag the picture to move it; zoom with the slider or the mouse wheel.</p>
        <div
          ref={frame}
          className="portrait-crop"
          style={{ width: VIEW, height: VIEW }}
          tabIndex={0}
          role="application"
          aria-label="Portrait framing: arrow keys move the picture, plus and minus zoom"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { id: e.pointerId, px: e.clientX, py: e.clientY, x: view.x, y: view.y };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || d.id !== e.pointerId) return;
            setView((v) => fit({ ...v, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onKeyDown={(e) => {
            const move: Record<string, [number, number]> = { ArrowLeft: [STEP, 0], ArrowRight: [-STEP, 0], ArrowUp: [0, STEP], ArrowDown: [0, -STEP] };
            if (move[e.key]) {
              const [dx, dy] = move[e.key];
              setView((v) => fit({ ...v, x: v.x + dx, y: v.y + dy }));
            } else if (e.key === '+' || e.key === '=') zoomTo(view.zoom * 1.1);
            else if (e.key === '-') zoomTo(view.zoom / 1.1);
            else return;
            e.preventDefault();
          }}
        >
          <img
            src={image.src}
            alt=""
            draggable={false}
            style={{ width: image.width * s, height: image.height * s, transform: `translate(${view.x}px, ${view.y}px)` }}
          />
        </div>
        <label className="portrait-zoom">
          <span>Zoom</span>
          <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={view.zoom} onChange={(e) => zoomTo(Number(e.target.value))} />
        </label>
        <div className="row-form">
          <button type="button" className="btn" onClick={use}>Use portrait</button>
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </>,
    document.body,
  );
}

/**
 * Picks a portrait with the framing dialog. `pick(file)` loads the image (throwing if it isn't one), opens the
 * dialog, and resolves with the framed data URL, or null if the player cancels. Render `dialog` somewhere.
 */
export function usePortraitPicker(): { pick: (file: File) => Promise<string | null>; dialog: ReactNode } {
  const [open, setOpen] = useState<{ image: HTMLImageElement; resolve: (url: string | null) => void } | null>(null);

  const pick = useCallback(async (file: File) => {
    const image = await loadImage(file);
    return new Promise<string | null>((resolve) => setOpen({ image, resolve }));
  }, []);

  const finish = useCallback(
    (url: string | null) => {
      open?.resolve(url);
      setOpen(null);
    },
    [open],
  );
  const cancel = useCallback(() => finish(null), [finish]);

  const dialog = open ? <PortraitCropper image={open.image} onDone={finish} onCancel={cancel} /> : null;
  return { pick, dialog };
}
