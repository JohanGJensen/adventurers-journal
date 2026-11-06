// Generates the tome textures in public/textures/: tileable, cel-shaded ("illustrated") parchment and leather PNGs,
// plus the vector ornaments (gilt frame, torn page edge, ruled divider). Deterministic; no dependencies.
// Usage: bun scripts/gen-textures.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const OUT = join(import.meta.dir, '..', 'public', 'textures');
const SIZE = 512;

/* ---------- PNG ---------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Uint8Array) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
function png(w: number, h: number, rgb: Float32Array): Uint8Array {
  const raw = new Uint8Array(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) raw[y * (1 + w * 3) + 1 + x * 3 + c] = Math.max(0, Math.min(255, Math.round(rgb[(y * w + x) * 3 + c])));
    }
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/* ---------- Seeded randomness and tileable noise ---------- */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (x: number, y: number, seed: number) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Value noise on a lattice of `period` cells across the tile, wrapping, so the result tiles seamlessly. */
function valueNoise(u: number, v: number, period: number, seed: number) {
  const x = u * period, y = v * period;
  const xi = Math.floor(x), yi = Math.floor(y);
  const tx = smooth(x - xi), ty = smooth(y - yi);
  const w = (n: number) => ((n % period) + period) % period;
  const a = hash(w(xi), w(yi), seed), b = hash(w(xi + 1), w(yi), seed);
  const c = hash(w(xi), w(yi + 1), seed), d = hash(w(xi + 1), w(yi + 1), seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
function fbm(u: number, v: number, period: number, octaves: number, seed: number) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(u, v, period << o, seed + o * 101);
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

/** Worley (cellular) noise, wrapping: distance to nearest and second-nearest feature point, in cell units. */
function worley(u: number, v: number, cells: number, seed: number): [number, number] {
  const x = u * cells, y = v * cells;
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx, cy = yi + dy;
      const wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells;
      const px = cx + hash(wx, wy, seed), py = cy + hash(wx, wy, seed + 7);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) [f1, f2] = [d, f1];
      else if (d < f2) f2 = d;
    }
  }
  return [f1, f2];
}

/* ---------- Painting helpers (all wrap around the tile edges) ---------- */

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

class Canvas {
  px = new Float32Array(SIZE * SIZE * 3);
  set(x: number, y: number, c: RGB) {
    const i = (y * SIZE + x) * 3;
    this.px[i] = c[0];
    this.px[i + 1] = c[1];
    this.px[i + 2] = c[2];
  }
  blend(x: number, y: number, c: RGB, a: number) {
    if (a <= 0) return;
    x = ((Math.round(x) % SIZE) + SIZE) % SIZE;
    y = ((Math.round(y) % SIZE) + SIZE) % SIZE;
    const i = (y * SIZE + x) * 3;
    for (let k = 0; k < 3; k++) this.px[i + k] += (c[k] - this.px[i + k]) * Math.min(1, a);
  }
  /** Anti-aliased filled disc. */
  disc(cx: number, cy: number, r: number, c: RGB, a: number) {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const cover = Math.max(0, Math.min(1, r + 0.5 - Math.hypot(x - cx, y - cy)));
        this.blend(x, y, c, a * cover);
      }
  }
  /** Anti-aliased ring (for foxing rims). */
  ring(cx: number, cy: number, r: number, w: number, c: RGB, a: number) {
    for (let y = Math.floor(cy - r - w - 1); y <= Math.ceil(cy + r + w + 1); y++)
      for (let x = Math.floor(cx - r - w - 1); x <= Math.ceil(cx + r + w + 1); x++) {
        const d = Math.abs(Math.hypot(x - cx, y - cy) - r);
        this.blend(x, y, c, a * Math.max(0, Math.min(1, w / 2 + 0.5 - d)));
      }
  }
  /** A short curved stroke (fibre or crease), stamped as small discs along a quadratic curve. */
  stroke(x0: number, y0: number, x1: number, y1: number, bend: number, width: number, c: RGB, a: number) {
    const mx = (x0 + x1) / 2 - (y1 - y0) * bend, my = (y0 + y1) / 2 + (x1 - x0) * bend;
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1;
      const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1;
      const taper = Math.sin(Math.PI * t); // thin at both ends, like a brush stroke
      this.disc(x, y, (width / 2) * (0.4 + 0.6 * taper), c, a / 3);
    }
  }
}

/**
 * Cel-shaded mottling: noise quantised into flat tonal bands, with a 1px contour where a band meets a darker one.
 * This is what makes the result read as "illustrated" rather than blurry.
 */
function bands(cv: Canvas, field: (u: number, v: number) => number, thresholds: number[], palette: string[], contour: string, contourAlpha: number) {
  const level = new Uint8Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const n = field(x / SIZE, y / SIZE);
      let l = 0;
      while (l < thresholds.length && n > thresholds[l]) l++;
      level[y * SIZE + x] = l;
      cv.set(x, y, hex(palette[l]));
    }
  const ink = hex(contour);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const l = level[y * SIZE + x];
      const right = level[y * SIZE + ((x + 1) % SIZE)], down = level[((y + 1) % SIZE) * SIZE + x];
      if (right > l || down > l) cv.blend(x, y, ink, contourAlpha);
    }
  return level;
}

/** Very fine, low-contrast grain so flat bands don't look like plastic. */
function grain(cv: Canvas, seed: number, amount: number) {
  const r = rng(seed);
  for (let i = 0; i < cv.px.length; i += 3) {
    const g = (r() - 0.5) * amount;
    cv.px[i] += g;
    cv.px[i + 1] += g;
    cv.px[i + 2] += g * 0.8;
  }
}

/* ---------- Textures ---------- */

interface ParchmentStyle {
  palette: string[];
  contour: string;
  speck: string;
  fibreLight: string;
  fibreDark: string;
  fox: string;
  foxRim: string;
  strength: number;
}

function parchment(seed: number, s: ParchmentStyle) {
  const cv = new Canvas();
  bands(cv, (u, v) => 0.65 * fbm(u, v, 4, 4, seed) + 0.35 * fbm(u, v, 9, 3, seed + 50), [0.5, 0.6, 0.69], s.palette, s.contour, 0.42 * s.strength);
  grain(cv, seed + 1, 7);
  const r = rng(seed + 2);
  // Foxing: small age spots with a darker rim.
  for (let i = 0; i < 7; i++) {
    const x = r() * SIZE, y = r() * SIZE, rad = 3 + r() * 7;
    cv.disc(x, y, rad, hex(s.fox), 0.22 * s.strength);
    cv.ring(x, y, rad, 1.1, hex(s.foxRim), 0.38 * s.strength);
  }
  // Fibres: short brushed strokes, light and dark.
  for (let i = 0; i < 90; i++) {
    const x = r() * SIZE, y = r() * SIZE, ang = r() * Math.PI, len = 6 + r() * 18;
    const light = r() < 0.6;
    cv.stroke(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len, (r() - 0.5) * 0.5, 1 + r() * 0.6, hex(light ? s.fibreLight : s.fibreDark), (light ? 0.5 : 0.28) * s.strength);
  }
  // Speckles: crisp ink flecks.
  for (let i = 0; i < 260; i++) cv.disc(r() * SIZE, r() * SIZE, 0.45 + r() * r() * 1.4, hex(s.speck), (0.35 + r() * 0.35) * s.strength);
  return cv;
}

function leather(seed: number, palette: string[], outline: string, highlight: string, crease: string) {
  const cv = new Canvas();
  bands(cv, (u, v) => fbm(u, v, 3, 4, seed), [0.42, 0.52, 0.6], palette, outline, 0.3);
  // Pebbled grain: cellular pattern, each pebble with a dark outline and a highlight on its upper-left.
  const hi = hex(highlight), ol = hex(outline);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const [f1, f2] = worley(x / SIZE, y / SIZE, 30, seed + 9);
      if (f2 - f1 < 0.06) cv.blend(x, y, ol, 0.42);
      else {
        const [g1] = worley((x + 1.5) / SIZE, (y + 1.5) / SIZE, 30, seed + 9);
        if (g1 < f1 - 0.02 && f1 < 0.45) cv.blend(x, y, hi, 0.2);
      }
    }
  grain(cv, seed + 3, 6);
  const r = rng(seed + 4);
  for (let i = 0; i < 14; i++) {
    const x = r() * SIZE, y = r() * SIZE, ang = r() * Math.PI, len = 30 + r() * 60;
    cv.stroke(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len, (r() - 0.5) * 0.3, 1.4, hex(crease), 0.5);
    cv.stroke(x + 1, y + 1, x + 1 + Math.cos(ang) * len, y + 1 + Math.sin(ang) * len, (r() - 0.5) * 0.3, 1, hi, 0.25);
  }
  return cv;
}

/* ---------- Vector ornaments ---------- */

const GOLD_DARK = '#4a2c0e';
const GOLD = '#d4a43c';
const GOLD_LIGHT = '#ffe39a';

/** 9-slice gilt frame (viewBox 144, slice 48): double rule with scrolled corner flourishes. */
function frameSvg() {
  const corner = `
    <g>
      <path d="M10 40 C10 22 22 10 40 10" fill="none" stroke="${GOLD_DARK}" stroke-width="5.2" stroke-linecap="round"/>
      <path d="M10 40 C10 22 22 10 40 10" fill="none" stroke="${GOLD}" stroke-width="3" stroke-linecap="round"/>
      <path d="M11.5 37 C12 24 24 12 37 11.5" fill="none" stroke="${GOLD_LIGHT}" stroke-width=".9" stroke-linecap="round"/>
      <path d="M40 10 c6 0 8.5 5.5 5 8 c-2.6 1.8 -5.4 -.6 -3.6 -2.8" fill="none" stroke="${GOLD_DARK}" stroke-width="4.2" stroke-linecap="round"/>
      <path d="M40 10 c6 0 8.5 5.5 5 8 c-2.6 1.8 -5.4 -.6 -3.6 -2.8" fill="none" stroke="${GOLD}" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M10 40 c0 6 5.5 8.5 8 5 c1.8 -2.6 -.6 -5.4 -2.8 -3.6" fill="none" stroke="${GOLD_DARK}" stroke-width="4.2" stroke-linecap="round"/>
      <path d="M10 40 c0 6 5.5 8.5 8 5 c1.8 -2.6 -.6 -5.4 -2.8 -3.6" fill="none" stroke="${GOLD}" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M17 31 Q19 19 31 17 Q27 27 17 31 Z" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="M19.5 28.5 Q22 22 28.5 19.5" fill="none" stroke="${GOLD_DARK}" stroke-width=".8"/>
      <path d="M6.5 6.5 L13 9 L9 13 Z" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width="1.2" stroke-linejoin="round"/>
      <circle cx="24" cy="24" r="2.4" fill="#8f2b1b" stroke="${GOLD_DARK}" stroke-width="1"/>
      <circle cx="23.3" cy="23.3" r=".7" fill="#ffb59a"/>
    </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144" width="144" height="144">
  <rect x="5" y="5" width="134" height="134" fill="none" stroke="${GOLD_DARK}" stroke-width="3.4"/>
  <rect x="5" y="5" width="134" height="134" fill="none" stroke="${GOLD}" stroke-width="1.8"/>
  <rect x="5.6" y="5.6" width="132.8" height="132.8" fill="none" stroke="${GOLD_LIGHT}" stroke-width=".5" opacity=".9"/>
  <rect x="12" y="12" width="120" height="120" fill="none" stroke="${GOLD_DARK}" stroke-width=".9" opacity=".75"/>
  ${corner}
  <g transform="translate(144 0) scale(-1 1)">${corner}</g>
  <g transform="translate(0 144) scale(1 -1)">${corner}</g>
  <g transform="translate(144 144) scale(-1 -1)">${corner}</g>
</svg>`;
}

/**
 * 9-slice torn page edge (viewBox 120, slice 30, edges repeat with `round`): a ragged burnt band along the border.
 * The tear is periodic every 60 units, so repeated edge slices join without a seam.
 */
function tornEdgeSvg(seed: number) {
  const r = rng(seed);
  const P = 60, STEP = 2.5, N = P / STEP;
  const edges = Array.from({ length: 4 }, () => Array.from({ length: N }, () => r()));
  const tear = (e: number, t: number, base: number, amp: number) => {
    const k = ((((t - 30) % P) + P) % P) / STEP;
    const i = Math.floor(k), f = k - i;
    const a = edges[e][i % N], b = edges[e][(i + 1) % N];
    return base + amp * (a + (b - a) * f) + 1.2 * Math.sin((2 * Math.PI * (t - 30)) / P + e);
  };
  const ring = (base: number, amp: number) => {
    const pts: string[] = [];
    for (let x = 8; x <= 112; x += STEP) pts.push(`${x.toFixed(1)},${tear(0, x, base, amp).toFixed(2)}`);
    for (let y = 8; y <= 112; y += STEP) pts.push(`${(120 - tear(1, y, base, amp)).toFixed(2)},${y.toFixed(1)}`);
    for (let x = 112; x >= 8; x -= STEP) pts.push(`${x.toFixed(1)},${(120 - tear(2, x, base, amp)).toFixed(2)}`);
    for (let y = 112; y >= 8; y -= STEP) pts.push(`${tear(3, y, base, amp).toFixed(2)},${y.toFixed(1)}`);
    return `M0 0H120V120H0Z M${pts.join(' L')}Z`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
  <path d="${ring(5, 5)}" fill="#b07a3c" fill-opacity=".28" fill-rule="evenodd"/>
  <path d="${ring(2.2, 4)}" fill="#6b3a16" fill-opacity=".7" fill-rule="evenodd"/>
  <path d="${ring(0.6, 2.6)}" fill="#2a160a" fill-opacity=".9" fill-rule="evenodd"/>
</svg>`;
}

/** Hand-ruled ink divider with a central knot; drawn in % so it never stretches out of shape. */
function ruleSvg(color: string, gold: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="16">
  <line x1="2%" x2="98%" y1="8.5" y2="8.5" stroke="${color}" stroke-width="1.1" stroke-dasharray="140 1.5 60 2 220 1 90 2" stroke-linecap="round" opacity=".75"/>
  <line x1="3%" x2="97%" y1="11" y2="11" stroke="${color}" stroke-width=".5" opacity=".45"/>
  <svg x="50%" y="0" width="1" height="16" overflow="visible">
    <g transform="translate(-22 0)">
      <path d="M2 8.5 C8 2 14 2 22 8.5 C30 15 36 15 42 8.5" fill="none" stroke="${color}" stroke-width="1.2"/>
      <path d="M22 3.5 L26 8.5 L22 13.5 L18 8.5 Z" fill="${gold}" stroke="${color}" stroke-width="1"/>
      <circle cx="9" cy="8.5" r="1.4" fill="${color}"/>
      <circle cx="35" cy="8.5" r="1.4" fill="${color}"/>
    </g>
  </svg>
</svg>`;
}

/* ---------- Write everything ---------- */

mkdirSync(OUT, { recursive: true });
const write = (name: string, data: Uint8Array | string) => {
  writeFileSync(join(OUT, name), data);
  console.log(`${name}  ${(typeof data === 'string' ? data.length : data.byteLength) / 1024 | 0} KB`);
};

write(
  'parchment-light.png',
  png(SIZE, SIZE, parchment(11, {
    palette: ['#f7ebce', '#f2e2bd', '#ebd6aa', '#e2c895'],
    contour: '#c29d64',
    speck: '#5a3d1e',
    fibreLight: '#fff8e4',
    fibreDark: '#9c7646',
    fox: '#d6a96e',
    foxRim: '#a8743e',
    strength: 1,
  }).px),
);
write(
  'parchment-dark.png',
  png(SIZE, SIZE, parchment(23, {
    palette: ['#3a2c1c', '#352819', '#2f2316', '#291e13'],
    contour: '#17100a',
    speck: '#0f0a05',
    fibreLight: '#6b5232',
    fibreDark: '#120c06',
    fox: '#1c140c',
    foxRim: '#5a4024',
    strength: 1,
  }).px),
);
write('leather.png', png(SIZE, SIZE, leather(31, ['#6b3d22', '#5e341c', '#512b16', '#442311'], '#22110a', '#a8693e', '#2a150b').px));
write('leather-dark.png', png(SIZE, SIZE, leather(37, ['#3e2416', '#361f12', '#2e1a0f', '#26150c'], '#0d0704', '#6e4528', '#120a05').px));
write('frame-gilt.svg', frameSvg());
write('edge-torn.svg', tornEdgeSvg(5));
write('rule.svg', ruleSvg('#4a2c12', '#d4a43c'));
write('rule-dark.svg', ruleSvg('#c9a77a', '#d8aa4c'));
