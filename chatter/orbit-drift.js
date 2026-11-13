/* The drifting Orbit: a glowing Orbit coin floats across the home page, at the same pace as the asteroids in the backdrop (they take one
   49.32 s picture cycle to cross the width, see orbit-bg.js). When it leaves the edge it comes back in from a random spot on the edge.
   Click it and the SERVER picks 100 to 1000 Orbits (steps of 50) and adds them; the coin then bursts and flies to the Orbits chip by your profile.
   The 5-minute gap is kept by the server (claim_orbit_drift / orbit_drift_wait), so reloading, a second tab or calling the API directly changes nothing.
   All sounds are made with Web Audio (no files) and follow the Orbit speaker button. */

const LOOP_S = 2.74 * 18;          // same as orbit-bg.js: one full picture cycle
const R = 30;                      // coin radius in px
const MIN_GAP_S = 3;               // first coin shows a moment after you arrive
const LOGO = 'logo.svg';

const rnd = (a, b) => a + Math.random() * (b - a);
const soundOn = () => { try { return localStorage.getItem('orbit-ambient') !== 'off'; } catch { return true; } };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches && !document.documentElement.classList.contains('force-motion');
const fmt = n => Number(n).toLocaleString();

/* ───────── sound ───────── */
let ac = null;
function audio(create) {
  if (!soundOn()) return null;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  if (!ac) { if (!create) return null; try { ac = new AC(); } catch { return null; } }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  return ac;
}
const unlock = () => { audio(true); };
['pointerdown', 'keydown', 'touchend'].forEach(e => addEventListener(e, unlock, { once: true, capture: true, passive: true }));

function note(c, f, t, d, vol = .16, type = 'sine', f2) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d + .05);
}
function whoosh(c, t, d = .35) {
  const n = Math.floor(c.sampleRate * d), b = c.createBuffer(1, n, c.sampleRate), x = b.getChannelData(0);
  for (let i = 0; i < n; i++) x[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = b; f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(5200, t + d);
  g.gain.setValueAtTime(.10, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(f); f.connect(g); g.connect(c.destination); s.start(t);
}
const sfx = {
  spawn() { const c = audio(false); if (!c || c.state !== 'running') return; const t = c.currentTime; note(c, 880, t, .5, .05); note(c, 1318.5, t + .12, .6, .045); note(c, 1760, t + .26, .8, .035); },
  grab() { const c = audio(true); if (!c) return; const t = c.currentTime; whoosh(c, t, .32); note(c, 659.3, t, .35, .13, 'triangle'); note(c, 987.8, t + .05, .4, .11, 'triangle'); note(c, 1318.5, t + .1, .5, .09, 'sine'); },
  tick(i) { const c = audio(false); if (!c) return; const t = c.currentTime, f = 1046.5 * Math.pow(2, Math.min(i, 12) / 12 * 1.2); note(c, f, t, .16, .12, 'sine'); note(c, f * 2, t, .1, .05, 'sine'); },
  win(amt) {
    const c = audio(false); if (!c) return; const t = c.currentTime, big = amt >= 600;
    [523.25, 659.25, 783.99, 1046.5, ...(big ? [1318.5, 1568] : [])].forEach((f, i) => note(c, f, t + i * .07, .55, .11, 'triangle'));
    note(c, 261.6, t, .8, .09, 'sine'); if (big) note(c, 392, t, .9, .07, 'sine');
  },
  fizzle() { const c = audio(false); if (!c) return; const t = c.currentTime; note(c, 700, t, .3, .08, 'sine', 180); },
};

/* ───────── the coin ───────── */
export function createDrift({ sb, getOrbits, setOrbits, reloadOrbits, toast }) {
  let host = null, layer = null, el = null, fly = null, coin = null, raf = 0, last = 0, busy = false, waitTimer = 0, asking = false, lw = 0, lh = 0, lx = 0, ly = 0, measureAt = 0;

  function ensureLayers() {
    if (!layer) { layer = document.createElement('div'); layer.className = 'odlayer'; layer.setAttribute('aria-hidden', 'false'); }
    if (!fly) { fly = document.createElement('div'); fly.className = 'odfly'; fly.setAttribute('aria-hidden', 'true'); }
    if (!layer.isConnected) document.body.appendChild(layer);
    if (!fly.isConnected) document.body.appendChild(fly);
  }
  function makeEl() {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'odrift'; b.setAttribute('aria-label', 'Drifting Orbits: click to collect');
    b.innerHTML = `<span class="odhalo"></span><span class="odring"></span><span class="odcore"><img src="${LOGO}" alt="" width="34" height="34" draggable="false"></span><span class="odshine"></span>`;
    b.addEventListener('click', collect);
    return b;
  }

  /* a random spot on the edge, heading inward */
  function enter() {
    const w = lw, h = lh, side = (Math.random() * 4) | 0, t = Math.random();
    let x, y, a;
    if (side === 0) { x = t * w; y = -R; a = Math.PI / 2; }
    else if (side === 1) { x = w + R; y = t * h; a = Math.PI; }
    else if (side === 2) { x = t * w; y = h + R; a = -Math.PI / 2; }
    else { x = -R; y = t * h; a = 0; }
    a += rnd(-.85, .85);
    coin = { x, y, dx: Math.cos(a), dy: Math.sin(a) };
  }

  function frame(ts) {
    raf = 0;
    if (!host || !host.isConnected || document.hidden || !coin || busy) return;
    if (last && ts - last < 40) { raf = requestAnimationFrame(frame); return; } // 25 fps is smooth for a slow coin
    const dt = Math.min(.1, (ts - (last || ts)) / 1000); last = ts;
    if (!measureAt || ts - measureAt > 250) { // measure layout four times per second, not every animation frame
      measureAt = ts;
      const r = host.getBoundingClientRect();
      if (r.width < 80 || r.height < 80) { layer.style.display = 'none'; raf = requestAnimationFrame(frame); return; }
      layer.style.display = '';
      if (r.left !== lx || r.top !== ly || r.width !== lw || r.height !== lh) {
        lx = r.left; ly = r.top; lw = r.width; lh = r.height;
        layer.style.cssText = `left:${lx}px;top:${ly}px;width:${lw}px;height:${lh}px`;
      }
    }
    if (reduced()) { // keep the collectible visible but motionless for accessibility
      el.style.transform = `translate(${lw * .5 - R}px,${lh * .35 - R}px)`;
      return;
    } else {
      const v = (lw + 2 * R) / LOOP_S;
      coin.x += coin.dx * v * dt; coin.y += coin.dy * v * dt;
      if (coin.x < -R - 4 || coin.x > lw + R + 4 || coin.y < -R - 4 || coin.y > lh + R + 4) enter();
      el.style.transform = `translate(${coin.x - R}px,${coin.y - R}px)`;
    }
    raf = requestAnimationFrame(frame);
  }

  function spawn() {
    if (coin || !host) return;
    ensureLayers();
    el = makeEl(); layer.appendChild(el);
    const r = host.getBoundingClientRect(); lx = r.left; ly = r.top; lw = r.width; lh = r.height;
    layer.style.cssText = `left:${lx}px;top:${ly}px;width:${lw}px;height:${lh}px`;
    enter(); el.style.transform = `translate(${coin.x - R}px,${coin.y - R}px)`;
    if (reduced()) el.style.transform = `translate(${lw * .5 - R}px,${lh * .35 - R}px)`;
    else if (!raf) { last = 0; measureAt = 0; raf = requestAnimationFrame(frame); }
    el.classList.add('odin');
    sfx.spawn();
  }

  /* ask the server how long until this account's next coin, then wait that long */
  async function schedule() {
    clearTimeout(waitTimer); if (coin || busy || asking || !host) return;
    asking = true; let s = 0;
    try { const { data } = await sb.rpc('orbit_drift_wait'); s = Math.max(0, Number(data) || 0); } catch { s = 60; }
    asking = false;
    if (!host) return;
    waitTimer = setTimeout(() => { waitTimer = 0; if (host && !coin && !busy) spawn(); }, Math.max(MIN_GAP_S, s) * 1000);
  }

  /* ───── click ───── */
  async function collect(e) {
    if (busy || !coin) return; busy = true;
    e?.preventDefault?.();
    const cr = el.getBoundingClientRect(), cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
    el.classList.add('odgrab'); el.disabled = true;
    sfx.grab();
    burst(cx, cy);
    let amt = 0, failed = false;
    try { const { data, error } = await sb.rpc('claim_orbit_drift'); if (error) failed = true; else amt = Number(data) || 0; } catch { failed = true; }
    if (amt <= 0) {   // not ready (another tab got it) or not allowed: let it fade out quietly
      sfx.fizzle(); el.classList.add('odfade'); if (failed) toast?.('Could not collect that one. Try the next one.', true);
      setTimeout(() => { cleanupCoin(); schedule(); }, 450); return;
    }
    el.classList.add('odpop'); popText(cx, cy, amt);
    sfx.win(amt);
    await new Promise(r => setTimeout(r, 380));
    await throwToChip(cx, cy, amt);
    cleanupCoin(); reloadOrbits?.(); schedule();
  }
  function cleanupCoin() { el?.remove(); el = null; coin = null; busy = false; }

  function burst(x, y) {
    ensureLayers();
    const ring = document.createElement('i'); ring.className = 'odwave'; ring.style.cssText = `left:${x}px;top:${y}px`; fly.appendChild(ring);
    ring.animate([{ transform: 'translate(-50%,-50%) scale(.4)', opacity: .9 }, { transform: 'translate(-50%,-50%) scale(3.2)', opacity: 0 }], { duration: 650, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => ring.remove();
    const n = reduced() ? 0 : 18;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('i'); s.className = 'odspark'; const a = rnd(0, Math.PI * 2), d = rnd(40, 110), sz = rnd(3, 7);
      s.style.cssText = `left:${x}px;top:${y}px;width:${sz}px;height:${sz}px`; fly.appendChild(s);
      s.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * d}px),calc(-50% + ${Math.sin(a) * d}px)) scale(0)`, opacity: 0 }], { duration: rnd(450, 800), easing: 'cubic-bezier(.1,.8,.3,1)' }).onfinish = () => s.remove();
    }
  }
  function popText(x, y, amt) {
    const t = document.createElement('b'); t.className = 'odamt'; t.textContent = '+' + fmt(amt); t.style.cssText = `left:${x}px;top:${y}px`; fly.appendChild(t);
    t.animate([{ transform: 'translate(-50%,-50%) scale(.5)', opacity: 0 }, { transform: 'translate(-50%,-90%) scale(1.25)', opacity: 1, offset: .25 }, { transform: 'translate(-50%,-130%) scale(1)', opacity: 1, offset: .75 }, { transform: 'translate(-50%,-190%) scale(.9)', opacity: 0 }], { duration: 1500, easing: 'ease-out' }).onfinish = () => t.remove();
  }

  /* where the Orbits label is (the chip beside your profile); if the sidebar is hidden (small phones), the bottom-left corner */
  function target() {
    const c = document.querySelector('#orbchip'), r = c?.getBoundingClientRect();
    if (r && r.width > 0 && r.right > 0 && r.left >= 0 && r.top < innerHeight && r.bottom > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2, chip: c };
    return { x: 30, y: innerHeight - 30, chip: null };
  }
  function pulse(chip) {
    if (!chip) return;
    chip.animate([{ transform: 'scale(1)', boxShadow: '0 0 0 0 #7da0ffaa' }, { transform: 'scale(1.28)', boxShadow: '0 0 0 9px #7da0ff00', offset: .4 }, { transform: 'scale(1)', boxShadow: '0 0 0 0 #7da0ff00' }], { duration: 380, easing: 'ease-out' });
  }

  /* a stream of little coins arcs from the coin to the Orbits chip; the number counts up as each one lands */
  function throwToChip(x0, y0, amt) {
    return new Promise(done => {
      const n = reduced() ? 4 : Math.min(14, 5 + Math.round(amt / 120)), per = Math.floor(amt / n), flights = [];
      for (let i = 0; i < n; i++) {
        const m = document.createElement('img'); m.src = LOGO; m.alt = ''; m.className = 'odmini'; m.width = 22; m.height = 22; fly.appendChild(m);
        const a = rnd(0, Math.PI * 2), spread = rnd(30, 90);
        flights.push({ m, delay: i * 70 + rnd(0, 30), dur: rnd(650, 850), sx: x0 + Math.cos(a) * spread * .4, sy: y0 + Math.sin(a) * spread * .4, bow: rnd(-120, 120), got: false, i });
      }
      const t0 = performance.now(); let landed = 0;
      const step = now => {
        const tg = target();
        for (const f of flights) {
          if (f.got) continue;
          const p = (now - t0 - f.delay) / f.dur;
          if (p < 0) { f.m.style.opacity = 0; continue; }
          if (p >= 1) {
            f.got = true; f.m.remove(); landed++;
            const add = landed === n ? amt - per * (n - 1) : per;
            setOrbits(getOrbits() + add); sfx.tick(landed); pulse(tg.chip);
            continue;
          }
          const e = p * p * (3 - 2 * p), mx = (f.sx + tg.x) / 2 + f.bow, my = Math.min(f.sy, tg.y) - 60;
          const x = (1 - e) * (1 - e) * f.sx + 2 * (1 - e) * e * mx + e * e * tg.x, y = (1 - e) * (1 - e) * f.sy + 2 * (1 - e) * e * my + e * e * tg.y;
          f.m.style.opacity = 1; f.m.style.transform = `translate(${x - 11}px,${y - 11}px) scale(${1.15 - .45 * e}) rotate(${p * 540}deg)`;
        }
        if (landed < n) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
  }

  const resumeDrift = () => {
    if (!document.hidden && host && coin && !busy && !raf && !reduced()) { last = 0; measureAt = 0; raf = requestAnimationFrame(frame); }
  };
  document.addEventListener('visibilitychange', resumeDrift);
  window.addEventListener('orbit-motion', resumeDrift);

  return {
    /* called every time the home page is drawn (safe to repeat) */
    attach(main) {
      host = main; ensureLayers();
      if (el && !el.isConnected) layer.appendChild(el);
      if (coin && !raf && !reduced()) { last = 0; measureAt = 0; raf = requestAnimationFrame(frame); }
      if (!coin && !busy && !waitTimer && !asking) schedule();
    },
    /* called when the person leaves the home page: the coin waits where it is */
    detach() {
      host = null; clearTimeout(waitTimer); waitTimer = 0;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (!busy) { layer?.remove(); fly?.remove(); } else { layer && (layer.style.display = 'none'); }
    },
  };
}
