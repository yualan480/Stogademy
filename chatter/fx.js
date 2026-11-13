/* Orbit animations: sliding tab highlight, page transitions, scroll reveal, home starfield, orbiting logo planets, click ripple.
   Everything here is cosmetic. It never touches data, and it switches itself off for people who ask their device for less motion. */

const RM = matchMedia('(prefers-reduced-motion: reduce)');
const reduce = () => RM.matches && !document.documentElement.classList.contains('force-motion');

/* ───────── sliding highlight: one coloured pill that glides to whichever tab you pick ───────── */
const slideMem = new Map();
function slideSel(root, key) {
  if (!root) return;
  const on = root.querySelector(':scope > .on'), have = root.querySelector(':scope > .slidebg');
  if (!on || !on.offsetWidth) { have?.remove(); slideMem.delete(key); root.classList.remove('slides'); return; }
  if (have && have.__on === on) return;   // already showing this tab
  if (getComputedStyle(root).position === 'static') root.style.position = 'relative';
  const g = { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight };
  const set = (bg, r) => { bg.style.width = r.w + 'px'; bg.style.height = r.h + 'px'; bg.style.transform = `translate(${r.x}px,${r.y}px)`; };
  if (have) { have.__on = on; slideMem.set(key, g); set(have, g); return; }   // same bar, new tab: glide
  const prev = slideMem.get(key); slideMem.set(key, g);
  const bg = document.createElement('i'); bg.className = 'slidebg'; bg.setAttribute('aria-hidden', 'true'); bg.__on = on;
  root.prepend(bg); root.classList.add('slides');
  if (prev && !reduce() && (prev.x !== g.x || prev.y !== g.y || prev.w !== g.w || prev.h !== g.h)) {   // bar was rebuilt: start where the pill last was, then glide
    bg.style.transition = 'none'; set(bg, prev); bg.getBoundingClientRect();
    requestAnimationFrame(() => { bg.style.transition = ''; set(bg, g); });
  } else set(bg, g);
}
function slideAll(scope) {
  scope.querySelectorAll('.nav, .tabs, .lbtabs').forEach((el, i) => {
    const key = el.classList.contains('nav') ? 'nav' : el.classList.contains('lbtabs') ? 'lb' : 'tabs:' + (document.getElementById('main')?.dataset.view || '') + ':' + i;
    slideSel(el, key);
  });
}

/* ───────── page transition: the old page fades out and up while the new one fades in from slightly below ───────── */
export function pageSwap(main) {
  if (reduce() || !main || !main.firstElementChild) return;
  if (main.querySelector('iframe, video')) return;
  const r = main.getBoundingClientRect(); if (r.width < 80 || r.height < 80) return;
  if (main.getElementsByTagName('*').length > 400) { main.classList.remove('pg-in'); void main.offsetWidth; main.classList.add('pg-in'); clearTimeout(main.__pgT); main.__pgT = setTimeout(() => main.classList.remove('pg-in'), 520); return; }   // big page: fade the new one in, skip cloning the old one
  const ghost = document.createElement('div'); ghost.className = 'pg-ghost'; ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', background: getComputedStyle(main).backgroundColor });
  main.childNodes.forEach(n => ghost.appendChild(n.cloneNode(true)));
  ghost.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
  ghost.querySelectorAll('input,textarea,button,a,select').forEach(n => { n.tabIndex = -1; });
  document.body.appendChild(ghost);
  setTimeout(() => ghost.remove(), 320);
  main.classList.remove('pg-in'); void main.offsetWidth; main.classList.add('pg-in');
  clearTimeout(main.__pgT); main.__pgT = setTimeout(() => main.classList.remove('pg-in'), 520);
}

/* ───────── scroll reveal: headings, panels and rows drift up into place as they scroll into view ───────── */
let revealIO = null;
const REVEAL_SKIP = 'script,style,canvas,svg.ospace,.ostars,.sr,[hidden]';
function revealUnits(el, depth, out) {
  for (const ch of el.children) {
    if (ch.matches(REVEAL_SKIP) || ch.classList.contains('slidebg')) continue;
    const h = ch.offsetHeight; if (!h) continue;
    if (depth < 3 && ch.children.length > 1 && h > 380) revealUnits(ch, depth + 1, out); else out.push(ch);
  }
  return out;
}
export function revealScan(main) {
  revealIO?.disconnect(); revealIO = null;
  if (!main || reduce() || !('IntersectionObserver' in window)) return;
  const host = main.querySelector('.panel'); if (!host || host.classList.contains('orbithome')) return;
  const fold = innerHeight * 0.96, todo = [];
  revealUnits(host, 0, []).forEach(el => { if (el.getBoundingClientRect().top < fold) return; el.classList.add('rv'); todo.push(el); });
  if (!todo.length) return;
  revealIO = new IntersectionObserver(entries => {
    let i = 0;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target; revealIO.unobserve(el);
      el.style.transitionDelay = Math.min(i++, 6) * 70 + 'ms';
      el.classList.add('rv-in');
      setTimeout(() => { el.classList.remove('rv', 'rv-in'); el.style.transitionDelay = ''; }, 900 + i * 70);
    }
  }, { threshold: 0.06, rootMargin: '0px 0px -5% 0px' });
  todo.forEach(el => revealIO.observe(el));
}

/* ───────── attach to the app shell (called each time the shell is built) ───────── */
let mo = [];
export function attachFx(side, main) {
  mo.forEach(m => m.disconnect()); mo = [];
  const run = () => { slideAll(side); slideAll(main); };
  let raf = 0; const soon = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { slideMem.clear(); document.querySelectorAll('.slidebg').forEach(n => { n.__on = null; }); run(); }); };
  [side, main].forEach(el => { if (!el) return; const m = new MutationObserver(run); m.observe(el, { childList: true }); mo.push(m); });
  if (!attachFx.bound) { attachFx.bound = true; addEventListener('resize', () => attachFx.soon?.(), { passive: true }); }
  attachFx.soon = soon;
  run();
}
export function afterMain(main) { slideAll(main); revealScan(main); }

/* ───────── home starfield: three depths of stars drifting at different speeds, plus a rare shooting star ───────── */
const SF = { stars: null, t0: performance.now(), shoot: null, nextShoot: performance.now() + 7000, raf: 0, cv: null, last: 0, frame: null, ro: null };
function makeStars() {
  const n = 95, layers = [{ v: 4, r: [0.35, 0.7], a: [0.25, 0.5] }, { v: 9, r: [0.6, 1.1], a: [0.4, 0.75] }, { v: 17, r: [0.9, 1.6], a: [0.6, 1] }];
  return Array.from({ length: n }, (_, i) => {
    const L = layers[i % 3], rnd = (a, b) => a + Math.random() * (b - a);
    return { x: Math.random(), y: Math.random(), v: L.v * rnd(0.8, 1.25), r: rnd(...L.r), a: rnd(...L.a), tw: rnd(0.4, 1.6), ph: rnd(0, 6.28), hue: Math.random() < 0.18 ? 'warm' : Math.random() < 0.4 ? 'cool' : 'white' };
  });
}
export function startStars(cv) {
  if (!cv) return;
  if (SF.cv === cv && SF.ro) return; // keep the existing canvas and render loop across live home updates
  SF.ro?.disconnect(); SF.stars ||= makeStars(); SF.cv = cv;
  cancelAnimationFrame(SF.raf);
  const ctx = cv.getContext('2d');
  const fit = () => { const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(2500000 / Math.max(1,r.width*r.height))); cv.width = Math.max(1, Math.round(r.width * d)); cv.height = Math.max(1, Math.round(r.height * d)); ctx.setTransform(d, 0, 0, d, 0, 0); cv._w = r.width; cv._h = r.height; };
  fit(); const ro = new ResizeObserver(() => { fit(); frame(performance.now(), true); }); ro.observe(cv); SF.ro = ro;
  const col = { white: '255,255,255', cool: '170,205,255', warm: '255,225,190' };
  function frame(now, still) {
    SF.raf = 0;
    if (!cv.isConnected) { ro.disconnect(); SF.ro = null; return; }
    if (!still && document.hidden) return;
    if (!still && now - SF.last < 50) { SF.raf = requestAnimationFrame(frame); return; }   // 20 fps keeps the drifting stars visible at half the render cost
    const dt = Math.min(0.1, (now - (SF.last || now)) / 1000); SF.last = now;
    const W = cv._w, H = cv._h; ctx.clearRect(0, 0, W, H);
    const t = (now - SF.t0) / 1000; let lastHue = '';
    for (const s of SF.stars) {
      const x = (((s.x * W - s.v * t * 0.8) % W) + W) % W, y = (((s.y * H + s.v * t * 0.18) % H) + H) % H;
      const tw = 0.75 + 0.25 * Math.sin(t * s.tw + s.ph);
      if (s.hue !== lastHue) { ctx.fillStyle = `rgb(${col[s.hue]})`; lastHue = s.hue; }
      ctx.globalAlpha = s.a * tw;
      ctx.beginPath(); ctx.arc(x, y, s.r, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (!still && !reduce()) {
      if (!SF.shoot && now > SF.nextShoot) { SF.shoot = { x: Math.random() * W * 0.7 + W * 0.25, y: Math.random() * H * 0.35, life: 0 }; SF.nextShoot = now + 9000 + Math.random() * 9000; }
      const sh = SF.shoot;
      if (sh) {
        sh.life += dt; const p = sh.life / 0.9, len = 110;
        if (p >= 1) SF.shoot = null; else {
          const x = sh.x - p * 260, y = sh.y + p * 120, g = ctx.createLinearGradient(x, y, x + len * 0.9, y - len * 0.42);
          g.addColorStop(0, `rgba(255,255,255,${(1 - p) * 0.85})`); g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.strokeStyle = g; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len * 0.9, y - len * 0.42); ctx.stroke();
        }
      }
    }
    if (still || reduce()) return;
    SF.raf = requestAnimationFrame(frame);
  }
  SF.frame = frame;
  if (reduce()) frame(performance.now(), true); else SF.raf = requestAnimationFrame(frame);
}

/* ───────── orbit logo: two planets travel round the ring, passing in front of and behind the O ─────────
   The ring is an ellipse fitted to the logo image (coordinates are in the 660 x 651 pixel space of orbit-logo-core.png). */
const RING = { cx: 325.1, cy: 197.2, a: 293.4, b: 95.8, th: -20.2 * Math.PI / 180 }, IMG_W = 660, IMG_H = 444;   // IMG_H: orbit-logo-planet.png is the planet only (wordmark cropped off), so heights are measured against 444
const ringPt = t => ({ x: RING.cx + RING.a * Math.cos(t) * Math.cos(RING.th) - RING.b * Math.sin(t) * Math.sin(RING.th), y: RING.cy + RING.a * Math.cos(t) * Math.sin(RING.th) + RING.b * Math.sin(t) * Math.cos(RING.th) });
const nearestT = (x, y) => { let best = 0, bd = 1e9; for (let i = 0; i < 720; i++) { const t = i / 720 * 6.2832, p = ringPt(t), d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = t; } } return best; };
const PLANETS = [{ t0: nearestT(523, 71), w: 0.36, size: 72 / IMG_W }, { t0: nearestT(113, 332), w: 0.5, size: 40 / IMG_W }];
const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
let logoRaf = 0, logoRO = null, logoWrap = null, logoFrame = null, logoLast = 0; const LOGO_T0 = performance.now();
export function startLogo(wrap) {
  if (!wrap) return;
  if (logoWrap === wrap && logoRO) return; // preserve moving planets on live updates
  cancelAnimationFrame(logoRaf); logoRO?.disconnect(); logoWrap = wrap; logoLast = 0;
  const els = [...wrap.querySelectorAll('.op')];
  let wpx = wrap.clientWidth || 300;
  const ro = new ResizeObserver(() => { wpx = wrap.clientWidth || wpx; sizeAll(); }); ro.observe(wrap); logoRO = ro;
  const sizeAll = () => els.forEach((el, i) => { el.style.width = (PLANETS[i].size * wpx).toFixed(1) + 'px'; });
  sizeAll();
  function frame(now) {
    logoRaf = 0;
    if (!wrap.isConnected) { ro.disconnect(); logoRO = null; return; }
    if (document.hidden) return;
    if (!reduce() && logoLast && now - logoLast < 33) { logoRaf = requestAnimationFrame(frame); return; }
    logoLast = now;
    const t = (now - LOGO_T0) / 1000, hpx = wpx * IMG_H / IMG_W;
    els.forEach((el, i) => {
      const P = PLANETS[i], a = P.t0 + (reduce() ? 0 : P.w * t), p = ringPt(a), depth = Math.sin(a);
      const k = 0.88 + 0.16 * depth, vis = depth >= 0 ? 1 : smooth(196, 232, Math.abs(p.x - RING.cx));
      el.style.transform = `translate3d(${(p.x / IMG_W * wpx).toFixed(1)}px,${(p.y / IMG_H * hpx).toFixed(1)}px,0) translate(-50%,-50%) scale(${k.toFixed(3)})`;
      el.style.opacity = vis.toFixed(3);
    });
    if (!reduce()) logoRaf = requestAnimationFrame(frame);
  }
  logoFrame = frame;
  frame(performance.now());
}

// Stop background animation loops when the tab is hidden; resume automatically when visible.
const resumeHomeMotion = () => {
  if (document.hidden) return;
  if (SF.cv?.isConnected && SF.frame && !SF.raf && !reduce()) SF.raf = requestAnimationFrame(SF.frame);
  if (logoWrap?.isConnected && logoFrame && !logoRaf && !reduce()) logoRaf = requestAnimationFrame(logoFrame);
};
document.addEventListener('visibilitychange', resumeHomeMotion);
window.addEventListener('orbit-motion', resumeHomeMotion);

/* ───────── click ripple: a soft ring spreads from wherever you click or tap ───────── */
let rippleOn = false;
export function clickRipple() {
  if (rippleOn) return; rippleOn = true;
  addEventListener('pointerdown', e => {
    if (reduce() || e.button > 0) return;
    const ts = document.documentElement.dataset.trail;   // an equipped Orbit Trail with its own shape (shop-trails.js)
    if (ts && window.__orbitTrail) { const cs = getComputedStyle(document.documentElement); window.__orbitTrail(ts, e.clientX / (window.__pz || 1), e.clientY / (window.__pz || 1), cs.getPropertyValue('--rip1').trim(), cs.getPropertyValue('--rip2').trim()); return; }
    const r = document.createElement('span'); r.className = 'fx-ripple'; r.style.left = e.clientX / (window.__pz || 1) + 'px'; r.style.top = e.clientY / (window.__pz || 1) + 'px';
    document.body.appendChild(r); setTimeout(() => r.remove(), 600);
  }, { passive: true });
}
