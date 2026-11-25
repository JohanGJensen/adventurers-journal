// Cartographer's journey map: a hex grid the player paints as the party travels, with freehand lines (trails, roads,
// rivers, borders), pins and free text. A painted hex starts as a pencil sketch; charting it takes a Cartographer's Tools
// check (Utilize: draft a map of a small area, DC 15) rolled at the table, and a pass inks it in.
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { api } from '../lib/client';
import { buildCharacter, type Character } from '../lib/character';
import { linkTo } from '../lib/router';
import { fmt, titleCase } from '../lib/rules';
import { toast } from '../lib/toast';
import { hasTool, toolRules } from '../data/tools';
import {
  MARK_KINDS,
  PATH_KINDS,
  TERRAINS,
  type CharacterDto,
  type JourneyMapDto,
  type MapHex,
  type MapMark,
  type MapPath,
  type MarkKind,
  type Note,
  type NoteKind,
  type PathKind,
  type Terrain,
} from '../shared/types';
import { Loader } from './Loader';

const TOOL = "Cartographer's Tools";
const CHART_DC = 15;
/** hex radius in map units (pointy-top) */
const S = 40;
const SQ3 = Math.sqrt(3);
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;

type Pt = [number, number];
const keyOf = (q: number, r: number) => `${q},${r}`;
const toPixel = (q: number, r: number): Pt => [S * SQ3 * (q + r / 2), S * 1.5 * r];

/** The hex under a map-space point (cube rounding). */
function toHex(x: number, y: number): Pt {
  const fq = ((SQ3 / 3) * x - y / 3) / S;
  const fr = ((2 / 3) * y) / S;
  const fs = -fq - fr;
  let q = Math.round(fq), r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return [q, r];
}

const CORNERS = Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 180) * (60 * i - 30);
  return [S * Math.cos(a), S * Math.sin(a)] as Pt;
});
const hexPoints = (inset = 0) => CORNERS.map(([x, y]) => `${(x * (S - inset)) / S},${(y * (S - inset)) / S}`).join(' ');
const HEX = hexPoints();
const HEX_INNER = hexPoints(3);

/* ---------- Pen strokes ---------- */

/** Terrain symbols, drawn in a ~32-unit box around the hex centre. */
const GLYPHS: Record<Terrain, string> = {
  plains: 'M-13 6 l2 -6 l2 6 M-3 1 l2 -6 l2 6 M7 7 l2 -6 l2 6',
  forest: 'M-12 5 l5 -13 l5 13 z M-7 5 v4 M2 8 l5 -15 l5 15 z M7 8 v4',
  hills: 'M-15 7 q7 -14 15 0 M-1 7 q8 -11 15 0 M-8 0 q2 -2 4 -2',
  mountains: 'M-16 9 L-5 -10 L3 3 L8 -4 L16 9 M-8 -5 l3 2 l3 -2',
  water: 'M-15 -4 q3.75 -4 7.5 0 t7.5 0 t7.5 0 t7.5 0 M-15 4 q3.75 -4 7.5 0 t7.5 0 t7.5 0 t7.5 0',
  swamp: 'M-14 7 h9 M2 7 h12 M-9 7 v-9 M-6 7 v-6 M-11 7 v-4 M7 7 v-11 M10 7 v-6 M4 7 v-4',
  desert: 'M-15 6 q8 -10 15 0 q7 -7 15 0 M-6 -6 h.1 M4 -9 h.1 M10 -3 h.1',
  road: 'M-17 9 C -7 5 3 -5 17 -9',
  settlement: 'M-9 8 v-9 l9 -8 l9 8 v9 z M-2 8 v-6 h4 v6 M5 -6 v-6 h3 v3',
  ruin: 'M-13 8 h26 M-9 8 v-12 l2 -1 M-4 8 v-7 M4 8 v-15 l2 1 M9 8 v-5',
  cave: 'M-13 8 q0 -19 13 -19 q13 0 13 19 M-5 8 q0 -9 5 -9 q5 0 5 9',
};

/** Pin icons, drawn in a ~20-unit box. */
const MARK_ICONS: Record<MarkKind, string> = {
  party: 'M-5 9 V-9 M-5 -9 L8 -5 L-5 -1',
  camp: 'M-9 7 L0 -8 L9 7 Z M0 -8 V7 M-3 7 L0 1 L3 7',
  battle: 'M-8 -8 L8 8 M8 -8 L-8 8 M-8 4 l4 4 M8 4 l-4 4',
  treasure: 'M-8 -1 h16 v8 h-16 z M-8 -1 q8 -9 16 0 M-1 1 h2 v3 h-2 z',
  danger: 'M0 -8 L9 7 H-9 Z M0 -3 v4 M0 4 v.4',
  quest: 'M-4 -5 q0 -4 4 -4 q4 0 4 4 q0 3 -4 4 v3 M0 6 v.4',
  npc: 'M-4 -4 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 M-8 8 q8 -11 16 0',
  text: 'M-7 -7 h14 M0 -7 v15',
};

const MARK_NAMES: Record<MarkKind, string> = {
  party: 'Party', camp: 'Camp', battle: 'Battle', treasure: 'Treasure', danger: 'Danger', quest: 'Quest', npc: 'Person', text: 'Text',
};
const PATH_NAMES: Record<PathKind, string> = { trail: 'Trail', road: 'Road', river: 'River', border: 'Border' };

const Glyph = ({ terrain, y = -6, scale = 1 }: { terrain: Terrain; y?: number; scale?: number }) => (
  <path className={`glyph glyph-${terrain}`} d={GLYPHS[terrain]} transform={`translate(0 ${y}) scale(${scale})`} />
);

/** A smooth curve through the points: quadratic segments via each pair's midpoint. */
function smoothPath(pts: Pt[]): string {
  if (pts.length < 3) return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    d += ` Q${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`;
  }
  const [lx, ly] = pts[pts.length - 1];
  return `${d} L${lx} ${ly}`;
}

/** Ramer–Douglas–Peucker: drop points within `tol` of the line, so a freehand stroke stays light. */
function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const len = Math.hypot(bx - ax, by - ay) || 1;
  let max = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((by - ay) * pts[i][0] - (bx - ax) * pts[i][1] + bx * ay - by * ax) / len;
    if (d > max) (max = d), (at = i);
  }
  if (max <= tol) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, at + 1), tol).slice(0, -1), ...simplify(pts.slice(at), tol)];
}

/** Map-space centre of everything drawn (origin when empty). */
function centreOf(map: JourneyMapDto): { cx: number; cy: number } {
  const pts: Pt[] = [...map.hexes.map((h) => toPixel(h.q, h.r)), ...map.marks.map((m) => [m.x, m.y] as Pt)];
  if (!pts.length) return { cx: 0, cy: 0 };
  return { cx: pts.reduce((a, p) => a + p[0], 0) / pts.length, cy: pts.reduce((a, p) => a + p[1], 0) / pts.length };
}

/* ---------- Tools ---------- */

type Tool = 'select' | 'paint' | 'draw' | 'mark' | 'text' | 'erase';
const TOOLS: { id: Tool; name: string; key: string; icon: string }[] = [
  { id: 'select', name: 'Select & move', key: 'v', icon: 'M-5 -8 L6 3 L1 3 L4 9 L1 10 L-2 4 L-5 7 Z' },
  { id: 'paint', name: 'Paint terrain', key: 'b', icon: hexPoints(30).split(' ').map((p, i) => `${i ? 'L' : 'M'}${p.replace(',', ' ')}`).join(' ') + ' Z' },
  { id: 'draw', name: 'Draw a line', key: 'd', icon: 'M-8 8 L-6 2 L5 -9 L9 -5 L-2 6 Z M3 -7 l4 4' },
  { id: 'mark', name: 'Place a pin', key: 'm', icon: 'M0 9 C-5 3 -6 0 -6 -2 A6 6 0 1 1 6 -2 C6 0 5 3 0 9 Z M0 -2 h.1' },
  { id: 'text', name: 'Write text', key: 't', icon: 'M-7 -7 h14 M0 -7 v15 M-3 8 h6' },
  { id: 'erase', name: 'Erase', key: 'e', icon: 'M-9 3 L1 -7 L9 1 L-1 11 Z M-5 7 L4 -2' },
];

type Selection = { type: 'hex'; q: number; r: number } | { type: 'mark'; id: number } | { type: 'path'; id: number } | null;

type Gesture =
  | { kind: 'pan'; x: number; y: number; cx: number; cy: number; moved: boolean; target: Hit }
  | { kind: 'move-mark'; x: number; y: number; id: number; from: Pt; moved: boolean }
  | { kind: 'paint'; done: Set<string> }
  | { kind: 'draw' }
  | { kind: 'erase' };

type Hit = { type: 'mark' | 'path'; id: number } | null;

/** The pin or line under an element, from the data attributes on the SVG. */
function hitOf(el: Element | null): Hit {
  const m = el?.closest('[data-mark]');
  if (m) return { type: 'mark', id: Number(m.getAttribute('data-mark')) };
  const p = el?.closest('[data-path]');
  if (p) return { type: 'path', id: Number(p.getAttribute('data-path')) };
  return null;
}

interface View {
  cx: number;
  cy: number;
  zoom: number;
}

type Undo = { label: string; run: () => Promise<void> };

export function MapPage({ characterId }: { characterId: number }) {
  const [dto, setDto] = useState<CharacterDto | null | { error: string }>(null);
  useEffect(() => {
    let live = true;
    api<CharacterDto>('GET', `/characters/${characterId}`).then((r) => live && setDto(r.data ?? { error: r.error }));
    return () => {
      live = false;
    };
  }, [characterId]);
  const c = useMemo(() => (dto && !('error' in dto) ? buildCharacter(dto.sheet, dto.extras, dto.levels, dto.homebrew) : null), [dto]);

  if (!dto) return <Loader size="page" label="Unrolling the map" />;
  if ('error' in dto || !c)
    return (
      <div className="loading">
        <p>{'error' in dto ? dto.error : 'Could not read this character.'}</p>
        <a {...linkTo('/')}>All characters</a>
      </div>
    );
  return <JourneyMap c={c} characterId={characterId} />;
}

function JourneyMap({ c, characterId }: { c: Character; characterId: number }) {
  const [map, setMap] = useState<JourneyMapDto | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tool, setTool] = useState<Tool>('paint');
  const [brush, setBrush] = useState<Terrain>('forest');
  const [pathKind, setPathKind] = useState<PathKind>('trail');
  const [markKind, setMarkKind] = useState<MarkKind>('camp');
  const [selection, setSelection] = useState<Selection>(null);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [hover, setHover] = useState<Pt | null>(null);
  const [view, setView] = useState<View>({ cx: 0, cy: 0, zoom: 1.4 });
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const centred = useRef(false);
  const gesture = useRef<Gesture | null>(null);
  const undos = useRef<Undo[]>([]);
  /** undo steps collected during one paint/erase stroke, pushed as a single step when it ends */
  const batch = useRef<(() => Promise<void>)[] | null>(null);
  // the latest map for handlers that outlive a render (pointer strokes, undo)
  const mapRef = useRef<JourneyMapDto | null>(null);
  mapRef.current = map;

  const base = `/characters/${characterId}/map`;

  const load = useCallback(async () => {
    const [m, n] = await Promise.all([api<JourneyMapDto>('GET', base), api<Note[]>('GET', `/notes?character=${characterId}`)]);
    if (m.error) toast(`Couldn't load the map: ${m.error}`, 'error');
    if (m.data) {
      // centre on what's been drawn the first time the map loads
      if (!centred.current) setView((v) => ({ ...v, ...centreOf(m.data!) }));
      centred.current = true;
      setMap(m.data);
    }
    if (n.data) setNotes(n.data);
  }, [base, characterId]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ---------- Store: optimistic writes, reloading on failure ---------- */

  const failed = (what: string, error: string) => {
    toast(`Couldn't ${what}: ${error}`, 'error');
    void load();
  };

  const putHex = async (h: MapHex) => {
    setMap((m) => m && { ...m, hexes: [...m.hexes.filter((x) => x.q !== h.q || x.r !== h.r), h] });
    const res = await api<MapHex>('PUT', `${base}/hexes`, h);
    if (res.error) failed('save the hex', res.error);
  };
  const delHex = async (q: number, r: number) => {
    setMap((m) => m && { ...m, hexes: m.hexes.filter((x) => x.q !== q || x.r !== r) });
    const res = await api('DELETE', `${base}/hexes?q=${q}&r=${r}`);
    if (res.error && res.status !== 404) failed('erase the hex', res.error);
  };
  const addPath = async (kind: PathKind, points: Pt[]): Promise<MapPath | null> => {
    const res = await api<MapPath>('POST', `${base}/paths`, { kind, points });
    if (!res.data) return failed('save the line', res.error), null;
    setMap((m) => m && { ...m, paths: [...m.paths, res.data!] });
    return res.data;
  };
  const delPath = async (id: number) => {
    setMap((m) => m && { ...m, paths: m.paths.filter((p) => p.id !== id) });
    const res = await api('DELETE', `${base}/paths/${id}`);
    if (res.error && res.status !== 404) failed('erase the line', res.error);
  };
  const addMark = async (m: Omit<MapMark, 'id'>): Promise<MapMark | null> => {
    const res = await api<MapMark>('POST', `${base}/marks`, m);
    if (!res.data) return failed('place the pin', res.error), null;
    setMap((x) => x && { ...x, marks: [...x.marks, res.data!] });
    return res.data;
  };
  const patchMark = async (id: number, patch: Partial<Omit<MapMark, 'id'>>) => {
    setMap((x) => x && { ...x, marks: x.marks.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
    const res = await api<MapMark>('PATCH', `${base}/marks/${id}`, patch);
    if (res.error) failed('update the pin', res.error);
  };
  const delMark = async (id: number) => {
    setMap((x) => x && { ...x, marks: x.marks.filter((m) => m.id !== id) });
    const res = await api('DELETE', `${base}/marks/${id}`);
    if (res.error && res.status !== 404) failed('remove the pin', res.error);
  };

  /* ---------- Undo ---------- */

  const record = (label: string, run: () => Promise<void>) => {
    if (batch.current) batch.current.push(run);
    else {
      undos.current = [...undos.current.slice(-49), { label, run }];
      setUndoCount(undos.current.length);
    }
  };
  const startBatch = () => (batch.current = []);
  const endBatch = (label: string) => {
    const steps = batch.current;
    batch.current = null;
    if (steps?.length) record(label, async () => { for (const s of [...steps].reverse()) await s(); });
  };
  const undo = async () => {
    const step = undos.current.pop();
    setUndoCount(undos.current.length);
    if (!step) return;
    setSelection(null);
    await step.run();
    toast(`Undid: ${step.label}`, 'info', 2000);
  };

  // Undo-aware edits used by the tools and the side panel.
  const editHex = (next: MapHex, label = 'edit hex') => {
    const prev = mapRef.current?.hexes.find((h) => h.q === next.q && h.r === next.r) ?? null;
    void putHex(next);
    record(label, () => (prev ? putHex(prev) : delHex(next.q, next.r)));
  };
  const eraseHex = (h: MapHex) => {
    void delHex(h.q, h.r);
    record('erase hex', () => putHex(h));
  };
  const erasePath = (p: MapPath) => {
    void delPath(p.id);
    record('erase line', async () => void (await addPath(p.kind, p.points)));
  };
  const eraseMark = (m: MapMark) => {
    void delMark(m.id);
    record(`remove ${MARK_NAMES[m.kind].toLowerCase()}`, async () => void (await addMark({ kind: m.kind, x: m.x, y: m.y, label: m.label, noteId: m.noteId })));
  };
  const editMark = (m: MapMark, patch: Partial<Omit<MapMark, 'id'>>, label = 'edit pin') => {
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, m[k as keyof MapMark]])) as Partial<MapMark>;
    void patchMark(m.id, patch);
    record(label, () => patchMark(m.id, before));
  };

  /* ---------- View ---------- */

  // Track the SVG's pixel size so the viewBox maps 1:1 at zoom 1.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [map === null]);

  const vb = { x: view.cx - size.w / 2 / view.zoom, y: view.cy - size.h / 2 / view.zoom, w: size.w / view.zoom, h: size.h / view.zoom };

  const toMap = (clientX: number, clientY: number): Pt => {
    const rect = svgRef.current!.getBoundingClientRect();
    return [vb.x + (clientX - rect.left) / view.zoom, vb.y + (clientY - rect.top) / view.zoom];
  };

  // Trackpad: two-finger scroll pans, pinch (or ⌘/Ctrl + wheel) zooms around the pointer.
  // Native listener: React's onWheel is passive and can't stop the page scrolling.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      setView((v) => {
        if (!e.ctrlKey && !e.metaKey) return { ...v, cx: v.cx + e.deltaX / v.zoom, cy: v.cy + e.deltaY / v.zoom };
        const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002))));
        const px = e.clientX - rect.left - rect.width / 2;
        const py = e.clientY - rect.top - rect.height / 2;
        return { zoom, cx: v.cx + px / v.zoom - px / zoom, cy: v.cy + py / v.zoom - py / zoom };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [map === null]);

  const zoomBy = (f: number) => setView((v) => ({ ...v, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * f)) }));
  const recentre = () => map && setView({ zoom: 1.4, ...centreOf(map) });

  /* ---------- Keyboard ---------- */

  const deleteSelection = () => {
    const m = mapRef.current;
    if (!m || !selection) return;
    if (selection.type === 'hex') {
      const h = m.hexes.find((x) => x.q === selection.q && x.r === selection.r);
      if (h) eraseHex(h);
    } else if (selection.type === 'mark') {
      const mk = m.marks.find((x) => x.id === selection.id);
      if (mk) eraseMark(mk);
    } else {
      const p = m.paths.find((x) => x.id === selection.id);
      if (p) erasePath(p);
    }
    setSelection(null);
  };

  const keys = useRef({ undo, deleteSelection });
  keys.current = { undo, deleteSelection };
  useEffect(() => {
    const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement).closest('input, textarea, select');
    const down = (e: KeyboardEvent) => {
      if (typing(e)) {
        // Escape leaves the field so the tool shortcuts work again
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        void keys.current.undo();
      } else if (e.key === ' ') {
        e.preventDefault();
        setSpaceHeld(true);
      } else if (e.key === 'Escape') {
        setSelection(null);
        setDraft([]);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        keys.current.deleteSelection();
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
        if (t) setTool(t.id);
      }
    };
    const up = (e: KeyboardEvent) => e.key === ' ' && setSpaceHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  /* ---------- Pointer ---------- */

  const hexAt = (q: number, r: number) => mapRef.current?.hexes.find((h) => h.q === q && h.r === r) ?? null;

  const paintAt = (pt: Pt, g: Extract<Gesture, { kind: 'paint' }>) => {
    const [q, r] = toHex(...pt);
    const k = keyOf(q, r);
    if (g.done.has(k)) return;
    g.done.add(k);
    const prev = hexAt(q, r);
    if (prev?.terrain === brush) return;
    editHex(prev ? { ...prev, terrain: brush } : { q, r, terrain: brush, state: 'sketched', label: '', noteId: null }, 'paint');
  };

  const eraseAt = (clientX: number, clientY: number) => {
    const m = mapRef.current;
    if (!m) return;
    const hit = hitOf(document.elementFromPoint(clientX, clientY));
    if (hit?.type === 'mark') {
      const mk = m.marks.find((x) => x.id === hit.id);
      if (mk) eraseMark(mk);
    } else if (hit?.type === 'path') {
      const p = m.paths.find((x) => x.id === hit.id);
      if (p) erasePath(p);
    } else {
      const h = hexAt(...toHex(...toMap(clientX, clientY)));
      if (h) eraseHex(h);
    }
  };

  const place = async (pt: Pt) => {
    const kind: MarkKind = tool === 'text' ? 'text' : markKind;
    const party = kind === 'party' ? mapRef.current?.marks.find((m) => m.kind === 'party') : undefined;
    if (party) {
      // there's one party: placing it again moves it
      editMark(party, { x: pt[0], y: pt[1] }, 'move party');
      setSelection({ type: 'mark', id: party.id });
      return;
    }
    const m = await addMark({ kind, x: pt[0], y: pt[1], label: '', noteId: null });
    if (!m) return;
    record(`place ${MARK_NAMES[kind].toLowerCase()}`, () => delMark(m.id));
    setSelection({ type: 'mark', id: m.id });
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = toMap(e.clientX, e.clientY);
    const target = hitOf(e.target as Element);
    const pan: Gesture = { kind: 'pan', x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false, target };
    if (e.button === 1 || spaceHeld) return void (gesture.current = pan);
    switch (tool) {
      case 'select':
        if (target?.type === 'mark') {
          const m = mapRef.current?.marks.find((x) => x.id === target.id);
          if (m) return void (gesture.current = { kind: 'move-mark', x: e.clientX, y: e.clientY, id: m.id, from: [m.x, m.y], moved: false });
        }
        gesture.current = pan;
        break;
      case 'paint': {
        startBatch();
        const g: Gesture = { kind: 'paint', done: new Set() };
        gesture.current = g;
        paintAt(pt, g);
        break;
      }
      case 'draw':
        gesture.current = { kind: 'draw' };
        setDraft([pt]);
        break;
      case 'erase':
        startBatch();
        gesture.current = { kind: 'erase' };
        eraseAt(e.clientX, e.clientY);
        break;
      default:
        gesture.current = pan; // pins and text are placed on release, if the pointer didn't pan
    }
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    const pt = toMap(e.clientX, e.clientY);
    if (tool === 'paint' || tool === 'select') setHover(toHex(...pt));
    if (!g) return;
    if (g.kind === 'pan') {
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.moved && Math.hypot(dx, dy) < 5) return;
      g.moved = true;
      setView((v) => ({ ...v, cx: g.cx - dx / v.zoom, cy: g.cy - dy / v.zoom }));
    } else if (g.kind === 'move-mark') {
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.moved && Math.hypot(dx, dy) < 4) return;
      g.moved = true;
      const x = g.from[0] + dx / view.zoom, y = g.from[1] + dy / view.zoom;
      setMap((m) => m && { ...m, marks: m.marks.map((mk) => (mk.id === g.id ? { ...mk, x, y } : mk)) });
    } else if (g.kind === 'paint') paintAt(pt, g);
    else if (g.kind === 'erase') eraseAt(e.clientX, e.clientY);
    else if (g.kind === 'draw')
      setDraft((d) => {
        const last = d[d.length - 1];
        return last && Math.hypot(pt[0] - last[0], pt[1] - last[1]) < 3 / view.zoom ? d : [...d, pt];
      });
  };

  const onPointerUp = async (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    const pt = toMap(e.clientX, e.clientY);
    if (g.kind === 'paint') endBatch('paint');
    else if (g.kind === 'erase') endBatch('erase');
    else if (g.kind === 'move-mark') {
      const m = mapRef.current?.marks.find((x) => x.id === g.id);
      if (m && g.moved) {
        const [x, y] = [m.x, m.y];
        void patchMark(m.id, { x, y });
        record('move pin', () => patchMark(m.id, { x: g.from[0], y: g.from[1] }));
      }
      setSelection({ type: 'mark', id: g.id });
    } else if (g.kind === 'draw') {
      const pts = simplify(draft.length ? [...draft, pt] : [pt], 1.5 / view.zoom);
      setDraft([]);
      const length = pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
      if (pts.length < 2 || length < 10) return;
      const p = await addPath(pathKind, pts);
      if (p) record(`draw ${PATH_NAMES[pathKind].toLowerCase()}`, () => delPath(p.id));
    } else if (!g.moved) {
      // a click
      if (tool === 'mark' || tool === 'text') return void place(pt);
      if (g.target) return setSelection(g.target.type === 'mark' ? { type: 'mark', id: g.target.id } : { type: 'path', id: g.target.id });
      const [q, r] = toHex(...pt);
      setSelection((s) => (s?.type === 'hex' && s.q === q && s.r === r ? null : { type: 'hex', q, r }));
    }
  };

  /* ---------- Notes ---------- */

  const newNote = async (title: string, kind: NoteKind, body: string): Promise<number | null> => {
    const res = await api<Note>('POST', '/notes', { title, kind, characterId, body });
    if (!res.data) return toast(`Couldn't create the note: ${res.error}`, 'error'), null;
    setNotes((n) => [res.data!, ...n]);
    toast(`Note “${res.data.title}” created`);
    return res.data.id;
  };

  /* ---------- Charting ---------- */

  const rules = toolRules(TOOL)!;
  const proficient = hasTool(c.tools, TOOL);
  const chartBonus = c.mods[rules.ability] + (proficient ? c.profBonus : 0);
  const pairable = proficient ? rules.skills.filter((s) => c.skills.some((k) => k.name === s && k.proficient)) : [];

  const chartResult = (h: MapHex, passed: boolean) => {
    const name = h.label || titleCase(h.terrain);
    if (passed) {
      editHex({ ...h, state: 'charted' }, `chart ${name}`);
      toast(`${name} is charted in ink.`);
    } else toast(`The sketch of ${name} stays rough. Try again after the party travels on.`);
  };

  /* ---------- Render ---------- */

  const hexIndex = useMemo(() => new Set((map?.hexes ?? []).map((h) => keyOf(h.q, h.r))), [map]);

  // Empty grid cells across the visible area, so there's somewhere to draw.
  const ghosts = useMemo(() => {
    const out: Pt[] = [];
    const r0 = Math.floor(vb.y / (S * 1.5)) - 1, r1 = Math.ceil((vb.y + vb.h) / (S * 1.5)) + 1;
    for (let r = r0; r <= r1; r++) {
      const q0 = Math.floor(vb.x / (S * SQ3) - r / 2) - 1, q1 = Math.ceil((vb.x + vb.w) / (S * SQ3) - r / 2) + 1;
      for (let q = q0; q <= q1; q++) if (!hexIndex.has(keyOf(q, r))) out.push([q, r]);
    }
    return out;
  }, [vb.x, vb.y, vb.w, vb.h, hexIndex]);

  if (!map) return <Loader size="page" label="Unrolling the map" />;

  const charted = map.hexes.filter((h) => h.state === 'charted').length;
  const selHex = selection?.type === 'hex' ? map.hexes.find((h) => h.q === selection.q && h.r === selection.r) ?? null : null;
  const selMark = selection?.type === 'mark' ? map.marks.find((m) => m.id === selection.id) ?? null : null;
  const selPath = selection?.type === 'path' ? map.paths.find((p) => p.id === selection.id) ?? null : null;
  const cursor = spaceHeld ? 'tool-pan' : `tool-${tool}`;

  return (
    <main className="sheet map-page">
      <nav className="sheet-nav">
        <a {...linkTo(`/c/${characterId}`)}>← {c.name}</a>
        <a {...linkTo(`/c/${characterId}/lore`)}>Lore</a>
        <a {...linkTo(`/notes?character=${characterId}`)}>Notes</a>
      </nav>
      <div className="map-layout">
        <div className={`map-frame tome ${cursor}`}>
          <svg
            ref={svgRef}
            className="map-svg"
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => setHover(null)}
            onPointerCancel={() => {
              gesture.current = null;
              batch.current = null;
              setDraft([]);
            }}
            onContextMenu={(e) => e.preventDefault()}
            role="application"
            aria-label={`${c.name}'s journey map`}
          >
            <g className="map-grid">
              {ghosts.map(([q, r]) => (
                <polygon key={keyOf(q, r)} points={HEX} transform={`translate(${toPixel(q, r).join(' ')})`} />
              ))}
            </g>
            <g>
              {map.hexes.map((h) => (
                <g key={keyOf(h.q, h.r)} className={`map-hex ${h.state} terrain-${h.terrain}`} transform={`translate(${toPixel(h.q, h.r).join(' ')})`}>
                  <polygon className="hex-fill" points={h.state === 'charted' ? HEX : HEX_INNER} />
                  <title>{h.label || titleCase(h.terrain)}{h.state === 'sketched' ? ' (sketch)' : ''}</title>
                  <Glyph terrain={h.terrain} y={h.label ? -8 : -1} scale={1.25} />
                  {h.label && (
                    <text className="hex-label" y={23} textAnchor="middle">
                      {h.label.length > 12 ? `${h.label.slice(0, 11).trimEnd()}…` : h.label}
                    </text>
                  )}
                  {h.noteId && <circle className="hex-note" cx={22} cy={-20} r={3} />}
                </g>
              ))}
            </g>
            {hover && (tool === 'paint' || tool === 'select') && !spaceHeld && (
              <polygon className={`map-hover ${tool}`} points={HEX} transform={`translate(${toPixel(...hover).join(' ')})`} />
            )}
            {selection?.type === 'hex' && <polygon className="map-selected" points={HEX} transform={`translate(${toPixel(selection.q, selection.r).join(' ')})`} />}
            <g className="map-paths">
              {map.paths.map((p) => {
                const d = smoothPath(p.points);
                return (
                  <g key={p.id} data-path={p.id} className={`map-path kind-${p.kind} ${selPath?.id === p.id ? 'selected' : ''}`}>
                    {p.kind === 'road' && <path className="road-edge" d={d} />}
                    <path className="line" d={d} />
                    <path className="hit" d={d} />
                  </g>
                );
              })}
              {draft.length > 1 && (
                <g className={`map-path kind-${pathKind} drafting`}>
                  {pathKind === 'road' && <path className="road-edge" d={smoothPath(draft)} />}
                  <path className="line" d={smoothPath(draft)} />
                </g>
              )}
            </g>
            <g className="map-marks">
              {map.marks.map((m) => (
                <g key={m.id} data-mark={m.id} className={`map-mark kind-${m.kind} ${selMark?.id === m.id ? 'selected' : ''}`} transform={`translate(${m.x} ${m.y})`}>
                  {m.kind === 'text' ? (
                    <>
                      <text className="map-text" textAnchor="middle" dominantBaseline="middle">{m.label || 'Text'}</text>
                      <rect className="hit" x={-40} y={-10} width={80} height={20} />
                    </>
                  ) : (
                    <>
                      <title>{m.label || MARK_NAMES[m.kind]}</title>
                      <circle className="pin" r={11} />
                      <path className="icon" d={MARK_ICONS[m.kind]} transform="scale(.75)" />
                      {m.label && (
                        <text className="mark-label" y={23} textAnchor="middle">
                          {m.label.length > 18 ? `${m.label.slice(0, 17).trimEnd()}…` : m.label}
                        </text>
                      )}
                    </>
                  )}
                </g>
              ))}
            </g>
          </svg>

          <div className="map-toolbar" role="toolbar" aria-label="Map tools">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                className={`map-tool ${tool === t.id ? 'sel' : ''}`}
                onClick={() => setTool(t.id)}
                aria-pressed={tool === t.id}
                title={`${t.name} (${t.key.toUpperCase()})`}
              >
                <svg viewBox="-12 -12 24 24" aria-hidden="true"><path d={t.icon} /></svg>
              </button>
            ))}
            <span className="map-tool-sep" />
            <button className="map-tool" onClick={() => void undo()} disabled={!undoCount} title="Undo (⌘Z)" aria-label="Undo">
              <svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="M-7 -2 h9 a5 5 0 0 1 0 10 h-4 M-3 -6 L-7 -2 L-3 2" /></svg>
            </button>
          </div>

          <div className="map-zoom">
            <button className="icon-btn" onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
            <button className="icon-btn" onClick={() => zoomBy(0.8)} aria-label="Zoom out">−</button>
            <button className="icon-btn" onClick={recentre} aria-label="Recentre" title="Recentre">◎</button>
          </div>
        </div>

        <aside className="map-side card">
          <h2>Journey Map</h2>
          <p className="hint">
            {map.hexes.length} hexes, {charted} charted · {map.paths.length} lines · {map.marks.length} pins
          </p>

          <ToolOptions
            tool={tool}
            brush={brush}
            setBrush={setBrush}
            pathKind={pathKind}
            setPathKind={setPathKind}
            markKind={markKind}
            setMarkKind={setMarkKind}
          />

          {selection?.type === 'hex' && !selHex && (
            <section className="map-section">
              <h3>Empty hex</h3>
              <p className="hint">Paint it with the brush, or pick a terrain:</p>
              <TerrainPicker onPick={(t) => editHex({ q: selection.q, r: selection.r, terrain: t, state: 'sketched', label: '', noteId: null }, 'sketch hex')} />
            </section>
          )}
          {selHex && (
            <HexEditor
              key={keyOf(selHex.q, selHex.r)}
              hex={selHex}
              notes={notes}
              characterId={characterId}
              onChange={(h) => editHex(h)}
              onErase={() => { eraseHex(selHex); setSelection(null); }}
              onNewNote={async () => {
                const id = await newNote(selHex.label || titleCase(selHex.terrain), 'place', `Map hex ${selHex.q},${selHex.r} (${selHex.terrain}).`);
                if (id) editHex({ ...selHex, noteId: id }, 'link note');
              }}
              chart={
                selHex.state === 'sketched' ? (
                  <div className="map-chart">
                    <p>
                      <strong>Chart it:</strong> roll {TOOL} at the table, d20 {fmt(chartBonus)} ({rules.ability}
                      {proficient ? ' + proficiency' : ''}) vs <strong>DC {CHART_DC}</strong>
                      {pairable.length > 0 && <>, with advantage if {pairable.join(' or ')} also applies</>}.
                    </p>
                    <div className="char-actions">
                      <button className="btn" onClick={() => chartResult(selHex, true)}>Passed</button>
                      <button className="btn ghost" onClick={() => chartResult(selHex, false)}>Failed</button>
                    </div>
                  </div>
                ) : null
              }
            />
          )}
          {selMark && (
            <MarkEditor
              key={selMark.id}
              mark={selMark}
              notes={notes}
              characterId={characterId}
              onChange={(patch) => editMark(selMark, patch)}
              onErase={() => { eraseMark(selMark); setSelection(null); }}
              onNewNote={async () => {
                const kind: NoteKind = selMark.kind === 'npc' ? 'npc' : selMark.kind === 'quest' ? 'quest' : 'place';
                const id = await newNote(selMark.label || MARK_NAMES[selMark.kind], kind, '');
                if (id) editMark(selMark, { noteId: id }, 'link note');
              }}
            />
          )}
          {selPath && (
            <section className="map-section">
              <h3>{PATH_NAMES[selPath.kind]}</h3>
              <div className="char-actions">
                <button className="btn ghost small danger-text" onClick={() => { erasePath(selPath); setSelection(null); }}>Erase line</button>
              </div>
            </section>
          )}

          <details className="map-help">
            <summary>Controls</summary>
            <ul>
              <li><kbd>V</kbd> select · <kbd>B</kbd> paint · <kbd>D</kbd> draw · <kbd>M</kbd> pin · <kbd>T</kbd> text · <kbd>E</kbd> erase</li>
              <li>Two-finger scroll or hold <kbd>Space</kbd> and drag to pan; pinch or <kbd>⌘</kbd>-scroll to zoom</li>
              <li><kbd>⌘Z</kbd> undo · <kbd>Delete</kbd> removes the selection · <kbd>Esc</kbd> deselects</li>
              <li>With Select, drag a pin to move it</li>
            </ul>
          </details>
        </aside>
      </div>
    </main>
  );
}

function ToolOptions({
  tool,
  brush,
  setBrush,
  pathKind,
  setPathKind,
  markKind,
  setMarkKind,
}: {
  tool: Tool;
  brush: Terrain;
  setBrush: (t: Terrain) => void;
  pathKind: PathKind;
  setPathKind: (k: PathKind) => void;
  markKind: MarkKind;
  setMarkKind: (k: MarkKind) => void;
}) {
  const name = TOOLS.find((t) => t.id === tool)!.name;
  return (
    <section className="map-section">
      <h3>{name}</h3>
      {tool === 'select' && <p className="hint">Click a hex, line or pin to edit it. Drag pins to move them; drag elsewhere to pan.</p>}
      {tool === 'paint' && (
        <>
          <p className="hint">Click or drag across hexes. New hexes start as a pencil sketch.</p>
          <TerrainPicker value={brush} onPick={setBrush} />
        </>
      )}
      {tool === 'draw' && (
        <>
          <p className="hint">Press and drag to draw freehand.</p>
          <div className="path-picker">
            {PATH_KINDS.map((k) => (
              <button key={k} className={`terrain-btn ${pathKind === k ? 'sel' : ''}`} onClick={() => setPathKind(k)} aria-pressed={pathKind === k}>
                <svg viewBox="0 -10 60 20" aria-hidden="true" className={`map-path kind-${k}`}>
                  {k === 'road' && <path className="road-edge" d="M4 4 Q20 -8 32 0 T56 -2" />}
                  <path className="line" d="M4 4 Q20 -8 32 0 T56 -2" />
                </svg>
                <span>{PATH_NAMES[k]}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {tool === 'mark' && (
        <>
          <p className="hint">Click to place. There's one Party pin: placing it again moves it.</p>
          <MarkPicker value={markKind} onPick={setMarkKind} />
        </>
      )}
      {tool === 'text' && <p className="hint">Click anywhere to place a label, then type it here.</p>}
      {tool === 'erase' && <p className="hint">Click or drag over hexes, lines and pins to erase them. ⌘Z brings them back.</p>}
    </section>
  );
}

function TerrainPicker({ value, onPick }: { value?: Terrain; onPick: (t: Terrain) => void }) {
  return (
    <div className="terrain-picker">
      {TERRAINS.map((t) => (
        <button key={t} className={`terrain-btn ${value === t ? 'sel' : ''}`} onClick={() => onPick(t)} aria-pressed={value === t}>
          <svg viewBox="-20 -20 40 40" aria-hidden="true"><Glyph terrain={t} y={0} /></svg>
          <span>{titleCase(t)}</span>
        </button>
      ))}
    </div>
  );
}

function MarkPicker({ value, onPick }: { value: MarkKind; onPick: (k: MarkKind) => void }) {
  return (
    <div className="terrain-picker">
      {MARK_KINDS.filter((k) => k !== 'text').map((k) => (
        <button key={k} className={`terrain-btn ${value === k ? 'sel' : ''}`} onClick={() => onPick(k)} aria-pressed={value === k}>
          <svg viewBox="-14 -14 28 28" aria-hidden="true" className={`map-mark kind-${k}`}>
            <circle className="pin" r={11} />
            <path className="icon" d={MARK_ICONS[k]} transform="scale(.75)" />
          </svg>
          <span>{MARK_NAMES[k]}</span>
        </button>
      ))}
    </div>
  );
}

function NoteField({ value, notes, onChange }: { value: number | null; notes: Note[]; onChange: (id: number | null) => void }) {
  return (
    <label className="map-field">
      <span>Linked note</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">— none —</option>
        {notes.map((n) => (
          <option key={n.id} value={n.id}>{n.title} ({n.kind})</option>
        ))}
      </select>
    </label>
  );
}

/** A text input that saves on blur or Enter. */
function LabelField({ value, max, placeholder, autoFocus, onSave }: { value: string; max: number; placeholder: string; autoFocus?: boolean; onSave: (v: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <label className="map-field">
      <span>Name</span>
      <input
        value={text}
        maxLength={max}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text.trim() !== value && onSave(text.trim())}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}

function HexEditor({
  hex,
  notes,
  characterId,
  onChange,
  onErase,
  onNewNote,
  chart,
}: {
  hex: MapHex;
  notes: Note[];
  characterId: number;
  onChange: (h: MapHex) => void;
  onErase: () => void;
  onNewNote: () => void;
  chart: ReactNode;
}) {
  return (
    <section className="map-section">
      <h3>
        {hex.label || titleCase(hex.terrain)} <small className={`hex-state ${hex.state}`}>{hex.state === 'charted' ? 'charted' : 'sketch'}</small>
      </h3>
      {chart}
      <LabelField value={hex.label} max={80} placeholder="e.g. Neverwinter Wood" onSave={(label) => onChange({ ...hex, label })} />
      <div className="map-field">
        <span>Terrain</span>
        <TerrainPicker value={hex.terrain} onPick={(t) => t !== hex.terrain && onChange({ ...hex, terrain: t })} />
      </div>
      <NoteField value={hex.noteId} notes={notes} onChange={(noteId) => onChange({ ...hex, noteId })} />
      <div className="char-actions">
        {hex.noteId ? (
          <a className="btn ghost small" {...linkTo(`/notes?character=${characterId}`)}>Open notes</a>
        ) : (
          <button className="btn ghost small" onClick={onNewNote}>New place note</button>
        )}
        {hex.state === 'charted' && (
          <button className="btn ghost small" onClick={() => onChange({ ...hex, state: 'sketched' })} title="Mark it as uncertain again">Back to sketch</button>
        )}
        <button className="btn ghost small danger-text" onClick={onErase}>Erase hex</button>
      </div>
    </section>
  );
}

function MarkEditor({
  mark,
  notes,
  characterId,
  onChange,
  onErase,
  onNewNote,
}: {
  mark: MapMark;
  notes: Note[];
  characterId: number;
  onChange: (patch: Partial<Omit<MapMark, 'id'>>) => void;
  onErase: () => void;
  onNewNote: () => void;
}) {
  const isText = mark.kind === 'text';
  return (
    <section className="map-section">
      <h3>{mark.label || MARK_NAMES[mark.kind]}</h3>
      <LabelField
        value={mark.label}
        max={120}
        placeholder={isText ? 'e.g. The Sword Coast' : 'e.g. Ambushed by goblins'}
        autoFocus={isText && !mark.label}
        onSave={(label) => onChange({ label })}
      />
      {!isText && (
        <>
          <div className="map-field">
            <span>Pin</span>
            <MarkPicker value={mark.kind} onPick={(kind) => kind !== mark.kind && onChange({ kind })} />
          </div>
          <NoteField value={mark.noteId} notes={notes} onChange={(noteId) => onChange({ noteId })} />
        </>
      )}
      <div className="char-actions">
        {!isText &&
          (mark.noteId ? (
            <a className="btn ghost small" {...linkTo(`/notes?character=${characterId}`)}>Open notes</a>
          ) : (
            <button className="btn ghost small" onClick={onNewNote}>New note</button>
          ))}
        <button className="btn ghost small danger-text" onClick={onErase}>{isText ? 'Remove text' : 'Remove pin'}</button>
      </div>
    </section>
  );
}
