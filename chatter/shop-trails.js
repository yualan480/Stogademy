/* Orbit Shop: click effects with real shapes (stars, hearts, bubbles, confetti, bolts, a tiny galaxy...).
   spawnTrail() is used for your real clicks (fx.js calls window.__orbitTrail) and for the little shop previews (host = the preview box). */
const HEX = /^#[0-9a-f]{6}$/i;
const hx = (v, d) => (typeof v === 'string' && HEX.test(v) ? v : d);
const R = (a, b) => a + Math.random() * (b - a);
const mix = [(a, b) => a, (a, b) => b];

export const TRAIL_SHAPES = ['ring', 'bubbles', 'pixels', 'sparkle', 'hearts', 'snow', 'notes', 'petals', 'stars', 'confetti', 'bolts', 'burst', 'galaxy'];
const GLYPH = { sparkle: ['✦', '✧'], hearts: ['♥'], snow: ['❄', '❅'], notes: ['♪', '♫'], petals: ['❀', '✿'], stars: ['★'] };

function put(host, el) { if (host) { el.classList.add('abs'); host.append(el); } else document.body.append(el); return el; }

export function spawnTrail(shape, x, y, c1, c2, host) {
  c1 = hx(c1, '#7fb8ff'); c2 = hx(c2, '#37e0ff');
  const live = [];
  const p = (cls, o) => {
    const el = document.createElement('span'); el.className = 'fxp ' + cls;
    el.style.cssText = `left:${x}px;top:${y}px;--p1:${c1};--p2:${c2};--pc:${o.pc || c1};--dx:${o.dx || 0}px;--dy:${o.dy || 0}px;--gy:${o.gy || 0}px;--rot:${o.rot || 0}deg;--sc:${o.sc || 1};--dur:${o.dur || .9}s;--s:${o.s || 10}px`;
    if (o.t) el.textContent = o.t;
    put(host, el); live.push(el); setTimeout(() => el.remove(), (o.dur || .9) * 1000 + 80);
  };
  const ang = (i, n, v = 0) => ((i / n) * 6.283) + v;
  switch (shape) {
    case 'bubbles': for (let i = 0; i < 7; i++) p('k-bubble', { dx: R(-34, 34), dy: R(-70, -28), gy: 0, sc: R(1, 1.5), s: R(7, 16), dur: R(.8, 1.3) }); break;
    case 'pixels': for (let i = 0; i < 12; i++) { const a = ang(i, 12, R(0, .4)), d = R(18, 42); p('k-pixel', { dx: Math.cos(a) * d, dy: Math.sin(a) * d, gy: 14, s: R(4, 8), pc: i % 2 ? c1 : c2, dur: .7 }); } break;
    case 'sparkle': case 'hearts': case 'snow': case 'notes': case 'petals': case 'stars': {
      const g = GLYPH[shape], n = shape === 'snow' ? 7 : 8;
      for (let i = 0; i < n; i++) {
        const a = ang(i, n, R(0, .5)), d = R(20, 46);
        const o = shape === 'snow' ? { dx: R(-30, 30), dy: R(8, 24), gy: R(30, 54), rot: R(-120, 120), dur: R(1.1, 1.6) }
          : shape === 'hearts' ? { dx: R(-30, 30), dy: R(-64, -30), rot: R(-25, 25), dur: R(1, 1.4) }
          : shape === 'petals' ? { dx: Math.cos(a) * d, dy: Math.sin(a) * d * .5, gy: R(22, 44), rot: R(-260, 260), dur: R(1.1, 1.5) }
          : shape === 'notes' ? { dx: R(-36, 36), dy: R(-60, -26), rot: R(-30, 30), dur: R(1, 1.4) }
          : { dx: Math.cos(a) * d * 1.3, dy: Math.sin(a) * d * 1.3, rot: R(-180, 180), dur: .8 };
        p('k-glyph', { ...o, t: g[i % g.length], pc: i % 2 ? c2 : c1, s: R(12, shape === 'stars' ? 22 : 20), sc: R(.8, 1.3) });
      }
      break;
    }
    case 'confetti': for (let i = 0; i < 16; i++) p('k-confetti', { dx: R(-50, 50), dy: R(-48, -8), gy: R(36, 80), rot: R(-540, 540), pc: ['#ff4fd8', '#37e0ff', '#ffd166', '#7dff9c', c1, c2][i % 6], dur: R(1, 1.5) }); break;
    case 'bolts': for (let i = 0; i < 5; i++) { const a = ang(i, 5, R(-.3, .3)) - 1.57, d = R(26, 54); p('k-bolt', { dx: Math.cos(a) * d, dy: Math.sin(a) * d, rot: R(-40, 40), sc: R(.8, 1.3), dur: .5 }); } p('k-ring', { sc: 4, dur: .45 }); break;
    case 'burst': {
      p('k-ring', { sc: 5, dur: .6 });
      for (let i = 0; i < 20; i++) { const a = ang(i, 20, R(0, .3)), d = R(30, 66) * (i % 2 ? 1 : .7); p('k-dot', { dx: Math.cos(a) * d, dy: Math.sin(a) * d, gy: 22, s: R(3, 6), pc: i % 3 === 0 ? '#fff' : i % 2 ? c1 : c2, dur: R(.8, 1.2) }); }
      break;
    }
    case 'galaxy': {
      const g = document.createElement('span'); g.className = 'fxg'; g.style.cssText = `left:${x}px;top:${y}px`;
      for (let i = 0; i < 22; i++) { const a = i * .62, r = 3 + i * 2.5, s = i % 5 === 0 ? 5 : 3, e = document.createElement('i'); e.style.cssText = `left:${Math.cos(a) * r - s / 2}px;top:${Math.sin(a) * r - s / 2}px;width:${s}px;height:${s}px;--pc:${i % 3 ? (i % 2 ? c1 : c2) : '#fff'}`; g.append(e); }
      put(host, g); setTimeout(() => g.remove(), 1250); break;
    }
    default: p('k-ring', { sc: 4, dur: .6 });
  }
}

/* shop previews: every card with data-tpv replays its effect every couple of seconds */
let ticker = 0;
export function startTrailPreviews() {
  if (ticker) return;
  const play = () => {
    const boxes = document.querySelectorAll('[data-tpv]');
    if (!boxes.length) { clearInterval(ticker); ticker = 0; return; }
    if (document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches && !document.documentElement.classList.contains('force-motion')) return;
    boxes.forEach((b, i) => setTimeout(() => { if (b.isConnected) spawnTrail(b.dataset.tpv, b.clientWidth / 2, b.clientHeight / 2, b.dataset.c1, b.dataset.c2, b); }, i * 90));
  };
  ticker = setInterval(play, 1700); setTimeout(play, 200);
}
