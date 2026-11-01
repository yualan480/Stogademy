/* Orbit Shop: custom cursors. The database (migration-shop-cursors.sql) only stores each cursor's name, price, rarity and two colours.
   Everything you SEE is drawn here: the last word of the item id picks the shape (cu_sunset_heart -> "heart"), and the item's c1/c2 colours paint it.
   Every cursor comes as two pictures: the normal pointer, and a glowing "clickable" one with a little dot that shows over buttons and links. */

const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v, d) => (typeof v === 'string' && HEX.test(v) ? v : d);

/* a regular star / burst with n points */
const poly = (n, cx, cy, R, r, rot = -90) => {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (rot + (i * 180) / n) * Math.PI / 180, d = i % 2 ? r : R;
    pts.push((cx + d * Math.cos(a)).toFixed(2) + ' ' + (cy + d * Math.sin(a)).toFixed(2));
  }
  return 'M' + pts.join('L') + 'Z';
};

/* chunky arcade arrow, one rectangle per run of pixels */
const PIX = ['X', 'XX', 'XXX', 'XXXX', 'XXXXX', 'XXXXXX', 'XXXXXXX', 'XXXXXXXX', 'XXXXX', 'XX XX', 'X  XX', '    XX', '    XX'];
const pixel = PIX.flatMap((row, y) => [...row.matchAll(/X+/g)].map(m => `<rect x="${5 + m.index * 2}" y="${3 + y * 2}" width="${m[0].length * 2}" height="2"/>`)).join('');

const flake = (() => {
  let s = '';
  for (let k = 0; k < 6; k++) {
    const a = k * 60, rad = x => x * Math.PI / 180, p = (ang, d) => [16 + d * Math.cos(rad(ang)), 16 + d * Math.sin(rad(ang))].map(n => n.toFixed(2)).join(' ');
    s += `<path d="M16 16L${p(a, 13)}M${p(a, 8.5)}L${p(a - 40, 12)}M${p(a, 8.5)}L${p(a + 40, 12)}"/>`;
  }
  return s;
})();

/* hs = the hot spot (the exact pixel that does the clicking); b = the drawing; g = optional paint for the whole drawing */
const STROKED = 'fill="none" stroke="url(#g{u})" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"';
const SHAPES = {
  arrow: { hs: [5, 3], b: '<path d="M5 3V24.5L10.4 19.6L14 28L18.2 26.2L14.7 17.9L21.8 17.9Z"/><path class="d" d="M7.4 8.6V19.4L10.3 16.8" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.2" stroke-linecap="round"/>' },
  pixel: { hs: [5, 3], b: pixel, g: 'fill="url(#g{u})" stroke="none" shape-rendering="crispEdges"' },
  heart: { hs: [7, 6], b: '<path d="M16 28C16 28 4 20.5 4 11.5C4 7.5 7 5 10.2 5C12.7 5 14.8 6.4 16 8.6C17.2 6.4 19.3 5 21.8 5C25 5 28 7.5 28 11.5C28 20.5 16 28 16 28Z"/><path class="d" d="M8 10.5C8 8.8 9.2 8 10.6 8" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.6" stroke-linecap="round"/>' },
  plane: { hs: [3, 3], b: '<path d="M3 3L28.5 13.5L18 17.5L14 29Z"/><path class="d" d="M3 3L18 17.5L14 29" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.1" stroke-linejoin="round"/>' },
  moon: { hs: [10, 8], b: '<path d="M15 5A12 12 0 1 0 26.08 21.61A10 10 0 0 1 15 5Z"/>' },
  leaf: { hs: [4, 4], b: '<path d="M27 27C27 14 20 5 4 4C4 18 11 27 23 27Z"/><path class="d" d="M26 26L11 11" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.3" stroke-linecap="round"/>' },
  flame: { hs: [15, 4], b: '<path d="M16 3C17 9 24 12 24 20C24 26 20.5 29 16 29C11.5 29 8 26 8 20C8 16 10 14 11.5 12C12 15 13.5 16 14.5 16C14 11 14 7 16 3Z"/><path class="d" d="M16 17C17.5 19.5 19.5 20.5 19.5 23.5C19.5 25.8 18 27 16 27C14 27 12.5 25.8 12.5 23.5C12.5 21 14.5 20 16 17Z" fill="#fff" fill-opacity=".55" stroke="none"/>' },
  comet: { hs: [5, 5], b: '<path d="M13.6 4.4L29 29L4.4 13.6Z" fill-opacity=".72"/><circle cx="9" cy="9" r="6.5"/><circle class="d" cx="7.2" cy="7.2" r="2" fill="#fff" fill-opacity=".7" stroke="none"/>' },
  rocket: { hs: [7, 7], b: '<g transform="rotate(-45 16 16)"><path d="M13 22Q16 31 19 22Z" fill-opacity=".8"/><path d="M11 17L5.5 24.5L11 22.5ZM21 17L26.5 24.5L21 22.5Z"/><path d="M16 3C21 8 22 14 21 22H11C10 14 11 8 16 3Z"/><circle class="d" cx="16" cy="13" r="2.6" fill="#fff" fill-opacity=".85" stroke="none"/></g>' },
  bolt: { hs: [20, 3], b: '<path d="M20 2L6 17.5H14L11 30L26 12H18L22 2Z"/>' },
  orb: { hs: [9, 9], b: '<defs><mask id="m{u}"><rect width="32" height="32" fill="#fff"/><rect y="18" width="32" height="1.8" fill="#000"/><rect y="21.6" width="32" height="2.4" fill="#000"/><rect y="25.4" width="32" height="3" fill="#000"/></mask></defs><circle cx="16" cy="16" r="12" mask="url(#m{u})"/>' },
  wand: { hs: [6, 6], b: `<path class="w" d="M10.5 10.5L26.5 26.5" fill="none" stroke="url(#g{u})" stroke-width="4" stroke-linecap="round"/><path d="${poly(5, 8.5, 8.5, 8, 3.4)}"/><circle class="d" cx="25" cy="8" r="1.4" fill="#fff" stroke="none"/><circle class="d" cx="27.5" cy="14" r="1" fill="#fff" stroke="none"/>` },
  star: { hs: [16, 16], b: `<path d="${poly(5, 16, 17, 14, 5.8)}"/><path class="d" d="M16 8L17.6 13.4" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.3" stroke-linecap="round"/>` },
  gem: { hs: [16, 16], b: '<path d="M9 5H23L29 12L16 28L3 12Z"/><path class="d" d="M3 12H29M9 5L12.5 12L16 5L19.5 12L23 5M12.5 12L16 28L19.5 12" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1" stroke-linejoin="round"/>' },
  bubble: { hs: [16, 16], b: '<circle cx="16" cy="16" r="11.5" fill-opacity=".58"/><path class="d" d="M9.6 14C10.2 11 12.6 8.8 15.4 8.4" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="2" stroke-linecap="round"/><circle class="d" cx="21.5" cy="21.5" r="1.4" fill="#fff" fill-opacity=".7" stroke="none"/>' },
  planet: { hs: [16, 16], b: '<g transform="rotate(-20 16 16)"><path d="M2 16A14 4.6 0 0 1 30 16" fill="none" stroke="url(#g{u})" stroke-width="2.2"/><circle cx="16" cy="16" r="8.4"/><path d="M2 16A14 4.6 0 0 0 30 16" fill="none" stroke="url(#g{u})" stroke-width="2.2"/></g>' },
  flake: { hs: [16, 16], g: STROKED, b: flake + '<circle cx="16" cy="16" r="1.8" fill="url(#g{u})" stroke="none"/>' },
  cross: { hs: [16, 16], g: STROKED, b: '<circle cx="16" cy="16" r="8.5"/><path d="M16 3V10.5M16 21.5V29M3 16H10.5M21.5 16H29"/><circle cx="16" cy="16" r="1.7" fill="url(#g{u})" stroke="none"/>' },
  hole: { hs: [16, 16], b: '<circle cx="16" cy="16" r="11.5" fill="none" stroke="url(#g{u})" stroke-width="3"/><ellipse cx="16" cy="16" rx="14" ry="4.2" transform="rotate(-25 16 16)" fill="none" stroke="url(#g{u})" stroke-width="1.6" stroke-opacity=".85"/><circle cx="16" cy="16" r="6.6" fill="#05000f"/>' },
  paw: { hs: [16, 16], b: '<ellipse cx="16" cy="21" rx="7.4" ry="6"/><circle cx="6.5" cy="14.5" r="3"/><circle cx="11.6" cy="8.6" r="3.2"/><circle cx="20.4" cy="8.6" r="3.2"/><circle cx="25.5" cy="14.5" r="3"/>' },
  ghost: { hs: [16, 16], b: '<path d="M6 28V14C6 8 10 4 16 4S26 8 26 14V28L22.5 25L19 28L16 25L13 28L9.5 25Z"/><circle class="d" cx="12.4" cy="13" r="2" fill="#fff" stroke="none"/><circle class="d" cx="19.6" cy="13" r="2" fill="#fff" stroke="none"/><circle class="d" cx="16" cy="18.5" r="1.6" fill="#fff" fill-opacity=".7" stroke="none"/>' },
  crown: { hs: [16, 16], b: '<path d="M4 24L3 9L10 15L16 5L22 15L29 9L28 24Z"/><rect x="4" y="24" width="24" height="4.5" rx="1.2"/><circle class="d" cx="16" cy="17" r="1.8" fill="#fff" fill-opacity=".8" stroke="none"/>' },
  sword: { hs: [6, 6], b: '<g transform="rotate(-45 16 16)"><path d="M16 1.5L19 6V20H13V6Z"/><rect x="8.5" y="20" width="15" height="3.2" rx="1.4"/><rect x="14.4" y="23" width="3.2" height="6"/><circle cx="16" cy="30.2" r="1.7"/><path class="d" d="M16 5V19" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1"/></g>' },
  cloud: { hs: [16, 16], b: '<path d="M9 25C4.5 25 3 20 6.5 18.5C6 13.5 12 11 15 14.5C17 10.5 24 11.5 24 17C28 17 29 25 24 25Z"/><path class="d" d="M8 21C8.5 19.5 10 19 11 19.5" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.3" stroke-linecap="round"/>' },
  spark: { hs: [16, 16], b: `<path d="${poly(8, 16, 16, 14.5, 4.6)}"/><circle class="d" cx="16" cy="16" r="3.6" fill="#fff" fill-opacity=".85" stroke="none"/>` },
};
const FALLBACK = 'arrow';

export const shapeOf = id => { const k = String(id || '').split('_').pop(); return SHAPES[k] ? k : FALLBACK; };

let uid = 0;
/* the picture itself. it = a shop item ({id, art:{c1,c2}}), mode = 'arrow' | 'pointer', px = size on screen */
export function cursorSvg(it, mode = 'arrow', px = 32) {
  const key = shapeOf(it?.id), sh = SHAPES[key], u = 'c' + (++uid).toString(36);
  const c1 = hex(it?.art?.c1, '#2f6bff'), c2 = hex(it?.art?.c2, '#37e0ff'), id = String(it?.id || '');
  const stops = /prism/.test(id) ? ['#ff3b3b', '#ffb02e', '#f5e642', '#3be07a', '#37b8ff', '#8f3bff'] : /chrome/.test(id) ? ['#ffffff', '#c4cde6', '#6b7694', '#e8edfb', '#8c97b5'] : [c1, c2];
  const grad = `<linearGradient id="g${u}" gradientUnits="userSpaceOnUse" x1="3" y1="3" x2="29" y2="29">${stops.map((c, i) => `<stop offset="${(i / (stops.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join('')}</linearGradient>`;
  const glow = mode === 'pointer' ? `<filter id="f${u}" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="0" stdDeviation="1.5" flood-color="${c1}" flood-opacity=".95"/></filter>` : '';
  const body = sh.b.replace(/\{u\}/g, u);
  const paint = (sh.g || `fill="url(#g${u})" stroke="#fff" stroke-opacity=".92" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"`).replace(/\{u\}/g, u);
  const badge = mode === 'pointer' ? `<circle cx="26" cy="26" r="4.4" fill="#fff" stroke="${c2}" stroke-width="1.8"/><circle cx="26" cy="26" r="1.5" fill="${c1}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 32 32"><defs><style>.h${u} *{fill:none!important;stroke:#000!important;stroke-opacity:.55!important;stroke-width:4.4!important}.h${u} .w{stroke-width:7.4!important}.h${u} .d{display:none!important}</style>${grad}${glow}</defs>`
    + `<g class="h${u}" stroke-linejoin="round" stroke-linecap="round" transform="translate(.5 1)">${body.replace(/<defs>[\s\S]*?<\/defs>/g, '')}</g>`
    + `<g ${paint}${mode === 'pointer' ? ` filter="url(#f${u})"` : ''}>${body}</g>${badge}</svg>`;
}

/* CSS values for `cursor:` (a data picture, its hot spot, then a safe fallback). Returns {arrow, pointer}. */
export function cursorCss(it) {
  const [x, y] = SHAPES[shapeOf(it?.id)].hs;
  const mk = (mode, fb) => `url("data:image/svg+xml,${encodeURIComponent(cursorSvg(it, mode, 32))}") ${x} ${y},${fb}`;
  return { arrow: mk('arrow', 'auto'), pointer: mk('pointer', 'pointer') };
}

export const SHOP_CURSOR_KEY = 'stg_shop_cursor';   // read by ../cursor.js so the cursor follows you across the whole site
export function saveCursor(it) {
  try {
    if (!it) { localStorage.removeItem(SHOP_CURSOR_KEY); } else { const c = cursorCss(it); localStorage.setItem(SHOP_CURSOR_KEY, JSON.stringify({ id: it.id, a: c.arrow, p: c.pointer })); }
  } catch (e) { /* private mode: it still works on this page, it just will not follow you to other pages */ }
}
export function applyCursor(it) {
  const r = document.documentElement.style;
  if (!it) { r.removeProperty('--cur-arrow'); r.removeProperty('--cur-pointer'); if (window.StgCursor) window.StgCursor.apply(); return; }
  const c = cursorCss(it); r.setProperty('--cur-arrow', c.arrow); r.setProperty('--cur-pointer', c.pointer);
}
