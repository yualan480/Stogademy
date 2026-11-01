/* Orbit home: the collectibles you own drift slowly across the page. Click one and it makes the sound that object would make
   (dice rattle, coin ching, potion bubbles, sword shing...). The sounds are built live with Web Audio, so there are no sound files to load.
   - Only collectibles the member owns float (equipped one first, at most MAX at a time).
   - Positions are remembered between re-draws of the home page, so a live refresh never makes them jump back.
   - Respects "reduce motion" (they sit still, still clickable) and the Orbit sound button (sound off = silent pop). */

const MAX = 14, MUTE_KEY = 'orbit-ambient';
const rnd = (a, b) => a + Math.random() * (b - a);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches && !document.documentElement.classList.contains('force-motion');
const muted = () => { try { return localStorage.getItem(MUTE_KEY) === 'off'; } catch { return false; } };

/* ───────── sound ───────── */
let ctx = null, master = null, noiseBuf = null, lastAt = 0;
function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = .55;
    const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
/* one note: f = pitch, t = seconds from now, d = length. o: type, g (loudness), a (attack), to (slide to), lp (low-pass), vib (wobble Hz), det */
function tone(f, t, d, o = {}) {
  const c = ctx, T = c.currentTime + t, osc = c.createOscillator(), g = c.createGain(), a = o.a ?? .006, v = o.g ?? .25;
  osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, T);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, T + d);
  if (o.det) osc.detune.value = o.det;
  g.gain.setValueAtTime(.0001, T); g.gain.exponentialRampToValueAtTime(v, T + a); g.gain.exponentialRampToValueAtTime(.0001, T + Math.max(d, a + .01));
  let node = osc;
  if (o.lp) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.lp; osc.connect(fl); node = fl; }
  node.connect(g); g.connect(master);
  if (o.vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = o.vib; lg.gain.value = f * .02; l.connect(lg); lg.connect(osc.frequency); l.start(T); l.stop(T + d + .05); }
  osc.start(T); osc.stop(T + d + .05);
}
/* a burst of filtered noise: type (bandpass / highpass / lowpass), f = filter pitch, to = slide the filter, q, g, a */
function noise(t, d, o = {}) {
  const c = ctx, T = c.currentTime + t, s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter(), a = o.a ?? .004, v = o.g ?? .25;
  s.buffer = noiseBuf; s.loop = true; f.type = o.type || 'bandpass'; f.Q.value = o.q ?? 1; f.frequency.setValueAtTime(o.f || 2000, T);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, T + d);
  g.gain.setValueAtTime(.0001, T); g.gain.exponentialRampToValueAtTime(v, T + a); g.gain.exponentialRampToValueAtTime(.0001, T + Math.max(d, a + .01));
  s.connect(f); f.connect(g); g.connect(master); s.start(T, Math.random() * .5); s.stop(T + d + .05);
}
const bell = (f, t = 0, d = 1.1, g = .18) => { tone(f, t, d, { g }); tone(f * 2.76, t, d * .5, { g: g * .35 }); tone(f * 5.4, t, d * .25, { g: g * .15 }); };
const clink = (f, t = 0, g = .2) => { tone(f, t, .5, { g }); tone(f * 1.5, t, .35, { g: g * .6 }); tone(f * 2.4, t, .2, { g: g * .4 }); };
const horn = (notes, g = .12) => notes.forEach(([f, t, d]) => { tone(f, t, d, { type: 'sawtooth', g, lp: 2600, a: .02 }); tone(f * 2, t, d, { type: 'square', g: g * .3, lp: 2000, a: .02 }); });
const sparkle = (n, t0 = 0, lo = 1800, hi = 4200, g = .05) => { for (let i = 0; i < n; i++) tone(rnd(lo, hi), t0 + i * rnd(.05, .12), .35, { g }); };

/* what each collectible sounds like when you click it (the id is the shop item id) */
export const SOUNDS = {
  cl_crystal: () => { [1318.5, 1760, 2093, 2637].forEach((f, i) => bell(f, i * .07, 1.1, .12)); sparkle(5, .1); },                    // Star Crystal: glassy chime
  cl_trophy: () => { horn([[392, 0, .14], [523.25, .14, .14], [659.25, .28, .14], [783.99, .42, .55]]); clink(2093, .42, .1); },       // Golden Orbit: fanfare
  cl_trophy2: () => { horn([[392, 0, .12], [523.25, .12, .12], [659.25, .24, .12], [783.99, .36, .12], [1046.5, .48, .8]], .13); bell(1568, .5, 1.2, .1); }, // Grand Trophy
  cl_cube: () => { for (let i = 0; i < 8; i++) { const t = i * .055 + rnd(0, .02); noise(t, .04, { f: rnd(2500, 5000), q: 2.5, g: .25 * (1 - i * .08) }); tone(rnd(180, 260), t, .05, { type: 'triangle', g: .12 }); } bell(1568, .5, .9, .1); }, // Mystery Cube: rattle + sparkle
  cl_dice: () => { for (let i = 0; i < 9; i++) { const t = i * .05 + rnd(0, .02); noise(t, .04, { f: rnd(2200, 4800), q: 2.5, g: .25 * (1 - i * .07) }); tone(rnd(170, 250), t, .05, { type: 'triangle', g: .13 }); } tone(200, .52, .1, { type: 'triangle', g: .2, to: 120 }); }, // Lucky Dice: rattle + tock
  cl_coin: () => { clink(1760, 0, .22); clink(2349, .09, .16); },                                                                     // Orbit Coin: ching
  cl_lantern: () => { noise(0, 1, { f: 400, to: 900, q: .8, g: .16, a: .35 }); tone(220, 0, 1, { type: 'triangle', g: .07, vib: 5, a: .2 }); for (let i = 0; i < 5; i++) noise(rnd(.1, .9), .02, { type: 'highpass', f: 5000, g: .12 }); }, // Sky Lantern: soft flame whoosh
  cl_book: () => { noise(0, .18, { type: 'highpass', f: 3000, to: 7000, g: .22 }); noise(.24, .16, { type: 'highpass', f: 3500, to: 7500, g: .18 }); tone(330, .05, .25, { type: 'triangle', g: .04 }); }, // Star Atlas: page turns
  cl_ticket: () => { for (let i = 0; i < 14; i++) noise(i * .012, .016, { f: rnd(4000, 7000), q: .7, g: .2 }); bell(1318.5, .22, .9, .17); },  // Golden Ticket: tear + ding
  cl_globe: () => { for (let i = 0; i < 10; i++) tone(rnd(2000, 3800), i * .05 + rnd(0, .03), .25, { type: 'triangle', g: .06 }); [1046.5, 1318.5, 1568, 2093].forEach((f, i) => bell(f, .45 + i * .14, .8, .09)); }, // Snow Globe: shake + music box
  cl_shield: () => { [340, 517, 731, 1043].forEach((f, i) => tone(f, 0, .9 - i * .1, { type: 'square', g: .07, lp: 4500 })); tone(220, 0, 1, { type: 'square', g: .1, lp: 3000 }); noise(0, .05, { f: 3000, g: .3 }); }, // Guardian Crest: shield clang
  cl_card: () => { noise(0, .07, { type: 'highpass', f: 5000, g: .25 }); for (let i = 1; i < 4; i++) noise(i * .06, .05, { type: 'highpass', f: 5000, g: .2 }); [1568, 2093, 2637, 3136].forEach((f, i) => tone(f, .28 + i * .06, .4, { g: .07, to: f * 1.02 })); }, // Holo Card: flick + foil shimmer
  cl_throne: () => { horn([[349.23, 0, .18], [440, .2, .18], [523.25, .4, .18], [698.46, .6, .65]], .13); bell(1396.9, .62, 1.2, .08); }, // Crown Pedestal: royal horns
  cl_crown: () => { horn([[261.63, 0, .16], [392, .18, .16], [523.25, .36, .16], [659.25, .54, .7]], .13); bell(1318.5, .56, 1.3, .08); },      // Orbit Crown: royal horns
  cl_stardust: () => { for (let i = 0; i < 9; i++) tone(300 + i * 70 + rnd(0, 120), i * .09 + rnd(0, .03), .12, { to: rnd(700, 1200), g: .13 }); sparkle(6, .5, 2000, 4500, .05); }, // Stardust Potion: bubbling + sparkle
  cl_potion: () => { for (let i = 0; i < 9; i++) tone(260 + i * 60 + rnd(0, 120), i * .09 + rnd(0, .03), .12, { to: rnd(600, 1000), g: .14 }); tone(160, 0, .25, { to: 90, g: .2 }); }, // Mystery Potion: bubbles + gloop
  cl_champ: () => { clink(2093, 0, .2); bell(1568, .1, 1.1, .15); noise(0, .1, { type: 'highpass', f: 6000, g: .08 }); },                 // Champion Medal: clink + ding
  cl_medal: () => { clink(1865, 0, .2); bell(1397, .1, 1, .14); noise(0, .1, { type: 'highpass', f: 6000, g: .08 }); },                    // Champion Medal (small): clink + ding
  cl_pebble: () => { tone(140, 0, .12, { to: 60, g: .5 }); noise(0, .03, { f: 900, q: .8, g: .35 }); tone(120, .17, .1, { to: 55, g: .35 }); noise(.17, .03, { f: 800, q: .8, g: .25 }); }, // Moon Pebble: two knocks
  cl_shell: () => { noise(0, 1.6, { f: 300, to: 900, q: .6, g: .22, a: .7 }); noise(1, 1.2, { f: 900, to: 300, q: .6, g: .1, a: .3 }); },    // Starfish Shell: ocean wave
  cl_clover: () => { [659.25, 783.99, 987.77, 1318.5, 1568].forEach((f, i) => tone(f, i * .08, .5, { type: 'triangle', g: .12 })); bell(2093, .4, 1, .08); }, // Lucky Clover: lucky twinkle
  cl_feather: () => { noise(0, .55, { f: 1800, to: 4200, q: .8, g: .12, a: .15 }); tone(1200, 0, .4, { to: 1700, g: .03 }); },                // Comet Feather: soft swish
  cl_compass: () => { let t = 0, gap = .04; for (let i = 0; i < 14; i++) { noise(t, .012, { f: 3500, q: 3, g: .25 }); tone(2200, t, .02, { type: 'square', g: .03 }); t += gap; gap *= 1.22; } bell(1760, t + .05, .8, .13); }, // Star Compass: spinning needle
  cl_gamepad: () => { [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * .07, .1, { type: 'square', g: .09, lp: 3500 })); tone(1568, .4, .25, { type: 'square', g: .08, lp: 3500 }); }, // Golden Gamepad: arcade power-up
  cl_telescope: () => { tone(300, 0, .6, { to: 1400, g: .12 }); noise(0, .5, { f: 2500, to: 6000, q: 2, g: .06, a: .2 }); noise(.6, .02, { f: 3000, g: .2 }); bell(2093, .62, .9, .1); }, // Deep Space Scope: lens zoom + ping
  cl_orb: () => { tone(220, 0, 1.6, { g: .13, vib: 5, a: .4 }); tone(330, 0, 1.6, { g: .09, vib: 6, a: .4 }); [1568, 2093, 2349].forEach((f, i) => bell(f, .3 + i * .2, 1.2, .07)); }, // Crystal Ball: mystic hum
  cl_meteor: () => { noise(0, .9, { f: 3500, to: 250, q: .9, g: .3, a: .05 }); tone(110, .6, .5, { to: 40, g: .5 }); noise(.62, .4, { type: 'lowpass', f: 1200, to: 200, g: .35 }); for (let i = 0; i < 6; i++) noise(.7 + rnd(0, .4), .015, { type: 'highpass', f: 4000, g: .15 }); }, // Meteor Fragment: whoosh + impact
  cl_sword: () => { noise(0, .45, { type: 'highpass', f: 2500, to: 9000, g: .25, a: .01 }); tone(2800, 0, 1.1, { g: .1, to: 3200 }); tone(3520, .05, .9, { g: .05 }); }, // Hero's Sword: shing
  cl_egg: () => { [0, .09, .17].forEach(t => noise(t, .03, { f: 3000, q: 2, g: .35 })); tone(70, .3, .9, { type: 'sawtooth', g: .22, lp: 420, vib: 24, to: 50 }); tone(95, .3, .8, { type: 'sawtooth', g: .12, lp: 520, vib: 19 }); noise(.3, .8, { type: 'lowpass', f: 500, g: .12 }); }, // Dragon Egg: crack + little growl
  cl_hourglass: () => { noise(0, 1.2, { type: 'highpass', f: 6000, g: .12, a: .1 }); noise(0, 1.2, { f: 4000, q: .8, g: .06, a: .1 }); tone(900, 1.25, .05, { type: 'square', g: .08 }); tone(700, 1.45, .05, { type: 'square', g: .08 }); }, // Endless Hourglass: falling sand + tick-tock
  cl_comet: () => { noise(0, .7, { f: 6000, to: 1500, q: 1.2, g: .18 }); [2637, 3136, 3951].forEach((f, i) => bell(f, .1 + i * .12, 1, .07)); },       // Frozen Comet: icy whoosh + chimes
  cl_galaxy: () => { tone(55, 0, 1.8, { g: .4, a: .5 }); tone(82.4, 0, 1.8, { g: .2, a: .6, vib: .5 }); for (let i = 0; i < 6; i++) tone(rnd(1500, 4000), .2 + i * .2, .6, { g: .05 }); }, // Galaxy in a Jar: deep space drone
  cl_planet: () => { tone(65.4, 0, 2, { g: .4, a: .4, vib: 2 }); tone(130.8, .1, 1.8, { type: 'triangle', g: .15, a: .4, lp: 600 }); tone(196, 0, 1.6, { g: .06, vib: 30 }); bell(987.77, .5, 1.4, .06); }, // Private Planet: cosmic hum
};
/* custom collectibles (made through Custom Orders) get a little two-note bell, pitched by their name so each one sounds different */
const fallback = id => () => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; const f = [523.25, 587.33, 659.25, 783.99, 880, 1046.5][h % 6]; bell(f, 0, 1, .2); bell(f * 1.5, .12, 1, .14); };

export function playSound(id) {
  if (muted()) return false;
  const c = audio(); if (!c) return false;
  const now = performance.now(); if (now - lastAt < 90) return true; lastAt = now;
  try { (SOUNDS[id] || fallback(id))(); } catch (e) { /* a sound problem never breaks the page */ }
  return true;
}

/* ───────── floating ───────── */
const state = new Map();   // item id -> { x, yb, sp, t, ph, fq, amp }   (kept between re-draws)
let layer = null, host = null, list = [], raf = 0, last = 0, cssDone = false;

function ensureCss() {
  if (cssDone) return; cssDone = true;
  try { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('collectible-float.css?v=1', import.meta.url).href; document.head.appendChild(l); } catch (e) { /* the page still works without the style */ }
}
function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }
function place(f, w, h) {
  const s = f.s, y = s.yb * h + (reduced() ? 0 : Math.sin(s.t * s.fq + s.ph) * s.amp), r = reduced() ? 0 : Math.sin(s.t * s.fq * .7 + s.ph) * 10;
  f.el.style.transform = `translate3d(${s.x}px,${y}px,0) rotate(${r}deg)`;
}
function frame(ts) {
  raf = requestAnimationFrame(frame);
  if (!layer || !layer.isConnected || !host || !host.isConnected) { stop(); return; }
  if (document.hidden) { last = 0; return; }
  const dt = last ? Math.min(.05, (ts - last) / 1000) : 0; last = ts;
  const w = host.clientWidth, h = host.clientHeight;
  for (const f of list) {
    const s = f.s; s.t += dt; s.x += s.sp * dt;
    if (s.x > w + 60) { s.x = -60; s.yb = rnd(.12, .86); }   // left the right edge: come back in from the left at a new height
    place(f, w, h);
  }
}
function pop(btn, id) {
  playSound(id);
  btn.classList.remove('cfpop'); void btn.offsetWidth; btn.classList.add('cfpop');
  setTimeout(() => btn.classList.remove('cfpop'), 700);
}

/* panel = the .orbithome element; items = [{ id, name, glyph, c1, c2 }] (the member's own collectibles, equipped first) */
export function mountFloaters(panel, items) {
  stop(); if (layer && layer.parentNode) layer.remove();
  layer = null; host = panel; list = [];
  if (!panel || !items || !items.length) return;
  ensureCss();
  const w = panel.clientWidth || 900, h = panel.clientHeight || 600, still = reduced(), shown = items.slice(0, MAX);
  layer = document.createElement('div'); layer.className = 'cfloat'; layer.setAttribute('role', 'group'); layer.setAttribute('aria-label', 'Your collectibles');
  shown.forEach((it, i) => {
    let s = state.get(it.id);
    if (!s) { s = { x: rnd(0, w), yb: rnd(.12, .86), sp: rnd(18, 42), t: rnd(0, 20), ph: rnd(0, 6.28), fq: rnd(.5, 1.1), amp: rnd(10, 26) }; state.set(it.id, s); }
    if (still) { s.x = (i + .5) / shown.length * w; s.yb = .2 + (i % 3) * .22; }
    const el = document.createElement('button'); el.type = 'button'; el.className = 'cf'; el.dataset.id = it.id;
    el.style.setProperty('--k1', it.c1 || '#37e0ff'); el.style.setProperty('--k2', it.c2 || '#7a5cff');
    el.setAttribute('aria-label', `${it.name}. Click to hear it.`); el.title = it.name;
    const inner = document.createElement('span'); inner.className = 'cfi'; inner.setAttribute('aria-hidden', 'true'); inner.textContent = it.glyph || '✦'; el.appendChild(inner);
    el.addEventListener('click', e => { e.stopPropagation(); pop(el, it.id); });
    layer.appendChild(el); const f = { el, s }; list.push(f); place(f, w, h);
  });
  panel.insertBefore(layer, panel.querySelector('.ostars') ? panel.querySelector('.ostars').nextSibling : panel.firstChild);
  if (!still) raf = requestAnimationFrame(frame);
}
export function unmountFloaters() { stop(); if (layer && layer.parentNode) layer.remove(); layer = null; host = null; list = []; }
