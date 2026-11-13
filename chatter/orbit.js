/* Orbit features, kept apart from app.js:
   Home page, announcements, events + calendar, whiteboards, AI (assistant, summaries, conversation starters), formatting toolbar.
   app.js hands over what this needs through initOrbit(ctx) and calls the hooks that come back. */

import { startStars, startLogo } from './fx.js?v=5';
import { createBackdrop } from './orbit-bg.js?v=4';
import { ambient, cycleTime } from './ambient.js?v=6';
import { createDrift } from './orbit-drift.js?v=3';
import { mountFloaters } from './collectible-float.js?v=2';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX = /^#[0-9a-fA-F]{6}$/;
const pad = n => String(n).padStart(2, '0');
const dayKey = d => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

export const KINDS = {
  game_night: { emoji: '🎮', label: 'Game night' },
  trivia: { emoji: '🧠', label: 'Trivia' },
  tournament: { emoji: '🏆', label: 'Tournament' },
  drawing: { emoji: '🎨', label: 'Drawing contest' },
  other: { emoji: '📌', label: 'Event' },
};
const TEXT_COLORS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'gray'];
const NOTE_COLORS = { yellow: '#ffe66d', pink: '#ff9ecb', green: '#9be59b', blue: '#9fd0ff' };
const PEN_COLORS = ['#111111', '#ffffff', '#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
const BW = 1200, BH = 800;   // the drawing space; everything is stored in these units and scaled to the screen

export function initOrbit(c) {
  const { S, sb, $, esc, ic, I, modal, toast, prof, av, md, menuBtn, bindMenu } = c;
  const drift = createDrift({ sb, toast, getOrbits: () => S.orbits || 0, setOrbits: n => c.setOrbits(n), reloadOrbits: () => c.loadOrbits() });   // the drifting Orbit coin (orbit-drift.js)

  /* ───────── icons ───────── */
  Object.assign(I, {
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    brush: '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>',
    sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    sticky: '<path d="M4 4h16v10l-6 6H4z"/><path d="M14 20v-6h6"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/>',
    back: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    undo: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
    type: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>',
    chevL: '<polyline points="15 18 9 12 15 6"/>',
    chevR: '<polyline points="9 18 15 12 9 6"/>',
    heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    mapPin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  });

  /* ───────── state ───────── */
  const today = new Date();
  const O = {
    ann: [], events: [], boards: [], err: '', loaded: false, loading: null,
    cal: { y: today.getFullYear(), m: today.getMonth() }, bigCal: { y: today.getFullYear(), m: today.getMonth() },
    calOpen: lsGet('orbit-cal') ? lsGet('orbit-cal') === '1' : innerHeight > 820,
    ev: { tab: 'upcoming', day: null, id: null },
    bd: null, ai: { msgs: [], busy: false, rules: null }, ch: null, reminded: new Set(), timer: 0,
    wb: false, lastView: '', homeAt: 0,
  };
  const isStaff = () => c.isStaff();
  const staff = () => isStaff();
  const setupErr = e => /schema cache|does not exist|PGRST20[45]|42P01|42883|Could not find the function/i.test(e?.message || e?.code || '')
    ? 'Events, boards and announcements are not set up yet. Run migration-orbit.sql in the Supabase SQL Editor, then reload.' : (e?.message || 'Something went wrong.');
  const fail = e => toast(setupErr(e), true);

  /* ───────── time helpers ───────── */
  const kindOf = e => KINDS[e.kind] || KINDS.other;
  const whenFmt = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  const fmtWhen = iso => new Date(iso).toLocaleString([], whenFmt);
  const fmtTime = iso => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const fmtDay = d => { const x = new Date(d), n = new Date(); const k = dayKey(x);
    if (k === dayKey(n)) return 'Today'; if (k === dayKey(new Date(+n + 864e5))) return 'Tomorrow';
    return x.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }); };
  const evEnd = e => e.ends_at ? +new Date(e.ends_at) : +new Date(e.starts_at) + 2 * 36e5;
  const evState = e => { const n = Date.now(), s = +new Date(e.starts_at); return n < s ? (s - n < 36e5 ? 'soon' : 'upcoming') : n <= evEnd(e) ? 'live' : 'past'; };
  const rel = e => {
    const n = Date.now(), s = +new Date(e.starts_at), st = evState(e);
    if (st === 'live') return 'Happening now';
    if (st === 'past') return 'Ended';
    const m = Math.round((s - n) / 6e4);
    if (m < 60) return `Starts in ${Math.max(m, 1)} min`;
    const h = Math.round(m / 60); if (h < 24) return `In ${h} hour${h === 1 ? '' : 's'}`;
    const d = Math.round(h / 24); return `In ${d} day${d === 1 ? '' : 's'}`;
  };
  const toLocalInput = d => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const upcoming = () => O.events.filter(e => evEnd(e) >= Date.now()).sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
  const byDay = () => { const m = new Map(); for (const e of O.events) { const k = dayKey(e.starts_at); (m.get(k) || m.set(k, []).get(k)).push(e); } return m; };
  const going = e => (e.rsvps || []).filter(r => r.status === 'going');
  const maybe = e => (e.rsvps || []).filter(r => r.status === 'maybe');
  const myRsvp = e => (e.rsvps || []).find(r => r.user_id === S.me.id)?.status || '';
  const person = id => prof(id).display_name || 'Unknown';

  /* ───────── loading + live updates ───────── */
  async function load(force) {
    if (O.loading && !force) return O.loading;
    O.loading = (async () => {
      const [a, e, b] = await Promise.all([
        sb.from('announcements').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(30),
        sb.from('events').select('*, rsvps:event_rsvps(user_id,status)').gte('starts_at', new Date(Date.now() - 60 * 864e5).toISOString()).order('starts_at').limit(500),
        sb.from('boards').select('*').order('created_at'),
      ]);
      const bad = a.error || e.error || b.error;
      if (bad) { O.err = setupErr(bad); O.loaded = true; return; }
      O.err = ''; O.ann = a.data || []; O.events = e.data || []; O.boards = b.data || []; O.loaded = true;
      const ids = new Set(); O.ann.forEach(x => x.created_by && ids.add(x.created_by));
      O.events.forEach(x => { x.host_id && ids.add(x.host_id); (x.rsvps || []).forEach(r => ids.add(r.user_id)); });
      O.boards.forEach(x => x.created_by && ids.add(x.created_by));
      await c.needProfiles([...ids]);
    })().finally(() => { O.loading = null; });
    return O.loading;
  }
  let repaintT = 0;
  const repaint = () => {
    clearTimeout(repaintT);
    repaintT = setTimeout(() => {
      if (!S.me) return;
      c.renderSide();
      if (['home', 'events', 'event', 'boards'].includes(S.view)) c.renderMain();
      else if (S.view === 'board') boardHead();
      else if (S.view === 'call' && O.wb) wbRender();
    }, 60);
  };
  let reloadT = 0;
  const reloadSoon = () => { clearTimeout(reloadT); reloadT = setTimeout(async () => { await load(true); repaint(); }, 250); };
  function start() {
    stop();
    load().then(repaint);
    O.ch = sb.channel('orbit-core')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, reloadSoon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, reloadSoon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_rsvps' }, reloadSoon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boards' }, p => { onBoardRow(p); reloadSoon(); })
      .subscribe();
    O.timer = setInterval(remind, 30000);
    ambient.boot();   // Orbit's background music plays on every page (it pauses only while a game is open)
  }
  function stop() {
    ambient.quit();
    clearTimeout(reloadT); clearTimeout(repaintT); clearInterval(O.timer); O.timer = 0;
    if (O.ch) { sb.removeChannel(O.ch); O.ch = null; }
    closeBoard();
    Object.assign(O, { wb: false, ann: [], events: [], boards: [], err: '', loaded: false, loading: null, bd: null, ai: { msgs: [], busy: false, rules: null }, reminded: new Set(), ev: { tab: 'upcoming', day: null, id: null } });
  }
  function remind() {   // a nudge 10 minutes before an event you said yes or maybe to
    if (!S.me) return;
    for (const e of O.events) {
      const mins = (+new Date(e.starts_at) - Date.now()) / 6e4;
      if (mins > 0 && mins <= 10 && myRsvp(e) && !O.reminded.has(e.id)) {
        O.reminded.add(e.id);
        toast(`⏰ ${e.title} starts in ${Math.max(1, Math.round(mins))} min`);
        c.osNotify?.(`${kindOf(e).emoji} ${e.title}`, `Starts in ${Math.max(1, Math.round(mins))} minutes`, 'ev-' + e.id);
      }
    }
  }

  /* ───────── announcements ───────── */
  function announcementModal(a, fromHome) {   // a = the announcement to edit; none = write a new one
    const editing = !!a;
    modal(editing ? 'Edit announcement' : 'New announcement', `<label class="lbl2">Title</label><input id="an-t" maxlength="120" placeholder="What's the news?" value="${esc(editing ? a.title : '')}">
      <label class="lbl2">Details (optional)</label><textarea id="an-b" rows="5" maxlength="2000" placeholder="You can use **bold**, *italic*, links and lists.">${esc(editing ? (a.body || '') : '')}</textarea>
      <label style="display:flex;gap:8px;align-items:center;margin-top:8px"><input type="checkbox" id="an-p" style="width:auto"${(editing ? a.pinned : fromHome) ? ' checked' : ''}> Pin to the top of Home</label>`,
      [{ label: 'Cancel', cls: 'ghost' }, { label: editing ? 'Save' : 'Post', fn: async bg => {
        const t = $('#an-t', bg).value.trim(); if (!t) { toast('Add a title.', true); return false; }
        const r = editing
          ? await sb.rpc('edit_announcement', { p_id: a.id, p_title: t, p_body: $('#an-b', bg).value, p_pinned: $('#an-p', bg).checked })
          : await sb.rpc('post_announcement', { p_title: t, p_body: $('#an-b', bg).value, p_pinned: $('#an-p', bg).checked });
        if (r.error) { fail(r.error); return false; }
        toast(editing ? 'Announcement updated.' : 'Announcement posted.'); await load(true); repaint();
      } }]);
  }
  const delAnnouncement = id => c.confirmBox('Delete announcement?', 'This removes it from Home for everyone.', 'Delete', async () => {
    const r = await sb.rpc('delete_announcement', { p_id: id }); if (r.error) return fail(r.error);
    await load(true); repaint();
  });
  const pinAnnouncement = async id => {
    const a = O.ann.find(x => x.id === id); if (!a) return;
    const r = await sb.rpc('set_announcement_pinned', { p_id: id, p_pinned: !a.pinned }); if (r.error) return fail(r.error);
    await load(true); repaint();
  };

  /* ───────── home ───────── */
  function evRow(e) {
    const st = evState(e), k = kindOf(e);
    return `<button class="orow" data-o="event" data-id="${e.id}"><span class="oemo">${k.emoji}</span><span class="t"><b>${esc(e.title)}</b><small>${esc(fmtWhen(e.starts_at))} · ${going(e).length} going</small></span>${st === 'live' ? '<span class="pill red">LIVE</span>' : st === 'soon' ? '<span class="pill">soon</span>' : ''}</button>`;
  }
  /* the animated backdrop is the design video itself (orbit-home.mp4, 2.74s, same length as the sound loop).
     One element is kept and moved into each redraw, so live updates never restart or flash the picture. */
  function homeVideo() {
    if (O.vid) return O.vid;
    /* sharp backdrop drawn live at the screen's resolution (orbit-bg.js); the old video below is only the fallback if canvas is unavailable */
    const live = createBackdrop();
    if (live) {
      live.className = 'ovid'; live.setAttribute('aria-hidden', 'true'); live.tabIndex = -1;
      document.addEventListener('visibilitychange', () => { if (document.hidden) live.pause(); else if (live.isConnected && document.querySelector('.orbithome')) playHomeVideo(live); });
      return (O.vid = live);
    }
    const v = document.createElement('video');
    v.className = 'ovid'; v.poster = 'orbit-home-poster.jpg?v=3';
    v.innerHTML = '<source src="orbit-home.mp4?v=3" type="video/mp4"><source src="orbit-home.webm?v=3" type="video/webm">';
    v.muted = v.defaultMuted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'; v.tabIndex = -1;
    v.disableRemotePlayback = true; v.disablePictureInPicture = true; v.setAttribute('aria-hidden', 'true'); v.setAttribute('muted', '');
    document.addEventListener('visibilitychange', () => { if (document.hidden) v.pause(); else if (v.isConnected && document.querySelector('.orbithome')) playHomeVideo(v); });
    return (O.vid = v);
  }
  function playHomeVideo(v) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches && !document.documentElement.classList.contains('force-motion')) { v.pause(); return; }
    const go = () => {
      const d = v.duration, t = cycleTime();
      if (d && isFinite(d)) { const off = Math.abs(v.currentTime - t % d); if (off > 0.15 && off < d - 0.15) { try { v.currentTime = t % d; } catch {} } }
      const p = v.play(); if (p && p.catch) p.catch(() => {});
    };
    if (v.readyState >= 1) go(); else v.addEventListener('loadedmetadata', go, { once: true });
  }
  // A reduced-motion user can opt back into Orbit animations without reloading.
  window.addEventListener('orbit-motion', () => {
    if (O.vid?.isConnected && document.querySelector('.orbithome')) playHomeVideo(O.vid);
  });
  /* the announcement on Home: big and above Quick links. Owner, admins and moderators can add a new one or edit this one. */
  function annCard(a) {
    const can = staff(), body = a ? (a.body || '') : (O.loaded ? 'Your world. Connected.' : '');
    const btns = can ? `<span class="grow"></span>${a ? `<button type="button" class="oann-btn" data-o="editann" data-id="${a.id}" aria-label="Edit this announcement">${ic('pencil', 15)}<span>Edit</span></button>` : ''}<button type="button" class="oann-btn pri" data-o="newann" data-home="1" aria-label="Add an announcement">${ic('plus', 15)}<span>${a ? 'Add new' : 'Add'}</span></button>` : '';
    return `<section class="oann${a ? '' : ' none'}" aria-label="Announcement"><div class="oann-h"><span class="oann-badge">${ic('bell', 16)} Announcement</span>${a && a.pinned ? '<span class="oann-pin">Pinned</span>' : ''}${btns}</div>
      <div class="oann-main"><img src="logo.svg" width="34" height="34" alt=""><div class="oann-t"><b>${esc(a ? a.title : 'Welcome to Orbit!')}</b>${body ? `<div class="oann-body">${a ? md(body, 'ann' + a.id) : esc(body)}</div>` : ''}${!a && can ? '<small class="oann-hint">Nothing posted yet. Tap Add to tell everyone the news.</small>' : ''}</div></div></section>`;
  }
  function renderHome(main) {
    const sv = S.sv, text = S.chans.filter(x => x.kind === 'text');
    const up = upcoming(), weekEnd = Date.now() + 7 * 864e5, thisWeek = up.filter(e => +new Date(e.starts_at) <= weekEnd).length;
    const dms = c.unreadDms();
    const a0 = O.ann[0], links = [
      ['chat', 'friends', 'Go Social', 'Chat · Friends · Communities'],
      ['gamer', 'gamepad', 'Orbit Games', 'Games · Leaderboards · Fun'],
      ['events', 'calendar', 'Upcoming Events', 'Events · Tournaments · More'],
      ['communities', 'compass', 'Explore Communities', 'Find your people'],
    ];
    const inN = (S.incoming || []).length, oq0 = main.querySelector('#oq'), oqVal = oq0 ? oq0.value : '', oqFocus = !!oq0 && document.activeElement === oq0;
    const enterMs = Math.round(performance.now() - O.homeAt), enter = enterMs < 1500;   // fade-in only when you arrive, not on every live refresh
    const oldStars = main.querySelector('.orbithome > .ostars');
    const oldLogo = main.querySelector('.orbithome .ologo');
    main.innerHTML = `<div class="top otop${enter ? ' oenter' : ''}" style="--el:${enterMs}ms">${menuBtn()}<div class="osearchw"><label class="osearch">${ic('search', 18)}<input id="oq" type="text" placeholder="Search Orbit…" autocomplete="off" spellcheck="false" aria-label="Search Orbit"><kbd>Ctrl + K</kbd></label><div class="ores" id="ores" hidden></div></div><div class="otop-actions">
      <button class="otb osnd" type="button" aria-pressed="true" aria-label="Turn Orbit sound off" title="Sound on"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path class="sw" d="M15.5 8.5a5 5 0 0 1 0 7"/><path class="sw" d="M18.5 5.5a9 9 0 0 1 0 13"/><path class="sx" d="m16 9 5 6M21 9l-5 6"/></svg></button>
      <button class="otb omus" type="button" aria-pressed="true" aria-label="Turn Orbit music off" title="Music on"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/><path class="mx" d="M3 3l18 18"/></svg></button>
      <button class="otb" data-o="go" data-k="friends" aria-label="Friends${inN ? ' (' + inN + ' requests)' : ''}">${ic('friends', 20)}${inN ? '<i class="otbdot"></i>' : ''}</button>
      <button class="otb" data-o="go" data-k="dm" aria-label="Messages${dms ? ' (' + dms + ' unread)' : ''}">${ic('bell', 20)}${dms ? '<i class="otbdot"></i>' : ''}</button>
      <button class="otb oguide" type="button" data-o="guide" aria-label="Choose your guide" title="Choose your guide — Elara or Stellan">${ic('sparkle', 20)}</button>
      <button class="otb oav" data-x="me" aria-label="Your profile">${av(S.me)}</button></div></div>
    <div class="panel orbithome${enter ? ' oenter' : ''}" style="--el:${enterMs}ms">
      <canvas class="ostars" aria-hidden="true"></canvas>
      <section class="ohero"><div class="ologo"><img class="ohero-logo" src="orbit-logo-planet.png" alt=""><i class="op op-a"></i><i class="op op-b"></i></div><h1 class="owt"><img class="owm" src="orbit-wordmark.png" alt="Orbit" width="518" height="180"></h1><p class="otag">Stay in the Loop.</p><div class="ohbtns">${top !== self && typeof top.OpenOrbitTab === 'function' ? `<button class="obtn" data-ob="blank">${ic('arrow',16)}<span>Open Orbit in new tab</span></button>` : ''}${top !== self ? `<button class="obtn" data-ob="back">${ic('arrow', 16)}<span>Back to Silk Road</span></button>` : ''}</div></section>
      ${annCard(a0)}
      <section class="oquick"><h3>${ic('sparkle', 20)} Quick links</h3><div class="qlinks">${links.map(([k, i, t, s]) => `<button class="qlink" data-o="go" data-k="${k}">${ic(i, 24)}<span class="t"><b>${t}</b><small>${esc(s)}</small></span>${ic('arrow', 16)}</button>`).join('')}</div></section>
      <p class="omore"><span></span>More Connections <i>·</i> More Moments <i>·</i> One Orbit<span></span></p>

    </div>`;
    // Reattach the existing canvas and orbiting planets, so realtime updates don't restart animations.
    if (oldStars) main.querySelector('.orbithome > .ostars')?.replaceWith(oldStars);
    if (oldLogo) main.querySelector('.orbithome .ologo')?.replaceWith(oldLogo);
    bindMenu(); startStars(main.querySelector('.ostars')); startLogo(main.querySelector('.ologo'));
    const vid = homeVideo(), appEl = document.getElementById('app');
    if (appEl && vid.parentNode !== appEl) appEl.insertBefore(vid, appEl.firstChild);   // the backdrop sits behind the whole window (sidebar included), so the sidebar can be see-through
    ambient.attach(main.querySelector('.orbithome'), main.querySelector('.osnd'), vid, main.querySelector('.omus'));
    drift.attach(main);
    mountFloaters(main.querySelector('.orbithome'), c.collectibles ? c.collectibles() : []);   // your collectibles float across the page; click one to hear it
    playHomeVideo(vid);
    main.querySelectorAll('[data-ob]').forEach(b => b.onclick = () => {
      if(b.dataset.ob==='blank'){try{top.OpenOrbitTab();}catch{}return;}
      try { if(typeof top.SilkRoadHome==='function')top.SilkRoadHome();else top.location.href='../'; } catch { try { top.location.href = '../'; } catch {} }   // Return to the history page.
    });
    main.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => c.openChan(b.dataset.ch));
    c.bindSearch(main.querySelector('#oq'), main.querySelector('#ores'));
    if (oqVal) { const q = main.querySelector('#oq'); q.value = oqVal; if (oqFocus) { q.focus(); q.dispatchEvent(new Event('input')); } }
    main.querySelector('[data-x="me"]').onclick = () => c.profileModal(S.me.id);
    if (!O.loaded) load().then(repaint);
  }
  function go(k) {
    if (k === 'boards' && S.view === 'call') { closeBoard(); return wbRender(); }
    if (k === 'chat') return c.openFirstChannel();
    if (k === 'gamer') return c.navTo('gamer');
    c.navTo(k);
  }

  /* ───────── events ───────── */
  async function rsvp(id, status) {
    const e = O.events.find(x => x.id === id); if (!e) return;
    const next = myRsvp(e) === status ? 'none' : status;
    e.rsvps = (e.rsvps || []).filter(r => r.user_id !== S.me.id); if (next !== 'none') e.rsvps.push({ user_id: S.me.id, status: next });
    repaint();
    const r = await sb.rpc('rsvp_event', { p_event: id, p_status: next });
    if (r.error) { fail(r.error); await load(true); repaint(); }
  }
  const rsvpBtns = e => `<div class="rsvp"><button class="btn sm ${myRsvp(e) === 'going' ? '' : 'ghost'}" data-o="rsvp" data-id="${e.id}" data-s="going" aria-pressed="${myRsvp(e) === 'going'}">${ic('check', 14)} Going</button><button class="btn sm ${myRsvp(e) === 'maybe' ? '' : 'ghost'}" data-o="rsvp" data-id="${e.id}" data-s="maybe" aria-pressed="${myRsvp(e) === 'maybe'}">Maybe</button></div>`;
  const stateChip = e => { const s = evState(e); return s === 'live' ? '<span class="chip live">● Live now</span>' : s === 'soon' ? '<span class="chip soon">Starting soon</span>' : s === 'past' ? '<span class="chip">Ended</span>' : ''; };
  function evCard(e) {
    const k = kindOf(e), g = going(e);
    return `<article class="evcard ${evState(e) === 'live' ? 'live' : ''}">
      <button class="evmain" data-o="event" data-id="${e.id}"><span class="evemo">${k.emoji}</span>
        <span class="t"><b>${esc(e.title)}</b><small>${esc(fmtWhen(e.starts_at))}${e.ends_at ? ' – ' + esc(fmtTime(e.ends_at)) : ''}</small>
        <small>${esc(k.label)}${e.host_id ? ' · hosted by ' + esc(person(e.host_id)) : ''}${e.location ? ' · ' + esc(e.location) : ''}</small></span>
        <span class="evr">${stateChip(e)}<small>${g.length} going${maybe(e).length ? `, ${maybe(e).length} maybe` : ''}</small></span></button>
      ${evState(e) === 'past' ? '' : rsvpBtns(e)}</article>`;
  }
  const monthName = (y, m) => new Date(y, m, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
  function monthCells(y, m) {
    const first = new Date(y, m, 1), start = new Date(y, m, 1 - first.getDay()), cells = [];
    for (let i = 0; i < 42; i++) { const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i); cells.push({ d, k: dayKey(d), inMonth: d.getMonth() === m }); }
    return cells;
  }
  function bigCalendar() {
    const { y, m } = O.bigCal, map = byDay(), tk = dayKey(new Date());
    return `<div class="bcal"><div class="bcalh"><button class="ib" data-o="bcal" data-d="-1" aria-label="Previous month">${ic('chevL')}</button><b>${esc(monthName(y, m))}</b><button class="ib" data-o="bcal" data-d="1" aria-label="Next month">${ic('chevR')}</button><button class="btn sm ghost" data-o="bcal" data-d="0">Today</button></div>
      <div class="bgrid">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div class="bdow">${d}</div>`).join('')}
      ${monthCells(y, m).map(({ d, k, inMonth }) => { const es = map.get(k) || [];
        return `<div class="bday ${inMonth ? '' : 'out'} ${k === tk ? 'today' : ''}"><button class="bnum" data-o="day" data-k="${k}" aria-label="${esc(d.toLocaleDateString([], { month: 'long', day: 'numeric' }))}${es.length ? ', ' + es.length + ' events' : ''}">${d.getDate()}</button>
          ${es.slice(0, 3).map(e => `<button class="bchip k-${esc(e.kind)}" data-o="event" data-id="${e.id}" title="${esc(e.title)}">${kindOf(e).emoji} ${esc(e.title)}</button>`).join('')}${es.length > 3 ? `<button class="bmore" data-o="day" data-k="${k}">+${es.length - 3} more</button>` : ''}</div>`; }).join('')}</div></div>`;
  }
  function renderEvents(main) {
    const tab = O.ev.tab, day = O.ev.day;
    let body;
    if (O.err) body = `<p class="muted">${esc(O.err)}</p>`;
    else if (!O.loaded) { body = '<p class="muted">Loading…</p>'; load().then(repaint); }
    else if (tab === 'calendar') body = bigCalendar();
    else {
      let list = tab === 'past' ? O.events.filter(e => evEnd(e) < Date.now()).sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at)) : upcoming();
      if (day) list = O.events.filter(e => dayKey(e.starts_at) === day).sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
      const groups = []; for (const e of list) { const k = dayKey(e.starts_at), g = groups[groups.length - 1]; if (g && g.k === k) g.es.push(e); else groups.push({ k, es: [e] }); }
      body = `${day ? `<p class="chip dayf">Showing ${esc(fmtDay(day + 'T12:00'))} <button class="ib sm" data-o="clearday" aria-label="Show all events">${ic('x', 14)}</button></p>` : ''}
        ${groups.map(g => `<h3 class="lbl">${esc(fmtDay(g.k + 'T12:00'))}</h3>${g.es.map(evCard).join('')}`).join('') ||
          `<div class="empty" style="padding:2rem 0"><h2>${day ? 'Nothing that day' : tab === 'past' ? 'No past events yet' : 'Nothing scheduled yet'}</h2><p>${staff() ? 'Schedule a game night, trivia or a drawing contest.' : 'Check back soon.'}</p>${staff() ? `<button class="btn" data-o="newevent" style="width:auto">Schedule an event</button>` : ''}</div>`}`;
    }
    main.innerHTML = `<div class="top">${menuBtn()}<span class="hashi">${ic('calendar', 20)}</span><b class="title">Events</b><span class="grow"></span>${staff() && !O.err ? `<button class="btn sm" data-o="newevent">+ New event</button>` : ''}</div>
      <div class="panel"><div class="tabs">${[['upcoming', 'Upcoming'], ['calendar', 'Calendar'], ['past', 'Past']].map(([k, t]) => `<button class="${tab === k ? 'on' : ''}" data-o="evtab" data-k="${k}">${t}</button>`).join('')}</div>${body}</div>`;
    bindMenu();
  }
  function renderEvent(main) {
    const e = O.events.find(x => x.id === O.ev.id);
    const back = `<button class="ib" data-o="go" data-k="events" aria-label="Back to events">${ic('back')}</button>`;
    if (!e) { main.innerHTML = `<div class="top">${menuBtn()}${back}<b class="title">Event</b></div><div class="empty"><h2>${O.loaded ? 'Event not found' : 'Loading…'}</h2><p>${O.loaded ? 'It may have been removed.' : ''}</p></div>`; bindMenu(); if (!O.loaded) load().then(repaint); return; }
    const k = kindOf(e), g = going(e), mb = maybe(e), people = list => list.length ? `<div class="attgrid">${list.map(r => `<button class="att" data-o="prof" data-id="${r.user_id}">${av(prof(r.user_id))}<span>${esc(person(r.user_id))}</span></button>`).join('')}</div>` : '<p class="muted">Nobody yet.</p>';
    const board = e.board_id && O.boards.find(b => b.id === e.board_id);
    main.innerHTML = `<div class="top">${menuBtn()}${back}<span class="hashi">${k.emoji}</span><b class="title">${esc(e.title)}</b></div>
    <div class="panel"><article class="evpage">
      <div class="evtags"><span class="chip">${k.emoji} ${esc(k.label)}</span>${stateChip(e)}<span class="chip">${esc(rel(e))}</span></div>
      <h1>${esc(e.title)}</h1>
      <div class="evmeta">
        <div>${ic('clock', 18)}<span><b>${esc(new Date(e.starts_at).toLocaleString([], { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</b>${e.ends_at ? ` <span class="muted">until ${esc(fmtTime(e.ends_at))}</span>` : ''}</span></div>
        ${e.host_id ? `<div>${ic('user', 18)}<span>Hosted by <button class="linkb" data-o="prof" data-id="${e.host_id}"><b>${esc(person(e.host_id))}</b></button></span></div>` : ''}
        ${e.location ? `<div>${ic('mapPin', 18)}<span>${esc(e.location)}</span></div>` : ''}
      </div>
      ${e.description ? `<div class="evdesc">${md(e.description, 'ev' + e.id)}</div>` : ''}
      <div class="evact">${evState(e) === 'past' ? '' : rsvpBtns(e)}
        ${board ? `<button class="btn sm" data-o="board" data-id="${board.id}">${ic('brush', 14)} Open contest board</button>` : ''}
        <button class="btn sm ghost" data-o="ics" data-id="${e.id}">${ic('download', 14)} Add to my calendar</button>
        ${staff() ? `<button class="btn sm ghost" data-o="editevent" data-id="${e.id}">${ic('pencil', 14)} Edit</button><button class="btn sm danger" data-o="delevent" data-id="${e.id}">${ic('trash', 14)} Delete</button>` : ''}</div>
      <h3 class="lbl">Going (${g.length})</h3>${people(g)}
      ${mb.length ? `<h3 class="lbl">Maybe (${mb.length})</h3>${people(mb)}` : ''}
    </article></div>`;
    bindMenu();
  }
  function eventForm(e, presetDay) {
    const members = S.members.map(m => m.user_id), kinds = Object.entries(KINDS);
    const base = e ? new Date(e.starts_at) : (() => { const d = presetDay ? new Date(presetDay + 'T18:00') : new Date(Date.now() + 864e5); d.setMinutes(0, 0, 0); if (!presetDay) d.setHours(d.getHours() + 1); return d; })();
    modal(e ? 'Edit event' : 'New event', `<label class="lbl2">Title</label><input id="ef-t" maxlength="100" value="${esc(e?.title || '')}" placeholder="Friday game night">
      <label class="lbl2">Type</label><select id="ef-k">${kinds.map(([k, v]) => `<option value="${k}" ${(e?.kind || 'game_night') === k ? 'selected' : ''}>${v.emoji} ${v.label}</option>`).join('')}</select>
      <div class="two"><div><label class="lbl2">Starts</label><input type="datetime-local" id="ef-s" value="${toLocalInput(base)}"></div>
      <div><label class="lbl2">Ends (optional)</label><input type="datetime-local" id="ef-e" value="${e?.ends_at ? toLocalInput(e.ends_at) : ''}"></div></div>
      <label class="lbl2">Host</label><select id="ef-h">${members.map(id => `<option value="${id}" ${(e?.host_id || S.me.id) === id ? 'selected' : ''}>${esc(person(id))}</option>`).join('')}</select>
      <label class="lbl2">Where</label><input id="ef-l" maxlength="200" value="${esc(e?.location || '')}" placeholder="#chat, a voice channel, a link…">
      <label class="lbl2">Description</label><textarea id="ef-d" rows="4" maxlength="2000" placeholder="What's happening? For a drawing contest, put the theme here.">${esc(e?.description || '')}</textarea>
      <p class="muted" style="font-size:12px;margin:6px 0 0">Times are in your time zone. A drawing contest gets its own contest board automatically.</p>`,
      [{ label: 'Cancel', cls: 'ghost' }, { label: e ? 'Save' : 'Schedule', fn: async bg => {
        const v = id => $(id, bg).value, t = v('#ef-t').trim(), s = v('#ef-s'), en = v('#ef-e');
        if (!t) { toast('Add a title.', true); return false; } if (!s) { toast('Choose a start time.', true); return false; }
        const st = new Date(s), et = en ? new Date(en) : null;
        if (et && et <= st) { toast('The end must be after the start.', true); return false; }
        const r = await sb.rpc('save_event', { p_id: e?.id || null, p_title: t, p_description: v('#ef-d'), p_kind: v('#ef-k'), p_host: v('#ef-h'), p_starts: st.toISOString(), p_ends: et ? et.toISOString() : null, p_location: v('#ef-l') });
        if (r.error) { fail(r.error); return false; }
        toast(e ? 'Event saved.' : 'Event scheduled.'); await load(true); repaint();
        if (!e && r.data) openEvent(r.data);
      } }]);
  }
  const delEvent = id => c.confirmBox('Delete event?', 'The event and its sign-ups will be removed.', 'Delete', async () => {
    const r = await sb.rpc('delete_event', { p_id: id }); if (r.error) return fail(r.error);
    await load(true); O.ev.id = null; c.navTo('events');
  });
  function downloadIcs(e) {
    const f = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''), t = s => String(s || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Orbit//EN', 'BEGIN:VEVENT', `UID:${e.id}@chatter`, `DTSTAMP:${f(Date.now())}`, `DTSTART:${f(e.starts_at)}`, `DTEND:${f(e.ends_at || evEnd(e))}`,
      `SUMMARY:${t(e.title)}`, `DESCRIPTION:${t(e.description)}`, `LOCATION:${t(e.location)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = e.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 40) + '.ics';
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function openEvent(id) { O.ev.id = id; S.view = 'event'; c.closeSide(); c.renderMain(); c.renderSide(); }

  /* ───────── calendar in the sidebar ───────── */
  function sideCal() {
    if (!S.sv) return '';
    const next = upcoming()[0], { y, m } = O.cal, map = byDay(), tk = dayKey(new Date());
    const label = O.err ? 'Not set up yet' : !O.loaded ? 'Loading…' : next ? `${kindOf(next).emoji} ${next.title} · ${fmtWhen(next.starts_at)}` : 'Nothing scheduled';
    return `<div class="scal"><button class="scal-h" data-o="calt" aria-expanded="${O.calOpen}">${ic('calendar', 18)}<span class="t"><b>Calendar</b><small>${esc(label)}</small></span>${ic('chev', 16)}</button>
      ${O.calOpen ? `<div class="scal-b"><div class="scal-nav"><button class="ib sm" data-o="scal" data-d="-1" aria-label="Previous month">${ic('chevL', 16)}</button><b>${esc(monthName(y, m))}</b><button class="ib sm" data-o="scal" data-d="1" aria-label="Next month">${ic('chevR', 16)}</button></div>
        <div class="scal-g">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<i class="dow">${d}</i>`).join('')}${monthCells(y, m).map(({ d, k, inMonth }) => { const n = (map.get(k) || []).length;
          return `<button class="sd ${inMonth ? '' : 'out'} ${k === tk ? 'today' : ''} ${n ? 'has' : ''}" data-o="day" data-k="${k}" aria-label="${esc(d.toLocaleDateString([], { month: 'long', day: 'numeric' }))}${n ? ', ' + n + ' event' + (n > 1 ? 's' : '') : ''}">${d.getDate()}</button>`; }).join('')}</div>
        <button class="scal-all" data-o="go" data-k="events">All events</button></div>` : ''}</div>`;
  }
  function bindSide(side) { side.querySelectorAll('.scal [data-o]').forEach(b => b.onclick = e => { e.stopPropagation(); act(b); }); }

  /* ───────── boards: list ───────── */
  const statusLabel = b => b.mode === 'contest' ? { open: 'Drawing open', voting: 'Voting open', ended: 'Finished' }[b.status] : (b.status === 'ended' ? 'Closed' : 'Open');
  function renderBoards(main) {
    let body;
    if (O.err) body = `<p class="muted">${esc(O.err)}</p>`;
    else if (!O.loaded) { body = '<p class="muted">Loading…</p>'; load().then(repaint); }
    else body = O.boards.length ? `<div class="bdlist">${O.boards.slice().reverse().map(b => `<button class="bdcard" data-o="board" data-id="${b.id}"><span class="bdemo">${b.mode === 'contest' ? '🎨' : '🧑‍🎨'}</span><span class="t"><b>${esc(b.title)}</b><small>${b.mode === 'contest' ? 'Art contest' : 'Shared canvas'}${b.prompt ? ' · ' + esc(b.prompt) : ''}</small></span><span class="chip ${b.status}">${esc(statusLabel(b))}</span></button>`).join('')}</div>`
      : `<div class="empty"><h2>No boards yet</h2><p>${staff() ? 'Create a shared canvas or an art contest.' : 'Check back soon.'}</p></div>`;
    if (S.view === 'call') {   // inside a voice call: a compact panel beside the call tiles
      main.innerHTML = `<div class="wbhead"><span class="hashi">${ic('brush', 18)}</span><b class="title">Whiteboard</b><span class="grow"></span>${staff() && !O.err ? `<button class="btn sm" data-o="newboard">+ New board</button>` : ''}<button class="ib" data-o="wbclose" title="Close whiteboard" aria-label="Close whiteboard">${ic('x', 18)}</button></div><div class="wbbody"><p class="muted" style="margin-top:0">Draw together, drop sticky notes and vote on ideas, or enter an art contest.</p>${body}</div>`;
      return;
    }
    main.innerHTML = `<div class="top">${menuBtn()}<span class="hashi">${ic('brush', 20)}</span><b class="title">Whiteboard</b><span class="grow"></span>${staff() && !O.err ? `<button class="btn sm" data-o="newboard">+ New board</button>` : ''}</div><div class="panel"><p class="muted" style="margin-top:0">Draw together, drop sticky notes and vote on ideas, or enter an art contest.</p>${body}</div>`;
    bindMenu();
  }
  function boardForm() {
    modal('New board', `<label class="lbl2">Name</label><input id="bf-t" maxlength="80" placeholder="Brainstorm: spirit week">
      <label class="lbl2">Type</label><select id="bf-m"><option value="collab">🧑‍🎨 Shared canvas: everyone draws on one board, notes can be voted on</option><option value="contest">🎨 Art contest: everyone draws their own entry, then people vote</option></select>
      <label class="lbl2">Prompt or theme (optional)</label><input id="bf-p" maxlength="300" placeholder="Draw your favourite animal">`,
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Create', fn: async bg => {
        const t = $('#bf-t', bg).value.trim(); if (!t) { toast('Add a name.', true); return false; }
        const r = await sb.rpc('save_board', { p_title: t, p_mode: $('#bf-m', bg).value, p_prompt: $('#bf-p', bg).value });
        if (r.error) { fail(r.error); return false; }
        await load(true); openBoard(r.data);
      } }]);
  }

  /* ───────── boards: one board ───────── */
  async function fetchAll(q, size = 1000) {
    const out = [];
    for (let from = 0; out.length < 20000; from += size) { const r = await q().range(from, from + size - 1); if (r.error) throw r.error; out.push(...r.data); if (r.data.length < size) break; }
    return out;
  }
  function openBoard(id) {
    closeBoard();
    O.bd = { id, board: O.boards.find(b => b.id === id) || null, items: new Map(), votes: new Map(), live: new Map(), tab: 'draw', loading: true, err: '', drawing: null, ch: null, seq: 0, sent: 0 };
    O.pen = O.pen || { tool: 'pen', color: PEN_COLORS[0], size: 5 };
    if (S.view === 'call') wbRender(); else { S.view = 'board'; c.closeSide(); c.renderMain(); c.renderSide(); }
    loadBoard(id);
  }
  async function loadBoard(id) {
    const bd = O.bd; if (!bd || bd.id !== id) return;
    try {
      const [b, items, votes] = await Promise.all([
        sb.from('boards').select('*').eq('id', id).single(),
        fetchAll(() => sb.from('board_items').select('*').eq('board_id', id).order('created_at').order('id')),
        fetchAll(() => sb.from('board_votes').select('*').eq('board_id', id).order('created_at').order('voter_id')),
      ]);
      if (O.bd !== bd) return;
      if (b.error) throw b.error;
      bd.board = b.data; items.forEach(i => bd.items.set(i.id, i)); votes.forEach(v => addVote(v));
      await c.needProfiles([...new Set(items.map(i => i.author_id).filter(Boolean))]);
      if (O.bd !== bd) return;
      bd.loading = false;
      if (bd.board.mode === 'contest' && bd.board.status !== 'open') bd.tab = 'gallery';
      subscribeBoard(); renderBoardShell();
    } catch (e) { if (O.bd === bd) { bd.loading = false; bd.err = setupErr(e); renderBoardShell(); } }
  }
  function subscribeBoard() {
    const bd = O.bd, id = bd.id;
    bd.ch = sb.channel('orbit-board-' + id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'board_items', filter: `board_id=eq.${id}` }, p => onItem(p.new))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'board_items' }, p => { if (p.old?.id && bd.items.has(p.old.id)) { bd.items.delete(p.old.id); redraw(); paintNotes(); paintGallery(); } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_votes' }, p => onVote(p))
      .on('broadcast', { event: 'seg' }, ({ payload }) => onSeg(payload))
      .subscribe();
  }
  function closeBoard() {
    const bd = O.bd; if (!bd) return;
    if (bd.ch) sb.removeChannel(bd.ch);
    cancelAnimationFrame(bd.raf); O.bd = null;
  }
  const bkey = (kind, id) => kind + ':' + id;
  function addVote(v) { const k = bkey(v.target_kind, v.target_id); (O.bd.votes.get(k) || O.bd.votes.set(k, new Set()).get(k)).add(v.voter_id); }
  const votesOf = (kind, id) => O.bd.votes.get(bkey(kind, id)) || new Set();
  function onVote(p) {
    const bd = O.bd; if (!bd) return;
    const r = p.eventType === 'DELETE' ? p.old : p.new; if (!r || r.board_id !== bd.id) return;
    if (p.eventType === 'DELETE') { const s = bd.votes.get(bkey(r.target_kind, r.target_id)); s?.delete(r.voter_id); } else addVote(r);
    paintNotes(); paintGallery();
  }
  function onBoardRow(p) {
    const bd = O.bd, row = p?.new; if (!bd || !row || row.id !== bd.id) return;
    const was = bd.board?.status; bd.board = row;
    if (row.mode === 'contest' && row.status !== 'open' && was === 'open') bd.tab = 'gallery';
    if (row.mode === 'contest' && row.status === 'open' && was !== 'open') bd.tab = 'draw';
    renderBoardShell();
  }
  function onItem(row) {
    const bd = O.bd; if (!bd || !row?.id || bd.items.has(row.id)) return;
    bd.items.set(row.id, row); if (row.author_id) bd.live.delete(row.author_id);
    if (row.kind === 'note') paintNotes(); redraw(); paintGallery();
  }
  function onSeg(m) {
    const bd = O.bd; if (!bd || !m || !UUID.test(m.u || '') || m.u === S.me.id || bd.board?.mode === 'contest') return;
    if (!HEX.test(m.c || '') || !Array.isArray(m.p) || m.p.length > 400) return;
    const w = Math.min(40, Math.max(1, +m.w || 4)), pts = m.p.map(Number).filter(Number.isFinite);
    let L = bd.live.get(m.u);
    if (!L || L.s !== m.s) { L = { s: m.s, c: m.c, w, p: [], t: 0 }; bd.live.set(m.u, L); }
    const cv = $('#bdcv'); const prev = L.p.length >= 2 ? L.p.slice(-2) : null;
    L.p.push(...pts); L.t = Date.now();
    if (cv) { const g = cv.getContext('2d'); strokePath(g, prev ? [...prev, ...pts] : pts, L.c, L.w); }
    setTimeout(() => { const x = bd.live.get(m.u); if (x && Date.now() - x.t > 5000) { bd.live.delete(m.u); redraw(); } }, 5200);
  }

  /* drawing helpers */
  function strokePath(g, p, color, w, k = 1) {
    const pts = []; for (let i = 0; i + 1 < p.length; i += 2) { const x = +p[i], y = +p[i + 1]; if (Number.isFinite(x) && Number.isFinite(y)) pts.push(x * k, y * k); }
    if (pts.length < 2 || !HEX.test(color || '')) return;
    g.strokeStyle = g.fillStyle = color; g.lineWidth = Math.min(40, Math.max(1, +w || 4)) * k; g.lineCap = g.lineJoin = 'round';
    g.beginPath(); g.moveTo(pts[0], pts[1]);
    if (pts.length === 2) g.lineTo(pts[0] + 0.01, pts[1]);
    else {
      for (let i = 2; i + 3 < pts.length; i += 2) g.quadraticCurveTo(pts[i], pts[i + 1], (pts[i] + pts[i + 2]) / 2, (pts[i + 1] + pts[i + 3]) / 2);
      g.lineTo(pts[pts.length - 2], pts[pts.length - 1]);
    }
    g.stroke();
  }
  const canvasOwner = () => O.bd?.board?.mode === 'contest' ? S.me.id : null;
  const itemsFor = (owner) => [...O.bd.items.values()].filter(i => i.kind === 'stroke' && (i.canvas_owner || null) === (owner || null));
  function paintInto(cv, strokes, k = 1, live = null) {
    const g = cv.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height);
    for (const s of strokes) strokePath(g, s.data?.p || [], s.data?.c, s.data?.w, k);
    if (live) for (const L of live.values()) strokePath(g, L.p, L.c, L.w, k);
  }
  function redraw() {
    const bd = O.bd; if (!bd || bd.raf) return;
    bd.raf = requestAnimationFrame(() => { bd.raf = 0; const cv = $('#bdcv'); if (!cv || !O.bd) return; paintInto(cv, itemsFor(canvasOwner()), 1, bd.board?.mode === 'contest' ? null : bd.live); });
  }
  const canDraw = () => { const b = O.bd?.board; return !!b && (b.mode === 'contest' ? b.status === 'open' : b.status === 'open'); };
  const point = (cv, e) => { const r = cv.getBoundingClientRect(); return [Math.round(Math.min(BW, Math.max(0, (e.clientX - r.left) * BW / r.width))), Math.round(Math.min(BH, Math.max(0, (e.clientY - r.top) * BH / r.height)))]; };
  function bindCanvas(cv) {
    const bd = O.bd, pen = O.pen; let flushT = 0;
    const sendNew = d => {   // tell everyone else about the points drawn since the last send (live view only, nothing is saved here)
      if (!bd.ch || bd.board.mode === 'contest') { d.sent = d.p.length; return; }
      while (d.sent < d.p.length) { const chunk = d.p.slice(d.sent, d.sent + 300); bd.ch.send({ type: 'broadcast', event: 'seg', payload: { u: S.me.id, s: d.s, c: d.c, w: d.w, p: chunk } }); d.sent += chunk.length; }
    };
    cv.onpointerdown = e => {
      if (e.button > 0 || !canDraw()) return;
      const [x, y] = point(cv, e);
      if (pen.tool === 'note') { noteForm(x / BW, y / BH); return; }
      cv.setPointerCapture(e.pointerId); e.preventDefault();
      bd.drawing = { s: ++bd.seq + '-' + Date.now().toString(36), c: pen.color, w: pen.size, p: [x, y], sent: 0 };
      const g = cv.getContext('2d'); strokePath(g, [x, y, x, y], pen.color, pen.size);
      flushT = setInterval(() => bd.drawing && sendNew(bd.drawing), 120);
    };
    cv.onpointermove = e => {
      const d = bd.drawing; if (!d) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e], g = cv.getContext('2d');
      for (const ev of evs) {
        const [x, y] = point(cv, ev), lx = d.p[d.p.length - 2], ly = d.p[d.p.length - 1];
        if (Math.hypot(x - lx, y - ly) < 2 || d.p.length >= 7900) continue;
        strokePath(g, [lx, ly, x, y], d.c, d.w); d.p.push(x, y);
      }
    };
    const end = async e => {
      const d = bd.drawing; if (!d) return; bd.drawing = null; clearInterval(flushT);
      sendNew(d);
      const p = d.p.length < 4 ? [d.p[0], d.p[1], d.p[0], d.p[1]] : d.p, tmp = { id: 'tmp' + d.s, board_id: bd.id, author_id: S.me.id, kind: 'stroke', canvas_owner: canvasOwner(), data: { p, c: d.c, w: d.w }, created_at: new Date().toISOString() };
      bd.items.set(tmp.id, tmp);
      const r = await sb.rpc('board_add_item', { p_board: bd.id, p_kind: 'stroke', p_owner: canvasOwner(), p_data: { p, c: d.c, w: d.w } });
      bd.items.delete(tmp.id);
      if (r.error) { toast(setupErr(r.error), true); redraw(); return; }
      if (O.bd === bd && r.data) { bd.items.set(r.data.id, r.data); bd.live.delete(S.me.id); }
      redraw(); paintGallery();
    };
    cv.onpointerup = end; cv.onpointercancel = end;
  }
  async function undo() {
    const bd = O.bd; if (!bd) return;
    const mine = itemsFor(canvasOwner()).filter(i => i.author_id === S.me.id && !String(i.id).startsWith('tmp')).pop(); if (!mine) return toast('Nothing to undo.');
    bd.items.delete(mine.id); redraw();
    const r = await sb.rpc('board_delete_item', { p_item: mine.id }); if (r.error) { bd.items.set(mine.id, mine); redraw(); fail(r.error); }
  }
  function clearBoard() {
    const bd = O.bd, contest = bd.board.mode === 'contest', own = contest && !staff();
    c.confirmBox(own ? 'Clear your drawing?' : 'Clear this board?', own ? 'This erases your whole drawing so you can start again.' : 'This removes every drawing and note on the board for everyone.', 'Clear', async () => {
      const r = await sb.rpc('clear_board', { p_board: bd.id, p_owner: contest ? (own ? S.me.id : null) : null }); if (r.error) return fail(r.error);
      [...bd.items.values()].forEach(i => { if (!contest || !own || i.canvas_owner === S.me.id) bd.items.delete(i.id); });
      if (!own) bd.votes.clear(); redraw(); paintNotes(); paintGallery();
    });
  }
  function noteForm(x, y) {
    let col = 'yellow';
    modal('Add a sticky note', `<textarea id="nt" rows="3" maxlength="200" placeholder="Your idea…"></textarea><div class="ncols" id="ncols">${Object.entries(NOTE_COLORS).map(([k, v]) => `<button type="button" class="ncol ${k === col ? 'on' : ''}" data-c="${k}" style="background:${v}" aria-label="${k}"></button>`).join('')}</div>`,
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Add note', fn: async bg => {
        const t = $('#nt', bg).value.trim(); if (!t) { toast('Write something first.', true); return false; }
        const r = await sb.rpc('board_add_item', { p_board: O.bd.id, p_kind: 'note', p_owner: null, p_data: { t, x: Math.min(.92, Math.max(.08, x)), y: Math.min(.9, Math.max(.1, y)), c: col } });
        if (r.error) { fail(r.error); return false; }
        if (r.data && O.bd) { O.bd.items.set(r.data.id, r.data); paintNotes(); }
      } }],
      bg => bg.querySelector('#ncols').onclick = e => { const b = e.target.closest('.ncol'); if (!b) return; col = b.dataset.c; bg.querySelectorAll('.ncol').forEach(x => x.classList.toggle('on', x === b)); });
  }
  async function voteNote(id) {
    const bd = O.bd, s = votesOf('note', id), on = !s.has(S.me.id);
    on ? addVote({ target_kind: 'note', target_id: id, voter_id: S.me.id }) : s.delete(S.me.id); paintNotes();
    const r = await sb.rpc('board_vote', { p_board: bd.id, p_kind: 'note', p_target: id, p_on: on });
    if (r.error) { on ? votesOf('note', id).delete(S.me.id) : addVote({ target_kind: 'note', target_id: id, voter_id: S.me.id }); paintNotes(); fail(r.error); }
  }
  async function voteEntry(uid) {
    const bd = O.bd, s = votesOf('entry', uid), on = !s.has(S.me.id);
    on ? addVote({ target_kind: 'entry', target_id: uid, voter_id: S.me.id }) : s.delete(S.me.id); paintGallery();
    const r = await sb.rpc('board_vote', { p_board: bd.id, p_kind: 'entry', p_target: uid, p_on: on });
    if (r.error) { on ? votesOf('entry', uid).delete(S.me.id) : addVote({ target_kind: 'entry', target_id: uid, voter_id: S.me.id }); paintGallery(); fail(r.error); }
  }
  async function delNote(id) {
    const bd = O.bd, it = bd.items.get(id); bd.items.delete(id); paintNotes();
    const r = await sb.rpc('board_delete_item', { p_item: id }); if (r.error) { bd.items.set(id, it); paintNotes(); fail(r.error); }
  }
  function ideasModal() {
    const notes = [...O.bd.items.values()].filter(i => i.kind === 'note').map(n => ({ n, v: votesOf('note', n.id).size })).sort((a, b) => b.v - a.v || +new Date(a.n.created_at) - +new Date(b.n.created_at));
    modal('Top ideas', notes.length ? `<div class="ideas">${notes.map(({ n, v }) => `<div class="idea"><span class="iv">${ic('up', 14)} ${v}</span><span>${esc(n.data?.t)}</span><small class="muted">${esc(person(n.author_id))}</small></div>`).join('')}</div>` : '<p class="muted">No sticky notes yet. Pick the Note tool and click the canvas.</p>');
  }
  function savePng() {
    const bd = O.bd, cv = document.createElement('canvas'); cv.width = BW; cv.height = BH;
    paintInto(cv, itemsFor(canvasOwner())); const g = cv.getContext('2d');
    if (bd.board.mode !== 'contest') for (const n of bd.items.values()) {
      if (n.kind !== 'note') continue;
      const x = (+n.data.x || .5) * BW, y = (+n.data.y || .5) * BH, w = 190, lines = []; g.font = '600 20px system-ui, sans-serif';
      let line = ''; for (const word of String(n.data.t || '').split(/\s+/)) { const t = line ? line + ' ' + word : word; if (g.measureText(t).width > w - 24 && line) { lines.push(line); line = word; } else line = t; } lines.push(line);
      const h = lines.length * 26 + 24; g.fillStyle = NOTE_COLORS[n.data.c] || NOTE_COLORS.yellow; g.fillRect(x - w / 2, y - h / 2, w, h);
      g.fillStyle = '#222'; lines.forEach((l, i) => g.fillText(l, x - w / 2 + 12, y - h / 2 + 30 + i * 26));
    }
    cv.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = (bd.board.title || 'board').replace(/[^\w\- ]+/g, '').trim().slice(0, 40) + '.png'; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); });
  }
  async function setStatus(st) { const r = await sb.rpc('set_board_status', { p_board: O.bd.id, p_status: st }); if (r.error) { fail(r.error); renderBoardShell(); } }
  const delBoard = () => c.confirmBox('Delete this board?', 'All drawings, notes and votes on it will be removed for everyone.', 'Delete', async () => {
    const r = await sb.rpc('delete_board', { p_board: O.bd.id }); if (r.error) return fail(r.error);
    await load(true); if (S.view === 'call') { closeBoard(); wbRender(); } else c.navTo('boards');
  });

  /* board layout */
  function entries() {
    const bd = O.bd, by = new Map();
    for (const i of bd.items.values()) if (i.kind === 'stroke' && i.canvas_owner) (by.get(i.canvas_owner) || by.set(i.canvas_owner, []).get(i.canvas_owner)).push(i);
    const list = [...by.entries()].map(([uid, items]) => ({ uid, items, votes: votesOf('entry', uid).size, t: Math.min(...items.map(i => +new Date(i.created_at))) }));
    return bd.board.status === 'ended' ? list.sort((a, b) => b.votes - a.votes || a.t - b.t) : list.sort((a, b) => a.t - b.t);
  }
  function boardHead() {
    const bd = O.bd, el = $('#bdhead'); if (!bd || !bd.board || !el) return;
    const b = bd.board, contest = b.mode === 'contest', opts = contest ? [['open', 'Drawing open'], ['voting', 'Voting open'], ['ended', 'Finished']] : [['open', 'Open'], ['ended', 'Closed']];
    const ents = contest ? entries() : [], top = ents[0];
    const winner = contest && b.status === 'ended' && top && top.votes > 0 ? ents.filter(e => e.votes === top.votes) : [];
    el.innerHTML = `<div class="bdinfo">${b.prompt ? `<p class="bdprompt">${esc(b.prompt)}</p>` : ''}
      <div class="bdrow"><span class="chip ${b.status}">${esc(statusLabel(b))}</span>
      ${contest ? `<div class="tabs sm"><button class="${bd.tab === 'draw' ? 'on' : ''}" data-o="bdtab" data-k="draw">My canvas</button><button class="${bd.tab === 'gallery' ? 'on' : ''}" data-o="bdtab" data-k="gallery">Gallery (${ents.length})</button></div>` : ''}
      <span class="grow"></span>
      ${staff() ? `<label class="muted" style="font-size:12px">Status <select id="bdstatus">${opts.map(([k, t]) => `<option value="${k}" ${b.status === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label><button class="ib" data-o="delboard" title="Delete board" aria-label="Delete board">${ic('trash', 18)}</button>` : ''}</div>
      ${winner.length ? `<div class="winner">${ic('trophy', 20)} <b>${winner.length > 1 ? 'Winners' : 'Winner'}:</b> ${winner.map(w => esc(person(w.uid))).join(', ')} <span class="muted">(${top.votes} vote${top.votes === 1 ? '' : 's'})</span></div>` : ''}
      ${contest && b.status === 'voting' ? `<p class="muted" style="margin:6px 0 0">Voting is open. Open the Gallery and tap the heart on the drawings you like.</p>` : ''}</div>`;
    const sel = $('#bdstatus', el); if (sel) sel.onchange = () => setStatus(sel.value);
    paintTools();
  }
  function paintTools() {
    const bd = O.bd, el = $('#bdtools'); if (!bd || !el) return;
    const show = bd.tab === 'draw', pen = O.pen, can = canDraw(), contest = bd.board.mode === 'contest';
    el.hidden = !show; if (!show) return;
    el.innerHTML = `<div class="tgrp"><button class="${pen.tool === 'pen' ? 'on' : ''}" data-o="tool" data-k="pen">${ic('pencil', 16)} Pen</button>${contest ? '' : `<button class="${pen.tool === 'note' ? 'on' : ''}" data-o="tool" data-k="note">${ic('sticky', 16)} Note</button>`}</div>
      <div class="swatches" role="group" aria-label="Colour">${PEN_COLORS.map(col => `<button class="sw ${pen.color === col ? 'on' : ''}" data-o="color" data-k="${col}" style="background:${col}" aria-label="Colour ${col}"></button>`).join('')}<input type="color" id="bdcol" value="${pen.color}" aria-label="Custom colour"></div>
      <div class="tgrp" role="group" aria-label="Brush size">${[[3, 'S'], [6, 'M'], [14, 'L']].map(([n, t]) => `<button class="${pen.size === n ? 'on' : ''}" data-o="size" data-k="${n}">${t}</button>`).join('')}</div>
      <span class="grow"></span>
      <button class="btn sm ghost" data-o="undo" ${can ? '' : 'disabled'}>${ic('undo', 14)} Undo</button>
      <button class="btn sm ghost" data-o="clearboard" ${can && (staff() || contest) ? '' : 'disabled'}>${ic('trash', 14)} Clear</button>
      ${contest ? '' : `<button class="btn sm ghost" data-o="ideas">Top ideas</button>`}
      <button class="btn sm ghost" data-o="savepng">${ic('download', 14)} Save</button>`;
    const cc = $('#bdcol', el); if (cc) cc.oninput = () => { pen.color = cc.value; pen.tool = 'pen'; el.querySelectorAll('.sw').forEach(s => s.classList.remove('on')); };
    $('#bdstage')?.classList.toggle('nodraw', !can); $('#bdcv')?.classList.toggle('notemode', pen.tool === 'note');
  }
  function paintNotes() {
    const bd = O.bd, el = $('#bdnotes'); if (!bd || !el) return;
    const ended = bd.board.status === 'ended';
    el.innerHTML = bd.board.mode === 'contest' ? '' : [...bd.items.values()].filter(i => i.kind === 'note').map(n => {
      const v = votesOf('note', n.id), mine = v.has(S.me.id), x = Math.min(.95, Math.max(.05, +n.data?.x || .5)) * 100, y = Math.min(.95, Math.max(.05, +n.data?.y || .5)) * 100;
      return `<div class="bnote" style="left:${x}%;top:${y}%;background:${NOTE_COLORS[n.data?.c] || NOTE_COLORS.yellow}" title="${esc(person(n.author_id))}"><div class="bnt">${esc(n.data?.t)}</div>
        <div class="bnf"><button class="bnv ${mine ? 'on' : ''}" data-o="votenote" data-id="${n.id}" ${ended ? 'disabled' : ''} aria-label="Vote for this idea" aria-pressed="${mine}">${ic('up', 13)} ${v.size}</button>
        ${(n.author_id === S.me.id || staff()) && !ended ? `<button class="bnx" data-o="delnote" data-id="${n.id}" aria-label="Delete note">${ic('x', 13)}</button>` : ''}</div></div>`;
    }).join('');
  }
  function paintGallery() {
    const bd = O.bd, el = $('#bdgal'); if (!bd || !el || bd.board?.mode !== 'contest') return;
    boardHeadSoon();
    if (bd.tab !== 'gallery') { el.hidden = true; return; } el.hidden = false;
    const ents = entries(), b = bd.board, reveal = b.status === 'ended' || staff();
    el.innerHTML = ents.length ? ents.map((e, i) => { const mine = e.uid === S.me.id, voted = votesOf('entry', e.uid).has(S.me.id);
      return `<figure class="gcard ${b.status === 'ended' && e.votes === ents[0].votes && e.votes > 0 ? 'win' : ''}"><button class="gthumb" data-o="zoom" data-u="${e.uid}" aria-label="Enlarge drawing"><canvas width="360" height="240" data-u="${e.uid}"></canvas></button>
        <figcaption><span class="t"><b>${mine ? 'Your drawing' : reveal ? esc(person(e.uid)) : 'Drawing ' + (i + 1)}</b>${mine && !reveal ? '' : ''}</span>
        ${b.status === 'voting' && !mine ? `<button class="vote ${voted ? 'on' : ''}" data-o="voteentry" data-u="${e.uid}" aria-pressed="${voted}" aria-label="Vote for this drawing">${ic('heart', 16)} ${e.votes}</button>` : `<span class="vcount">${ic('heart', 14)} ${e.votes}</span>`}</figcaption></figure>`; }).join('')
      : `<p class="muted">No drawings yet. ${b.status === 'open' ? 'Switch to My canvas and draw something!' : ''}</p>`;
    el.querySelectorAll('canvas').forEach(cv => paintInto(cv, ents.find(e => e.uid === cv.dataset.u)?.items || [], 360 / BW));
  }
  let hs = 0; const boardHeadSoon = () => { clearTimeout(hs); hs = setTimeout(boardHead, 100); };
  function zoomEntry(uid) {
    const items = itemsFor(uid); modal(uid === S.me.id ? 'Your drawing' : (O.bd.board.status === 'ended' || staff() ? person(uid) : 'Drawing'), `<canvas id="zc" width="${BW}" height="${BH}" class="zoomcv"></canvas>`, [{ label: 'Close', cls: 'ghost' }], bg => paintInto($('#zc', bg), items));
  }
  function renderBoardShell() {
    const pane = S.view === 'call', bd = O.bd, main = pane ? $('#wbpane') : $('#main'); if (!bd || !main || (S.view !== 'board' && !pane)) return;
    const b = bd.board, back = `<button class="ib" data-o="go" data-k="boards" aria-label="Back to boards">${ic('back')}</button>`;
    const bar = (title, withIcon) => pane
      ? `<div class="wbhead">${back}${withIcon ? `<span class="hashi">${ic('brush', 18)}</span>` : ''}<b class="title">${esc(title)}</b><span class="grow"></span><button class="ib" data-o="wbclose" title="Close whiteboard" aria-label="Close whiteboard">${ic('x', 18)}</button></div>`
      : `<div class="top">${menuBtn()}${back}${withIcon ? `<span class="hashi">${ic('brush', 20)}</span>` : ''}<b class="title">${esc(title)}</b></div>`;
    if (bd.loading || !b) { main.innerHTML = `${bar(b?.title || 'Board', false)}<div class="empty"><p>${bd.err ? esc(bd.err) : 'Loading…'}</p></div>`; if (!pane) bindMenu(); return; }
    const contest = b.mode === 'contest';
    main.innerHTML = `${bar(b.title, true)}
      <div class="bdwrap"><div id="bdhead"></div><div class="bdtools" id="bdtools"></div>
        <div class="bdstage" id="bdstage" ${contest && bd.tab === 'gallery' ? 'hidden' : ''}><div class="bdpaper"><canvas id="bdcv" width="${BW}" height="${BH}" aria-label="Drawing canvas"></canvas><div class="bdnotes" id="bdnotes"></div></div></div>
        ${contest ? '<div class="gal" id="bdgal" hidden></div>' : ''}</div>`;
    if (!pane) bindMenu(); boardHead(); bindCanvas($('#bdcv')); paintNotes(); redraw(); paintGallery();
    if (contest) { $('#bdstage').hidden = bd.tab !== 'draw'; }
  }

  /* ───────── formatting toolbar for the message box ───────── */
  const fmtOpen = () => lsGet('orbit-fmt') !== '0';
  const fmtBar = () => `<div class="fmtbar" id="fmt" role="toolbar" aria-label="Text formatting" ${fmtOpen() ? '' : 'hidden'}>
    <button type="button" data-f="b" title="Bold (Ctrl+B)" aria-label="Bold"><b>B</b></button><button type="button" data-f="i" title="Italic (Ctrl+I)" aria-label="Italic"><i>I</i></button>
    <button type="button" data-f="s" title="Strikethrough" aria-label="Strikethrough"><s>S</s></button><button type="button" data-f="code" title="Code" aria-label="Code">&lt;/&gt;</button>
    <button type="button" data-f="h" title="Heading (click again for a smaller one)" aria-label="Heading">H</button>
    <button type="button" data-f="color" title="Text colour" aria-label="Text colour"><span class="fa">A</span></button>
    <span class="grow"></span><button type="button" data-f="help" title="Formatting help" aria-label="Formatting help">?</button></div>`;
  const fmtToggle = () => `<button class="ib ${fmtOpen() ? 'on' : ''}" id="fmtb" title="Show or hide the formatting bar" aria-label="Formatting bar" aria-pressed="${fmtOpen()}">${ic('type')}</button>`;
  function bindFmt(ta) {
    const bar = $('#fmt'), tog = $('#fmtb'); if (!bar || !tog) return;
    const done = () => { ta.dispatchEvent(new Event('input')); ta.focus(); };
    const wrap = (open, close, ph = 'text') => { const s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e);
      ta.setRangeText(open + (sel || ph) + close, s, e, 'end'); ta.setSelectionRange(s + open.length, s + open.length + (sel || ph).length); done(); };
    const heading = () => { const s = ta.selectionStart, ls = ta.value.lastIndexOf('\n', s - 1) + 1, rest = ta.value.slice(ls), m = /^(#{1,3}) /.exec(rest), next = !m ? '# ' : m[1].length === 3 ? '' : '#'.repeat(m[1].length + 1) + ' ';
      ta.setRangeText(next, ls, ls + (m ? m[0].length : 0), 'preserve'); ta.setSelectionRange(s + next.length - (m ? m[0].length : 0), s + next.length - (m ? m[0].length : 0)); done(); };
    const color = btn => {
      const old = $('.fpop'); if (old) return old.remove();
      const pop = document.createElement('div'); pop.className = 'fpop';
      pop.innerHTML = TEXT_COLORS.map(n => `<button type="button" class="tc-sw tc-${n}" data-c="${n}" aria-label="${n}">A</button>`).join('') + `<label class="tc-custom" title="Custom colour"><input type="color" value="#ff8800" aria-label="Custom colour"></label>`;
      pop.onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; pop.remove(); wrap(`{${b.dataset.c}:`, '}'); };
      pop.querySelector('input').onchange = e => { pop.remove(); wrap(`{${e.target.value}:`, '}'); };
      $('.composer').append(pop);
      const off = ev => { if (!pop.isConnected) return document.removeEventListener('pointerdown', off); if (!pop.contains(ev.target) && !btn.contains(ev.target)) { pop.remove(); document.removeEventListener('pointerdown', off); } };
      setTimeout(() => document.addEventListener('pointerdown', off));
    };
    bar.onclick = e => { const b = e.target.closest('[data-f]'); if (!b) return; e.preventDefault(); const f = b.dataset.f;
      if (f === 'b') wrap('**', '**'); else if (f === 'i') wrap('*', '*'); else if (f === 's') wrap('~~', '~~');
      else if (f === 'code') { const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd); sel.includes('\n') ? wrap('```\n', '\n```') : wrap('`', '`', 'code'); }
      else if (f === 'h') heading(); else if (f === 'color') color(b); else if (f === 'help') fmtHelp(); };
    tog.onclick = () => { const on = !fmtOpen(); lsSet('orbit-fmt', on ? '1' : '0'); bar.hidden = !on; tog.classList.toggle('on', on); tog.setAttribute('aria-pressed', on); };
    ta.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'x') { e.preventDefault(); wrap('~~', '~~'); } });
  }
  function fmtHelp() {
    modal('Formatting', `<table class="fmthelp"><tbody>
      <tr><td><code>**bold**</code></td><td><b>bold</b></td></tr><tr><td><code>*italic*</code></td><td><i>italic</i></td></tr>
      <tr><td><code>~~strike~~</code></td><td><s>strike</s></td></tr><tr><td><code>\`code\`</code></td><td><code>code</code></td></tr>
      <tr><td><code>\`\`\`<br>a block<br>\`\`\`</code></td><td>a code block</td></tr>
      <tr><td><code># Heading</code><br><code>## Smaller</code></td><td><b style="font-size:1.15em">Heading</b></td></tr>
      <tr><td><code>{red:text}</code><br><code>{#ff8800:text}</code></td><td><span class="tc tc-red">red text</span><br><span class="tc" style="color:#ff8800">orange text</span></td></tr>
      <tr><td><code>||spoiler||</code></td><td>hidden until clicked</td></tr><tr><td><code>- item</code></td><td>bullet list</td></tr></tbody></table>
      <p class="muted" style="font-size:12px">Colours: ${TEXT_COLORS.join(', ')}, or any #hex colour.</p>`);
  }

  /* ───────── AI ───────── */
  async function aiCall(body) {
    const r = await sb.functions.invoke('orbit-ai', { body });
    if (r.error) {
      let msg = ''; try { const j = await r.error.context?.json?.(); msg = j?.error || j?.message || ''; } catch {}
      const m = msg || r.error.message || '';
      throw new Error(/not found|404|failed to send|NetworkError|Failed to fetch/i.test(m) ? 'The AI is not switched on yet. The site owner needs to deploy the orbit-ai function and add the API key.' : (m || 'The AI could not answer.'));
    }
    if (r.data?.error) throw new Error(r.data.error);
    return r.data;
  }
  async function rulesText() {
    if (O.ai.rules !== null) return O.ai.rules;
    const ch = S.chans.find(x => x.is_rules === true); O.ai.rules = '';
    if (ch) { const r = await sb.from('messages').select('content').eq('channel_id', ch.id).order('created_at').limit(40); if (!r.error) O.ai.rules = (r.data || []).map(m => m.content).filter(Boolean).join('\n').slice(0, 2500); }
    return O.ai.rules;
  }
  async function buildContext() {
    const L = [`Now: ${new Date().toLocaleString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`, `Community: ${S.sv?.name || 'Orbit'}${S.sv?.description ? ' (' + S.sv.description + ')' : ''}`, `Person asking: ${S.me.display_name}`];
    L.push('', 'Channels:', ...S.chans.filter(x => x.kind === 'text').map(x => `#${x.name}${x.description ? ' - ' + x.description : ''}`));
    const up = upcoming().slice(0, 12);
    L.push('', 'Upcoming events:', ...(up.length ? up.map(e => `- ${e.title} (${kindOf(e).label}) ${fmtWhen(e.starts_at)}${e.host_id ? ', host ' + person(e.host_id) : ''}${e.location ? ', where: ' + e.location : ''}, ${going(e).length} going${e.description ? '. ' + e.description.slice(0, 200) : ''}`) : ['(none scheduled)']));
    L.push('', 'Announcements:', ...(O.ann.length ? O.ann.slice(0, 6).map(a => `- ${a.pinned ? '[pinned] ' : ''}${a.title}${a.body ? ': ' + a.body.slice(0, 300) : ''}`) : ['(none)']));
    L.push('', 'Whiteboards:', ...(O.boards.length ? O.boards.map(b => `- ${b.title} (${b.mode === 'contest' ? 'art contest' : 'shared canvas'}, ${statusLabel(b)})`) : ['(none)']));
    const rules = await rulesText(); if (rules) L.push('', 'Server rules:', rules);
    return L.join('\n').slice(0, 9000);
  }
  const AI_CARDS = [
    ['dm', 'Give me a conversation starter', 'Break the ice in any channel'],
    ['calendar', 'What events are coming up?', 'See what is happening soon'],
    ['tag', 'What are the server rules?', 'A quick refresher'],
    ['sparkle', 'What can I do in Orbit?', 'A tour of the community'],
    ['hash', 'Which channel should I use to ask for help?', 'Find the right place']
  ];
  Object.assign(I, {
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    redo: '<polyline points="23 4 23 10 17 10"/><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10"/>'
  });
  const aiMotion = () => !(matchMedia('(prefers-reduced-motion: reduce)').matches && !document.documentElement.classList.contains('force-motion'));
  const aiOrb = (size, cls = '') => `<span class="aiorb2 ${cls}" style="--s:${size}px" aria-hidden="true"><i class="ring"></i><i class="core">${ic('sparkle', Math.round(size * .5))}</i><i class="sat s1"></i><i class="sat s2"></i></span>`;
  /* reveal an answer like it is being written: the text appears word by word inside the finished, formatted bubble */
  function aiType(el, done) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), nodes = [];
    for (let n; (n = walker.nextNode());) if (n.nodeValue.trim()) nodes.push({ n, t: n.nodeValue });
    const total = nodes.reduce((a, x) => a + x.t.length, 0); if (!total || !aiMotion()) return done?.();
    nodes.forEach(x => { x.n.nodeValue = ''; });
    const box = $('#aimsgs'), per = Math.max(2, Math.ceil(total / 90)); let shown = 0;
    el.classList.add('aityping');
    (function tick() {
      if (!el.isConnected) return;
      shown = Math.min(total, shown + per); let left = shown;
      for (const x of nodes) { const k = Math.max(0, Math.min(x.t.length, left)); x.n.nodeValue = x.t.slice(0, k); left -= k; }
      if (box && box.scrollHeight - box.scrollTop - box.clientHeight < 160) box.scrollTop = box.scrollHeight;
      if (shown < total) requestAnimationFrame(tick); else { el.classList.remove('aityping'); done?.(); }
    })();
  }
  function renderAI(main) {
    const a = O.ai, prev = $('#aiin'); if (prev) a.draft = prev.value;
    const fresh = a.fresh; a.fresh = null;   // only the newest message animates in; later redraws stay still
    const me = S.me, first = esc((me.display_name || '').split(' ')[0] || 'there');
    const lastA = (() => { for (let k = a.msgs.length - 1; k >= 0; k--) if (a.msgs[k].role === 'assistant') return k; return -1; })();
    const msg = (m, i) => m.role === 'user'
      ? `<div class="aim user${fresh === i ? ' new' : ''}"><div class="aib">${esc(m.text).replace(/\n/g, '<br>')}</div><span class="aiav">${av(me)}</span></div>`
      : `<div class="aim assistant${fresh === i ? ' new' : ''}">${aiOrb(30, 'sm')}<div class="aicol"><div class="aib ${m.err ? 'err' : ''}" data-ai="${i}">${md(m.text, 'ai' + i)}</div>
          <div class="aiact">${m.err ? '' : `<button class="aiact-b" data-o="aicopy" data-i="${i}" title="Copy answer" aria-label="Copy answer">${ic('copy', 14)}<span>Copy</span></button>`}${i === lastA && !a.busy ? `<button class="aiact-b" data-o="airetry" title="Try again" aria-label="Try again">${ic('redo', 14)}<span>${m.err ? 'Try again' : 'Regenerate'}</span></button>` : ''}</div></div></div>`;
    main.innerHTML = `<div class="top">${menuBtn()}<span class="hashi">${aiOrb(26, 'xs')}</span><b class="title">Ask Orbit AI</b><span class="aistat"><i></i>${a.busy ? 'Thinking' : 'Online'}</span><span class="grow"></span>${a.msgs.length ? `<button class="btn sm ghost" data-o="aiclear">${ic('plus', 14)} New chat</button>` : ''}</div>
      <div class="aiscreen"><div class="aiwrap"><div class="aimsgs" id="aimsgs" aria-live="polite">
        ${a.msgs.length ? a.msgs.map(msg).join('')
          : `<div class="aihello">${aiOrb(92, 'hero')}<h2>Hi ${first}! I'm <span class="aigrad">Orbit AI</span>.</h2><p class="muted">Ask me anything, get conversation starters, or find out what's going on: events, channels, rules.</p>
            <div class="aicards">${AI_CARDS.map(([k, t, sub], n) => `<button class="aicard" style="--n:${n}" data-o="aichip" data-t="${esc(t)}"><span class="aic-i">${ic(k, 18)}</span><span class="aic-t"><b>${esc(t)}</b><small>${esc(sub)}</small></span></button>`).join('')}</div></div>`}
        ${a.busy ? `<div class="aim assistant new">${aiOrb(30, 'sm busy')}<div class="aicol"><div class="aib thinking" role="status" aria-label="Orbit AI is thinking"><span class="aiwave"><i></i><i></i><i></i></span><span class="aishim">Thinking<span class="aistep s1"> about your question</span><span class="aistep s2"> with Orbit's info</span><span class="aistep s3"> and writing it up</span></span></div></div></div>` : ''}</div>
        <button class="aidown" id="aidown" type="button" title="Jump to the latest message" aria-label="Jump to the latest message" hidden>${ic('down', 18)}</button>
        <div class="aibox"><textarea id="aiin" rows="1" maxlength="1500" placeholder="Ask Orbit AI…" aria-label="Message Orbit AI"></textarea><span class="aicount" id="aicount" hidden></span><button class="send" id="aisend" title="Send" aria-label="Send" ${a.busy ? 'disabled' : ''}>${a.busy ? '<span class="aispin"></span>' : ic('send', 18)}</button></div>
        <p class="muted ainote">AI can make mistakes. Don't share private info. Your questions are sent to an AI service to get an answer.</p></div></div>`;
    bindMenu();
    const ta = $('#aiin'), box = $('#aimsgs'), send = $('#aisend'), cnt = $('#aicount'), down = $('#aidown');
    const fit = () => {
      ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
      const n = ta.value.length; cnt.hidden = n < 1200; cnt.textContent = (1500 - n).toLocaleString(); cnt.classList.toggle('low', n > 1440);
      send.classList.toggle('ready', !!ta.value.trim() && !a.busy);
    };
    ta.value = a.draft || ''; fit();
    ta.oninput = () => { a.draft = ta.value; fit(); };
    ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (ta.value.trim() && !a.busy) { const t = ta.value; a.draft = ''; aiSend(t); } } };
    send.onclick = () => { if (ta.value.trim() && !a.busy) { const t = ta.value; a.draft = ''; aiSend(t); } };
    const atEnd = () => box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.onscroll = () => { down.hidden = atEnd(); };
    down.onclick = () => box.scrollTo({ top: box.scrollHeight, behavior: aiMotion() ? 'smooth' : 'auto' });
    box.scrollTop = box.scrollHeight;
    if (fresh != null && a.msgs[fresh]?.role === 'assistant') { const b = box.querySelector(`.aib[data-ai="${fresh}"]`); const act = b?.parentElement.querySelector('.aiact'); if (b && !a.msgs[fresh].err) { act?.classList.add('wait'); aiType(b, () => act?.classList.remove('wait')); } }
    if (innerWidth > 700 && !a.busy) ta.focus();
  }
  async function aiSend(text) {
    const a = O.ai; text = (text || '').trim(); if (!text || a.busy) return;
    a.msgs.push({ role: 'user', text }); a.fresh = a.msgs.length - 1; a.busy = true; if (S.view === 'ai') c.renderMain();
    try {
      const r = await aiCall({ mode: 'chat', messages: a.msgs.filter(m => !m.err).slice(-12).map(m => ({ role: m.role, text: m.text })), context: await buildContext() });
      a.msgs.push({ role: 'assistant', text: r.text || 'I could not think of an answer.' });
    } catch (e) { a.msgs.push({ role: 'assistant', text: e.message, err: true }); }
    a.busy = false; a.fresh = a.msgs.length - 1; if (S.view === 'ai') c.renderMain();
  }
  function aiRetry() {
    const a = O.ai; if (a.busy) return;
    while (a.msgs.length && a.msgs[a.msgs.length - 1].role === 'assistant') a.msgs.pop();
    const u = a.msgs.pop(); if (u?.role === 'user') aiSend(u.text); else c.renderMain();
  }
  const aiOk = () => S.view === 'server' && S.ch && S.ch.kind === 'text' && !S.ch.is_private && !S.ch.is_rules;
  const logLine = m => `[${new Date(m.created_at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}] ${person(m.author_id)}: ${String(c.plain(m.content || '')).replace(/\s+/g, ' ').slice(0, 500)}`;
  async function summaryModal() {
    const ch = S.ch; if (!ch || !aiOk()) return;
    const lastRead = S.readMark;
    modal(`Catch up on #${ch.name}`, `<p class="muted" style="margin-top:0">Orbit AI reads the recent messages and writes a short summary. Messages from this channel are sent to an AI service to do this.</p>
      <label class="lbl2">What to summarize</label><select id="sm-r">${lastRead ? '<option value="unread">Since I last read this channel</option>' : ''}<option value="50">The last 50 messages</option><option value="200">The last 200 messages</option><option value="day">The last 24 hours</option></select>
      <div class="aiout" id="sm-out" hidden></div><div class="actions2" id="sm-act" hidden><button class="btn sm ghost" id="sm-copy">Copy</button><button class="btn sm ghost" id="sm-post">Post in #${esc(ch.name)}</button></div>`,
      [{ label: 'Close', cls: 'ghost' }, { label: 'Summarize', fn: async bg => {
        const out = $('#sm-out', bg), btn = [...bg.querySelectorAll('.actions .btn')].pop(), range = $('#sm-r', bg).value;
        btn.disabled = true; btn.textContent = 'Reading…'; out.hidden = false; out.className = 'aiout'; out.textContent = 'Reading the chat…'; $('#sm-act', bg).hidden = true;
        try {
          let q = sb.from('messages').select('author_id,content,created_at').eq('channel_id', ch.id).order('created_at', { ascending: false });
          if (range === 'unread') q = q.gt('created_at', lastRead).limit(300); else if (range === 'day') q = q.gte('created_at', new Date(Date.now() - 864e5).toISOString()).limit(300); else q = q.limit(+range);
          const r = await q; if (r.error) throw r.error;
          const rows = (r.data || []).reverse().filter(m => (m.content || '').trim());
          if (rows.length < 3) { out.className = 'aiout err'; out.textContent = 'There are not enough messages to summarize.'; return false; }
          await c.needProfiles([...new Set(rows.map(m => m.author_id))]);
          let log = rows.map(logLine).join('\n'); if (log.length > 28000) log = log.slice(-28000);
          const res = await aiCall({ mode: 'summary', channel: ch.name, span: `${new Date(rows[0].created_at).toLocaleString()} to ${new Date(rows[rows.length - 1].created_at).toLocaleString()} (${rows.length} messages)`, log });
          out.innerHTML = c.md(res.text || '', 'sum'); out.dataset.t = res.text || ''; $('#sm-act', bg).hidden = false;
          $('#sm-copy', bg).onclick = () => navigator.clipboard?.writeText(out.dataset.t).then(() => toast('Copied.'), () => toast('Could not copy.', true));
          $('#sm-post', bg).onclick = () => { const ta = $('#in'); if (!ta) return; ta.value = `**Catch-up summary (AI)**\n${out.dataset.t}`.slice(0, 4000); c.send(); bg.querySelector('.actions .btn')?.click(); };
        } catch (e) { out.className = 'aiout err'; out.textContent = e.message || 'The AI could not answer.'; }
        finally { btn.disabled = false; btn.textContent = 'Summarize'; }
        return false;
      } }]);
  }
  async function startersModal(ta) {
    const ch = S.ch; if (!ch || !aiOk()) return;
    modal('Conversation starters', `<div id="st-out"><p class="muted">Thinking of some ideas…</p></div>`, [{ label: 'Close', cls: 'ghost' }, { label: 'More ideas', cls: 'ghost', fn: bg => { load2(bg); return false; } }], bg => load2(bg));
    async function load2(bg) {
      const out = $('#st-out', bg); out.innerHTML = '<p class="muted">Thinking of some ideas…</p>';
      try {
        const rows = S.list.slice(-15).filter(m => (m.content || '').trim() && !m.pending);
        await c.needProfiles([...new Set(rows.map(m => m.author_id))]);
        const log = rows.length ? rows.map(logLine).join('\n') : '(quiet channel, no recent messages yet)';
        const r = await aiCall({ mode: 'starters', channel: ch.name, description: ch.description || '', log });
        const list = r.starters || []; if (!list.length) throw new Error('No ideas this time. Try again.');
        out.innerHTML = `<div class="starters">${list.map(t => `<button class="startr" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div><p class="muted" style="font-size:12px">Tap one to put it in your message box.</p>`;
        out.onclick = e => { const b = e.target.closest('.startr'); if (!b) return; const t = $('#in') || ta; t.value = b.dataset.t; t.dispatchEvent(new Event('input')); t.focus(); bg.querySelector('.actions .btn')?.click(); };
      } catch (e) { out.innerHTML = `<p class="muted">${esc(e.message || 'The AI could not answer.')}</p>`; }
    }
  }
  const headBtn = () => aiOk() ? `<button class="ib" id="sum" title="Catch up: AI summary of this channel" aria-label="Summarize this channel">${ic('sparkle')}</button>` : '';
  const bindHead = () => { const b = $('#sum'); if (b) b.onclick = summaryModal; };
  const aiBtn = () => aiOk() ? `<button class="ib" id="aist" title="Conversation starters (AI)" aria-label="Conversation starters">${ic('sparkle')}</button>` : '';
  const bindAiBtn = ta => { const b = $('#aist'); if (b) b.onclick = () => startersModal(ta); };

  /* ───────── whiteboard inside a voice call ───────── */
  function wbRender() {
    const pane = $('#wbpane'); if (!pane || S.view !== 'call' || !O.wb) return;
    if (O.bd) renderBoardShell(); else renderBoards(pane);
  }
  function wbMount() {
    const body = $('#callbody'), pane = $('#wbpane'), main = $('#main'); if (!body || !pane || !main) return;
    if (!main.__orbit) { main.__orbit = true; main.addEventListener('click', onMainClick); }
    body.classList.toggle('wb-open', !!O.wb); pane.hidden = !O.wb;
    if (!O.wb) { pane.innerHTML = ''; return; }
    if (!O.loaded && !O.loading) load().then(repaint);
    wbRender();
  }
  function wbToggle() { O.wb = !O.wb; if (!O.wb) closeBoard(); wbMount(); }

  /* ───────── clicks ───────── */
  function act(b) {
    const k = b.dataset.o, id = b.dataset.id, d = b.dataset;
    switch (k) {
      case 'go': return go(d.k);
      case 'wbclose': O.wb = false; closeBoard(); return wbMount();
      case 'event': return openEvent(id);
      case 'newann': return announcementModal(null, d.home === '1');
      case 'editann': return announcementModal(O.ann.find(x => x.id === id));
      case 'delann': return delAnnouncement(id);
      case 'pinann': return pinAnnouncement(id);
      case 'newevent': return eventForm(null, O.ev.day);
      case 'editevent': return eventForm(O.events.find(e => e.id === id));
      case 'delevent': return delEvent(id);
      case 'rsvp': return rsvp(id, d.s);
      case 'ics': { const e = O.events.find(x => x.id === id); return e && downloadIcs(e); }
      case 'guide': return c.chooseGuide();
      case 'prof': return c.profileModal(id);
      case 'evtab': O.ev.tab = d.k; O.ev.day = null; return c.renderMain();
      case 'clearday': O.ev.day = null; return c.renderMain();
      case 'day': O.ev.day = d.k; O.ev.tab = 'upcoming'; if (S.view !== 'events') return c.navTo('events'); return c.renderMain();
      case 'bcal': { const m = O.bigCal; if (d.d === '0') { const n = new Date(); m.y = n.getFullYear(); m.m = n.getMonth(); } else { const x = new Date(m.y, m.m + +d.d, 1); m.y = x.getFullYear(); m.m = x.getMonth(); } return c.renderMain(); }
      case 'scal': { const x = new Date(O.cal.y, O.cal.m + +d.d, 1); O.cal.y = x.getFullYear(); O.cal.m = x.getMonth(); return c.renderSide(); }
      case 'calt': O.calOpen = !O.calOpen; lsSet('orbit-cal', O.calOpen ? '1' : '0'); if (O.calOpen && !O.loaded) load().then(repaint); return c.renderSide();
      case 'newboard': return boardForm();
      case 'board': return openBoard(id);
      case 'delboard': return delBoard();
      case 'bdtab': O.bd.tab = d.k; return renderBoardShell();
      case 'tool': O.pen.tool = d.k; return paintTools();
      case 'color': O.pen.color = d.k; O.pen.tool = 'pen'; return paintTools();
      case 'size': O.pen.size = +d.k; return paintTools();
      case 'undo': return undo();
      case 'clearboard': return clearBoard();
      case 'ideas': return ideasModal();
      case 'savepng': return savePng();
      case 'votenote': return voteNote(id);
      case 'delnote': return delNote(id);
      case 'voteentry': return voteEntry(d.u);
      case 'zoom': return zoomEntry(d.u);
      case 'aichip': return aiSend(d.t);
      case 'aiclear': O.ai.msgs = []; O.ai.draft = ''; return c.renderMain();
      case 'airetry': return aiRetry();
      case 'aicopy': { const m = O.ai.msgs[+d.i]; if (!m) return; return navigator.clipboard?.writeText(m.text).then(() => { b.classList.add('ok'); b.querySelector('span').textContent = 'Copied'; setTimeout(() => { b.classList.remove('ok'); b.querySelector('span') && (b.querySelector('span').textContent = 'Copy'); }, 1600); }, () => toast('Could not copy.', true)); }
    }
  }
  function onMainClick(e) { const b = e.target.closest('[data-o]'); if (b && $('#main').contains(b)) act(b); }

  /* ───────── hooks for app.js ───────── */
  function render(main) {
    if (!main.__orbit) { main.__orbit = true; main.addEventListener('click', onMainClick); }
    switch (S.view) {
      case 'home': return renderHome(main);
      case 'events': return renderEvents(main);
      case 'event': return renderEvent(main);
      case 'boards': return renderBoards(main);
      case 'board': return O.bd ? renderBoardShell() : (S.view = 'boards', renderBoards(main));
      case 'ai': return renderAI(main);
    }
  }
  const VIEWS = ['events', 'event', 'boards', 'board', 'ai'];
  return {
    VIEWS, render, start, stop, gameOpen: on => ambient.setGameOpen(on), bindSide, sideCal, headBtn, bindHead, aiBtn, bindAiBtn, fmtBar, fmtToggle, bindFmt,
    handles: v => v === 'home' || VIEWS.includes(v),
    refreshFloaters: () => { const p = document.querySelector('.orbithome'); if (p && S.view === 'home') mountFloaters(p, c.collectibles ? c.collectibles() : []); },
    onView(v) { if (v !== 'home') { ambient.detach(); drift.detach(); if (O.vid) O.vid.pause(); } if (v !== 'board' && !(v === 'call' && O.wb) && O.bd) closeBoard(); if (v !== 'call') O.wb = false; if (v === 'home' && O.lastView !== 'home') O.homeAt = performance.now(); O.lastView = v; },
    wbToggle, wbMount, wbIsOpen: () => !!O.wb,
    onNav(k) { if (k === 'events' || k === 'boards' || k === 'home') load().then(repaint); },
    load: () => load(),
  };
}
