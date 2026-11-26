// Generates the stand-in pictures for notes without an image of their own: one per note kind except players.
// Painted look, to sit beside the character portraits: soft light, depth blur, grain and brushy edges, no outlines.
// Writes the vector sources to build/fallbacks/*.svg, then renders them to public/fallbacks/*.png with Electron.
// Usage: bun scripts/gen-fallbacks.ts
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const SVG_DIR = join(ROOT, 'build', 'fallbacks');
const PNG_DIR = join(ROOT, 'public', 'fallbacks');
const PX = 512;

const rnd = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const f = (n: number) => n.toFixed(1);
type Stop = [number, string, number?];
const stops = (s: Stop[]) => s.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('');
const lg = (id: string, x1: number, y1: number, x2: number, y2: number, s: Stop[]) =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops(s)}</linearGradient>`;
const rg = (id: string, cx: number, cy: number, r: number, s: Stop[], fx = cx, fy = cy) =>
  `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${r}" fx="${fx}" fy="${fy}">${stops(s)}</radialGradient>`;
const rgBox = (id: string, s: Stop[], fx = 0.35, fy = 0.35) => `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.6" fx="${fx}" fy="${fy}">${stops(s)}</radialGradient>`;

const BASE = `
  <filter id="paint" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="3" seed="3"/><feDisplacementMap in="SourceGraphic" scale="9" xChannelSelector="R" yChannelSelector="G"/></filter>
  <filter id="brush" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.015 0.09" numOctaves="2" seed="5"/><feDisplacementMap in="SourceGraphic" scale="16" xChannelSelector="R" yChannelSelector="G"/></filter>
  <filter id="b2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2"/></filter>
  <filter id="b4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
  <filter id="b10" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>
  <filter id="b25" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="25"/></filter>
  <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="9" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.22  0 0 0 0 0.17  0 0 0 0 0.12  1.6 0 0 0 -0.72"/></filter>
  <radialGradient id="vig" cx="50%" cy="48%" r="72%"><stop offset="0.5" stop-color="#140c06" stop-opacity="0"/><stop offset="1" stop-color="#140c06" stop-opacity="0.8"/></radialGradient>`;

const scene = (defs: string, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
<defs>${BASE}${defs}</defs>
<g filter="url(#paint)">${body}</g>
<rect width="1024" height="1024" filter="url(#grain)" opacity="0.3"/>
<rect width="1024" height="1024" fill="url(#vig)"/>
</svg>
`;
const SCREEN = 'style="mix-blend-mode:screen"';
const ellipseCloud = (r: () => number, n: number, cx: number, cy: number, sx: number, sy: number, rx: [number, number], ry: [number, number], fill: string, op: [number, number]) =>
  Array.from({ length: n }, () => `<ellipse cx="${f(cx + (r() - 0.5) * sx)}" cy="${f(cy + (r() - 0.5) * sy)}" rx="${f(rx[0] + r() * (rx[1] - rx[0]))}" ry="${f(ry[0] + r() * (ry[1] - ry[0]))}" fill="${fill}" opacity="${(op[0] + r() * (op[1] - op[0])).toFixed(2)}"/>`).join('');
const leaf = (x: number, y: number, len: number, w: number, rot: number, fill: string, op = 1) =>
  `<g transform="translate(${x} ${y}) rotate(${rot})" opacity="${op}"><path d="M0 0 Q${len / 2} ${-w} ${len} 0 Q${len / 2} ${w} 0 0 Z" fill="${fill}"/><path d="M0 0 L${len * 0.9} 0" stroke="#000" stroke-opacity="0.25" stroke-width="2"/></g>`;
/** A rough-edged rectangle (paper). */
function roughRect(r: () => number, x: number, y: number, w: number, h: number, j: number) {
  const pts: [number, number][] = [];
  const step = 24;
  for (let i = 0; i <= w; i += step) pts.push([x + i, y + (r() - 0.5) * j]);
  for (let i = 0; i <= h; i += step) pts.push([x + w + (r() - 0.5) * j, y + i]);
  for (let i = w; i >= 0; i -= step) pts.push([x + i, y + h + (r() - 0.5) * j]);
  for (let i = h; i >= 0; i -= step) pts.push([x + (r() - 0.5) * j, y + i]);
  return 'M' + pts.map(([a, b]) => `${f(a)} ${f(b)}`).join(' L') + ' Z';
}
/** A blobby closed shape around a centre. */
function blob(r: () => number, cx: number, cy: number, rx: number, ry: number, j: number, n = 28) {
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (r() - 0.5) * j;
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
  });
  return 'M' + pts.map(([a, b]) => `${f(a)} ${f(b)}`).join(' L') + ' Z';
}
function woodTable(seed: number) {
  const r = rnd(seed);
  let out = `<rect x="-40" y="-40" width="1104" height="1104" fill="url(#woodBase)"/>`;
  for (let i = 0; i < 90; i++) {
    const y = r() * 1120 - 50;
    const a = 3 + r() * 10;
    out += `<path d="M-40 ${f(y)} Q256 ${f(y + a)} 512 ${f(y)} T1064 ${f(y + (r() - 0.5) * 8)}" fill="none" stroke="${r() < 0.55 ? '#1e0f05' : '#b07a44'}" stroke-width="${f(1 + r() * 3)}" opacity="${(0.12 + r() * 0.22).toFixed(2)}"/>`;
  }
  out += `<g filter="url(#b4)" stroke="#120802" stroke-width="7" opacity="0.8">${[250, 520, 800].map((y) => `<path d="M-40 ${y} H1064"/>`).join('')}</g>`;
  return out;
}
const WOOD = lg('woodBase', 0, 0, 0, 1024, [[0, '#6e4628'], [0.5, '#56341b'], [1, '#341e0e']]);
const glowDots = (r: () => number, n: number, cx: number, cy: number, sx: number, sy: number, colors: string[], rad: [number, number]) =>
  Array.from({ length: n }, () => {
    const big = r() < 0.4;
    return `<circle cx="${f(cx + (r() - 0.5) * sx)}" cy="${f(cy + (r() - 0.5) * sy)}" r="${f(rad[0] + r() * (rad[1] - rad[0]))}" fill="${colors[Math.floor(r() * colors.length)]}" opacity="${(0.35 + r() * 0.6).toFixed(2)}" ${big ? 'filter="url(#b2)"' : ''}/>`;
  }).join('');

/* ---------------- NPC: a hooded stranger in a sunlit forest ---------------- */
function npc() {
  const r = rnd(11);
  const defs =
    rg('bg', 380, 260, 860, [[0, '#fff3c4'], [0.18, '#dcd38c'], [0.5, '#7b9150'], [1, '#223018']]) +
    lg('cloak', 150, 0, 874, 0, [[0, '#8a9358'], [0.45, '#4c5633'], [1, '#1b2014']]) +
    lg('hood', 300, 180, 740, 660, [[0, '#a3ad70'], [0.45, '#56613a'], [1, '#1e2416']]) +
    rg('hollow', 512, 610, 300, [[0, '#3d2b1d'], [0.5, '#170f0a'], [1, '#080504']]) +
    lg('skin', 512, 520, 512, 676, [[0, '#24150d'], [0.55, '#6e4329'], [1, '#a87348']]) +
    lg('beard', 512, 590, 512, 690, [[0, '#9c9387'], [1, '#d9d2c4']]) +
    lg('strap', 330, 700, 760, 1064, [[0, '#8a5a30'], [1, '#341c0c']]) +
    rgBox('brass', [[0, '#fff2b8'], [0.4, '#d4a443'], [1, '#4a2e08']]) +
    rgBox('gem', [[0, '#ffb0a0'], [0.4, '#c01830'], [1, '#3a0008']]) +
    lg('ray', 300, 0, 700, 1000, [[0, '#fff6d0', 0.9], [1, '#fff6d0', 0]]);
  const trunks = Array.from({ length: 10 }, (_, i) => `<rect x="${f(20 + i * 108 + r() * 40)}" y="-40" width="${f(24 + r() * 46)}" height="1110" fill="#4c5e36" opacity="${(0.35 + r() * 0.3).toFixed(2)}"/>`).join('');
  const bokeh = glowDots(r, 45, 512, 380, 1100, 760, ['#f6f0b0', '#cfe08a', '#fff9d8'], [5, 24]);
  const body = `
  <rect x="-40" y="-40" width="1104" height="1104" fill="url(#bg)"/>
  <g filter="url(#b10)">${trunks}</g>
  <g filter="url(#b4)">${bokeh}</g>
  <g filter="url(#b10)">
    <path d="M-40 -40 H130 Q100 500 150 1064 H-40 Z" fill="#2a2617"/>
    <path d="M1064 -40 H905 Q935 500 885 1064 H1064 Z" fill="#211d12"/>
    <path d="M128 -40 Q100 500 148 1064" stroke="#9aab58" stroke-width="10" fill="none" opacity="0.6"/>
  </g>
  <g ${SCREEN} filter="url(#b25)" opacity="0.5" fill="url(#ray)">
    <polygon points="230,-40 330,-40 760,1064 520,1064"/><polygon points="390,-40 430,-40 900,900 810,960"/><polygon points="110,-40 160,-40 330,1064 200,1064"/>
  </g>
  <!-- cloak and strap -->
  <path d="M150 1064 Q170 760 360 650 Q512 610 664 650 Q854 760 874 1064 Z" fill="url(#cloak)"/>
  <g filter="url(#b10)" fill="none">
    <path d="M400 760 Q380 900 410 1064" stroke="#121609" stroke-width="28" opacity="0.6"/>
    <path d="M620 740 Q660 900 640 1064" stroke="#121609" stroke-width="28" opacity="0.6"/>
    <path d="M290 860 Q270 960 280 1064" stroke="#121609" stroke-width="22" opacity="0.5"/>
    <path d="M350 770 Q320 880 340 1064" stroke="#b9c07c" stroke-width="16" opacity="0.4"/>
    <path d="M580 760 Q600 900 590 1064" stroke="#b9c07c" stroke-width="12" opacity="0.25"/>
  </g>
  <path d="M330 700 L700 1064 L770 1064 L385 678 Z" fill="url(#strap)"/>
  <path d="M352 694 L734 1064" stroke="#d4a46a" stroke-width="3" stroke-dasharray="10 12" opacity="0.55" fill="none"/>
  <!-- hood -->
  <path d="M512 150 Q660 160 712 320 Q752 470 716 620 Q630 690 512 690 Q394 690 308 620 Q272 470 312 320 Q364 160 512 150 Z" fill="url(#hood)"/>
  <g filter="url(#b10)" fill="none">
    <path d="M512 172 Q470 260 440 330" stroke="#1e2416" stroke-width="20" opacity="0.5"/>
    <path d="M700 360 Q690 480 650 610" stroke="#141a0e" stroke-width="26" opacity="0.6"/>
    <path d="M380 230 Q338 330 330 480" stroke="#d6dc9c" stroke-width="18" opacity="0.45"/>
  </g>
  <path d="M512 290 Q604 296 634 396 Q652 500 604 578 Q562 624 512 626 Q462 624 420 578 Q372 500 390 396 Q420 296 512 290 Z" fill="url(#hollow)"/>
  <path d="M512 290 Q604 296 634 396 Q652 500 604 578 Q562 624 512 626 Q462 624 420 578 Q372 500 390 396 Q420 296 512 290 Z" fill="none" stroke="#2c331e" stroke-width="16" filter="url(#b4)"/>
  <!-- what the hood lets you see: nose, mouth, a grey beard -->
  <path d="M436 548 Q446 640 512 668 Q578 640 588 548 Q556 592 512 596 Q468 592 436 548 Z" fill="url(#skin)" filter="url(#b2)"/>
  <path d="M508 540 Q522 560 514 572" stroke="#8a5636" stroke-width="5" fill="none" opacity="0.6" filter="url(#b2)"/>
  <path d="M446 592 Q470 668 512 690 Q554 668 578 592 Q546 630 512 632 Q478 630 446 592 Z" fill="url(#beard)" filter="url(#brush)"/>
  <path d="M488 608 Q512 618 540 604" stroke="#2a1610" stroke-width="4" fill="none" opacity="0.8"/>
  <circle cx="474" cy="490" r="4" fill="#f2dfae" opacity="0.7"/><circle cx="552" cy="490" r="4" fill="#f2dfae" opacity="0.7"/>
  <!-- sun catching the hood's edge -->
  <g ${SCREEN} filter="url(#b4)" fill="none" stroke="#fff0b0" opacity="0.85">
    <path d="M512 152 Q364 162 312 322 Q276 460 300 600" stroke-width="12"/>
    <path d="M152 1064 Q172 760 360 652" stroke-width="10"/>
  </g>
  <circle cx="512" cy="680" r="38" fill="url(#brass)"/>
  <circle cx="512" cy="680" r="15" fill="url(#gem)"/><circle cx="507" cy="675" r="4" fill="#fff" opacity="0.9"/>
  <g filter="url(#b10)">
    ${leaf(-20, 990, 150, 40, -25, '#4d6a26')}${leaf(40, 1040, 160, 44, -50, '#7f9e3c')}${leaf(960, 1000, 150, 40, -150, '#435e20')}${leaf(880, 1050, 140, 40, -120, '#6f8e34')}
  </g>`;
  return scene(defs, body);
}

/* ---------------- Place: a castle on a hill at sunset ---------------- */
function place() {
  const r = rnd(21);
  const defs =
    lg('sky', 0, 0, 0, 760, [[0, '#2f4a78'], [0.35, '#8a6a8a'], [0.62, '#e8a36a'], [0.8, '#f7d08a'], [1, '#fbe6b0']]) +
    rg('sun', 690, 560, 380, [[0, '#fffbe6', 1], [0.12, '#ffe9a0', 0.85], [1, '#ffb060', 0]]) +
    lg('hill', 0, 620, 0, 1024, [[0, '#71913f'], [0.45, '#3d5224'], [1, '#18200d']]) +
    lg('stone', 330, 0, 700, 0, [[0, '#34293e'], [0.65, '#4e4050'], [1, '#7a5e58']]) +
    lg('roof', 0, 170, 0, 460, [[0, '#5a2a2a'], [1, '#24101a']]);
  const cloud = (cx: number, cy: number, s: number) =>
    ellipseCloud(r, 9, cx, cy, 300 * s, 50 * s, [60 * s, 140 * s], [26 * s, 50 * s], '#8e6a8a', [0.6, 0.9]) +
    ellipseCloud(r, 7, cx, cy + 24 * s, 260 * s, 30 * s, [50 * s, 110 * s], [12 * s, 24 * s], '#ffcf95', [0.45, 0.8]);
  const trees = Array.from({ length: 30 }, () => {
    const side = r() < 0.5 ? -1 : 1;
    const x = 512 + side * (120 + r() * 520);
    const t = Math.abs(x - 512) / 552;
    const y = 640 + t * t * 190 + r() * 40;
    const s = 16 + r() * 22;
    return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(s)}" fill="#1b2612"/><circle cx="${f(x + s * 0.35)}" cy="${f(y - s * 0.3)}" r="${f(s * 0.45)}" fill="#a89a4c" opacity="0.35"/>`;
  }).join('');
  const crenel = (x0: number, x1: number, y: number, step: number) => Array.from({ length: Math.floor((x1 - x0) / step) + 1 }, (_, i) => `<rect x="${x0 + i * step}" y="${y}" width="${step * 0.55}" height="22"/>`).join('');
  const windows = [[370, 500], [640, 470], [508, 300], [470, 450], [550, 450], [652, 540]]
    .map(([x, y]) => `<circle cx="${x + 5}" cy="${y + 9}" r="22" fill="#ffb54a" opacity="0.5" filter="url(#b10)"/><rect x="${x}" y="${y}" width="10" height="18" rx="5" fill="#ffd27a"/>`)
    .join('');
  const body = `
  <rect x="-40" y="-40" width="1104" height="1104" fill="url(#sky)"/>
  <circle cx="690" cy="560" r="380" fill="url(#sun)" ${SCREEN}/>
  <g filter="url(#b10)">${cloud(250, 190, 1)}${cloud(780, 150, 0.8)}${cloud(560, 330, 0.55)}${cloud(110, 400, 0.5)}</g>
  <g filter="url(#b4)">
    <path d="M-40 640 L80 520 L180 580 L300 470 L420 560 L520 500 L640 580 L760 460 L880 560 L1064 500 V780 H-40 Z" fill="#8a7a9a" opacity="0.7"/>
    <path d="M-40 700 L120 600 L260 660 L380 610 L520 680 L700 620 L860 670 L1064 610 V820 H-40 Z" fill="#5a5674" opacity="0.85"/>
  </g>
  <ellipse cx="512" cy="720" rx="720" ry="70" fill="#ffe6c0" opacity="0.45" filter="url(#b25)"/>
  <path d="M-40 1064 L-40 840 Q200 700 512 640 Q820 700 1064 820 V1064 Z" fill="url(#hill)"/>
  <path d="M-40 840 Q200 700 512 640 Q820 700 1064 820" stroke="#ffd98a" stroke-width="8" fill="none" opacity="0.75" filter="url(#b4)"/>
  <g filter="url(#b2)">${trees}</g>
  <path d="M500 650 Q470 720 540 780 Q640 860 560 960 Q520 1010 560 1064 L640 1064 Q600 1010 640 960 Q730 860 600 770 Q530 720 530 650 Z" fill="#c7a874" opacity="0.8" filter="url(#b4)"/>
  <g fill="url(#stone)">
    <rect x="330" y="560" width="364" height="90"/>${crenel(330, 680, 540, 30)}
    <rect x="340" y="440" width="80" height="200"/><rect x="610" y="410" width="84" height="230"/>
    <rect x="440" y="380" width="150" height="270"/>${crenel(440, 580, 360, 28)}
    <rect x="495" y="260" width="40" height="125"/>
  </g>
  <g fill="url(#roof)"><polygon points="328,446 380,318 432,446"/><polygon points="598,416 652,278 706,416"/><polygon points="488,266 515,168 542,266"/></g>
  <path d="M515 170 V128" stroke="#2a1e24" stroke-width="3"/><path d="M515 130 Q545 124 566 138 Q545 150 515 146 Z" fill="#b02a2a"/>
  <g fill="#ffcf88" opacity="0.7" filter="url(#b2)"><rect x="414" y="440" width="6" height="200"/><rect x="688" y="410" width="6" height="230"/><rect x="584" y="380" width="6" height="270"/><rect x="529" y="260" width="5" height="125"/><polygon points="652,278 706,416 698,416"/></g>
  ${windows}
  <path d="M492 650 V612 Q512 590 532 612 V650 Z" fill="#ffb54a"/><circle cx="512" cy="630" r="40" fill="#ffb54a" opacity="0.4" filter="url(#b10)"/>
  <g stroke="#2a2030" stroke-width="3" fill="none">${[[300, 280, 1], [340, 300, 0.8], [820, 250, 0.9], [860, 270, 0.6]].map(([x, y, s]) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 0 Q8 -7 16 0 Q24 -7 32 0"/>`).join('')}</g>`;
  return scene(defs, body);
}

/* ---------------- Faction: a battered shield and crossed swords on a torch-lit wall ---------------- */
function faction() {
  const r = rnd(31);
  const defs =
    rg('torch', 150, 240, 760, [[0, '#ffb860', 0.9], [0.35, '#c86a28', 0.35], [1, '#000', 0]]) +
    lg('dark', 0, 0, 1024, 0, [[0, '#000', 0], [1, '#000', 0.55]]) +
    lg('blade', 490, 0, 534, 0, [[0, '#fbfcfd'], [0.45, '#c3cad2'], [0.55, '#7d858e'], [1, '#4a5058']]) +
    lg('brassH', 0, 696, 0, 738, [[0, '#fff0b0'], [0.5, '#c99a3a'], [1, '#5a3a10']]) +
    lg('shield', 260, 220, 780, 820, [[0, '#4a74d0'], [0.5, '#2a4a9a'], [1, '#101a3c']]) +
    lg('rim', 260, 220, 780, 820, [[0, '#fff2b8'], [0.35, '#d4a443'], [0.7, '#8a6420'], [1, '#3a2508']]) +
    lg('gold', 380, 370, 640, 600, [[0, '#fff3b0'], [0.4, '#e8b840'], [1, '#7a5210']]) +
    lg('cloth', 0, 760, 0, 940, [[0, '#d63c3a'], [0.5, '#9a1e24'], [1, '#420810']]) +
    rgBox('gem', [[0, '#ffb0a0'], [0.4, '#c01830'], [1, '#3a0008']]) +
    rgBox('pommel', [[0, '#fff2b8'], [0.4, '#d4a443'], [1, '#4a2e08']]);
  const colors = ['#5a4d42', '#4d4238', '#625446', '#463b32', '#56483c'];
  let bricks = '';
  for (let row = 0, y = -40; y < 1064; y += 72, row++) {
    for (let x = -40 - (row % 2) * 75; x < 1064; x += 150) {
      bricks += `<rect x="${f(x + 4)}" y="${f(y + 4)}" width="${f(142 + (r() - 0.5) * 6)}" height="64" rx="8" fill="${colors[Math.floor(r() * colors.length)]}"/>`;
    }
  }
  const sword = (rot: number) => `
    <g transform="rotate(${rot} 512 520)">
      <path d="M490 130 L512 70 L534 130 V700 H490 Z" fill="url(#blade)"/>
      <path d="M512 140 V680" stroke="#5e666e" stroke-width="5" opacity="0.7"/>
      <path d="M492 130 L512 74" stroke="#fff" stroke-width="3" opacity="0.8"/>
      <rect x="420" y="696" width="184" height="42" rx="18" fill="url(#brassH)"/>
      <rect x="494" y="738" width="36" height="120" fill="#3a2010"/>
      ${Array.from({ length: 7 }, (_, i) => `<path d="M494 ${748 + i * 16} L530 ${740 + i * 16}" stroke="#6a4020" stroke-width="5"/>`).join('')}
      <circle cx="512" cy="878" r="30" fill="url(#pommel)"/>
    </g>`;
  const SHIELD = 'M512 210 Q640 250 770 240 Q790 560 512 820 Q234 560 254 240 Q384 250 512 210 Z';
  const body = `
  <rect x="-40" y="-40" width="1104" height="1104" fill="#221a14"/>
  <g filter="url(#brush)">${bricks}</g>
  <rect x="-40" y="-40" width="1104" height="1104" fill="url(#torch)" ${SCREEN}/>
  <rect x="-40" y="-40" width="1104" height="1104" fill="url(#dark)"/>
  <path d="${SHIELD}" transform="translate(40 40)" fill="#000" opacity="0.55" filter="url(#b25)"/>
  ${sword(-38)}${sword(38)}
  <path d="${SHIELD}" fill="url(#shield)"/>
  <path d="M512 226 V804 Q270 560 268 254 Q384 264 512 226 Z" fill="#fff" opacity="0.07"/>
  <g stroke="#d8e2ff" stroke-width="2" opacity="0.25" fill="none"><path d="M330 330 L380 360"/><path d="M600 640 L660 600"/><path d="M420 680 L440 720"/><path d="M640 330 L700 350"/></g>
  <ellipse cx="512" cy="740" rx="200" ry="70" fill="#000" opacity="0.3" filter="url(#b25)"/>
  <path d="${SHIELD}" fill="none" stroke="url(#rim)" stroke-width="26"/>
  <path d="M400 560 L380 400 L450 470 L512 370 L574 470 L644 400 L624 560 Z" fill="url(#gold)"/>
  <rect x="396" y="556" width="232" height="44" rx="10" fill="url(#gold)"/>
  ${[446, 512, 578].map((x) => `<circle cx="${x}" cy="578" r="13" fill="url(#gem)"/><circle cx="${x - 4}" cy="574" r="3" fill="#fff"/>`).join('')}
  ${[[380, 400], [512, 368], [644, 400]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="#fff3b0"/>`).join('')}
  <ellipse cx="400" cy="330" rx="130" ry="60" transform="rotate(-30 400 330)" fill="#fff" opacity="0.18" filter="url(#b25)"/>
  <path d="M512 210 Q384 250 254 240 Q234 560 512 820" fill="none" stroke="#ffcf88" stroke-width="7" opacity="0.6" filter="url(#b4)" ${SCREEN}/>
  <path d="M180 800 L280 788 L280 890 L180 902 L220 850 Z" fill="#6a1018"/><path d="M844 800 L744 788 L744 890 L844 902 L804 850 Z" fill="#5a0c14"/>
  <path d="M240 760 Q512 840 784 760 L784 870 Q512 950 240 870 Z" fill="url(#cloth)"/>
  <path d="M260 782 Q512 858 764 782" stroke="#ff8a7a" stroke-width="10" opacity="0.45" fill="none" filter="url(#b4)"/>
  <g filter="url(#b10)" fill="#2a0408" opacity="0.6"><ellipse cx="270" cy="815" rx="26" ry="60"/><ellipse cx="754" cy="815" rx="26" ry="60"/></g>`;
  return scene(defs, body);
}

/* ---------------- Item: a treasure chest glowing in a dark vault ---------------- */
function item() {
  const r = rnd(41);
  const defs =
    rg('room', 512, 470, 780, [[0, '#5c4630'], [0.5, '#2a1f15'], [1, '#0b0805']]) +
    rg('glow', 512, 470, 440, [[0, '#fff2c0', 1], [0.22, '#ffd060', 0.7], [1, '#ff9a20', 0]]) +
    lg('wood', 0, 510, 0, 840, [[0, '#8a5a30'], [0.5, '#62401f'], [1, '#2e1a0b']]) +
    lg('lidW', 0, 290, 0, 480, [[0, '#a06e3a'], [1, '#4a2c14']]) +
    lg('ironL', 340, 0, 400, 0, [[0, '#8a8a90'], [0.5, '#3a3a40'], [1, '#18181c']]) +
    lg('ironR', 624, 0, 684, 0, [[0, '#7a7a80'], [0.5, '#34343a'], [1, '#141418']]) +
    lg('front', 0, 510, 0, 640, [[0, '#ffd060', 0.55], [1, '#ffd060', 0]]) +
    lg('plate', 462, 540, 562, 660, [[0, '#fff0b0'], [0.5, '#c99a3a'], [1, '#5a3a10']]) +
    rgBox('coin', [[0, '#fff6c0'], [0.4, '#f0c040'], [1, '#6a4008']]);
  const coins = (n: number, cx: number, cy: number, sx: number, sy: number, rx = 22) =>
    Array.from({ length: n }, () => `<ellipse cx="${f(cx + (r() - 0.5) * sx)}" cy="${f(cy + (r() - 0.5) * sy)}" rx="${rx}" ry="${f(rx * 0.45)}" fill="url(#coin)"/>`).join('');
  const grain = Array.from({ length: 34 }, () => {
    const y = 520 + r() * 300;
    return `<path d="M278 ${f(y)} Q400 ${f(y + (r() - 0.5) * 12)} 512 ${f(y)} T746 ${f(y + (r() - 0.5) * 8)}" stroke="${r() < 0.6 ? '#1e0f05' : '#c08a52'}" stroke-width="${f(1 + r() * 2)}" opacity="0.3" fill="none"/>`;
  }).join('');
  const body = `
  <rect x="-40" y="-40" width="1104" height="1104" fill="url(#room)"/>
  <ellipse cx="512" cy="900" rx="720" ry="260" fill="#3a2c1e" opacity="0.8" filter="url(#b25)"/>
  <circle cx="512" cy="470" r="440" fill="url(#glow)" ${SCREEN}/>
  <ellipse cx="512" cy="850" rx="340" ry="52" fill="#000" opacity="0.6" filter="url(#b10)"/>
  <path d="M270 520 L300 440 H724 L754 520 Z" fill="#ffe08a"/>
  <g filter="url(#b4)">${coins(26, 512, 470, 360, 40)}</g>
  <g transform="rotate(-8 270 470)">
    <path d="M270 470 Q276 290 512 280 Q748 290 754 470 Z" fill="url(#lidW)"/>
    <path d="M300 440 Q320 320 500 296" stroke="#d09a5a" stroke-width="10" opacity="0.4" fill="none" filter="url(#b4)"/>
    <path d="M340 466 Q344 316 372 296 L400 292 Q392 330 392 466 Z" fill="#3a3a40"/>
    <path d="M632 466 Q632 330 624 292 L652 296 Q680 316 684 466 Z" fill="#2c2c32"/>
  </g>
  <rect x="270" y="510" width="484" height="320" rx="10" fill="url(#wood)"/>
  ${grain}
  <g stroke="#1a0c04" stroke-width="4" opacity="0.8">${[592, 672, 752].map((y) => `<path d="M272 ${y} H752"/>`).join('')}</g>
  <rect x="270" y="510" width="484" height="130" fill="url(#front)" ${SCREEN}/>
  <rect x="340" y="510" width="60" height="320" fill="url(#ironL)"/><rect x="624" y="510" width="60" height="320" fill="url(#ironR)"/>
  ${[540, 620, 700, 780].map((y) => `<circle cx="370" cy="${y}" r="7" fill="#9a9aa0"/><circle cx="654" cy="${y}" r="7" fill="#8a8a90"/><circle cx="368" cy="${y - 2}" r="2" fill="#fff"/>`).join('')}
  <path d="M462 540 H562 V630 Q512 670 462 630 Z" fill="url(#plate)"/>
  <path d="M500 586 A12 12 0 1 1 524 586 L520 618 H504 Z" fill="#1a0e04"/>
  <path d="M272 512 H752" stroke="#ffd98a" stroke-width="7" opacity="0.8" filter="url(#b4)"/>
  ${coins(14, 210, 852, 150, 34, 24)}${coins(12, 800, 860, 150, 30, 24)}
  <circle cx="190" cy="830" r="24" fill="url(#coin)"/><circle cx="840" cy="836" r="22" fill="url(#coin)"/>
  <polygon points="300,850 322,838 340,856 322,872" fill="#c01830"/><polygon points="306,850 322,842 326,852" fill="#ffb0b0"/>
  <polygon points="740,880 760,866 778,884 758,898" fill="#1a9a5a"/><polygon points="746,880 760,870 764,880" fill="#b0ffd0"/>
  ${glowDots(r, 45, 512, 380, 640, 420, ['#fff0c0', '#ffe090'], [1.5, 4.5])}`;
  return scene(defs, body);
}

/* ---------------- Quest: a hand-drawn map on a table by candlelight ---------------- */
function quest() {
  const r = rnd(51);
  const defs =
    WOOD +
    rg('parch', 512, 500, 480, [[0, '#f4e3b8'], [0.7, '#e0c48c'], [1, '#a77a42']]) +
    rg('candle', 930, 100, 760, [[0, '#ffd080', 0.85], [0.4, '#ff9a3a', 0.25], [1, '#ff9a3a', 0]]) +
    lg('wax', 880, 0, 970, 0, [[0, '#f6ead0'], [0.6, '#e2cfa4'], [1, '#a88a5a']]) +
    rgBox('seal', [[0, '#e85a5a'], [0.5, '#a8182a'], [1, '#4a0610']]);
  const INK = '#4a2e18';
  const island = blob(r, 500, 520, 230, 170, 0.35, 34);
  const mountains = [[430, 430], [470, 410], [510, 440], [560, 420]].map(([x, y]) => `<path d="M${x} ${y} l20 -34 l20 34" /><path d="M${x + 20} ${y - 34} l6 34" stroke-width="2"/>`).join('');
  const trees = Array.from({ length: 12 }, () => {
    const x = 380 + r() * 120;
    const y = 540 + r() * 90;
    return `<circle cx="${f(x)}" cy="${f(y)}" r="7"/><path d="M${f(x)} ${f(y + 7)} v8"/>`;
  }).join('');
  const hatch = Array.from({ length: 26 }, (_, i) => {
    const a = (i / 26) * Math.PI * 2;
    const x = 500 + Math.cos(a) * 285;
    const y = 520 + Math.sin(a) * 215;
    return `<path d="M${f(x - 12)} ${f(y)} h24"/>`;
  }).join('');
  const body = `
  ${woodTable(52)}
  <path d="${roughRect(rnd(53), 190, 200, 690, 660, 16)}" transform="rotate(-5 512 512) translate(30 34)" fill="#000" opacity="0.55" filter="url(#b25)"/>
  <g transform="rotate(-5 512 512)">
    <path d="${roughRect(r, 170, 180, 690, 660, 18)}" fill="url(#parch)"/>
    <path d="${roughRect(rnd(54), 170, 180, 690, 660, 18)}" fill="none" stroke="#5a3418" stroke-width="20" opacity="0.45" filter="url(#b10)"/>
    <g filter="url(#b10)">${ellipseCloud(r, 6, 512, 520, 560, 520, [20, 60], [16, 50], '#a07040', [0.08, 0.16])}</g>
    <g stroke="${INK}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.85">
      <path d="${island}" fill="#d9bf86" fill-opacity="0.5" stroke-width="4"/>
      <g stroke-width="2.5" opacity="0.6">${hatch}</g>
      <g stroke-width="3">${mountains}</g>
      <g stroke-width="2.5">${trees}</g>
      <path d="M300 760 Q360 700 420 680 Q470 660 460 600 Q450 520 540 500 Q600 490 620 430 Q630 380 660 360" stroke="#8a2a1a" stroke-width="6" stroke-dasharray="2 18"/>
      <path d="M645 335 L695 385 M695 335 L645 385" stroke="#a01818" stroke-width="10"/>
      <g transform="translate(290 300)" stroke-width="3"><circle r="44"/><path d="M0 -60 L10 -10 L60 0 L10 10 L0 60 L-10 10 L-60 0 L-10 -10 Z" fill="#c9a86a" fill-opacity="0.6"/><path d="M0 -60 V60 M-60 0 H60" stroke-width="1.5"/></g>
      <g stroke-width="3" opacity="0.45"><path d="M560 240 H780"/><path d="M590 268 H750"/></g>
    </g>
    <g transform="translate(760 780)">
      <path d="M-30 10 L-60 120 L-30 100 L-10 130 L0 20 Z" fill="#8a1620"/><path d="M10 10 L60 110 L72 80 L100 84 L30 0 Z" fill="#a81e2a"/>
      <path d="${blob(rnd(55), 0, 0, 58, 54, 0.22)}" fill="url(#seal)"/>
      <circle r="34" fill="none" stroke="#5a0610" stroke-width="5" opacity="0.6"/><circle r="34" fill="none" stroke="#ff9a9a" stroke-width="2" opacity="0.4" transform="translate(-2 -2)"/>
      <path d="M0 -20 Q6 -6 20 0 Q6 6 0 20 Q-6 6 -20 0 Q-6 -6 0 -20 Z" fill="#6a0a14" opacity="0.8"/>
      <ellipse cx="-20" cy="-24" rx="14" ry="7" fill="#fff" opacity="0.35" filter="url(#b2)"/>
    </g>
  </g>
  <rect x="-40" y="-40" width="1104" height="1104" fill="url(#candle)" ${SCREEN} opacity="0.7"/>`;
  return scene(defs, body);
}

/* ---------------- Lore: an old tome open in a library, light through a window ---------------- */
function lore() {
  const r = rnd(61);
  const defs =
    WOOD +
    lg('beam', 200, 0, 600, 1000, [[0, '#fff0c8', 0.7], [1, '#fff0c8', 0]]) +
    lg('pageL', 220, 0, 512, 0, [[0, '#c9ab78'], [0.12, '#f3e4c0'], [0.8, '#ead6a8'], [1, '#8a6a3e']]) +
    lg('pageR', 512, 0, 804, 0, [[0, '#8a6a3e'], [0.2, '#ead6a8'], [0.88, '#f3e4c0'], [1, '#c9ab78']]) +
    lg('cover', 0, 430, 0, 840, [[0, '#6a2a18'], [1, '#260c05']]) +
    rg('magic', 512, 420, 300, [[0, '#ffe9a8', 0.7], [1, '#ffb040', 0]]);
  const bookColors = ['#6a2a1a', '#2a3a5a', '#3a4a2a', '#7a5a2a', '#4a2a3a', '#8a6a3a', '#5a1a1a'];
  let shelves = '';
  for (const y of [20, 270, 520]) {
    let x = -30;
    while (x < 1060) {
      const w = 22 + r() * 30;
      const h = 150 + r() * 70;
      const c = bookColors[Math.floor(r() * bookColors.length)];
      shelves += `<rect x="${f(x)}" y="${f(y + 220 - h)}" width="${f(w)}" height="${f(h)}" fill="${c}"/><rect x="${f(x + 3)}" y="${f(y + 240 - h)}" width="${f(w - 6)}" height="6" fill="#c9a050" opacity="0.6"/>`;
      x += w + 2;
    }
    shelves += `<rect x="-40" y="${y + 220}" width="1104" height="28" fill="#3a2412"/>`;
  }
  const lines = (x0: number, x1: number, y0: number, n: number, curve: number) =>
    Array.from({ length: n }, (_, i) => {
      const y = y0 + i * 24;
      return `<path d="M${x0} ${y} Q${(x0 + x1) / 2} ${y + curve} ${x1} ${y}" stroke-dasharray="${f(20 + r() * 50)} 9 ${f(10 + r() * 40)} 9 ${f(30 + r() * 30)} 9"/>`;
    }).join('');
  const body = `
  <rect x="-40" y="-40" width="1104" height="1104" fill="#1e140c"/>
  <g filter="url(#b10)">${shelves}</g>
  <rect x="-40" y="-40" width="1104" height="1104" fill="#120a06" opacity="0.5"/>
  <g ${SCREEN} filter="url(#b25)"><polygon points="120,-40 380,-40 800,1064 400,1064" fill="url(#beam)"/></g>
  <rect x="-40" y="720" width="1104" height="400" fill="url(#woodBase)"/>
  <path d="M-40 722 H1064" stroke="#a87a48" stroke-width="5" opacity="0.6" filter="url(#b2)"/>
  <ellipse cx="512" cy="840" rx="380" ry="50" fill="#000" opacity="0.6" filter="url(#b10)"/>
  <path d="M512 830 Q380 770 170 800 L190 460 Q380 430 512 510 Q644 430 834 460 L854 800 Q644 770 512 830 Z" fill="url(#cover)"/>
  <g stroke="#b89868" stroke-width="1.5" fill="none">${Array.from({ length: 8 }, (_, i) => `<path d="M512 ${790 + i * 4} Q380 ${730 + i * 4} ${200 + i} ${758 + i * 4}"/><path d="M512 ${790 + i * 4} Q644 ${730 + i * 4} ${824 - i} ${758 + i * 4}"/>`).join('')}</g>
  <path d="M512 780 Q380 720 220 744 L236 440 Q380 410 512 480 Z" fill="url(#pageL)"/>
  <path d="M512 780 Q644 720 804 744 L788 440 Q644 410 512 480 Z" fill="url(#pageR)"/>
  <path d="M512 480 V780" stroke="#4a3018" stroke-width="10" opacity="0.5" filter="url(#b4)"/>
  <g stroke="#4a3426" stroke-width="3" opacity="0.5" fill="none">${lines(320, 480, 500, 10, 12)}${lines(268, 310, 548, 2, 2)}${lines(548, 760, 640, 5, -10)}</g>
  <rect x="266" y="490" width="42" height="46" fill="#8a1a1a" opacity="0.85"/><path d="M276 528 L287 498 L298 528 M280 518 H294" stroke="#e8c060" stroke-width="3" fill="none"/>
  <g transform="translate(655 545)" stroke="#5a3a26" stroke-width="3" fill="none" opacity="0.65"><circle r="62"/><circle r="48"/><polygon points="0,-48 42,24 -42,24"/><polygon points="0,48 42,-24 -42,-24"/></g>
  <path d="M600 780 V900 L622 876 L644 900 V766" fill="#9a1a26"/>
  <circle cx="512" cy="420" r="300" fill="url(#magic)" ${SCREEN} opacity="0.6"/>
  ${glowDots(r, 30, 512, 380, 380, 260, ['#fff0b0', '#ffd070'], [2, 5])}
  ${glowDots(r, 30, 420, 400, 300, 700, ['#fff6e0'], [1, 3])}`;
  return scene(defs, body);
}

/* ---------------- Session: a campfire at night with a d20 beside it ---------------- */
function session() {
  const r = rnd(71);
  const defs =
    rg('night', 480, 640, 820, [[0, '#3a2a1a'], [0.4, '#15171a'], [1, '#05070b']]) +
    rg('fireGlow', 470, 640, 600, [[0, '#ffcf70', 0.95], [0.3, '#ff8a2a', 0.45], [1, '#ff6a1a', 0]]) +
    rg('ground', 470, 830, 640, [[0, '#7a5232'], [0.5, '#2e2014'], [1, '#0e0a06']]) +
    lg('logA', 0, 720, 0, 790, [[0, '#9a6a3a'], [0.5, '#5a3418'], [1, '#22120a']]) +
    rgBox('stone', [[0, '#d8a888'], [0.45, '#6a6260'], [1, '#1e1a1c']], 0.4, 0.2);
  const trunks = Array.from({ length: 9 }, (_, i) => {
    const x = -20 + i * 120 + r() * 50;
    const w = 40 + r() * 60;
    const lit = x + w / 2 < 470 ? x + w - 6 : x;
    return `<rect x="${f(x)}" y="-40" width="${f(w)}" height="${f(600 + r() * 200)}" fill="#0c0a08"/><rect x="${f(lit)}" y="120" width="8" height="${f(400 + r() * 200)}" fill="#c8783a" opacity="0.4"/>`;
  }).join('');
  const stones = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2 + 0.2;
    return `<ellipse cx="${f(470 + Math.cos(a) * 220)}" cy="${f(800 + Math.sin(a) * 70)}" rx="${f(52 + r() * 14)}" ry="${f(32 + r() * 8)}" fill="url(#stone)"/>`;
  }).join('');
  const embers = Array.from({ length: 50 }, () => {
    const h = r();
    return `<circle cx="${f(470 + (r() - 0.5) * (60 + h * 360))}" cy="${f(620 - h * 520)}" r="${f(1.5 + r() * 3.5)}" fill="${r() < 0.5 ? '#ffb040' : '#ffe080'}" opacity="${(0.4 + r() * 0.6).toFixed(2)}" ${r() < 0.4 ? 'filter="url(#b2)"' : ''}/>`;
  }).join('');
  const FLAME = 'M470 250 Q530 380 600 440 Q690 530 650 650 Q610 750 470 760 Q330 750 290 650 Q250 530 340 440 Q370 500 400 500 Q380 380 470 250 Z';
  const body = `
  <rect x="-40" y="-40" width="1104" height="1104" fill="url(#night)"/>
  ${glowDots(r, 20, 512, 60, 1000, 120, ['#cfd8ff'], [1, 2])}
  <g filter="url(#b10)">${trunks}</g>
  <g filter="url(#b25)" fill="#05070a">${ellipseCloud(r, 10, 512, 0, 1200, 120, [120, 240], [60, 120], '#05070a', [0.9, 1])}</g>
  <ellipse cx="470" cy="860" rx="660" ry="230" fill="url(#ground)"/>
  <circle cx="470" cy="640" r="600" fill="url(#fireGlow)" ${SCREEN}/>
  <g filter="url(#b25)" opacity="0.1" fill="#b0a8a0">${ellipseCloud(r, 5, 470, 160, 200, 160, [40, 90], [60, 110], '#b0a8a0', [0.6, 1])}</g>
  ${stones}
  <rect x="250" y="720" width="440" height="70" rx="35" fill="url(#logA)" transform="rotate(16 470 755)"/>
  <rect x="250" y="720" width="440" height="70" rx="35" fill="url(#logA)" transform="rotate(-16 470 755)"/>
  <g stroke="#1a0c04" stroke-width="3" opacity="0.6" fill="none">${Array.from({ length: 8 }, (_, i) => `<path d="M${290 + i * 50} 740 q20 6 40 0" transform="rotate(16 470 755)"/><path d="M${290 + i * 50} 770 q20 -6 40 0" transform="rotate(-16 470 755)"/>`).join('')}</g>
  <g fill="#d8b080"><ellipse cx="676" cy="812" rx="18" ry="30"/><ellipse cx="264" cy="812" rx="18" ry="30"/></g>
  <g ${SCREEN}>
    <path d="${FLAME}" fill="#e0401a" opacity="0.9" filter="url(#b10)"/>
    <path d="M470 400 Q520 480 560 520 Q610 580 580 670 Q550 740 470 744 Q390 740 360 670 Q340 590 390 540 Q410 580 430 580 Q420 480 470 400 Z" fill="#ff9a20" filter="url(#b10)"/>
    <path d="M470 540 Q510 600 520 650 Q530 710 470 720 Q410 710 420 650 Q430 600 470 540 Z" fill="#ffe070" filter="url(#b4)"/>
    <ellipse cx="470" cy="690" rx="40" ry="30" fill="#fff6d0" filter="url(#b10)"/>
    <path d="M560 470 Q600 400 590 330 Q630 400 620 470 Z" fill="#ff7a1a" opacity="0.7" filter="url(#b10)"/>
    <path d="M370 470 Q330 410 350 350 Q300 420 320 480 Z" fill="#ff7a1a" opacity="0.7" filter="url(#b10)"/>
  </g>
  ${embers}
  <ellipse cx="790" cy="930" rx="120" ry="24" fill="#000" opacity="0.6" filter="url(#b10)"/>
  <g transform="translate(790 820) rotate(12)">
    <path d="M0 -125 L-108 -62 L-66 42 Z" fill="#c088f8"/>
    <path d="M0 -125 L108 -62 L66 42 Z" fill="#6a2aa8"/>
    <path d="M0 -125 L-66 42 H66 Z" fill="#9a58e0"/>
    <path d="M-108 -62 L-108 62 L-66 42 Z" fill="#a86ae8"/>
    <path d="M108 -62 L108 62 L66 42 Z" fill="#4a1a80"/>
    <path d="M-108 62 L0 125 L-66 42 Z" fill="#7a3ac0"/>
    <path d="M108 62 L0 125 L66 42 Z" fill="#3a1060"/>
    <path d="M-66 42 H66 L0 125 Z" fill="#5a2090"/>
    <g stroke="#e8ccff" stroke-width="2" opacity="0.5" fill="none"><path d="M0 -125 L-108 -62 L-108 62 L0 125 L108 62 L108 -62 Z M0 -125 L-66 42 H66 Z M-108 -62 L-66 42 L-108 62 M108 -62 L66 42 L108 62 M-66 42 L0 125 L66 42"/></g>
    <text x="0" y="12" font-family="Georgia, serif" font-weight="700" font-size="46" text-anchor="middle" fill="#f0d070" stroke="#3a1060" stroke-width="1">20</text>
    <ellipse cx="-58" cy="-60" rx="20" ry="9" transform="rotate(-30 -58 -60)" fill="#fff" opacity="0.7" filter="url(#b2)"/>
  </g>`;
  return scene(defs, body);
}

/* ---------------- Note: quill, inkpot and a written page on a desk ---------------- */
function note() {
  const r = rnd(81);
  const defs =
    WOOD +
    rg('parch', 440, 520, 440, [[0, '#f6e7c0'], [0.7, '#e4caa0'], [1, '#ad8452']]) +
    rg('candle', 60, 60, 820, [[0, '#ffd080', 0.85], [0.4, '#ff9a3a', 0.25], [1, '#ff9a3a', 0]]) +
    rgBox('glass', [[0, '#5a5478'], [0.55, '#1a1626'], [1, '#06050a']], 0.3, 0.3) +
    lg('collar', 580, 0, 720, 0, [[0, '#fff0b0'], [0.4, '#c99a3a'], [1, '#4a2e08']]);
  const writing = Array.from({ length: 11 }, (_, i) => {
    const y = 300 + i * 44;
    const len = i === 10 ? 160 : 240 + r() * 200;
    let d = `M270 ${y}`;
    for (let x = 270; x < 270 + len; x += 7) d += ` L${f(x)} ${f(y + Math.sin(x * 0.35 + i) * 5 + (r() - 0.5) * 4)}`;
    return `<path d="${d}"/>`;
  }).join('');
  // the quill: barbs off a curved shaft
  const P = (t: number) => {
    const x = (1 - t) ** 2 * 650 + 2 * (1 - t) * t * 720 + t * t * 900;
    const y = (1 - t) ** 2 * 640 + 2 * (1 - t) * t * 360 + t * t * 120;
    return [x, y];
  };
  let barbs = '';
  for (let t = 0.12; t <= 1; t += 0.01) {
    if (r() < 0.08) continue;
    const [x, y] = P(t);
    const [x2, y2] = P(Math.min(1, t + 0.01));
    const dx = x2 - x;
    const dy = y2 - y;
    const len = Math.hypot(dx, dy);
    const tx = dx / len;
    const ty = dy / len;
    const s = Math.sin(Math.PI * Math.min(1, (t - 0.1) / 0.9)) ** 0.7;
    const c = t < 0.3 ? '#bdb3a0' : '#f4efe4';
    for (const side of [-1, 1]) {
      const L = (side < 0 ? 90 : 56) * s;
      const ex = x + -ty * side * L + tx * L * 0.55;
      const ey = y + tx * side * L + ty * L * 0.55;
      barbs += `<path d="M${f(x)} ${f(y)} Q${f(x + -ty * side * L * 0.6)} ${f(y + tx * side * L * 0.6)} ${f(ex)} ${f(ey)}" stroke="${c}" />`;
    }
  }
  const body = `
  ${woodTable(82)}
  <rect x="-40" y="-40" width="1104" height="1104" fill="url(#candle)" ${SCREEN}/>
  <path d="${roughRect(rnd(83), 220, 220, 480, 620, 10)}" transform="rotate(-8 460 520) translate(24 28)" fill="#000" opacity="0.5" filter="url(#b25)"/>
  <g transform="rotate(-8 460 520)">
    <path d="${roughRect(r, 220, 220, 480, 620, 10)}" fill="url(#parch)"/>
    <g stroke="#3a2414" stroke-width="2.6" fill="none" opacity="0.6" stroke-linejoin="round">${writing}</g>
    <path d="M300 790 Q340 740 380 790 T470 780" stroke="#3a2414" stroke-width="3" fill="none" opacity="0.7"/>
    <g filter="url(#b10)">${ellipseCloud(r, 4, 460, 520, 400, 500, [20, 50], [16, 40], '#a07040', [0.08, 0.15])}</g>
  </g>
  <ellipse cx="680" cy="870" rx="170" ry="30" fill="#000" opacity="0.6" filter="url(#b10)"/>
  <g fill="none" stroke-width="2.4" opacity="0.92" stroke-linecap="round">${barbs}</g>
  <path d="M650 640 Q720 360 900 120" stroke="#f8f2e4" stroke-width="5" fill="none"/>
  <path d="M650 640 Q680 520 700 470" stroke="#d8cdb8" stroke-width="7" fill="none"/>
  <path d="M560 660 Q560 630 600 626 H760 Q800 630 800 660 Q860 700 860 780 Q860 880 680 884 Q500 880 500 780 Q500 700 560 660 Z" fill="url(#glass)"/>
  <path d="M530 740 Q540 690 590 670 Q560 720 562 810 Q540 800 530 740 Z" fill="#fff" opacity="0.25" filter="url(#b4)"/>
  <ellipse cx="575" cy="700" rx="10" ry="5" fill="#fff" opacity="0.8" transform="rotate(-40 575 700)"/>
  <path d="M830 740 Q840 800 800 850" stroke="#ffcf88" stroke-width="5" fill="none" opacity="0.4" filter="url(#b2)"/>
  <rect x="590" y="590" width="180" height="48" rx="12" fill="url(#collar)"/>
  <ellipse cx="680" cy="592" rx="88" ry="12" fill="#0a0810"/>
  <path d="M650 640 L638 600 L664 596 Z" fill="#1a1410"/>`;
  return scene(defs, body);
}

const ALL = { npc, place, faction, item, quest, lore, session, note };
mkdirSync(SVG_DIR, { recursive: true });
mkdirSync(PNG_DIR, { recursive: true });
for (const [k, fn] of Object.entries(ALL)) writeFileSync(join(SVG_DIR, `${k}.svg`), fn());

const r = spawnSync(join(ROOT, 'node_modules', '.bin', 'electron'), [join(import.meta.dir, 'render-svgs.cjs'), SVG_DIR, PNG_DIR, String(PX)], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`Wrote ${Object.keys(ALL).length} fallbacks to ${PNG_DIR}`);
