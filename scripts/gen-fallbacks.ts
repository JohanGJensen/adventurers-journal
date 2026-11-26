// Generates the stand-in pictures for notes without an image of their own: one per note kind except players,
// drawn in the app icon's style (bold outlines, cel shading, gold on a night-purple ground).
// Writes the vector sources to build/fallbacks/*.svg, then renders them to public/fallbacks/*.png with Electron.
// Usage: bun scripts/gen-fallbacks.ts
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const SVG_DIR = join(ROOT, 'build', 'fallbacks');
const PNG_DIR = join(ROOT, 'public', 'fallbacks');
const PX = 512;

const INK = '#2a1206'; // outline, as on the icon
const GOLD = '#ffcc3d';
const GOLD_HI = '#fff3a8';

const defs = `
  <defs>
    <radialGradient id="bg" cx="50%" cy="45%" r="70%">
      <stop offset="0" stop-color="#3a2560"/><stop offset="0.6" stop-color="#1c1233"/><stop offset="1" stop-color="#0c0818"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#fff6c2"/><stop offset="0.3" stop-color="#ffd23f" stop-opacity="0.8"/><stop offset="1" stop-color="#ff9a1f" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="arcane" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#e6f0ff"/><stop offset="0.3" stop-color="#8ab4ff" stop-opacity="0.75"/><stop offset="1" stop-color="#4d8bff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="aura" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#ff8a3d" stop-opacity="0.4"/><stop offset="1" stop-color="#ff8a3d" stop-opacity="0"/>
    </radialGradient>
    <symbol id="sparkle" viewBox="-10 -10 20 20">
      <path d="M0-10 Q1.5-1.5 10 0 Q1.5 1.5 0 10 Q-1.5 1.5 -10 0 Q-1.5-1.5 0-10Z"/>
    </symbol>
  </defs>`;

/** [x, y, size] of four-point sparkles, and [x, y, r] of gold dots. */
type Sparkles = { stars: [number, number, number][]; dots: [number, number, number][] };
const sparkles = ({ stars, dots }: Sparkles) => `
  <g fill="#fff6c2" stroke="${INK}" stroke-width="1.2">
    ${stars.map(([x, y, s]) => `<use href="#sparkle" x="${x}" y="${y}" width="${s}" height="${s}"/>`).join('')}
  </g>
  <g fill="#ffd84a">${dots.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`;

const svg = (body: string, s: Sparkles, aura = 'aura') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">${defs}
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <circle cx="512" cy="512" r="440" fill="url(#${aura})"/>
  ${body}
  ${sparkles(s)}
</svg>
`;

/** Shadow ellipse under a subject. */
const shadow = (cx: number, cy: number, rx: number, ry = 40) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000" opacity="0.35"/>`;

const g = (inner: string, extra = '') => `<g stroke="${INK}" stroke-width="16" stroke-linejoin="round" stroke-linecap="round" ${extra}>${inner}</g>`;

/* ---------- NPC: a hooded stranger, face in shadow (centred for the round portrait crop) ---------- */
const npc = svg(
  g(`
    <!-- cloak -->
    <path d="M170 1060 Q190 760 380 640 L644 640 Q834 760 854 1060 Z" fill="#5b3a6e"/>
    <path d="M200 1040 Q220 780 380 660 L430 660 Q300 800 290 1040 Z" fill="#7a5290" stroke="none"/>
    <path d="M854 1040 Q834 780 700 680 Q760 820 760 1040 Z" fill="#43284f" stroke="none"/>
    <path d="M170 1060 Q190 760 380 640 L644 640 Q834 760 854 1060" fill="none"/>
    <g fill="none" stroke-width="10"><path d="M400 760 Q380 880 400 1024"/><path d="M624 760 Q650 880 630 1024"/></g>
    <!-- hood -->
    <path d="M512 150 Q660 160 712 320 Q752 470 716 620 Q630 690 512 690 Q394 690 308 620 Q272 470 312 320 Q364 160 512 150 Z" fill="#5b3a6e"/>
    <path d="M512 168 Q400 180 346 320 Q314 430 324 590 Q350 430 410 320 Q456 236 512 168 Z" fill="#7a5290" stroke="none"/>
    <path d="M700 380 Q730 500 700 610 Q640 660 580 676 Q680 560 700 380 Z" fill="#43284f" stroke="none"/>
    <path d="M512 150 Q660 160 712 320 Q752 470 716 620 Q630 690 512 690 Q394 690 308 620 Q272 470 312 320 Q364 160 512 150 Z" fill="none"/>
    <!-- the face in shadow -->
    <path d="M512 290 Q604 296 634 396 Q652 500 604 578 Q562 624 512 626 Q462 624 420 578 Q372 500 390 396 Q420 296 512 290 Z" fill="#140b22"/>
    <path d="M512 300 Q590 306 618 380 Q560 330 512 330 Q464 330 406 380 Q434 306 512 300 Z" fill="#2a1a3d" stroke="none"/>
    <!-- clasp -->
    <circle cx="512" cy="684" r="40" fill="${GOLD}"/>
    <circle cx="512" cy="684" r="18" fill="#d6304a" stroke-width="8"/>
    <circle cx="505" cy="677" r="5" fill="#fff" stroke="none"/>
  `) +
    `
  <!-- glinting eyes -->
  <circle cx="470" cy="470" r="46" fill="url(#glow)" opacity="0.55"/>
  <circle cx="554" cy="470" r="46" fill="url(#glow)" opacity="0.55"/>
  <g fill="#ffd84a" stroke="${INK}" stroke-width="5">
    <path d="M446 472 Q470 452 494 466 Q470 484 446 472 Z"/>
    <path d="M530 466 Q554 452 578 472 Q554 484 530 466 Z"/>
  </g>`,
  { stars: [[150, 220, 64], [810, 180, 52], [860, 560, 40], [110, 520, 34]], dots: [[250, 150, 8], [900, 400, 8], [90, 720, 7], [940, 760, 7]] },
);

/* ---------- Place: a castle on a hill under the moon ---------- */
const place = svg(
  g(`
    <!-- moon -->
    <circle cx="770" cy="230" r="86" fill="#fff3b0"/>
    <path d="M800 160 Q860 210 840 290 Q800 330 740 310 Q820 260 800 160 Z" fill="#f2d97a" stroke="none"/>
    <circle cx="770" cy="230" r="86" fill="none"/>
    <!-- hill -->
    <path d="M-20 1044 Q160 690 512 670 Q864 690 1044 1044 Z" fill="#4f8a3c"/>
    <path d="M40 1000 Q200 730 512 690 Q300 760 170 1000 Z" fill="#6fae4f" stroke="none"/>
    <path d="M-20 1044 Q160 690 512 670 Q864 690 1044 1044" fill="none"/>
    <!-- road -->
    <path d="M478 712 Q430 790 520 840 Q620 900 540 1030 L660 1030 Q730 900 600 830 Q520 790 546 712 Z" fill="#e8cf96" stroke-width="12"/>
    <!-- side towers -->
    <rect x="300" y="430" width="120" height="280" fill="#c9b28a"/>
    <rect x="604" y="430" width="120" height="280" fill="#c9b28a"/>
    <rect x="384" y="440" width="34" height="268" fill="#9e8562" stroke="none"/>
    <rect x="688" y="440" width="34" height="268" fill="#9e8562" stroke="none"/>
    <rect x="300" y="430" width="120" height="280" fill="none"/>
    <rect x="604" y="430" width="120" height="280" fill="none"/>
    <path d="M286 436 L360 270 L434 436 Z" fill="#d6304a"/>
    <path d="M590 436 L664 270 L738 436 Z" fill="#d6304a"/>
    <path d="M360 284 L304 430 L340 430 Z" fill="#ff5f6f" stroke="none"/>
    <path d="M664 284 L608 430 L644 430 Z" fill="#ff5f6f" stroke="none"/>
    <!-- keep -->
    <path d="M400 360 H624 V712 H400 Z" fill="#d8c29a"/>
    <path d="M576 370 H620 V708 H576 Z" fill="#9e8562" stroke="none"/>
    <path d="M400 360 H624 V712 H400 Z" fill="none"/>
    <path d="M392 360 V310 H436 V340 H474 V310 H514 V340 H552 V310 H592 V340 H632 V360 Z" fill="#d8c29a"/>
    <!-- door and windows, lamp-lit -->
    <path d="M466 712 V630 Q512 580 558 630 V712 Z" fill="#5a2a12"/>
    <path d="M478 712 V634 Q512 598 546 634 V712 Z" fill="#ffb53d" stroke="none"/>
    <g fill="#ffd84a" stroke-width="10">
      <path d="M492 470 V430 Q512 410 532 430 V470 Z"/>
      <path d="M346 540 V506 Q360 492 374 506 V540 Z"/>
      <path d="M650 540 V506 Q664 492 678 506 V540 Z"/>
    </g>
    <!-- banner -->
    <path d="M512 310 V200" fill="none" stroke-width="10"/>
    <path d="M512 204 Q560 190 600 214 Q560 236 512 236 Z" fill="${GOLD}" stroke-width="10"/>
  `) +
    `<circle cx="512" cy="660" r="70" fill="url(#glow)" opacity="0.45"/>`,
  { stars: [[150, 170, 60], [560, 120, 40], [890, 420, 44], [110, 450, 34]], dots: [[300, 120, 8], [920, 120, 7], [80, 300, 7], [660, 80, 6]] },
);

/* ---------- Faction: a heraldic shield on crossed swords, with a banner ---------- */
const sword = (rot: number) => `
  <g transform="rotate(${rot} 512 520)">
    <path d="M492 120 L512 70 L532 120 V700 H492 Z" fill="#dfe6f0"/>
    <path d="M512 84 L532 120 V700 H512 Z" fill="#a9b4c6" stroke="none"/>
    <path d="M492 120 L512 70 L532 120 V700 H492 Z" fill="none"/>
    <rect x="430" y="700" width="164" height="34" rx="16" fill="${GOLD}"/>
    <rect x="494" y="734" width="36" height="110" fill="#7a2e14"/>
    <circle cx="512" cy="866" r="28" fill="${GOLD}"/>
  </g>`;
const faction = svg(
  g(`
    ${sword(-38)}
    ${sword(38)}
    <!-- shield -->
    <path d="M512 210 Q640 250 770 240 Q790 560 512 820 Q234 560 254 240 Q384 250 512 210 Z" fill="#2f4fb8"/>
    <path d="M512 226 V804 Q270 560 268 254 Q384 264 512 226 Z" fill="#4d78e6" stroke="none"/>
    <path d="M512 210 Q640 250 770 240 Q790 560 512 820 Q234 560 254 240 Q384 250 512 210 Z" fill="none"/>
    <path d="M512 252 Q628 284 734 278 Q748 546 512 774 Q276 546 290 278 Q396 284 512 252 Z" fill="none" stroke="${GOLD}" stroke-width="12"/>
    <!-- crown charge -->
    <path d="M400 560 L380 400 L450 470 L512 370 L574 470 L644 400 L624 560 Z" fill="${GOLD}"/>
    <path d="M512 390 L560 470 L574 470 L624 420 L610 540 L512 540 Z" fill="#e0a92a" stroke="none"/>
    <path d="M400 560 L380 400 L450 470 L512 370 L574 470 L644 400 L624 560 Z" fill="none"/>
    <rect x="396" y="556" width="232" height="44" rx="10" fill="${GOLD}"/>
    <g fill="#d6304a" stroke-width="8"><circle cx="446" cy="578" r="12"/><circle cx="512" cy="578" r="12"/><circle cx="578" cy="578" r="12"/></g>
    <circle cx="380" cy="400" r="14" fill="${GOLD_HI}" stroke-width="8"/>
    <circle cx="512" cy="368" r="14" fill="${GOLD_HI}" stroke-width="8"/>
    <circle cx="644" cy="400" r="14" fill="${GOLD_HI}" stroke-width="8"/>
    <!-- banner -->
    <path d="M190 800 L280 790 L280 880 L190 890 L224 846 Z" fill="#9e2238"/>
    <path d="M834 800 L744 790 L744 880 L834 890 L800 846 Z" fill="#9e2238"/>
    <path d="M260 760 Q512 830 764 760 L764 860 Q512 930 260 860 Z" fill="#d6304a"/>
    <path d="M276 778 Q512 842 748 778 L748 800 Q512 862 276 800 Z" fill="#ff5f6f" stroke="none"/>
    <path d="M260 760 Q512 830 764 760 L764 860 Q512 930 260 860 Z" fill="none"/>
  `),
  { stars: [[130, 200, 60], [830, 150, 54], [880, 560, 40], [100, 560, 34]], dots: [[300, 120, 8], [930, 380, 8], [120, 960, 7], [900, 960, 7]] },
);

/* ---------- Item: a treasure chest, lid ajar, gold light spilling out ---------- */
const item = svg(
  shadow(512, 860, 330) +
    `<circle cx="512" cy="470" r="300" fill="url(#glow)" opacity="0.85"/>` +
    g(`
    <!-- inside glow, between lid and box -->
    <path d="M270 520 L300 440 H724 L754 520 Z" fill="#ffd84a"/>
    <!-- lid, tipped open -->
    <g transform="rotate(-6 270 470)">
      <path d="M270 470 Q276 290 512 280 Q748 290 754 470 Z" fill="#9a5a22"/>
      <path d="M290 460 Q300 310 470 292 Q360 340 340 460 Z" fill="#c07a36" stroke="none"/>
      <path d="M270 470 Q276 290 512 280 Q748 290 754 470 Z" fill="none"/>
      <path d="M330 470 Q340 300 380 290" fill="none" stroke-width="0"/>
      <path d="M348 464 Q350 320 372 296 L420 288 Q396 330 398 464 Z" fill="${GOLD}"/>
      <path d="M626 464 Q628 330 604 288 L652 296 Q674 320 676 464 Z" fill="${GOLD}"/>
    </g>
    <!-- box -->
    <rect x="270" y="510" width="484" height="320" rx="20" fill="#9a5a22"/>
    <path d="M620 520 H740 Q746 520 746 530 V812 Q746 822 736 822 H560 Q680 700 620 520 Z" fill="#6e3d14" stroke="none"/>
    <path d="M286 530 H500 Q400 560 320 680 L286 700 Z" fill="#c07a36" stroke="none"/>
    <rect x="270" y="510" width="484" height="320" rx="20" fill="none"/>
    <g fill="none" stroke-width="8"><path d="M290 620 H734"/><path d="M290 720 H734"/></g>
    <rect x="348" y="510" width="50" height="320" fill="${GOLD}"/>
    <rect x="626" y="510" width="50" height="320" fill="${GOLD}"/>
    <!-- lock -->
    <path d="M462 540 H562 V630 Q512 670 462 630 Z" fill="${GOLD}"/>
    <path d="M500 586 A12 12 0 1 1 524 586 L520 618 H504 Z" fill="${INK}" stroke-width="4"/>
    <!-- spilled coins -->
    <g fill="${GOLD}" stroke-width="10">
      <ellipse cx="236" cy="850" rx="44" ry="20"/>
      <ellipse cx="788" cy="856" rx="44" ry="20"/>
      <ellipse cx="740" cy="830" rx="40" ry="18"/>
      <circle cx="420" cy="430" r="26"/>
      <circle cx="560" cy="420" r="26"/>
      <circle cx="490" cy="400" r="24"/>
    </g>
    <g fill="${GOLD_HI}" stroke="none"><circle cx="412" cy="422" r="7"/><circle cx="552" cy="412" r="7"/><circle cx="482" cy="392" r="6"/></g>
  `),
  { stars: [[150, 200, 62], [820, 170, 56], [870, 560, 42], [110, 520, 36], [600, 200, 40]], dots: [[300, 150, 8], [930, 380, 8], [90, 720, 7], [500, 130, 7]] },
);

/* ---------- Quest: an unrolled map scroll with a trail, an X and a wax seal ---------- */
const quest = svg(
  shadow(512, 880, 320, 36) +
    g(`
    <g transform="rotate(-6 512 512)">
      <!-- sheet -->
      <path d="M290 240 H734 V800 H290 Z" fill="#fbe8bf"/>
      <path d="M640 250 H730 V790 H520 Q700 640 640 250 Z" fill="#e9c98a" stroke="none"/>
      <path d="M290 240 H734 V800 H290 Z" fill="none"/>
      <!-- trail to an X -->
      <path d="M360 720 Q340 620 440 600 Q560 580 500 480 Q450 400 560 360" fill="none" stroke="#b4441f" stroke-width="10" stroke-dasharray="4 26"/>
      <path d="M560 320 L640 400 M640 320 L560 400" fill="none" stroke="#d6304a" stroke-width="22"/>
      <g fill="none" stroke="#d9b77c" stroke-width="8"><path d="M340 300 H520"/><path d="M340 340 H470"/></g>
      <!-- rolls -->
      <rect x="250" y="190" width="524" height="80" rx="40" fill="#e9c98a"/>
      <path d="M270 200 H740 Q700 214 540 222 Q380 230 270 250 Z" fill="#fbe8bf" stroke="none"/>
      <rect x="250" y="190" width="524" height="80" rx="40" fill="none"/>
      <rect x="250" y="770" width="524" height="80" rx="40" fill="#e9c98a"/>
      <rect x="250" y="770" width="524" height="80" rx="40" fill="none"/>
      <g fill="#7a2e14"><rect x="214" y="206" width="40" height="48" rx="14"/><rect x="770" y="206" width="40" height="48" rx="14"/><rect x="214" y="786" width="40" height="48" rx="14"/><rect x="770" y="786" width="40" height="48" rx="14"/></g>
      <!-- wax seal with ribbons -->
      <path d="M660 720 L630 900 L670 870 L700 910 L710 730 Z" fill="#9e2238"/>
      <path d="M690 720 L760 890 L780 846 L826 852 L740 710 Z" fill="#d6304a"/>
      <path d="M690 640 Q752 630 774 690 Q790 760 720 780 Q650 790 630 730 Q620 660 690 640 Z" fill="#d6304a"/>
      <circle cx="704" cy="710" r="40" fill="#b8273f" stroke-width="8"/>
      <path d="M704 682 Q712 704 732 710 Q712 716 704 738 Q696 716 676 710 Q696 704 704 682 Z" fill="${GOLD}" stroke-width="5"/>
    </g>
  `),
  { stars: [[150, 180, 60], [830, 170, 54], [870, 520, 40], [100, 560, 36]], dots: [[320, 120, 8], [930, 360, 8], [100, 360, 7], [880, 920, 7]] },
);

/* ---------- Lore: an open tome with runes rising off the pages ---------- */
const rune = (x: number, y: number, d: string, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="${d}"/></g>`;
const lore = svg(
  shadow(512, 860, 340) +
    `<circle cx="512" cy="430" r="320" fill="url(#arcane)" opacity="0.8"/>` +
    g(`
    <!-- cover -->
    <path d="M512 820 Q380 760 170 790 L190 450 Q380 420 512 500 Q644 420 834 450 L854 790 Q644 760 512 820 Z" fill="#7a2e14"/>
    <!-- page block edges -->
    <path d="M512 790 Q380 730 196 758 L210 440 Q380 410 512 480 Z" fill="#e9c98a"/>
    <path d="M512 790 Q644 730 828 758 L814 440 Q644 410 512 480 Z" fill="#e9c98a"/>
    <!-- pages -->
    <path d="M512 760 Q380 700 220 724 L236 420 Q380 390 512 460 Z" fill="#fbe8bf"/>
    <path d="M512 760 Q644 700 804 724 L788 420 Q644 390 512 460 Z" fill="#fbe8bf"/>
    <path d="M512 460 Q600 420 788 420 L800 640 Q680 560 512 600 Z" fill="#fff6dc" stroke="none"/>
    <path d="M512 760 Q644 700 804 724 L788 420 Q644 390 512 460 Z" fill="none"/>
    <path d="M512 460 V760" fill="none" stroke-width="10"/>
    <g fill="none" stroke="#d9b77c" stroke-width="8">
      <path d="M270 480 Q380 460 470 500"/><path d="M268 540 Q380 520 470 560"/><path d="M266 600 Q380 580 470 620"/><path d="M264 660 Q380 640 470 680"/>
      <path d="M554 500 Q644 460 752 480"/><path d="M554 560 Q644 520 754 540"/><path d="M554 620 Q644 580 756 600"/><path d="M554 680 Q644 640 758 660"/>
    </g>
    <!-- bookmark -->
    <path d="M600 760 V870 L624 846 L648 870 V744" fill="#d6304a" stroke-width="12"/>
  `) +
    `<g fill="none" stroke="${GOLD}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round">
      ${rune(512, 330, 'M0 -36 V36 M-22 -18 L22 18')}
      ${rune(380, 280, 'M-18 -30 L0 30 L18 -30', -12)}
      ${rune(650, 270, 'M-14 -30 V30 M-14 -30 L16 -12 L-14 4', 10)}
      ${rune(300, 380, 'M-16 -16 L16 16 M16 -16 L-16 16', 8)}
      ${rune(730, 370, 'M0 -26 L22 0 L0 26 L-22 0 Z', -8)}
      ${rune(512, 200, 'M-18 -18 V18 H18', 0)}
    </g>
    <g fill="${GOLD_HI}"><circle cx="440" cy="390" r="8"/><circle cx="600" cy="380" r="7"/><circle cx="560" cy="240" r="6"/><circle cx="430" cy="210" r="6"/></g>`,
  { stars: [[140, 190, 60], [830, 160, 54], [880, 560, 40], [90, 560, 36]], dots: [[300, 110, 8], [930, 360, 8], [120, 940, 7], [900, 940, 7]] },
  'arcane',
);

/* ---------- Session: a campfire with a d20 beside it ---------- */
const session = svg(
  shadow(470, 850, 330) +
    `<circle cx="470" cy="560" r="330" fill="url(#glow)" opacity="0.7"/>` +
    g(`
    <!-- stones -->
    <g fill="#8d8aa3">
      <ellipse cx="250" cy="800" rx="64" ry="42"/><ellipse cx="690" cy="800" rx="64" ry="42"/>
      <ellipse cx="360" cy="840" rx="66" ry="40"/><ellipse cx="580" cy="840" rx="66" ry="40"/><ellipse cx="470" cy="856" rx="60" ry="36"/>
    </g>
    <!-- logs -->
    <rect x="250" y="720" width="440" height="70" rx="35" fill="#9a5a22" transform="rotate(16 470 755)"/>
    <rect x="250" y="720" width="440" height="70" rx="35" fill="#b06a2a" transform="rotate(-16 470 755)"/>
    <g fill="#e8cf96" stroke-width="10"><ellipse cx="672" cy="808" rx="20" ry="30"/><ellipse cx="268" cy="808" rx="20" ry="30"/></g>
    <!-- flames -->
    <path d="M470 270 Q540 380 610 440 Q690 520 650 640 Q610 740 470 750 Q330 740 290 640 Q250 520 340 440 Q370 500 400 500 Q380 380 470 270 Z" fill="#ff7a1f"/>
    <path d="M470 400 Q520 480 560 520 Q610 580 580 660 Q550 730 470 734 Q390 730 360 660 Q340 590 390 540 Q410 580 430 580 Q420 480 470 400 Z" fill="#ffc53d" stroke="none"/>
    <path d="M470 540 Q510 600 520 640 Q530 700 470 710 Q410 700 420 640 Q430 600 470 540 Z" fill="#fff3a8" stroke="none"/>
    <path d="M470 270 Q540 380 610 440 Q690 520 650 640 Q610 740 470 750 Q330 740 290 640 Q250 520 340 440 Q370 500 400 500 Q380 380 470 270 Z" fill="none"/>
    <!-- d20 -->
    <g transform="translate(770 790) rotate(12)">
      <path d="M0 -130 L113 -65 L113 65 L0 130 L-113 65 L-113 -65 Z" fill="#b44dff"/>
      <path d="M0 -70 L66 44 H-66 Z" fill="#d18cff"/>
      <path d="M0 -130 L0 -70 M113 -65 L0 -70 L-113 -65 M113 65 L66 44 L113 -65 M-113 65 L-66 44 L-113 -65 M0 130 L66 44 M0 130 L-66 44" fill="none" stroke-width="10"/>
      <path d="M0 -70 L66 44 H-66 Z" fill="none" stroke-width="10"/>
      <path d="M66 44 L113 65 L0 130 Z" fill="#7d2fc0" stroke-width="10"/>
      <path d="M-66 44 L-113 65 L0 130 Z" fill="#9a3de0" stroke-width="10"/>
      <text x="0" y="22" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="54" text-anchor="middle" fill="#fff6c2" stroke="none">20</text>
    </g>
  `) +
    `<g fill="#ffd84a"><circle cx="420" cy="230" r="10"/><circle cx="540" cy="190" r="8"/><circle cx="480" cy="140" r="6"/><circle cx="380" cy="160" r="5"/></g>`,
  { stars: [[150, 200, 60], [800, 170, 56], [880, 470, 40], [100, 520, 36]], dots: [[300, 110, 8], [700, 110, 7], [90, 760, 7], [930, 300, 7]] },
);

/* ---------- Note: a quill in an inkpot on a sheet of parchment ---------- */
const note = svg(
  shadow(512, 860, 340) +
    g(`
    <!-- parchment sheet -->
    <g transform="rotate(-8 460 520)">
      <path d="M220 220 H640 L700 280 V840 H220 Z" fill="#fbe8bf"/>
      <path d="M560 300 H690 V830 H420 Q620 640 560 300 Z" fill="#e9c98a" stroke="none"/>
      <path d="M640 220 V280 H700 Z" fill="#e9c98a"/>
      <path d="M220 220 H640 L700 280 V840 H220 Z" fill="none"/>
      <g fill="none" stroke="#c9a46a" stroke-width="9">
        <path d="M280 320 H560"/><path d="M280 390 H620"/><path d="M280 460 H600"/><path d="M280 530 H520"/><path d="M280 600 H440"/>
      </g>
    </g>
    <!-- feather -->
    <path d="M640 640 Q700 440 880 150 Q900 330 800 480 Q740 570 660 640 Z" fill="#fff6dc"/>
    <path d="M880 150 Q860 300 790 440 Q760 500 700 570 L660 640 Q740 570 800 480 Q900 330 880 150 Z" fill="#e0d2b4" stroke="none"/>
    <path d="M640 640 Q700 440 880 150 Q900 330 800 480 Q740 570 660 640 Z" fill="none"/>
    <path d="M660 640 Q760 420 870 170" fill="none" stroke-width="8"/>
    <g fill="none" stroke-width="6"><path d="M720 500 L780 470"/><path d="M760 410 L820 380"/><path d="M800 320 L846 290"/></g>
    <!-- inkpot -->
    <path d="M560 640 Q560 610 600 606 H700 Q740 610 740 640 Q800 680 800 760 Q800 860 650 864 Q500 860 500 760 Q500 680 560 640 Z" fill="#2c2340"/>
    <path d="M530 720 Q540 670 590 650 Q560 700 562 790 Q540 780 530 720 Z" fill="#5a4b80" stroke="none"/>
    <path d="M560 640 Q560 610 600 606 H700 Q740 610 740 640 Q800 680 800 760 Q800 860 650 864 Q500 860 500 760 Q500 680 560 640 Z" fill="none"/>
    <rect x="580" y="570" width="140" height="50" rx="14" fill="${GOLD}"/>
    <rect x="600" y="580" width="30" height="30" rx="6" fill="${GOLD_HI}" stroke="none"/>
    <!-- nib into the ink -->
    <path d="M640 640 L620 600 L660 590 Z" fill="${INK}" stroke-width="6"/>
  `),
  { stars: [[150, 200, 60], [520, 140, 46], [880, 600, 40], [100, 560, 36]], dots: [[330, 110, 8], [940, 420, 8], [110, 940, 7], [900, 940, 7]] },
);

const FALLBACKS = { npc, place, faction, item, quest, lore, session, note } as const;

mkdirSync(SVG_DIR, { recursive: true });
mkdirSync(PNG_DIR, { recursive: true });
for (const [kind, text] of Object.entries(FALLBACKS)) writeFileSync(join(SVG_DIR, `${kind}.svg`), text);

const r = spawnSync(join(ROOT, 'node_modules', '.bin', 'electron'), [join(import.meta.dir, 'render-svgs.cjs'), SVG_DIR, PNG_DIR, String(PX)], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`Wrote ${Object.keys(FALLBACKS).length} fallbacks to ${PNG_DIR}`);
