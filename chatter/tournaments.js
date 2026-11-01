/* Orbit Tournaments: browse tournaments, read the details, sign up, follow the bracket or leaderboard, and (for staff) run them.
   Everything that matters is checked on the server (migration-tournaments.sql): who may sign up, how full a tournament is,
   who won a match and who gets prizes. This file only draws the screens and calls those functions, so editing it in the
   browser can never join a full tournament, change a result or pay a prize.
   Games: only Orbit Games can be picked. The list below must match tournament_games() in the SQL file. */

export const GAMES = [
  { id: 'game2048', title: '2048', page: '2048.html', emoji: '🔢', kind: 'solo', c1: '#f59e0b', c2: '#ef4444' },
  { id: 'blockblast', title: 'Block Blast', page: 'blockblast.html', emoji: '🧩', kind: 'solo', c1: '#8b5cf6', c2: '#ec4899' },
  { id: 'breakout', title: 'Block Breaker', page: 'breakout.html', emoji: '🧱', kind: 'solo', c1: '#ef4444', c2: '#f97316' },
  { id: 'dino', title: 'Dino Run', page: 'dino.html', emoji: '🦖', kind: 'solo', c1: '#22c55e', c2: '#14b8a6' },
  { id: 'flappy', title: 'Flappy Bird', page: 'flappy.html', emoji: '🐦', kind: 'solo', c1: '#facc15', c2: '#22c55e' },
  { id: 'geodash', title: 'Geometry Dash', page: 'geodash.html', emoji: '🔷', kind: 'solo', c1: '#3b82f6', c2: '#a855f7' },
  { id: 'girder', title: 'Girder Gorilla', page: 'girder-gorilla.html', emoji: '🦍', kind: 'solo', c1: '#a16207', c2: '#f59e0b' },
  { id: 'sudoku', title: 'Sudoku', page: 'sudoku.html', emoji: '🔢', kind: 'solo', c1: '#2f5bd6', c2: '#8fb0ff' },
  { id: 'minesweeper', title: 'Minesweeper', page: 'minesweeper.html', emoji: '💣', kind: 'solo', c1: '#64748b', c2: '#38bdf8' },
  { id: 'pacman', title: 'Pac-Man', page: 'pacman.html', emoji: '🟡', kind: 'solo', c1: '#eab308', c2: '#3b82f6' },
  { id: 'slope', title: 'Slope', page: 'slope.html', emoji: '🎢', kind: 'solo', c1: '#10b981', c2: '#6366f1' },
  { id: 'snake', title: 'Snake', page: 'snake.html', emoji: '🐍', kind: 'solo', c1: '#16a34a', c2: '#84cc16' },
  { id: 'tetris', title: 'Tetris', page: 'tetris.html', emoji: '🟦', kind: 'solo', c1: '#2563eb', c2: '#06b6d4' },
  { id: 'battleship', title: 'Battleship', page: 'battleship.html', emoji: '🚢', kind: 'duel', c1: '#0ea5e9', c2: '#1e3a8a' },
  { id: 'chess', title: 'Chess', page: 'chess.html', emoji: '♟️', kind: 'duel', c1: '#475569', c2: '#a78bfa' },
  { id: 'draw', title: 'Draw & Guess', page: 'draw.html', emoji: '🎨', kind: 'duel', c1: '#ec4899', c2: '#f59e0b' },
  { id: 'archery', title: 'Archery', page: 'archery.html', emoji: '🏹', kind: 'duel', c1: '#14b8a6', c2: '#65a30d' },
  { id: 'breakout2p', title: 'Block Breaker Duel', page: 'breakout2p.html', emoji: '⚔️', kind: 'duel', c1: '#f43f5e', c2: '#6366f1' },
];
const G = Object.fromEntries(GAMES.map(g => [g.id, g]));
const UNKNOWN_GAME = { id: '', title: 'Orbit Game', page: '', emoji: '🎮', kind: 'solo', c1: '#2563eb', c2: '#37e0ff' };
const gameOf = id => G[id] || UNKNOWN_GAME;

const fmtDate = d => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const fmtDT = d => new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtRange = t => `${fmtDate(t.starts_at)} – ${fmtDate(t.ends_at)}`;
const num = n => Number(n || 0).toLocaleString();
const pad = n => String(n).padStart(2, '0');
const toLocal = iso => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function rel(iso) {
  const ms = new Date(iso) - Date.now(), a = Math.abs(ms), m = a / 60000, h = m / 60, d = h / 24;
  const t = d >= 2 ? `${Math.floor(d)} days` : h >= 2 ? `${Math.floor(h)} hours` : `${Math.max(1, Math.floor(m))} min`;
  return ms > 0 ? `in ${t}` : `${t} ago`;
}
const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };
const group = (rows, key) => { const m = new Map(); for (const r of rows) { if (!m.has(r[key])) m.set(r[key], []); m.get(r[key]).push(r); } return m; };

export function initTournaments(c) {
  const { S, sb, $, esc, ic, I, modal, toast, menuBtn, bindMenu, prof, av, needProfiles, renderMain, renderSide, navTo, isStaff, loadOrbits } = c;

  Object.assign(I, {
    bracket: '<path d="M3 4h5v6H3z"/><path d="M3 14h5v6H3z"/><path d="M16 9h5v6h-5z"/><path d="M8 7h3v10H8"/><path d="M11 12h5"/>',
    crown: '<path d="M2 18l2-11 5 5 3-8 3 8 5-5 2 11z"/><path d="M2 21h20"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  });

  const T = { loaded: false, loading: null, err: '', list: [], byId: new Map(), players: new Map(), matches: new Map(), scores: new Map(),
    id: null, tab: 'overview', filter: 'all', game: '', q: '', admin: false, timer: 0 };

  /* ───────── data ───────── */
  async function load(force) {
    if (T.loading) return T.loading;
    if (T.loaded && !force) return;
    T.loading = (async () => {
      const [a, b, m, s] = await Promise.all([
        sb.from('tournaments').select('*').order('starts_at', { ascending: true }),
        sb.from('tournament_players').select('*').order('registered_at', { ascending: true }),
        sb.from('tournament_matches').select('*'),
        sb.from('tournament_scores').select('*').order('created_at', { ascending: true }),
      ]);
      const bad = a.error || b.error || m.error || s.error;
      if (bad) { T.err = /relation|does not exist|schema cache|function/i.test(bad.message || '') ? 'Tournaments are not set up yet. Run migration-tournaments.sql in Supabase.' : (bad.message || 'Could not load tournaments.'); T.loaded = true; return; }
      T.err = ''; T.list = a.data || []; T.byId = new Map(T.list.map(x => [x.id, x]));
      T.players = group(b.data || [], 'tournament_id');
      T.matches = group(m.data || [], 'tournament_id');
      for (const [k, v] of T.matches) v.sort((x, y) => x.round - y.round || x.slot - y.slot);
      T.scores = group(s.data || [], 'tournament_id');
      const ids = new Set(); [b.data, s.data].forEach(r => (r || []).forEach(x => ids.add(x.user_id)));
      (m.data || []).forEach(x => { if (x.p1) ids.add(x.p1); if (x.p2) ids.add(x.p2); });
      try { await needProfiles([...ids]); } catch {}
      T.loaded = true;
    })().finally(() => { T.loading = null; });
    return T.loading;
  }
  async function call(name, args, okMsg) {
    const { error } = await sb.rpc(name, args);
    if (error) { toast(error.message || 'That did not work.', true); return false; }
    if (okMsg) toast(okMsg);
    await load(true); repaint();
    return true;
  }
  const repaint = () => { if (handles(S.view)) renderMain(); };

  /* ───────── small helpers ───────── */
  const staff = () => !!isStaff();
  const regs = id => (T.players.get(id) || []).filter(p => p.status === 'registered');
  const mine = id => regs(id).some(p => p.user_id === S.me?.id);
  const removed = id => (T.players.get(id) || []).some(p => p.user_id === S.me?.id && p.status === 'disqualified');
  const nameOf = id => (id ? prof(id).display_name : 'TBD');
  const mini = id => (id ? av(prof(id)) : '<span class="av tn-tbd"></span>');
  const isFull = t => regs(t.id).length >= t.max_players;
  const ended = t => !!t.ends_at && Date.now() >= new Date(t.ends_at);
  const regClosed = t => !!t.reg_closes_at && Date.now() > new Date(t.reg_closes_at);
  const canJoin = t => t.status === 'open' && !isFull(t) && !regClosed(t) && !mine(t.id) && !removed(t.id);
  function stat(t) {
    if (t.status === 'draft') return { k: 'draft', l: 'Draft' };
    if (t.status === 'cancelled') return { k: 'cancelled', l: 'Cancelled' };
    if (t.status === 'completed') return { k: 'done', l: 'Completed' };
    if (t.status === 'live') return { k: 'live', l: 'Live' };
    if (isFull(t)) return { k: 'full', l: 'Full' };
    if (regClosed(t)) return { k: 'closed', l: 'Sign-ups closed' };
    return { k: 'open', l: 'Open' };
  }
  const prizeLine = t => [t.orbit_prizes ? '🥇 100 · 🥈 50 · 🥉 25 Orbits' : '', t.prize_text || ''].filter(Boolean).join(' + ') || 'Bragging rights';
  const fmtName = t => (t.format === 'bracket' ? 'Single elimination' : 'Leaderboard (best score)');
  const gtile = g => `<span class="tn-gtile" style="--c1:${g.c1};--c2:${g.c2}" aria-hidden="true">${g.emoji}</span>`;
  const roundName = (r, R) => (r === R ? 'Final' : r === R - 1 ? 'Semifinals' : r === R - 2 ? 'Quarterfinals' : `Round ${r}`);

  function standings(t) {
    const out = new Map(), ps = T.players.get(t.id) || [], bad = new Set(ps.filter(p => p.status !== 'registered').map(p => p.user_id)), since = new Map(ps.map(p => [p.user_id, p.registered_at]));
    for (const s of T.scores.get(t.id) || []) {   // only scores made after the player entered count, and the first one counts even if it is not their best
      if (s.status !== 'approved' || bad.has(s.user_id) || (since.get(s.user_id) && s.created_at < since.get(s.user_id))) continue;
      const o = out.get(s.user_id) || { user: s.user_id, score: -1, at: '', n: 0 }; o.n++;
      if (s.score > o.score || (s.score === o.score && s.created_at < o.at)) { o.score = s.score; o.at = s.created_at; }
      out.set(s.user_id, o);
    }
    return [...out.values()].sort((a, b) => b.score - a.score || (a.at < b.at ? -1 : 1));
  }
  const winsBoard = () => {   // everybody's podium finishes, from the tournaments that are over
    const m = new Map();
    for (const [tid, ps] of T.players) {
      if (T.byId.get(tid)?.status !== 'completed') continue;
      for (const p of ps) if (p.placement >= 1 && p.placement <= 3) { const o = m.get(p.user_id) || { u: p.user_id, 1: 0, 2: 0, 3: 0 }; o[p.placement]++; m.set(p.user_id, o); }
    }
    return [...m.values()].sort((a, b) => b[1] - a[1] || b[2] - a[2] || b[3] - a[3]).slice(0, 5);
  };

  /* ───────── list: browse ───────── */
  const visibleList = () => T.list.filter(t => staff() || t.status !== 'draft');
  function filtered() {
    const q = T.q.trim().toLowerCase();
    return visibleList().filter(t => t.status !== 'draft' && t.status !== 'cancelled').filter(t => {
      if (T.filter === 'open' && t.status !== 'open') return false;
      if (T.filter === 'live' && t.status !== 'live') return false;
      if (T.filter === 'done' && t.status !== 'completed') return false;
      if (T.filter === 'mine' && !mine(t.id)) return false;
      if (T.game && t.game !== T.game) return false;
      if (q && !(t.title.toLowerCase().includes(q) || gameOf(t.game).title.toLowerCase().includes(q))) return false;
      return true;
    });
  }
  function actionBtn(t) {
    const st = stat(t);
    if (canJoin(t)) return `<button class="btn tn-act" data-t="register" data-id="${t.id}">Register →</button>`;
    if (mine(t.id) && t.status === 'open') return `<button class="btn tn-act ghost" data-t="open" data-id="${t.id}">✓ Registered</button>`;
    if (t.status === 'live') return `<button class="btn tn-act ghost" data-t="open" data-id="${t.id}">${t.format === 'bracket' ? 'View bracket' : 'View leaderboard'}</button>`;
    if (t.status === 'completed') return `<button class="btn tn-act ghost" data-t="open" data-id="${t.id}">View results</button>`;
    return `<button class="btn tn-act ghost" data-t="open" data-id="${t.id}">${st.k === 'full' ? 'Full · details' : 'View details'}</button>`;
  }
  function card(t) {
    const g = gameOf(t.game), st = stat(t), n = regs(t.id).length, pct = Math.min(100, Math.round(n / t.max_players * 100));
    return `<article class="tn-card" data-t="open" data-id="${t.id}" tabindex="0" role="button" aria-label="${esc(t.title)}">
      <div class="tn-cardtop">${gtile(g)}<span class="tn-gname">${esc(g.title)}</span><span class="tn-st ${st.k}">${st.l}</span></div>
      <h3>${esc(t.title)}</h3>
      <ul class="tn-meta">
        <li>${ic('calendar', 15)}<span>${esc(fmtRange(t))}</span><small>${t.status === 'open' || t.status === 'draft' ? esc(rel(t.starts_at)) : ''}</small></li>
        <li>${ic('users', 15)}<span>${n}/${t.max_players} registered</span></li>
        <li>${ic('trophy', 15)}<span>${esc(prizeLine(t))}</span></li>
      </ul>
      <div class="tn-bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
      <div class="tn-tags"><span class="tn-tag">${t.format === 'bracket' ? ic('bracket', 13) + ' Bracket' : ic('trophy', 13) + ' Leaderboard'}</span>${mine(t.id) ? '<span class="tn-tag me">You’re in</span>' : ''}</div>
      ${actionBtn(t)}
    </article>`;
  }
  function section(title, icon, list, empty) {
    if (!list.length && !empty) return '';
    return `<h2 class="tn-h">${ic(icon, 20)}<span>${title}</span><small>${list.length}</small></h2>
      ${list.length ? `<div class="tn-grid">${list.map(card).join('')}</div>` : `<p class="muted tn-empty">${empty}</p>`}`;
  }
  function gridHtml() {
    const all = filtered(), f = T.filter;
    if (!all.length) return `<div class="empty tn-none"><h2>No tournaments found</h2><p>${T.list.length ? 'Try a different filter or game.' : staff() ? 'Create the first one from the Admin dashboard.' : 'Check back soon: new tournaments are on the way.'}</p>${staff() && !T.list.length ? '<button class="btn" data-t="new" style="width:auto">Create a tournament</button>' : ''}</div>`;
    const open = all.filter(t => t.status === 'open'), live = all.filter(t => t.status === 'live'), done = all.filter(t => t.status === 'completed').reverse();
    if (f === 'all' || f === 'mine') return section('Upcoming tournaments', 'calendar', open, '') + section('Ongoing tournaments', 'bracket', live, '') + section('Completed', 'crown', done, '');
    return `<div class="tn-grid">${all.map(card).join('')}</div>`;
  }
  function aside() {
    const feat = visibleList().filter(t => t.status === 'open').sort((a, b) => regs(b.id).length - regs(a.id).length)[0];
    const mineList = T.list.filter(t => mine(t.id) && t.status !== 'cancelled').slice(0, 5), top = winsBoard();
    return `<aside class="tn-side">
      ${feat ? `<section class="tn-box tn-feat"><h3>${ic('crown', 18)} Featured</h3>
        <div class="tn-featbody" style="--c1:${gameOf(feat.game).c1};--c2:${gameOf(feat.game).c2}"><span class="tn-bigemoji">${gameOf(feat.game).emoji}</span><b>${esc(feat.title)}</b><small>${esc(gameOf(feat.game).title)} · ${esc(fmtDate(feat.starts_at))}</small></div>
        <p class="muted">${regs(feat.id).length}/${feat.max_players} registered<br>${esc(prizeLine(feat))}</p>
        ${canJoin(feat) ? `<button class="btn" data-t="register" data-id="${feat.id}" style="width:100%">Register now</button>` : `<button class="btn ghost" data-t="open" data-id="${feat.id}" style="width:100%">View details</button>`}</section>` : ''}
      <section class="tn-box"><h3>${ic('trophy', 18)} My tournaments</h3>
        ${mineList.length ? mineList.map(t => `<button class="tn-mine" data-t="open" data-id="${t.id}">${gtile(gameOf(t.game))}<span><b>${esc(t.title)}</b><small>${esc(stat(t).l)} · ${esc(fmtDate(t.starts_at))}</small></span></button>`).join('') : '<p class="muted">You haven’t signed up for any yet.</p>'}</section>
      <section class="tn-box"><h3>${ic('crown', 18)} Top players</h3>
        ${top.length ? top.map((r, i) => `<div class="tn-top"><i>${i + 1}</i><span class="tn-pl">${av(prof(r.u))}<b>${esc(nameOf(r.u))}</b></span><small>🥇${r[1]} 🥈${r[2]} 🥉${r[3]}</small></div>`).join('') : '<p class="muted">Podium finishes will show up here.</p>'}</section>
    </aside>`;
  }
  function renderList(main) {
    const vis = visibleList().filter(t => t.status !== 'draft' && t.status !== 'cancelled');
    const players = new Set(); vis.forEach(t => regs(t.id).forEach(p => players.add(p.user_id)));
    const openN = vis.filter(t => t.status === 'open').length, liveN = vis.filter(t => t.status === 'live').length;
    const chips = [['all', 'All'], ['open', 'Upcoming'], ['live', 'Ongoing'], ['done', 'Completed'], ['mine', 'Mine']];
    main.innerHTML = `<div class="top">${menuBtn()}<span class="hashi">${ic('trophy', 20)}</span><b class="title">Tournaments</b><span class="grow"></span>
        ${staff() && !T.err ? `<button class="btn sm ${T.admin ? '' : 'ghost'}" data-t="admin">${ic('shield', 15)} ${T.admin ? 'Back to browse' : 'Admin dashboard'}</button>` : ''}</div>
      <div class="panel tn">${T.err ? `<div class="empty"><h2>Tournaments unavailable</h2><p>${esc(T.err)}</p></div>` : !T.loaded ? '<p class="muted">Loading…</p>' :
        T.admin && staff() ? adminHtml() : `
        <section class="tn-hero"><div class="tn-heroart" aria-hidden="true">${ic('trophy', 86)}</div>
          <div><h1>Tournaments</h1><p class="tn-tag2">Compete. Connect. Win.</p>
          <p class="muted">Play your favorite Orbit Games against the rest of Orbit, climb the brackets and leaderboards, and earn Orbits for finishing on the podium.</p>
          <div class="tn-stats"><span>${ic('calendar', 16)}<b>${openN}</b> Upcoming</span><span>${ic('bracket', 16)}<b>${liveN}</b> Ongoing</span><span>${ic('users', 16)}<b>${players.size}</b> Players signed up</span></div></div></section>
        <div class="tn-filters" role="toolbar" aria-label="Filter tournaments">${chips.map(([k, l]) => `<button class="tn-chip ${T.filter === k ? 'on' : ''}" data-t="filter" data-k="${k}">${l}</button>`).join('')}
          <span class="grow"></span><input id="tn-q" class="tn-q" type="search" placeholder="Search tournaments" aria-label="Search tournaments" value="${esc(T.q)}">
          <select id="tn-game" class="tn-sel" aria-label="Filter by game"><option value="">All Orbit Games</option>${GAMES.map(g => `<option value="${g.id}" ${T.game === g.id ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}</select></div>
        <div class="tn-cols"><div class="tn-main" id="tn-grid">${gridHtml()}</div>${aside()}</div>`}</div>`;
    bindMenu();
  }

  /* ───────── detail ───────── */
  function renderDetail(main) {
    const t = T.byId.get(T.id);
    const back = `<button class="ib" data-t="back" aria-label="Back to tournaments">${ic('back')}</button>`;
    if (!t) { main.innerHTML = `<div class="top">${menuBtn()}${back}<b class="title">Tournament</b></div><div class="empty"><h2>${T.loaded ? 'Tournament not found' : 'Loading…'}</h2><p>${T.loaded ? 'It may have been removed.' : ''}</p></div>`; bindMenu(); if (!T.loaded) load().then(repaint); return; }
    const g = gameOf(t.game), st = stat(t), n = regs(t.id).length, ps = T.players.get(t.id) || [];
    const tabs = [['overview', 'Overview'], ['players', `Participants (${n})`], [t.format === 'bracket' ? 'bracket' : 'board', t.format === 'bracket' ? 'Bracket' : 'Leaderboard'], ...(staff() ? [['manage', 'Manage']] : [])];
    if (!tabs.some(x => x[0] === T.tab)) T.tab = 'overview';
    let join = '';
    if (canJoin(t)) join = `<button class="btn" data-t="register" data-id="${t.id}">Register →</button>`;
    else if (mine(t.id) && t.status === 'open') join = `<button class="btn ghost" data-t="withdraw" data-id="${t.id}">Withdraw</button>`;
    const body = { overview: overview, players: participants, bracket: bracketHtml, board: boardHtml, manage: manageHtml }[T.tab](t);
    main.innerHTML = `<div class="top">${menuBtn()}${back}<b class="title">${esc(t.title)}</b><span class="grow"></span>${staff() ? `<button class="btn sm ghost" data-t="edit" data-id="${t.id}">Edit</button>` : ''}</div>
      <div class="panel tn">
        <section class="tn-dhead" style="--c1:${g.c1};--c2:${g.c2}"><span class="tn-bigemoji">${g.emoji}</span>
          <div class="tn-dtext"><h1>${esc(t.title)}</h1><p><span class="tn-st ${st.k}">${st.l}</span> ${esc(g.title)} · ${esc(fmtName(t))} · ${esc(fmtDT(t.starts_at))} → ${esc(fmtDT(t.ends_at))}</p></div>
          <div class="tn-dact">${join}${g.page && t.status !== 'completed' && t.status !== 'cancelled' ? `<button class="btn ghost" data-t="play" data-id="${t.id}">${ic('gamepad', 16)} Play ${esc(g.title)}</button>` : ''}</div></section>
        ${mine(t.id) ? '<p class="tn-note ok">You’re signed up for this tournament.</p>' : removed(t.id) ? '<p class="tn-note bad">You were removed from this tournament.</p>' : ''}
        ${t.status === 'cancelled' ? '<p class="tn-note bad">This tournament was cancelled.</p>' : ''}
        ${t.status === 'draft' ? '<p class="tn-note">Draft: only staff can see this tournament until it is published.</p>' : ''}
        <div class="tabs tn-tabs">${tabs.map(([k, l]) => `<button class="${T.tab === k ? 'on' : ''}" data-t="tab" data-k="${k}">${l}</button>`).join('')}</div>
        ${body}</div>`;
    bindMenu();
  }
  function overview(t) {
    const n = regs(t.id).length, pct = Math.min(100, Math.round(n / t.max_players * 100)), g = gameOf(t.game);
    const podium = (T.players.get(t.id) || []).filter(p => p.placement >= 1 && p.placement <= 3).sort((a, b) => a.placement - b.placement);
    return `<div class="tn-two">
      <section class="tn-box"><h3>${ic('calendar', 18)} Details</h3>
        <dl class="tn-dl"><dt>Game</dt><dd>${g.emoji} ${esc(g.title)} <small class="muted">(Orbit Games)</small></dd>
        <dt>Format</dt><dd>${esc(fmtName(t))}</dd>
        <dt>Starts</dt><dd>${esc(fmtDT(t.starts_at))} ${['open', 'draft'].includes(t.status) ? `<small class="muted">(${esc(rel(t.starts_at))})</small>` : ''}</dd>
        <dt>Ends</dt><dd>${esc(fmtDT(t.ends_at))} ${['open', 'draft', 'live'].includes(t.status) ? `<small class="muted">(${ended(t) ? 'ended' : esc(rel(t.ends_at))})</small>` : ''}</dd>
        <dt>Sign-ups close</dt><dd>${t.reg_closes_at ? esc(fmtDT(t.reg_closes_at)) : 'When it starts'}</dd>
        <dt>Players</dt><dd>${n} / ${t.max_players}<div class="tn-bar"><i style="width:${pct}%"></i></div></dd></dl>
        ${t.description ? `<p class="tn-desc">${esc(t.description)}</p>` : ''}</section>
      <section class="tn-box"><h3>${ic('trophy', 18)} Prizes</h3>
        ${t.orbit_prizes ? `<div class="tn-prizes"><div><b>🥇</b><span>100 Orbits</span></div><div><b>🥈</b><span>50 Orbits</span></div><div><b>🥉</b><span>25 Orbits</span></div></div>` : ''}
        ${t.prize_text ? `<p>${esc(t.prize_text)}</p>` : ''}${!t.orbit_prizes && !t.prize_text ? '<p class="muted">Bragging rights.</p>' : ''}
        ${t.status === 'completed' && podium.length ? `<h4>Results</h4>${podium.map(p => `<div class="tn-podium">${MEDAL[p.placement]}<span class="tn-pl">${av(prof(p.user_id))}<b>${esc(nameOf(p.user_id))}</b></span></div>`).join('')}${t.prizes_paid ? '<p class="muted">Orbit prizes have been paid out.</p>' : ''}` : ''}</section>
      <section class="tn-box tn-wide2"><h3>${ic('hash', 18)} Rules</h3>${t.rules ? `<p class="tn-rules">${esc(t.rules)}</p>` : '<p class="muted">No extra rules. Play fair, be kind, and follow the Orbit rules.</p>'}
        <p class="muted">${t.format === 'bracket' ? 'Players are seeded at random when the tournament starts. Each match is played in the game above and a staff member enters the result; the winner moves on until one player is left.' : 'Once you have entered and the tournament is live, the next score you get in the game is recorded automatically as your score, even if it is lower than your personal best. After that only a higher score replaces it. Scores from before you entered never count, and no scores are accepted after the end date.'}</p></section>
    </div>`;
  }
  function participants(t) {
    const ps = [...(T.players.get(t.id) || [])].sort((a, b) => (a.seed ?? 1e9) - (b.seed ?? 1e9) || (a.registered_at < b.registered_at ? -1 : 1));
    if (!ps.length) return '<p class="muted">Nobody has signed up yet. Be the first!</p>';
    return `<div class="tn-plist">${ps.map(p => `<div class="tn-prow ${p.status !== 'registered' ? 'dq' : ''}"><span class="tn-pl">${av(prof(p.user_id))}<span><b>${esc(nameOf(p.user_id))}</b><small>@${esc(prof(p.user_id).username || '')}</small></span></span>
      <span class="tn-pmeta">${p.seed ? `<span class="tn-tag">Seed ${p.seed}</span>` : ''}${p.status !== 'registered' ? '<span class="tn-tag bad">Removed</span>' : ''}${p.placement ? `<span class="tn-tag gold">${MEDAL[p.placement] || ''} ${p.placement === 1 ? '1st' : p.placement === 2 ? '2nd' : '3rd'}</span>` : ''}
      <small class="muted">Joined ${esc(fmtDate(p.registered_at))}</small>${staff() && t.status !== 'completed' ? `<button class="ib sm" data-t="remove" data-id="${t.id}" data-u="${p.user_id}" aria-label="Remove ${esc(nameOf(p.user_id))}" title="Remove from tournament">${ic('x', 14)}</button>` : ''}</span></div>`).join('')}</div>`;
  }
  function bracketHtml(t) {
    if (t.format !== 'bracket') return boardHtml(t);
    const ms = T.matches.get(t.id) || [];
    if (!ms.length) return `<div class="empty tn-none"><h2>The bracket isn’t ready yet</h2><p>It is drawn when the tournament starts${t.status === 'open' ? ` (${regs(t.id).length} signed up so far)` : ''}.</p></div>`;
    const R = Math.max(...ms.map(m => m.round)), rounds = group(ms, 'round');
    const champ = t.status === 'completed' ? ms.find(m => m.round === R && m.winner)?.winner : null;
    const box = m => {
      const bye = m.status === 'done' && (!m.p1 || !m.p2), can = staff() && t.status === 'live' && m.p1 && m.p2;
      const row = (u, s) => `<div class="tn-mp ${m.winner && u === m.winner ? 'win' : ''} ${m.winner && u !== m.winner ? 'lose' : ''} ${u ? '' : 'tbd'}">${u ? av(prof(u)) : '<span class="av tn-tbd"></span>'}<span>${u ? esc(nameOf(u)) : bye ? 'Bye' : 'TBD'}</span><b>${s ?? ''}</b></div>`;
      return `<div class="tn-match ${m.status} ${can ? 'can' : ''}" ${can ? `data-t="report" data-id="${m.id}" role="button" tabindex="0" title="Enter the result"` : ''}>${row(m.p1, m.s1)}${row(m.p2, m.s2)}${m.status === 'ready' ? '<small class="tn-tonight">Ready to play</small>' : ''}</div>`;
    };
    return `${champ ? `<div class="tn-champ">${ic('crown', 22)} Champion: <span class="tn-pl">${av(prof(champ))}<b>${esc(nameOf(champ))}</b></span></div>` : ''}
      ${staff() && t.status === 'live' ? '<p class="muted">Staff: click a match to enter its result.</p>' : ''}
      <div class="tn-bracket" role="group" aria-label="Tournament bracket">${[...rounds.keys()].sort((a, b) => a - b).map(r => `<div class="tn-round"><h4>${roundName(r, R)}</h4><div class="tn-rmatches">${rounds.get(r).sort((a, b) => a.slot - b.slot).map(box).join('')}</div></div>`).join('')}</div>`;
  }
  function boardHtml(t) {
    if (t.format !== 'leaderboard') return bracketHtml(t);
    const st = standings(t), ranked = new Set(st.map(r => r.user)), rest = regs(t.id).filter(p => !ranked.has(p.user_id));
    const myScores = (T.scores.get(t.id) || []).filter(s => s.user_id === S.me.id).slice(-6).reverse();
    const yours = st.find(r => r.user === S.me.id);
    const auto = t.status === 'live' && mine(t.id) ? `<p class="tn-note ${ended(t) ? 'bad' : 'ok'}">${ended(t) ? 'This tournament has ended. No more scores are accepted.' : yours ? `Your recorded score is <b>${num(yours.score)}</b>. A higher score in ${esc(gameOf(t.game).title)} replaces it automatically. Ends ${esc(fmtDT(t.ends_at))}.` : `You’re in! The next score you get in ${esc(gameOf(t.game).title)} is recorded automatically as your score, even if it isn’t your best. Ends ${esc(fmtDT(t.ends_at))}.`}</p>` : '';
    const submit = t.status === 'live' && mine(t.id) && !ended(t) ? `<section class="tn-box"><h3>${ic('plus', 18)} Submit a score</h3>
      <p class="muted">Scores from the game are recorded for you. If one was missed, enter it here: your first score is recorded straight away, later ones are approved by staff.</p>
      <div class="tn-form"><input id="tn-score" type="number" min="0" max="1000000000" inputmode="numeric" placeholder="Your score" aria-label="Your score"><input id="tn-note" maxlength="200" placeholder="Note (optional)" aria-label="Note"><button class="btn" data-t="submit" data-id="${t.id}">Submit</button></div>
      ${myScores.length ? `<div class="tn-mine-scores">${myScores.map(s => `<span class="tn-tag ${s.status === 'approved' ? 'gold' : s.status === 'rejected' ? 'bad' : ''}">${num(s.score)} · ${s.status}</span>`).join('')}</div>` : ''}</section>` : '';
    return `${auto}${submit}${st.length || rest.length ? `<div class="tn-lb"><div class="tn-lbh"><span>#</span><span>Player</span><span>Best score</span><span>Entries</span></div>
      ${st.map((r, i) => `<div class="tn-lbr ${r.user === S.me.id ? 'me' : ''}"><span class="tn-rank">${MEDAL[i + 1] || i + 1}</span><span class="tn-pl">${av(prof(r.user))}<b>${esc(nameOf(r.user))}</b></span><span class="tn-sc">${num(r.score)}</span><span>${r.n}</span></div>`).join('')}
      ${rest.map(p => `<div class="tn-lbr none"><span class="tn-rank">–</span><span class="tn-pl">${av(prof(p.user_id))}<b>${esc(nameOf(p.user_id))}</b></span><span class="tn-sc">–</span><span>0</span></div>`).join('')}</div>` :
      '<div class="empty tn-none"><h2>No scores yet</h2><p>The leaderboard fills in once the tournament is live and scores are approved.</p></div>'}`;
  }

  /* ───────── staff: manage one tournament ───────── */
  function manageHtml(t) {
    if (!staff()) return '';
    const ps = regs(t.id), ms = T.matches.get(t.id) || [], pend = (T.scores.get(t.id) || []).filter(s => s.status === 'pending');
    const b = (a, label, cls = 'ghost') => `<button class="btn sm ${cls}" data-t="${a}" data-id="${t.id}">${label}</button>`;
    let actions = '';
    if (t.status === 'draft') actions = b('publish', 'Publish for sign-ups', '') + b('edit', 'Edit') + b('delete', 'Delete', 'danger');
    else if (t.status === 'open') actions = b('start', ps.length ? `Start tournament (${ps.length} players)` : 'Start tournament', '') + b('edit', 'Edit') + b('todraft', 'Unpublish') + b('cancel', 'Cancel tournament', 'danger');
    else if (t.status === 'live') actions = (t.format === 'leaderboard' ? b('finish', 'Finish & pay prizes', '') : '') + b('edit', 'Edit') + b('cancel', 'Cancel tournament', 'danger');
    else if (t.status === 'completed') actions = b('delete', 'Delete', 'danger');
    else actions = b('todraft', 'Reopen as draft') + b('delete', 'Delete', 'danger');
    const ready = ms.filter(m => m.status === 'ready');
    return `<div class="tn-two">
      <section class="tn-box"><h3>${ic('shield', 18)} Controls</h3><p>Status: <span class="tn-st ${stat(t).k}">${stat(t).l}</span> ${t.prizes_paid ? '<span class="tn-tag gold">Prizes paid</span>' : ''}</p><div class="tn-btnrow">${actions}</div>
        <p class="muted">${t.status === 'open' ? 'Starting closes sign-ups' + (t.format === 'bracket' ? ' and draws the bracket.' : ' and opens score submissions.') : t.status === 'live' && t.format === 'bracket' ? 'Enter each match result from the Bracket tab. The tournament finishes (and Orbit prizes are paid) when the final is decided.' : t.status === 'live' ? 'Finishing uses the best approved score per player and pays the Orbit prizes.' : ''}</p></section>
      <section class="tn-box"><h3>${ic('users', 18)} Registrations (${ps.length}/${t.max_players})</h3>
        ${ps.length ? ps.map(p => `<div class="tn-prow"><span class="tn-pl">${av(prof(p.user_id))}<b>${esc(nameOf(p.user_id))}</b></span>${t.status !== 'completed' ? `<button class="btn sm ghost" data-t="remove" data-id="${t.id}" data-u="${p.user_id}">Remove</button>` : ''}</div>`).join('') : '<p class="muted">No registrations yet.</p>'}</section>
      ${t.format === 'bracket' && t.status === 'live' ? `<section class="tn-box tn-wide2"><h3>${ic('bracket', 18)} Matches waiting for a result (${ready.length})</h3>${ready.length ? ready.map(m => `<div class="tn-prow"><span>${esc(roundName(m.round, Math.max(...ms.map(x => x.round))))}: <b>${esc(nameOf(m.p1))}</b> vs <b>${esc(nameOf(m.p2))}</b></span><button class="btn sm" data-t="report" data-id="${m.id}">Enter result</button></div>`).join('') : '<p class="muted">No matches are waiting.</p>'}</section>` : ''}
      ${t.format === 'leaderboard' && ['live', 'completed'].includes(t.status) ? `<section class="tn-box tn-wide2"><h3>${ic('hash', 18)} Score review (${pend.length} waiting)</h3>
        ${pend.length ? pend.map(s => `<div class="tn-prow"><span><b>${esc(nameOf(s.user_id))}</b>: ${num(s.score)} ${s.note ? `<small class="muted">“${esc(s.note)}”</small>` : ''}</span><span class="tn-btnrow"><button class="btn sm" data-t="approve" data-sid="${s.id}">Approve</button><button class="btn sm ghost" data-t="reject" data-sid="${s.id}">Reject</button></span></div>`).join('') : '<p class="muted">Nothing to review.</p>'}
        ${t.status === 'live' && ps.length ? `<h4>Add a score yourself</h4><div class="tn-form"><select id="tn-addu" aria-label="Player">${ps.map(p => `<option value="${p.user_id}">${esc(nameOf(p.user_id))}</option>`).join('')}</select><input id="tn-adds" type="number" min="0" placeholder="Score" aria-label="Score"><button class="btn" data-t="addscore" data-id="${t.id}">Add (approved)</button></div>` : ''}</section>` : ''}
    </div>`;
  }

  /* ───────── staff: dashboard ───────── */
  function adminHtml() {
    const all = T.list, pend = [...T.scores.values()].flat().filter(s => s.status === 'pending').length;
    const order = { live: 0, open: 1, draft: 2, completed: 3, cancelled: 4 };
    const rows = [...all].sort((a, b) => order[a.status] - order[b.status] || new Date(a.starts_at) - new Date(b.starts_at));
    const players = new Set(); all.forEach(t => regs(t.id).forEach(p => players.add(p.user_id)));
    const tile = (n, l) => `<div class="tn-tile"><b>${n}</b><span>${l}</span></div>`;
    return `<section class="tn-hero slim"><div><h1>Admin dashboard</h1><p class="muted">Create tournaments, manage sign-ups, enter results and pay prizes. Only Orbit Games can be used.</p></div><button class="btn" data-t="new">+ New tournament</button></section>
      <div class="tn-tiles">${tile(all.length, 'Tournaments')}${tile(all.filter(t => t.status === 'open').length, 'Open for sign-up')}${tile(all.filter(t => t.status === 'live').length, 'Live now')}${tile(players.size, 'Players signed up')}${tile(pend, 'Scores to review')}</div>
      ${rows.length ? `<div class="tn-table" role="table" aria-label="All tournaments"><div class="tn-tr head" role="row"><span>Tournament</span><span>Game</span><span>Format</span><span>Status</span><span>Players</span><span>Starts</span><span>Ends</span><span></span></div>
        ${rows.map(t => `<div class="tn-tr" role="row"><span class="tn-tt"><b>${esc(t.title)}</b></span><span>${gameOf(t.game).emoji} ${esc(gameOf(t.game).title)}</span><span>${t.format === 'bracket' ? 'Bracket' : 'Leaderboard'}</span><span><span class="tn-st ${stat(t).k}">${stat(t).l}</span></span><span>${regs(t.id).length}/${t.max_players}</span><span>${esc(fmtDate(t.starts_at))}</span><span>${esc(fmtDate(t.ends_at))}</span>
          <span class="tn-btnrow"><button class="btn sm" data-t="manage" data-id="${t.id}">Manage</button><button class="btn sm ghost" data-t="edit" data-id="${t.id}">Edit</button></span></div>`).join('')}</div>` : '<div class="empty tn-none"><h2>No tournaments yet</h2><p>Create your first one to get started.</p></div>'}`;
  }
  function editor(t) {
    const d = t || {}, startDef = toLocal(d.starts_at || new Date(Date.now() + 7 * 864e5).setHours(18, 0, 0, 0)), endDef = toLocal(d.ends_at || new Date(new Date(startDef).getTime() + 7 * 864e5));
    const gameOpts = (kind, label) => `<optgroup label="${label}">${GAMES.filter(g => g.kind === kind).map(g => `<option value="${g.id}" ${d.game === g.id ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}</optgroup>`;
    const live = t && ['live', 'completed'].includes(t.status);
    modal(t ? 'Edit tournament' : 'New tournament', `<div class="tn-fgrid">
      <label class="tn-f wide">Title<input id="tf-title" maxlength="80" value="${esc(d.title || '')}" placeholder="Orbit Tetris Showdown"></label>
      <label class="tn-f">Game <small>(Orbit Games only)</small><select id="tf-game" ${live ? 'disabled' : ''}>${gameOpts('solo', 'Score games')}${gameOpts('duel', 'Head-to-head games')}</select></label>
      <label class="tn-f">Format<select id="tf-format" ${live ? 'disabled' : ''}><option value="bracket" ${d.format === 'bracket' ? 'selected' : ''}>Bracket (single elimination)</option><option value="leaderboard" ${d.format === 'leaderboard' ? 'selected' : ''}>Leaderboard (best score)</option></select></label>
      <label class="tn-f">Starts<input id="tf-start" type="datetime-local" value="${startDef}"></label>
      <label class="tn-f">Ends <small>(required)</small><input id="tf-end" type="datetime-local" value="${endDef}" required></label>
      <label class="tn-f">Sign-ups close <small>(optional)</small><input id="tf-close" type="datetime-local" value="${d.reg_closes_at ? toLocal(d.reg_closes_at) : ''}"></label>
      <label class="tn-f">Max players<input id="tf-max" type="number" min="2" max="64" value="${d.max_players || 16}"></label>
      <label class="tn-f">Extra prize <small>(optional)</small><input id="tf-prize" maxlength="200" value="${esc(d.prize_text || '')}" placeholder="e.g. Gold role for a week"></label>
      <label class="tn-f wide">Description<textarea id="tf-desc" rows="3" maxlength="1500" placeholder="What is this tournament about?">${esc(d.description || '')}</textarea></label>
      <label class="tn-f wide">Rules<textarea id="tf-rules" rows="4" maxlength="3000" placeholder="One rule per line">${esc(d.rules || '')}</textarea></label>
      <label class="tn-chk wide"><input id="tf-orbits" type="checkbox" ${d.orbit_prizes === false ? '' : 'checked'} ${t?.prizes_paid ? 'disabled' : ''}> Pay Orbits to the top 3 (🥇 100 · 🥈 50 · 🥉 25)</label>
      ${!t || t.status === 'draft' ? '<label class="tn-chk wide"><input id="tf-pub" type="checkbox" checked> Open sign-ups right away</label>' : ''}</div>`,
      [{ label: 'Cancel', cls: 'ghost' }, { label: t ? 'Save changes' : 'Create tournament', fn: async bg => {
        const v = id => bg.querySelector('#' + id), st = v('tf-start').value, en = v('tf-end').value, cl = v('tf-close').value;
        if (!st) { toast('Choose a start date.', true); return false; }
        if (!en) { toast('Choose an end date.', true); return false; }
        if (new Date(en) <= new Date(st)) { toast('The end date must be after the start date.', true); return false; }
        if (cl && new Date(cl) > new Date(en)) { toast('Sign-ups must close before the tournament ends.', true); return false; }
        return !!(await call('tournament_save', { p_id: t?.id || null, p_title: v('tf-title').value, p_game: v('tf-game').value, p_format: v('tf-format').value, p_description: v('tf-desc').value, p_rules: v('tf-rules').value,
          p_starts: new Date(st).toISOString(), p_ends: new Date(en).toISOString(), p_reg_closes: cl ? new Date(cl).toISOString() : null, p_max: parseInt(v('tf-max').value, 10) || 16, p_prize_text: v('tf-prize').value,
          p_orbit_prizes: v('tf-orbits').checked, p_publish: !!v('tf-pub')?.checked }, t ? 'Saved.' : 'Tournament created.'));
      } }],
      bg => {
        bg.querySelector('.modal').classList.add('tn-wide');
        const gs = bg.querySelector('#tf-game'), fm = bg.querySelector('#tf-format');
        if (t) { gs.value = t.game; fm.value = t.format; }
        gs.onchange = () => { if (!t) fm.value = gameOf(gs.value).kind === 'duel' ? 'bracket' : 'leaderboard'; };
        if (!t) gs.onchange();
        const sIn = bg.querySelector('#tf-start'), eIn = bg.querySelector('#tf-end');   // moving the start keeps the end after it
        sIn.onchange = () => { if (sIn.value && (!eIn.value || new Date(eIn.value) <= new Date(sIn.value))) eIn.value = toLocal(new Date(sIn.value).getTime() + 7 * 864e5); };
      });
  }
  function ask(title, text, label, fn, danger) {
    modal(title, `<p>${esc(text)}</p>`, [{ label: 'Cancel', cls: 'ghost' }, { label, cls: danger ? 'danger' : '', fn: async () => !!(await fn()) }]);
  }
  function reportModal(m) {
    const t = T.byId.get(m.tournament_id); if (!t) return;
    const lb = t.format === 'bracket' ? 'Score' : '';
    modal('Enter match result', `<p class="muted">${esc(roundName(m.round, Math.max(...(T.matches.get(t.id) || []).map(x => x.round))))} · ${esc(gameOf(t.game).title)}</p>
      <div class="tn-rep">${[[m.p1, m.s1, 1], [m.p2, m.s2, 2]].map(([u, s, i]) => `<label class="tn-repr"><input type="radio" name="tn-win" value="${u}" ${m.winner === u ? 'checked' : ''}><span class="tn-pl">${av(prof(u))}<b>${esc(nameOf(u))}</b></span><input id="tn-s${i}" class="tn-sin" type="number" min="0" placeholder="${lb}" value="${s ?? ''}" aria-label="Score for ${esc(nameOf(u))}"></label>`).join('')}</div>
      <p class="muted">Pick the winner. Scores are optional.</p>`,
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Save result', fn: async bg => {
        let w = bg.querySelector('input[name=tn-win]:checked')?.value; const a = bg.querySelector('#tn-s1').value, b = bg.querySelector('#tn-s2').value;
        if (!w && a !== '' && b !== '' && +a !== +b) w = +a > +b ? m.p1 : m.p2;
        if (!w) { toast('Pick the winner.', true); return false; }
        return !!(await call('tournament_report', { p_match: m.id, p_s1: a === '' ? null : +a, p_s2: b === '' ? null : +b, p_winner: w }, 'Result saved.').then(async ok => { if (ok) loadOrbits?.(); return ok; }));
      } }]);
  }

  /* ───────── events ───────── */
  function open(id) { T.id = id; T.tab = 'overview'; S.view = 'tournament'; renderMain(); renderSide(); }
  function openManage(id) { T.id = id; T.tab = 'manage'; S.view = 'tournament'; renderMain(); renderSide(); }
  async function onClick(e) {
    if (!handles(S.view)) return;
    const el = e.target.closest('[data-t]'); if (!el || !el.closest('#main')) return;
    const a = el.dataset.t, id = el.dataset.id, t = id ? T.byId.get(id) : null;
    if (el.tagName === 'ARTICLE' && e.target.closest('button')) return;
    switch (a) {
      case 'open': return open(id);
      case 'back': T.id = null; S.view = 'tournaments'; renderMain(); renderSide(); return;
      case 'tab': T.tab = el.dataset.k; return renderMain();
      case 'filter': T.filter = el.dataset.k; return renderMain();
      case 'admin': T.admin = !T.admin; return renderMain();
      case 'new': return editor(null);
      case 'edit': return t && editor(t);
      case 'manage': return openManage(id);
      case 'register': if (await call('tournament_register', { p_id: id }, 'You’re signed up!')) { if (S.view === 'tournaments') renderMain(); } return;
      case 'withdraw': return ask('Withdraw?', `Leave “${t?.title}”? You can sign up again while sign-ups are open.`, 'Withdraw', () => call('tournament_unregister', { p_id: id }, 'You left the tournament.'));
      case 'play': { const g = gameOf(t?.game); if (g.page) { S.gamerNext = g.page; navTo('gamer'); } return; }
      case 'publish': return call('tournament_set_status', { p_id: id, p_status: 'open' }, 'Published. Sign-ups are open.');
      case 'todraft': return call('tournament_set_status', { p_id: id, p_status: 'draft' }, 'Moved back to draft.');
      case 'cancel': return ask('Cancel tournament?', `“${t?.title}” will be marked cancelled. No prizes are paid.`, 'Cancel tournament', () => call('tournament_set_status', { p_id: id, p_status: 'cancelled' }, 'Tournament cancelled.'), true);
      case 'delete': return ask('Delete tournament?', `“${t?.title}” and all its sign-ups, matches and scores will be deleted for good.`, 'Delete', async () => { const ok = await call('tournament_delete', { p_id: id }, 'Deleted.'); if (ok) { T.id = null; S.view = 'tournaments'; renderMain(); renderSide(); } return ok; }, true);
      case 'start': return ask('Start tournament?', t?.format === 'bracket' ? 'Sign-ups close and the bracket is drawn at random. This cannot be undone.' : 'Sign-ups close and scores start counting. Players’ next score after entering is recorded automatically.', 'Start', () => call('tournament_start', { p_id: id }, 'The tournament is live!'));
      case 'finish': return ask('Finish tournament?', 'The best approved score per player decides the placements, and Orbit prizes are paid to the top 3.', 'Finish & pay', async () => { const ok = await call('tournament_finish', { p_id: id }, 'Finished. Prizes paid.'); if (ok) loadOrbits?.(); return ok; });
      case 'remove': return ask('Remove player?', `${nameOf(el.dataset.u)} will be taken out of this tournament${t?.status === 'live' ? ' (they are disqualified and a bracket opponent advances)' : ''}.`, 'Remove', () => call('tournament_remove_player', { p_id: id, p_user: el.dataset.u }, 'Player removed.'), true);
      case 'report': { const m = [...T.matches.values()].flat().find(x => x.id === id); return m && reportModal(m); }
      case 'submit': { const sc = $('#tn-score')?.value; if (sc === '' || sc == null) { toast('Enter your score.', true); return; } return call('tournament_submit_score', { p_id: id, p_score: Math.floor(+sc), p_note: $('#tn-note')?.value || '' }, 'Score submitted for review.'); }
      case 'approve': return call('tournament_review_score', { p_score: el.dataset.sid, p_approve: true }, 'Approved.');
      case 'reject': return call('tournament_review_score', { p_score: el.dataset.sid, p_approve: false }, 'Rejected.');
      case 'addscore': { const u = $('#tn-addu')?.value, sc = $('#tn-adds')?.value; if (!u || sc === '') { toast('Pick a player and enter a score.', true); return; } return call('tournament_add_score', { p_id: id, p_user: u, p_score: Math.floor(+sc) }, 'Score added.'); }
    }
  }
  function onKey(e) {
    if (!handles(S.view) || (e.key !== 'Enter' && e.key !== ' ')) return;
    const el = e.target.closest?.('article[data-t],.tn-match[data-t]'); if (!el || e.target !== el) return;
    e.preventDefault(); el.click();
  }
  function onInput(e) {
    if (!handles(S.view)) return;
    if (e.target.id === 'tn-q') { T.q = e.target.value; const g = $('#tn-grid'); if (g) g.innerHTML = gridHtml(); }
    else if (e.target.id === 'tn-game') { T.game = e.target.value; const g = $('#tn-grid'); if (g) g.innerHTML = gridHtml(); }
  }
  let bound = false;
  function bind() {
    if (bound) return; bound = true;
    document.addEventListener('click', onClick); document.addEventListener('keydown', onKey);
    document.addEventListener('input', onInput); document.addEventListener('change', onInput);
  }
  function startPoll() {   // quiet refresh so sign-ups, results and scores appear without reloading
    clearInterval(T.timer);
    T.timer = setInterval(() => {
      if (!handles(S.view)) { clearInterval(T.timer); T.timer = 0; return; }
      if (document.hidden || document.querySelector('.modalbg') || document.activeElement?.closest?.('#main input, #main textarea, #main select')) return;
      load(true).then(repaint);
    }, 30000);
  }

  /* ───────── hooks for app.js ───────── */
  function handles(v) { return v === 'tournaments' || v === 'tournament'; }
  function render(main) {
    bind();
    if (!T.loaded) load().then(repaint);
    if (S.view === 'tournament') return renderDetail(main);
    return renderList(main);
  }
  function onNav(k) {
    if (k !== 'tournaments') return;
    T.id = null; T.admin = false; bind(); startPoll();
    load(true).then(repaint);
  }
  const stop = () => { clearInterval(T.timer); T.timer = 0; T.loaded = false; T.list = []; T.id = null; };
  return { handles, render, onNav, stop, load };
}
