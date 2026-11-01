/* Orbit Leaderboard: page markup and its animation.
   Kept out of app.js so it can be tested on its own. app.js hands in what it already has (rows, profiles, avatar maker, icons). */

const TABS = [[-1, 'Current', 'bulb'], [1, 'Day', 'sun'], [7, 'Week', 'calendar'], [30, 'Month', 'calendar'], [0, 'All-time', 'trophy']];
const ROLE = { owner: 'Owner', admin: 'Admin', moderator: 'Moderator', support: 'Support Specialist', member: 'Member' };

/* the three rings drawn in the hero (same numbers as the SVG ellipses): centre 400,170 in an 800x340 box.
   closer ring = higher rank. period = seconds for one lap; dir = which way round */
export const RINGS = [
  { rx: 235, ry: 120, rot: -22, period: 46, dir: 1, max: 2 },
  { rx: 330, ry: 125, rot: 8, period: 62, dir: -1, max: 3 },
  { rx: 372, ry: 112, rot: -8, period: 80, dir: 1, max: 3 },
];

/* how far someone moved: positive = climbed. null = new on the board */
export const move = r => (r.prev_rank == null ? null : Number(r.prev_rank) - Number(r.rank));
function moveHtml(r) {
  const m = move(r);
  if (m == null) return '<span class="lbmv new" title="New on the board">NEW</span>';
  if (m === 0) return '<span class="lbmv flat" title="Same place as before">—</span>';
  return m > 0 ? `<span class="lbmv up" title="Up ${m} ${m === 1 ? 'place' : 'places'}"><i>▲</i>${m}</span>` : `<span class="lbmv dn" title="Down ${-m} ${m === -1 ? 'place' : 'places'}"><i>▼</i>${-m}</span>`;
}
const SINCE = { 1: 'vs the day before', 7: 'vs the week before', 30: 'vs the month before', 0: 'vs 7 days ago', '-1': 'vs 7 days ago' };

export function leaderboardHtml({ rows, days, showAll, meId, err, prof, av, ic, esc, roleOf, logo, menu = '', fresh = false }) {
  const mine = rows.find(r => r.user_id === meId), shown = rows.slice(0, showAll ? 50 : 10);
  const p3 = [rows[1], rows[0], rows[2]].filter(Boolean);   // podium order: 2nd, 1st, 3rd
  let at = 0;
  const orbs = RINGS.map((ring, ri) => {
    const take = rows.slice(at, at + ring.max); at += ring.max;
    return take.map((r, i) => {
      const m = move(r), p = prof(r.user_id);
      return `<span class="lbo ring${ri}" data-ring="${ri}" data-i="${i}" data-n="${take.length}" tabindex="0" role="img" aria-label="${esc(r.display_name)}, place ${r.rank}"><span class="lbo-in">${av(p)}${m ? `<i class="lbo-b ${m > 0 ? 'up' : 'dn'}">${m > 0 ? '▲' : '▼'}</i>` : ''}</span><em class="lbo-tip"><b>${esc(r.display_name)}</b>#${r.rank} · ${Number(r.total).toLocaleString()}</em></span>`;
    }).join('');
  }).join('');
  const hero = `<section class="lbhero" aria-label="Top members orbiting Orbit">
    <svg viewBox="0 0 800 340" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="lbr" x1="0" x2="1"><stop offset="0" stop-color="#5a3bff"/><stop offset=".5" stop-color="#37c8ff"/><stop offset="1" stop-color="#b05bff"/></linearGradient></defs>
      <g fill="none" stroke="url(#lbr)">${RINGS.map((r, i) => `<ellipse class="lbring r${i}" cx="400" cy="170" rx="${r.rx}" ry="${r.ry}" stroke-width="${[2, 1.2, 1.6][i]}" transform="rotate(${r.rot} 400 170)" opacity="${[.9, .6, .8][i]}"/>`).join('')}</g></svg>
    <div class="lbstars" aria-hidden="true">${Array.from({ length: 26 }, (_, i) => `<i style="left:${(i * 37 + 11) % 100}%;top:${(i * 53 + 7) % 100}%;--d:${(i % 7) * .45}s;--s:${1 + (i % 3)}px"></i>`).join('')}</div>
    <div class="lbplanet"><span class="lbhalo"></span><img src="${logo}" alt=""></div>${orbs}
  </section>`;
  const podium = p3.length >= 3 ? `<section class="lbpodium" aria-label="Top three">${p3.map(r => {
    const k = Number(r.rank), place = k === 1 ? 1 : k === 2 ? 2 : 3, p = prof(r.user_id);
    return `<div class="pod p${place}${r.user_id === meId ? ' you' : ''}"><div class="pav">${place === 1 ? '<em class="pcrown">♛</em>' : ''}${av(p)}<i class="pm m${place}">${k}</i></div><b class="pn">${esc(r.display_name)}</b><span class="pt" data-count="${Number(r.total)}">${Number(r.total).toLocaleString()}</span><div class="pbar"><span>${moveHtml(r)}</span></div></div>`;
  }).join('')}</section>` : '';
  const rowsHtml = shown.map((r, i) => {
    const p = prof(r.user_id), k = Number(r.rank), role = ROLE[roleOf(r.user_id)] || 'Member';
    return `<div class="lbrow ${r.user_id === meId ? 'you' : ''} ${k <= 3 ? 'top' + k : ''}" style="--i:${i}" data-uid="${r.user_id}"><span class="lbrk">${k <= 3 ? `<i class="lbmedal m${k}">${k}</i>` : k}</span>
      <span class="lbm">${av(p)}<span class="t"><b>${esc(r.display_name)}${k === 1 ? ' <em class="lbcrown">♛</em>' : ''}</b><small>${esc(role)}</small></span></span>
      <span class="lbtot r"><img src="logo.svg" width="26" height="26" alt=""><span data-count="${Number(r.total)}">${Number(r.total).toLocaleString()}</span></span><span class="r">${moveHtml(r)}</span></div>`;
  }).join('') || '<p class="muted lbempty">No Orbits yet. Join an event to earn the first ones.</p>';
  const above = mine && Number(mine.rank) > 1 ? rows.filter(r => Number(r.rank) < Number(mine.rank)).pop() : null, gap = above ? Number(above.total) - Number(mine.total) : 0;
  const youCard = mine ? `<aside class="lbyoucard"><div class="yrank"><small>Your rank</small><b>#${mine.rank}</b></div><div class="ymid"><b>${Number(mine.total).toLocaleString()} Orbits</b>${above ? `<div class="ybar" aria-hidden="true"><i style="--w:${Math.max(6, Math.min(100, Math.round(Number(mine.total) / Math.max(1, Number(above.total)) * 100)))}%"></i></div><small>${gap.toLocaleString()} more to pass ${esc(above.display_name)}</small>` : '<small>You are leading the board</small>'}</div><div class="ymv">${moveHtml(mine)}<small>${SINCE[days]}</small></div></aside>` : '';
  return `<div class="lbscreen${fresh ? ' fresh' : ''}"><div class="top lbtop">${menu}<span class="hashi">${ic('trophy', 20)}</span><b class="title">Orbit Leaderboard</b></div>
  <div class="lbpage">
  <header class="lbhead"><span class="lbtrophy">${ic('trophy', 30)}</span><div><h1>Orbit Leaderboard</h1><p>Earn Orbits. Climb the ranks. Unlock exclusive cosmetics and more!</p></div></header>
  ${hero}
  <div class="lbtabs" role="tablist">${TABS.map(([n, l, i]) => `<button role="tab" aria-selected="${days === n}" class="${days === n ? 'on' : ''}" data-d="${n}">${ic(i, 18)}<span>${l}</span></button>`).join('')}</div>
  ${err ? `<p class="err">${esc(err)}<br>If this says a function is missing, run migration-leaderboard-rank-moves.sql in Supabase.</p>` : ''}
  ${podium}${youCard}
  <div class="lbcard"><div class="lbrow lbth"><span>#</span><span>Member</span><span class="r">Orbits</span><span class="r" title="${SINCE[days]}">Places</span></div>
  ${rowsHtml}
  ${rows.length > 10 ? `<button class="lbmore" id="lbmore">${showAll ? 'Show top 10' : 'View Full Leaderboard'} ${ic('arrow', 16)}</button>` : ''}</div>
  <p class="lbnote muted">Places = how far someone moved ${SINCE[days]}. ${days < 0 ? 'Current = the Orbits each member has right now (earned minus spent), so spending lowers it.' : days === 0 ? 'All-time = every Orbit a member has ever earned; spending never lowers it.' : 'Orbits earned count; spending never lowers a rank.'}</p>`;
}

/* ───────── animation ───────── */
const RM = matchMedia('(prefers-reduced-motion: reduce)');
const still = () => RM.matches && !document.documentElement.classList.contains('force-motion');
let raf = 0;

/* people ride the three rings around the planet logo (the icon only, no wordmark); back half is smaller, dimmer and passes behind the planet.
   Position is a GPU transform (no layout work per frame), so the motion stays smooth. */
function place(hero, t) {
  const w = hero.clientWidth, h = hero.clientHeight, kx = w / 800, ky = h / 340;
  hero.querySelectorAll('.lbo').forEach(el => {
    const ring = RINGS[+el.dataset.ring], n = +el.dataset.n, i = +el.dataset.i;
    const a = (i / n + (+el.dataset.ring) * .21) * Math.PI * 2 + ring.dir * (t / ring.period) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a), r = ring.rot * Math.PI / 180;
    const x = 400 + ring.rx * ca * Math.cos(r) - ring.ry * sa * Math.sin(r), y = 170 + ring.rx * ca * Math.sin(r) + ring.ry * sa * Math.cos(r);
    const depth = (sa + 1) / 2, back = sa < 0;   // sin<0 = far side
    const sc = .74 + .34 * depth;
    el.style.transform = `translate3d(${(x * kx).toFixed(2)}px,${(y * ky).toFixed(2)}px,0) translate(-50%,-50%) scale(${sc.toFixed(3)})`;
    const tipdn = y < 90, z = back ? 1 : 4, o = (.62 + .38 * depth).toFixed(2);
    if (el._tipdn !== tipdn) { el._tipdn = tipdn; el.classList.toggle('tipdn', tipdn); }
    if (el._z !== z) { el._z = z; el.style.zIndex = z; el.classList.toggle('far', back); }
    el.style.opacity = o;
  });
}

function countUp(root) {
  if (still()) return;
  root.querySelectorAll('[data-count]').forEach((el, idx) => {
    const to = +el.dataset.count; if (!(to > 0)) return;
    const t0 = performance.now() + Math.min(idx, 12) * 40, dur = 800;
    el.textContent = '0';
    const step = now => { const p = Math.min(1, Math.max(0, (now - t0) / dur)), e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(to * e).toLocaleString(); if (p < 1 && el.isConnected) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

/* called after the page is drawn. The orbit angle is kept in `phase` (seconds), so a redraw never makes anyone jump back.
   Hovering the scene eases everyone to a stop (so a name can be read) and eases them back up when you move away: no sudden stops or jumps. */
let phase = 0, speed = 1, lastT = 0;
export function startLeaderboardFx(main, countUpNow) {
  cancelAnimationFrame(raf); raf = 0;
  const scr = main.querySelector('.lbscreen'), hero = main.querySelector('.lbhero'); if (!scr || !hero) return;
  scr.classList.toggle('lbmotion', !still());
  if (countUpNow) countUp(scr);
  place(hero, phase);
  if (still()) return;
  lastT = performance.now();
  const loop = now => {
    if (!hero.isConnected) { raf = 0; return; }
    const dt = Math.min(100, now - lastT); lastT = now;
    const hold = document.hidden || hero.matches(':hover') || (hero.contains(document.activeElement) && document.activeElement.classList.contains('lbo'));
    speed += ((hold ? 0 : 1) - speed) * Math.min(1, dt / 260);
    if (speed < .001) speed = 0;
    if (speed) { phase += dt / 1000 * speed; place(hero, phase); }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}
