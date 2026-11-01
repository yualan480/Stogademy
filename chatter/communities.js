/* Orbit Communities, kept apart from app.js.
   Discovery page (search, category filters, featured + popular communities, trending, invitations, events)
   and a page per community (discussions, events, media, updates).
   app.js hands over what this needs through initCommunities(ctx) and calls the hooks that come back. */

const CATS = [
  ['all', 'All', 'users'],
  ['gaming', 'Gaming', 'gamepad'],
  ['anime', 'Anime & Manga', 'smile'],
  ['art', 'Art & Design', 'brush'],
  ['music', 'Music', 'music'],
  ['tech', 'Science & Tech', 'atom'],
];
const MORE = [['other', 'Other', 'compass'], ['joined', 'My communities', 'check']];
const COLORS = ['#4c6fff', '#a855f7', '#ec4899', '#ef4444', '#f59e0b', '#3ea74f', '#06b6d4', '#38bdf8'];
const EMOJI = ['🌐', '🎮', '🎨', '🎵', '🔬', '📷', '⚽', '📚', '🌸', '🚀', '🐾', '🍕'];
const TABS = [['discussions', 'Discussions', 'msg'], ['events', 'Events', 'calendar'], ['media', 'Media', 'image'], ['updates', 'Updates', 'megaphone']];
const LS = k => { try { return localStorage.getItem(k); } catch { return null; } };

export function initCommunities(c) {
  const { S, sb, $, esc, ic, I, modal, toast, confirmBox, prof, av, menuBtn, bindMenu } = c;

  Object.assign(I, {
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>',
    trend: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    verified: '<path d="M12 2l2.4 2.1 3.2-.3 1 3 2.8 1.6-.9 3.1.9 3.1-2.8 1.6-1 3-3.2-.3L12 22l-2.4-2.1-3.2.3-1-3L2.6 15.6l.9-3.1-.9-3.1 2.8-1.6 1-3 3.2.3z"/><polyline points="8.5 12 11 14.5 15.5 9.5"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    atom: '<circle cx="12" cy="12" r="1.5"/><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/>',
    plusC: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
  });

  /* ───────── state ───────── */
  const C = {
    list: [], mine: new Map(), week: new Map(), invites: [], events: [], loaded: false, loading: null, err: '',
    q: '', cat: 'all', more: false, showAll: false, admin: false,
    id: null, tab: 'discussions', d: null, open: null, ch: null,
  };
  const isStaff = () => c.isStaff();
  const get = id => C.list.find(x => x.id === id);
  const myRole = id => C.mine.get(id) || '';
  const isMgr = id => ['owner', 'moderator'].includes(myRole(id)) || isStaff();
  /* who can edit or delete a community: its owner, or Orbit staff (owner, admins, moderators) the same way they run tournaments */
  const canEdit = id => myRole(id) === 'owner' || isStaff();
  const setupErr = e => /schema cache|does not exist|PGRST20[45]|42P01|42883|Could not find the function/i.test(e?.message || e?.code || '')
    ? 'Communities are not set up yet. Run migration-communities.sql in the Supabase SQL Editor, then reload.' : (e?.message || 'Something went wrong.');
  const fail = e => toast(setupErr(e), true);

  /* ───────── formatting ───────── */
  const num = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K' : String(n);
  const members = n => `${num(n)} member${n === 1 ? '' : 's'}`;
  const ago = iso => {
    const s = Math.max(1, Math.round((Date.now() - +new Date(iso)) / 1e3));
    if (s < 60) return 'just now'; const m = Math.round(s / 60); if (m < 60) return m + 'm ago';
    const h = Math.round(m / 60); if (h < 24) return h + 'h ago'; const d = Math.round(h / 24);
    return d < 30 ? d + 'd ago' : new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };
  const when = iso => {
    const x = new Date(iso), n = new Date(), t = x.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const key = d => d.toDateString();
    if (key(x) === key(n)) return (x.getHours() >= 17 ? 'Tonight' : 'Today') + ' • ' + t;
    if (key(x) === key(new Date(+n + 864e5))) return 'Tomorrow • ' + t;
    return x.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ' • ' + t;
  };
  const text = s => esc(s).replace(/\n/g, '<br>');
  const toLocalInput = d => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

  const icon = x => `<span class="cmicon" style="--cc:${esc(x.color)}" aria-hidden="true"><b>${esc(x.icon)}</b></span>`;
  const badge = x => x.verified ? `<span class="cmver" title="Verified community" aria-label="Verified">${ic('verified', 15)}</span>` : '';
  const tags = x => (x.tags || []).length ? `<div class="cmtags">${x.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : '';
  const joinBtn = (x, cls = '') => myRole(x.id)
    ? `<button class="cmjoin on ${cls}" data-cm="open" data-id="${x.id}">${ic('check', 15)}<span>Joined</span></button>`
    : `<button class="cmjoin ${cls}" data-cm="join" data-id="${x.id}"><span>Join</span></button>`;

  /* ───────── loading ───────── */
  async function load(force) {
    if (C.loading && !force) return C.loading;
    C.loading = (async () => {
      const nowIso = new Date().toISOString();
      const [a, m, w, i, e] = await Promise.all([
        sb.from('communities').select('*').order('member_count', { ascending: false }).limit(300),
        sb.from('community_members').select('community_id, role').eq('user_id', S.me.id),
        sb.rpc('community_week_joins'),
        sb.from('community_invites').select('*').eq('invited_user', S.me.id).order('created_at', { ascending: false }).limit(20),
        sb.from('community_events').select('*, rsvps:community_event_rsvps(user_id)').gte('starts_at', new Date(Date.now() - 36e5).toISOString()).order('starts_at').limit(40),
      ]);
      const bad = a.error || m.error || i.error || e.error;
      if (bad) { C.err = setupErr(bad); C.loaded = true; return; }
      C.err = ''; C.list = a.data || [];
      C.mine = new Map((m.data || []).map(r => [r.community_id, r.role]));
      C.week = new Map((w.data || []).map(r => [r.community_id, Number(r.joins)]));
      C.invites = (i.data || []).filter(x => get(x.community_id));
      C.events = (e.data || []).filter(x => get(x.community_id));
      C.loaded = true;
      await c.needProfiles(C.invites.map(x => x.invited_by).filter(Boolean));
    })().finally(() => { C.loading = null; });
    return C.loading;
  }
  async function loadDetail() {
    const id = C.id; if (!id) return;
    const [p, e, m] = await Promise.all([
      sb.from('community_posts').select('*, replies:community_replies(count)').eq('community_id', id).order('created_at', { ascending: false }).limit(100),
      sb.from('community_events').select('*, rsvps:community_event_rsvps(user_id)').eq('community_id', id).gte('starts_at', new Date(Date.now() - 864e5).toISOString()).order('starts_at').limit(50),
      sb.from('community_members').select('user_id, role').eq('community_id', id).order('joined_at').limit(60),
    ]);
    if (id !== C.id) return;
    const bad = p.error || e.error || m.error;
    const prev = C.d || {};
    C.d = { posts: p.data || [], events: e.data || [], mem: m.data || [], replies: prev.replies || {}, err: bad ? setupErr(bad) : '', loaded: true };
    await c.needProfiles([...C.d.posts.map(x => x.author_id), ...C.d.mem.map(x => x.user_id)].filter(Boolean));
    if (C.open) await loadReplies(C.open, true);
  }
  async function loadReplies(pid, quiet) {
    const { data, error } = await sb.from('community_replies').select('*').eq('post_id', pid).order('created_at').limit(200);
    if (error) return quiet ? 0 : fail(error);
    C.d.replies[pid] = data || [];
    await c.needProfiles((data || []).map(x => x.author_id).filter(Boolean));
  }

  /* ───────── live updates ───────── */
  let reloadT = 0;
  const reloadSoon = () => {
    clearTimeout(reloadT);
    reloadT = setTimeout(async () => {
      if (!S.me) return;
      await load(true);
      if (S.view === 'community') { await loadDetail(); paintDetail(); }
      else if (S.view === 'communities') paintPage();
      else c.renderSide();
    }, 300);
  };
  function start() {
    stop();
    load().then(() => { if (S.view === 'communities') paintPage(); });
    C.ch = sb.channel('orbit-communities');
    ['communities', 'community_members', 'community_posts', 'community_replies', 'community_events', 'community_event_rsvps', 'community_invites']
      .forEach(t => C.ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, reloadSoon));
    C.ch.subscribe();
  }
  function stop() {
    clearTimeout(reloadT); if (C.ch) { sb.removeChannel(C.ch); C.ch = null; }
    Object.assign(C, { list: [], mine: new Map(), week: new Map(), invites: [], events: [], loaded: false, loading: null, err: '', q: '', cat: 'all', more: false, showAll: false, admin: false, id: null, tab: 'discussions', d: null, open: null });
  }

  /* ───────── actions ───────── */
  async function join(id) {
    const x = get(id); if (!x || myRole(id)) return;
    C.mine.set(id, 'member'); x.member_count++; C.invites = C.invites.filter(i => i.community_id !== id); refresh();
    const r = await sb.rpc('join_community', { p_id: id });
    if (r.error) { C.mine.delete(id); x.member_count = Math.max(0, x.member_count - 1); refresh(); fail(r.error); }
    else toast('Joined ' + x.name);
  }
  function leave(id) {
    const x = get(id); if (!x) return;
    confirmBox('Leave community?', `You will stop seeing ${x.name} in your communities. You can join again any time.`, 'Leave', async () => {
      const r = await sb.rpc('leave_community', { p_id: id });
      if (r.error) { fail(r.error); return false; }
      toast('Left ' + x.name); await load(true);
      if (!get(id)) return back();
      await loadDetail(); refresh();
    });
  }
  const refresh = () => { if (S.view === 'community') paintDetail(); else paintPage(); c.renderSide(); };
  function back() { C.id = null; C.d = null; C.open = null; c.navTo('communities'); }
  function openCommunity(id, tab) {
    if (!get(id)) return;
    C.id = id; C.tab = tab || 'discussions'; C.d = null; C.open = null;
    c.navTo('community'); loadDetail().then(() => S.view === 'community' && paintDetail());
  }
  async function declineInvite(id) {
    C.invites = C.invites.filter(i => i.id !== id); paintPage();
    const r = await sb.from('community_invites').delete().eq('id', id); if (r.error) { fail(r.error); await load(true); paintPage(); }
  }

  /* ───────── discovery page ───────── */
  function visible() {
    const q = C.q.trim().toLowerCase();
    return C.list.filter(x => {
      if (C.cat === 'joined' ? !myRole(x.id) : C.cat !== 'all' && x.category !== C.cat) return false;
      return !q || [x.name, x.description, ...(x.tags || [])].some(s => String(s).toLowerCase().includes(q));
    });
  }
  const trending = () => [...C.list].sort((a, b) => (C.week.get(b.id) || 0) - (C.week.get(a.id) || 0) || b.member_count - a.member_count).slice(0, 5);
  function featCard(x) {
    return `<article class="cmfeat" style="--cc:${esc(x.color)}" data-cm="open" data-id="${x.id}" tabindex="0" role="link" aria-label="${esc(x.name)}">
      <div class="cmbanner"><span class="cmbg">${esc(x.icon)}</span></div>
      <div class="cmfbody"><div class="cmfhead">${icon(x)}<div class="cmft"><b>${esc(x.name)}${badge(x)}</b><small>${ic('users', 12)} ${members(x.member_count)}</small></div></div>
      <p>${esc(x.description)}</p>${tags(x)}${joinBtn(x, 'wide')}</div></article>`;
  }
  function popRow(x) {
    return `<button class="cmpop" data-cm="open" data-id="${x.id}" style="--cc:${esc(x.color)}">${icon(x)}<span class="t"><b>${esc(x.name)}${badge(x)}</b><small>${members(x.member_count)}</small><em>${esc(x.description)}</em></span>
      ${myRole(x.id) ? `<span class="cmin">${ic('check', 13)}Joined</span>` : ''}${ic('chevR', 18)}</button>`;
  }
  const heroHtml = tot => `<section class="cmhero"><div class="cmplanet" aria-hidden="true"><i></i></div><div class="cmhicon">${ic('users', 38)}</div>
      <div class="cmhtext"><h1>Communities</h1><p>Find your people. Share your interests. Build something great.</p>
      <div class="cmstats"><span>${ic('compass', 16)}${C.list.length.toLocaleString()} Communities</span><span>${ic('users', 16)}${num(tot)} Members</span><span>${ic('clock', 16)}Always Active</span></div>${isStaff() ? `<button class="cmjoin ghost cmadmbtn" data-cm="admin">${ic('shield', 15)}<span>${C.admin ? 'Back to browse' : 'Admin dashboard'}</span></button>` : ''}</div></section>`;
  function centerHtml() {
    if (C.err) return `<div class="cmempty"><h2>Communities aren’t ready yet</h2><p>${esc(C.err)}</p></div>`;
    if (!C.loaded) return `<div class="cmempty"><div class="cmspin" aria-hidden="true"></div><p>Loading communities…</p></div>`;
    const tot = C.list.reduce((n, x) => n + x.member_count, 0), vis = visible(), filtering = C.q.trim() || C.cat !== 'all';
    if (C.admin && isStaff()) return heroHtml(tot) + adminHtml();
    const feat = [...vis].sort((a, b) => Number(b.verified) - Number(a.verified) || b.member_count - a.member_count).slice(0, 4);
    const pop = C.showAll ? vis : vis.slice(0, 8);
    const cats = [...CATS, ...(C.more ? MORE : [])];
    return `${heroHtml(tot)}
    <nav class="cmcats" aria-label="Categories">${cats.map(([k, l, i]) => `<button class="cmcat ${C.cat === k ? 'on' : ''}" data-cm="cat" data-k="${k}" aria-pressed="${C.cat === k}">${ic(i, 16)}<span>${l}</span></button>`).join('')}
      ${C.more ? '' : `<button class="cmcat more" data-cm="more"><span>More</span>${ic('chev', 14)}</button>`}</nav>
    ${vis.length ? `<section><div class="cmsh"><h2>${ic('sparkle', 20)} ${filtering ? 'Results' : 'Featured Communities'}</h2></div><div class="cmgrid">${feat.map(featCard).join('')}</div></section>
    <section><div class="cmsh"><h2 class="pop">${ic('trend', 20)} Popular Communities</h2>${vis.length > 8 ? `<button class="cmlink" data-cm="all">${C.showAll ? 'Show less' : 'View All'} ${ic('arrow', 14)}</button>` : ''}</div><div class="cmpops">${pop.map(popRow).join('')}</div></section>`
      : `<div class="cmempty">${C.cat === 'joined' ? `<h2>You haven’t joined any communities yet</h2><p>Browse the categories above and tap Join on anything that looks fun.</p>` : `<h2>No communities found</h2><p>${filtering ? 'Try a different search or category, or ' : 'Be the first to '}start your own.</p>`}<button class="cmjoin wide" data-cm="create"><span>Create community</span></button></div>`}`;
  }
  function sideHtml() {
    if (!C.loaded || C.err) return '';
    const tr = trending(), up = C.events.slice(0, 3), inv = C.invites;
    const rank = (x, i) => `<button class="cmtr" data-cm="open" data-id="${x.id}" style="--cc:${esc(x.color)}"><i class="n">${i + 1}</i>${icon(x)}<span class="t"><b>${esc(x.name)}</b><small>${ic('users', 11)} ${members(x.member_count)}</small></span><span class="up">${ic('trend', 14)}</span></button>`;
    return `<section class="cmbox"><div class="cmboxh"><h3>${ic('trend', 18)} Trending Now</h3></div>${tr.length ? tr.map(rank).join('') : '<p class="cmnote">Nothing trending yet.</p>'}</section>
    <section class="cmbox"><div class="cmboxh"><h3>${ic('userPlus', 18)} Invitations${inv.length ? `<span class="cmbadge">${inv.length}</span>` : ''}</h3></div>
      ${inv.length ? inv.map(i => { const x = get(i.community_id); return `<div class="cminv" style="--cc:${esc(x.color)}">${icon(x)}<span class="t"><b>${esc(x.name)}</b><small>${i.invited_by ? 'from ' + esc(prof(i.invited_by).display_name) : 'Invited'}</small></span>
        <button class="cmmini" data-cm="accept" data-id="${x.id}" aria-label="Accept invitation to ${esc(x.name)}">${ic('check', 15)}</button><button class="cmmini ghost" data-cm="decline" data-id="${i.id}" aria-label="Decline invitation">${ic('x', 15)}</button></div>`; }).join('') : '<p class="cmnote">No pending invitations. When a friend invites you, it shows up here.</p>'}</section>
    <section class="cmbox"><div class="cmboxh"><h3>${ic('sparkle', 18)} Quick Actions</h3></div><div class="cmqa">
      <button data-cm="create">${ic('users', 24)}<span>Create Community</span></button>
      <button data-cm="browse">${ic('compass', 24)}<span>Browse Communities</span></button>
      <button data-cm="joinev">${ic('calendar', 24)}<span>Join Event</span></button>
      <button class="w2" data-cm="friends">${ic('users', 24)}<span>Find Friends</span></button>
      <button class="w2" data-cm="invite">${ic('userPlus', 24)}<span>Invite Friends</span></button></div></section>
    <section class="cmbuild"><div class="cmbp" aria-hidden="true"><i></i></div><div><h3>Build Your Community</h3><p>Create a space for your friends, ideas, and passions.</p></div><button class="cmjoin wide" data-cm="create"><span>Create Community</span>${ic('arrow', 15)}</button></section>
    <section class="cmbox"><div class="cmboxh"><h3>${ic('calendar', 18)} Upcoming Events</h3></div>
      ${up.length ? up.map(e => { const x = get(e.community_id); return `<button class="cmev" data-cm="event" data-id="${x.id}"><span class="cmevi">${ic('calendar', 22)}</span><span class="t"><small>${esc(x.name)}</small><b>${esc(e.title)}</b><em>${esc(when(e.starts_at))}</em></span>${ic('arrow', 15)}</button>`; }).join('') : '<p class="cmnote">No community events scheduled. Hosts can add them from a community’s Events tab.</p>'}</section>`;
  }
  function paintPage() {
    const main = $('#main'); if (!main || S.view !== 'communities') return;
    const a = main.querySelector('#cmcenter'), b = main.querySelector('#cmside'); if (!a || !b) return renderPage(main);
    a.innerHTML = centerHtml(); b.innerHTML = sideHtml();
  }
  function renderPage(main) {
    const enter = !main.querySelector('.cmpage');
    main.innerHTML = `<div class="top cmtop">${menuBtn()}<label class="cmsearch">${ic('search', 18)}<input id="cmq" type="text" value="${esc(C.q)}" placeholder="Search communities, topics, or keywords…" autocomplete="off" spellcheck="false" aria-label="Search communities"></label><span class="grow"></span>
      <button class="otb" data-cm="friends" aria-label="Friends">${ic('friends', 20)}${(S.incoming || []).length ? '<i class="otbdot"></i>' : ''}</button>
      <button class="otb" data-cm="inv" aria-label="Invitations${C.invites.length ? ' (' + C.invites.length + ')' : ''}">${ic('bell', 20)}${C.invites.length ? '<i class="otbdot"></i>' : ''}</button>
      <button class="otb oav" data-cm="me" aria-label="Your profile">${av(S.me)}</button></div>
    <div class="panel cmpage${enter ? ' cmenter' : ''}"><div class="cmcols"><div class="cmcenter" id="cmcenter">${centerHtml()}</div><aside class="cmside" id="cmside" aria-label="Trending, invitations and events">${sideHtml()}</aside></div></div>`;
    bindMenu(); bindMain(main);
    const q = $('#cmq', main);
    q.oninput = () => { C.q = q.value; const a = main.querySelector('#cmcenter'); if (a) a.innerHTML = centerHtml(); };
    if (!C.loaded) load().then(paintPage);
  }

  /* ───────── community page ───────── */
  const mediaPosts = () => (C.d?.posts || []).filter(p => p.kind === 'media');
  function headHtml(x) {
    const mem = C.d?.mem || [], role = myRole(x.id);
    return `<section class="cmdh" style="--cc:${esc(x.color)}"><div class="cmdbanner"><span class="cmbg">${esc(x.icon)}</span></div>
      <div class="cmdbody"><div class="cmdtop">${icon(x)}<div class="cmdt"><h1>${esc(x.name)}${badge(x)}</h1><p>${esc(x.description) || 'A community on Orbit.'}</p>
      <div class="cmmeta"><span>${ic('users', 14)} ${members(x.member_count)}</span>${role === 'owner' ? '<span class="own">Owner</span>' : role === 'moderator' ? '<span class="own">Moderator</span>' : ''}</div>${tags(x)}</div>
      <div class="cmdact">${mem.length ? `<div class="cmface" aria-label="Some members">${mem.slice(0, 5).map(m => `<span data-cm="prof" data-u="${m.user_id}">${av(prof(m.user_id))}</span>`).join('')}</div>` : ''}
      ${isMgr(x.id) ? `<button class="cmjoin ghost" data-cm="manage" data-id="${x.id}">${ic('settings', 15)}<span>Manage</span></button>` : ''}${role ? `<button class="cmjoin ghost" data-cm="invite1" data-id="${x.id}">${ic('userPlus', 15)}<span>Invite</span></button><button class="cmjoin on" data-cm="leave" data-id="${x.id}" title="Leave community">${ic('check', 15)}<span>Joined</span></button>` : `<button class="cmjoin" data-cm="join" data-id="${x.id}"><span>Join community</span></button>`}</div></div></div></section>
    <nav class="cmtabs" aria-label="Community sections">${TABS.map(([k, l, i]) => `<button class="cmtab ${C.tab === k ? 'on' : ''}" data-cm="tab" data-k="${k}" aria-pressed="${C.tab === k}">${ic(i, 16)}<span>${l}</span>${count(k)}</button>`).join('')}</nav>`;
  }
  function count(k) {
    const d = C.d; if (!d) return '';
    const n = k === 'discussions' ? d.posts.filter(p => p.kind === 'discussion').length : k === 'updates' ? d.posts.filter(p => p.kind === 'update').length : k === 'media' ? mediaPosts().length : d.events.length;
    return n ? `<em>${n}</em>` : '';
  }
  function composerHtml(x) {
    const role = myRole(x.id), join = `<p class="cmnote">Join ${esc(x.name)} to take part.</p>`;
    if (C.tab === 'discussions') return role ? `<div class="cmcomp"><input id="ct" type="text" maxlength="120" placeholder="Start a discussion — what’s on your mind?" aria-label="Discussion title"><textarea id="cb" rows="2" maxlength="2000" placeholder="Add details (optional)" aria-label="Discussion details"></textarea><div class="cmcr"><button class="cmjoin" data-cm="post" data-kind="discussion"><span>Post</span></button></div></div>` : join;
    if (C.tab === 'updates') return isMgr(x.id) ? `<div class="cmcomp"><input id="ct" type="text" maxlength="120" placeholder="Update headline" aria-label="Update headline"><textarea id="cb" rows="2" maxlength="2000" placeholder="Share news with the community" aria-label="Update text"></textarea><div class="cmcr"><button class="cmjoin" data-cm="post" data-kind="update"><span>Post update</span></button></div></div>` : '';
    if (C.tab === 'media') return role ? `<div class="cmcomp row"><input id="cb" type="text" maxlength="300" placeholder="Caption (optional)" aria-label="Caption"><label class="cmjoin cmfile"><span>${ic('image', 15)} Add photo</span><input id="cf" type="file" accept="image/png,image/jpeg,image/webp" hidden></label></div>` : join;
    if (C.tab === 'events') return isMgr(x.id) ? `<div class="cmcomp row"><span class="cmnote" style="margin:0">Owners and moderators can host events.</span><button class="cmjoin" data-cm="hostev"><span>${ic('plus', 15)} Host an event</span></button></div>` : '';
    return '';
  }
  function postCard(p, x) {
    const a = prof(p.author_id), mine = p.author_id === S.me.id, can = mine || isMgr(x.id), n = p.replies?.[0]?.count || 0;
    const open = C.open === p.id, rep = C.d.replies[p.id] || [];
    return `<article class="cmpost${p.kind === 'update' ? ' upd' : ''}"><div class="cmph"><span data-cm="prof" data-u="${p.author_id || ''}">${av(a)}</span><span class="t"><b>${esc(p.author_id ? a.display_name : 'Former member')}</b><small>${esc(ago(p.created_at))}${p.kind === 'update' ? ' · Update' : ''}</small></span>${can ? `<button class="cmx" data-cm="delpost" data-id="${p.id}" aria-label="Delete post" title="Delete">${ic('trash', 16)}</button>` : ''}</div>
      ${p.title ? `<h3>${esc(p.title)}</h3>` : ''}${p.body ? `<p>${text(p.body)}</p>` : ''}
      ${p.kind === 'discussion' ? `<button class="cmrep" data-cm="thread" data-id="${p.id}" aria-expanded="${open}">${ic('msg', 15)} ${n} ${n === 1 ? 'reply' : 'replies'}</button>` : ''}
      ${open ? `<div class="cmthread">${rep.map(r => { const ra = prof(r.author_id); return `<div class="cmr"><span data-cm="prof" data-u="${r.author_id || ''}">${av(ra)}</span><div><b>${esc(r.author_id ? ra.display_name : 'Former member')}</b> <small>${esc(ago(r.created_at))}</small><p>${text(r.body)}</p></div>${r.author_id === S.me.id || isMgr(x.id) ? `<button class="cmx" data-cm="delrep" data-id="${r.id}" aria-label="Delete reply">${ic('trash', 14)}</button>` : ''}</div>`; }).join('') || '<p class="cmnote">No replies yet.</p>'}
        ${myRole(x.id) ? `<div class="cmrc"><input id="cr" type="text" maxlength="1000" placeholder="Write a reply…" aria-label="Reply"><button class="cmjoin" data-cm="reply" data-id="${p.id}"><span>Reply</span></button></div>` : ''}</div>` : ''}</article>`;
  }
  function listHtml(x) {
    const d = C.d; if (!d) return `<div class="cmempty"><div class="cmspin" aria-hidden="true"></div><p>Loading…</p></div>`;
    if (d.err) return `<div class="cmempty"><p>${esc(d.err)}</p></div>`;
    if (C.tab === 'events') {
      return d.events.length ? `<div class="cmevl">${d.events.map(e => { const going = (e.rsvps || []).some(r => r.user_id === S.me.id), n = (e.rsvps || []).length, d0 = new Date(e.starts_at);
        return `<article class="cmevc"><div class="cmdate"><b>${d0.getDate()}</b><small>${d0.toLocaleDateString([], { month: 'short' })}</small></div><div class="t"><h3>${esc(e.title)}</h3><small>${esc(when(e.starts_at))}${e.location ? ' · ' + ic('mapPin', 12) + ' ' + esc(e.location) : ''}</small>${e.description ? `<p>${text(e.description)}</p>` : ''}<small>${n} going</small></div>
        <div class="cmeva">${myRole(x.id) ? `<button class="cmjoin ${going ? 'on' : ''}" data-cm="rsvp" data-id="${e.id}" aria-pressed="${going}">${going ? ic('check', 15) : ''}<span>${going ? 'Going' : 'Join event'}</span></button>` : ''}${isMgr(x.id) ? `<button class="cmx" data-cm="delev" data-id="${e.id}" aria-label="Delete event">${ic('trash', 16)}</button>` : ''}</div></article>`; }).join('')}</div>`
        : `<div class="cmempty"><h2>No events yet</h2><p>${isMgr(x.id) ? 'Host the first one with the button above.' : 'Check back soon.'}</p></div>`;
    }
    if (C.tab === 'media') {
      const m = mediaPosts();
      return m.length ? `<div class="cmmedia">${m.map(p => `<figure class="cmm" data-cm="zoom" data-id="${p.id}" tabindex="0" role="button" aria-label="Open photo"><img src="${esc(p.image_url)}" alt="${esc(p.body || 'Community photo')}" loading="lazy" decoding="async">${p.body ? `<figcaption>${esc(p.body)}</figcaption>` : ''}</figure>`).join('')}</div>`
        : `<div class="cmempty"><h2>No photos yet</h2><p>${myRole(x.id) ? 'Add the first one.' : 'Join to share photos.'}</p></div>`;
    }
    const kind = C.tab === 'updates' ? 'update' : 'discussion', ps = d.posts.filter(p => p.kind === kind);
    return ps.length ? ps.map(p => postCard(p, x)).join('') : `<div class="cmempty"><h2>${kind === 'update' ? 'No updates yet' : 'No discussions yet'}</h2><p>${kind === 'update' ? 'News from the owner and moderators will appear here.' : myRole(x.id) ? 'Start the first one above.' : 'Join to start one.'}</p></div>`;
  }
  function paintDetail() {
    const main = $('#main'), x = get(C.id); if (!main || S.view !== 'community') return;
    if (!x) return back();
    const h = main.querySelector('#cmhead'); if (!h) return renderDetail(main);
    h.innerHTML = headHtml(x);
    const l = main.querySelector('#cmlist'), keep = l.scrollTop; l.innerHTML = listHtml(x); l.scrollTop = keep;
    const comp = main.querySelector('#cmcomp'); if (comp && !comp.contains(document.activeElement) && !comp.dataset.dirty) comp.innerHTML = composerHtml(x);
    bindComposer(main);
  }
  function renderDetail(main) {
    const x = get(C.id); if (!x) { if (C.loaded) { S.view = 'communities'; return renderPage(main); } load().then(() => c.renderMain()); main.innerHTML = `<div class="top">${menuBtn()}<b class="title">Communities</b></div><div class="cmempty"><div class="cmspin"></div></div>`; return bindMenu(); }
    main.innerHTML = `<div class="top cmtop">${menuBtn()}<button class="cmback" data-cm="back">${ic('back', 16)}<span>All communities</span></button><span class="grow"></span><button class="otb oav" data-cm="me" aria-label="Your profile">${av(S.me)}</button></div>
    <div class="panel cmpage cmenter"><div class="cmdetail"><div id="cmhead">${headHtml(x)}</div><div id="cmcomp">${composerHtml(x)}</div><div id="cmlist">${listHtml(x)}</div></div></div>`;
    bindMenu(); bindMain(main); bindComposer(main);
  }
  function bindComposer(main) {
    const comp = main.querySelector('#cmcomp'); if (!comp) return;
    comp.querySelectorAll('input[type=text],textarea').forEach(i => i.oninput = () => { comp.dataset.dirty = [...comp.querySelectorAll('input[type=text],textarea')].some(e => e.value) ? '1' : ''; });
    const f = comp.querySelector('#cf'); if (f) f.onchange = () => f.files[0] && uploadPhoto(f.files[0], f);
  }

  /* ───────── posting, replying, events, photos ───────── */
  async function post(kind) {
    const x = get(C.id), t = ($('#ct')?.value || '').trim(), b = ($('#cb')?.value || '').trim();
    if (kind === 'discussion' && !t) return toast('Give your discussion a title.', true);
    if (kind === 'update' && !t && !b) return toast('Write something first.', true);
    const r = await sb.from('community_posts').insert({ community_id: x.id, author_id: S.me.id, kind, title: t, body: b });
    if (r.error) return fail(r.error);
    const comp = $('#cmcomp'); comp.dataset.dirty = ''; comp.innerHTML = composerHtml(x);
    await loadDetail(); paintDetail(); bindComposer($('#main'));
  }
  async function reply(pid) {
    const i = $('#cr'), v = (i?.value || '').trim(); if (!v) return;
    const r = await sb.from('community_replies').insert({ post_id: pid, author_id: S.me.id, body: v });
    if (r.error) return fail(r.error);
    await loadDetail(); paintDetail(); $('#cr')?.focus();
  }
  async function delPost(id) {
    const p = C.d.posts.find(x => x.id === id); if (!p) return;
    confirmBox('Delete this post?', 'This cannot be undone.', 'Delete', async () => {
      const r = await sb.from('community_posts').delete().eq('id', id); if (r.error) { fail(r.error); return false; }
      if (p.image_url) { const path = p.image_url.split('/community-media/')[1]; if (path) sb.storage.from('community-media').remove([decodeURIComponent(path)]).catch(() => {}); }
      await loadDetail(); paintDetail();
    });
  }
  async function shrink(file) {
    const bmp = await createImageBitmap(file), s = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(bmp.width * s)); cv.height = Math.max(1, Math.round(bmp.height * s));
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height); bmp.close?.();
    for (const q of [0.84, 0.65, 0.45]) { const b = await new Promise(r => cv.toBlob(r, 'image/jpeg', q)); if (b && b.size < 1.9e6) return b; }
    throw new Error('That photo is too large.');
  }
  async function uploadPhoto(file, input) {
    const x = get(C.id); if (!x || !myRole(x.id)) return;
    try {
      toast('Uploading photo…');
      const blob = await shrink(file), path = `${S.me.id}/${crypto.randomUUID()}.jpg`;
      const up = await sb.storage.from('community-media').upload(path, blob, { contentType: 'image/jpeg' }); if (up.error) throw up.error;
      const url = sb.storage.from('community-media').getPublicUrl(path).data.publicUrl;
      const cap = ($('#cb')?.value || '').trim();
      const r = await sb.from('community_posts').insert({ community_id: x.id, author_id: S.me.id, kind: 'media', body: cap, image_url: url });
      if (r.error) { sb.storage.from('community-media').remove([path]).catch(() => {}); throw r.error; }
      const comp = $('#cmcomp'); comp.dataset.dirty = ''; comp.innerHTML = composerHtml(x);
      await loadDetail(); paintDetail(); toast('Photo added');
    } catch (e) { toast(e?.message?.includes('bucket') ? 'Photos are not set up yet. Run migration-communities.sql in Supabase.' : (e?.message || 'Upload failed'), true); }
    if (input) input.value = '';
  }
  function zoom(id) {
    const p = C.d.posts.find(x => x.id === id); if (!p) return;
    const a = prof(p.author_id), can = p.author_id === S.me.id || isMgr(C.id);
    modal(p.body || 'Photo', `<img class="cmzoom" src="${esc(p.image_url)}" alt="${esc(p.body || 'Community photo')}"><p class="muted">Shared by ${esc(p.author_id ? a.display_name : 'a former member')} · ${esc(ago(p.created_at))}</p>`,
      [...(can ? [{ label: 'Delete', cls: 'danger', fn: () => { setTimeout(() => delPost(id), 0); } }] : []), { label: 'Close', cls: 'ghost' }]);
  }
  function hostEvent() {
    const x = get(C.id), def = new Date(Date.now() + 864e5); def.setMinutes(0, 0, 0);
    modal('Host an event', `<label class="lbl">Title</label><input id="et" type="text" maxlength="100" placeholder="Community Game Night" style="width:100%">
      <label class="lbl">When</label><input id="ew" type="datetime-local" value="${toLocalInput(def)}" style="width:100%">
      <label class="lbl">Where (optional)</label><input id="el" type="text" maxlength="120" placeholder="Orbit voice chat" style="width:100%">
      <label class="lbl">Details (optional)</label><textarea id="ed" rows="3" maxlength="600" style="width:100%"></textarea>`,
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Create event', fn: async bg => {
        const title = $('#et', bg).value.trim(), at = new Date($('#ew', bg).value);
        if (!title) { toast('Give the event a title.', true); return false; }
        if (isNaN(+at)) { toast('Pick a date and time.', true); return false; }
        const r = await sb.from('community_events').insert({ community_id: x.id, title, starts_at: at.toISOString(), location: $('#el', bg).value.trim(), description: $('#ed', bg).value.trim(), created_by: S.me.id });
        if (r.error) { fail(r.error); return false; }
        toast('Event created'); await load(true); await loadDetail(); paintDetail();
      } }]);
  }
  async function rsvp(id) {
    const e = C.d.events.find(x => x.id === id); if (!e) return;
    const on = (e.rsvps || []).some(r => r.user_id === S.me.id);
    e.rsvps = on ? e.rsvps.filter(r => r.user_id !== S.me.id) : [...(e.rsvps || []), { user_id: S.me.id }]; paintDetail();
    const r = on ? await sb.from('community_event_rsvps').delete().match({ event_id: id, user_id: S.me.id }) : await sb.from('community_event_rsvps').insert({ event_id: id, user_id: S.me.id });
    if (r.error) { fail(r.error); await loadDetail(); paintDetail(); }
  }
  function delEvent(id) {
    confirmBox('Delete this event?', 'People who said they are going will no longer see it.', 'Delete', async () => {
      const r = await sb.from('community_events').delete().eq('id', id); if (r.error) { fail(r.error); return false; }
      await load(true); await loadDetail(); paintDetail();
    });
  }

  /* ───────── create + invite ───────── */
  function createModal() {
    let color = COLORS[0];
    modal('Create a community', `<label class="lbl">Name</label><input id="cn" type="text" maxlength="40" placeholder="Chess Club" style="width:100%">
      <label class="lbl">Description</label><textarea id="cd" rows="2" maxlength="240" placeholder="What is this community about?" style="width:100%"></textarea>
      <label class="lbl">Category</label><select id="cc" style="width:100%">${[...CATS.slice(1), MORE[0]].map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
      <label class="lbl">Icon</label><div class="cmpick" id="ci">${EMOJI.map((e, i) => `<button type="button" class="${i ? '' : 'on'}" data-e="${e}" aria-label="Icon ${e}">${e}</button>`).join('')}</div>
      <label class="lbl">Color</label><div class="cmpick" id="ck">${COLORS.map((k, i) => `<button type="button" class="sw ${i ? '' : 'on'}" data-k="${k}" style="background:${k}" aria-label="Color ${k}"></button>`).join('')}</div>
      <label class="lbl">Tags (comma separated, up to 4)</label><input id="cg" type="text" maxlength="60" placeholder="Strategy, Friendly" style="width:100%">`,
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Create', fn: async bg => {
        const name = $('#cn', bg).value.trim(); if (name.length < 2) { toast('Give it a name (2+ characters).', true); return false; }
        const ico = $('#ci .on', bg)?.dataset.e || '🌐', tg = $('#cg', bg).value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 4);
        const r = await sb.rpc('create_community', { p_name: name, p_description: $('#cd', bg).value.trim(), p_category: $('#cc', bg).value, p_icon: ico, p_color: color, p_tags: tg });
        if (r.error) { fail(r.error); return false; }
        toast('Community created'); await load(true); openCommunity(r.data);
      } }],
      bg => {
        bg.querySelectorAll('#ci button').forEach(b => b.onclick = () => { bg.querySelectorAll('#ci button').forEach(x => x.classList.toggle('on', x === b)); });
        bg.querySelectorAll('#ck button').forEach(b => b.onclick = () => { color = b.dataset.k; bg.querySelectorAll('#ck button').forEach(x => x.classList.toggle('on', x === b)); });
        $('#cn', bg)?.focus();
      });
  }
  async function inviteModal(id) {
    const mine = C.list.filter(x => myRole(x.id)); if (!mine.length) return toast('Join a community first, then invite friends to it.', true);
    if (!(S.friends || []).length) return toast('Add some friends first, then you can invite them.', true);
    let cur = id && myRole(id) ? id : mine[0].id;
    const paint = async bg => {
      const box = $('#cil', bg); box.innerHTML = '<p class="muted">Loading…</p>';
      const [m, i] = await Promise.all([
        sb.from('community_members').select('user_id').eq('community_id', cur).in('user_id', S.friends),
        sb.from('community_invites').select('invited_user').eq('community_id', cur).in('invited_user', S.friends)]);
      const mem = new Set((m.data || []).map(r => r.user_id)), inv = new Set((i.data || []).map(r => r.invited_user));
      const rows = S.friends.filter(u => !mem.has(u)).map(prof);
      box.innerHTML = rows.map(p => `<div class="row" style="cursor:default">${av(p)}<span class="t"><b>${esc(p.display_name)}</b><small>@${esc(p.username)}</small></span><button class="btn sm ${inv.has(p.id) ? 'ghost' : ''}" data-u="${p.id}" ${inv.has(p.id) ? 'disabled' : ''}>${inv.has(p.id) ? 'Invited' : 'Invite'}</button></div>`).join('') || '<p class="muted">All your friends are already in this community.</p>';
      box.querySelectorAll('button[data-u]').forEach(b => b.onclick = async () => {
        b.disabled = true; const r = await sb.rpc('invite_to_community', { p_id: cur, p_user: b.dataset.u });
        if (r.error) { b.disabled = false; return fail(r.error); } b.textContent = 'Invited'; b.classList.add('ghost');
      });
    };
    modal('Invite friends', `${mine.length > 1 ? `<label class="lbl">Community</label><select id="cis" style="width:100%">${mine.map(x => `<option value="${x.id}" ${x.id === cur ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : `<p class="muted">Invite friends to <b>${esc(get(cur).name)}</b>.</p>`}<div class="list" id="cil" style="max-height:320px;margin-top:10px"></div>`,
      [{ label: 'Done', cls: 'ghost' }], bg => { const s = $('#cis', bg); if (s) s.onchange = () => { cur = s.value; paint(bg); }; paint(bg); });
  }

  /* ───────── manage: edit, members, delete (community owner, or Orbit staff the same way they run tournaments) ───────── */
  const ROLE_LABEL = { owner: 'Owner', moderator: 'Moderator', member: 'Member' };
  const afterChange = async () => {
    await load(true);
    if (S.view === 'community') { if (!get(C.id)) return back(); await loadDetail(); }
    refresh();
  };
  function adminHtml() {
    const q = C.q.trim().toLowerCase();
    const rows = [...C.list].filter(x => !q || [x.name, x.description, x.category].some(v => String(v).toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
    return `<section class="cmadm"><div class="cmsh"><h2>${ic('shield', 20)} Admin dashboard</h2></div>
      <p class="cmnote" style="margin:0 0 10px">Edit, verify, manage members and delete any community. ${rows.length} of ${C.list.length} shown.${C.q.trim() ? '' : ' Use the search box above to filter.'}</p>
      <div class="cmadmlist">${rows.map(x => `<div class="cmadmrow" style="--cc:${esc(x.color)}">${icon(x)}<span class="t"><b>${esc(x.name)}${badge(x)}</b><small>${members(x.member_count)} · ${esc(x.category)}${x.created_by ? '' : ' · official'}</small></span>
        <div class="cmadmact"><button class="cmjoin ghost sm" data-cm="open" data-id="${x.id}">View</button><button class="cmjoin ghost sm" data-cm="manage" data-id="${x.id}">${ic('pencil', 13)}<span>Edit</span></button><button class="cmjoin ghost sm" data-cm="members" data-id="${x.id}">${ic('users', 13)}<span>Members</span></button><button class="cmjoin ghost sm" data-cm="verify" data-id="${x.id}">${x.verified ? 'Unverify' : 'Verify'}</button><button class="cmx" data-cm="delcomm" data-id="${x.id}" aria-label="Delete ${esc(x.name)}" title="Delete community">${ic('trash', 16)}</button></div></div>`).join('') || '<div class="cmempty"><h2>No communities found</h2><p>Try a different search.</p></div>'}</div></section>`;
  }
  function manageModal(id) {
    const x = get(id); if (!x || !isMgr(id)) return;
    if (!canEdit(id)) return membersModal(id);   // community moderators can only manage members
    let color = x.color, icoPick = x.icon;
    const emoji = EMOJI.includes(x.icon) ? EMOJI : [x.icon, ...EMOJI];
    const cats = [...CATS.slice(1), MORE[0]];
    modal('Manage ' + x.name, `<label class="lbl">Name</label><input id="cn" type="text" maxlength="40" value="${esc(x.name)}" style="width:100%">
      <label class="lbl">Description</label><textarea id="cd" rows="2" maxlength="240" style="width:100%">${esc(x.description)}</textarea>
      <label class="lbl">Category</label><select id="cc" style="width:100%">${cats.map(([k, l]) => `<option value="${k}" ${k === x.category ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <label class="lbl">Icon</label><div class="cmpick" id="ci">${emoji.map(e => `<button type="button" class="${e === x.icon ? 'on' : ''}" data-e="${esc(e)}" aria-label="Icon ${esc(e)}">${esc(e)}</button>`).join('')}</div>
      <label class="lbl">Color</label><div class="cmpick" id="ck">${(COLORS.includes(x.color) ? COLORS : [x.color, ...COLORS]).map(k => `<button type="button" class="sw ${k === x.color ? 'on' : ''}" data-k="${esc(k)}" style="background:${esc(k)}" aria-label="Color ${esc(k)}"></button>`).join('')}</div>
      <label class="lbl">Tags (comma separated, up to 4)</label><input id="cg" type="text" maxlength="70" value="${esc((x.tags || []).join(', '))}" style="width:100%">
      ${isStaff() ? `<label class="lbl" style="display:flex;align-items:center;gap:8px;margin-top:12px"><input id="cv" type="checkbox" ${x.verified ? 'checked' : ''}> Verified community (badge next to the name)</label>` : ''}
      <div class="cmmgrow"><button type="button" class="btn ghost sm" id="cmbm">${ic('users', 14)} Members and roles</button><button type="button" class="btn danger sm" id="cmbd">${ic('trash', 14)} Delete community</button></div>`,
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Save changes', fn: async bg => {
        const name = $('#cn', bg).value.trim(); if (name.length < 2) { toast('Give it a name (2+ characters).', true); return false; }
        const tg = $('#cg', bg).value.split(',').map(v => v.trim()).filter(Boolean).slice(0, 4), v = $('#cv', bg);
        const r = await sb.rpc('update_community', { p_id: id, p_name: name, p_description: $('#cd', bg).value.trim(), p_category: $('#cc', bg).value,
          p_icon: $('#ci .on', bg)?.dataset.e || icoPick, p_color: color, p_tags: tg, p_verified: v ? v.checked : null });
        if (r.error) { fail(r.error); return false; }
        toast('Community updated'); await afterChange();
      } }],
      (bg, close) => {
        bg.querySelectorAll('#ci button').forEach(b => b.onclick = () => { bg.querySelectorAll('#ci button').forEach(z => z.classList.toggle('on', z === b)); });
        bg.querySelectorAll('#ck button').forEach(b => b.onclick = () => { color = b.dataset.k; bg.querySelectorAll('#ck button').forEach(z => z.classList.toggle('on', z === b)); });
        $('#cmbm', bg).onclick = () => { close(); membersModal(id); };
        $('#cmbd', bg).onclick = () => { close(); delCommunity(id); };
      });
  }
  async function membersModal(id) {
    const x = get(id); if (!x || !isMgr(id)) return;
    const paint = async bg => {
      const mine = myRole(id), staff = isStaff();
      const box = $('#cmml', bg); box.innerHTML = '<p class="muted">Loading…</p>';
      const { data, error } = await sb.from('community_members').select('user_id, role, joined_at').eq('community_id', id).order('joined_at').limit(500);
      if (error) { box.innerHTML = `<p class="muted">${esc(setupErr(error))}</p>`; return; }
      await c.needProfiles((data || []).map(m => m.user_id));
      const rank = { owner: 0, moderator: 1, member: 2 };
      const rows = (data || []).sort((a, b) => rank[a.role] - rank[b.role]);
      box.innerHTML = rows.map(m => {
        const p = prof(m.user_id), me = m.user_id === S.me.id;
        const roleCtl = staff || mine === 'owner'
          ? `<select data-r="${m.user_id}" aria-label="Role for ${esc(p.display_name)}">${['owner', 'moderator', 'member'].map(r => `<option value="${r}" ${r === m.role ? 'selected' : ''}>${ROLE_LABEL[r]}${r === 'owner' && m.role !== 'owner' ? ' (hand over)' : ''}</option>`).join('')}</select>`
          : `<span class="cmin">${ROLE_LABEL[m.role]}</span>`;
        const canKick = !me && m.role !== 'owner' && (staff || mine === 'owner' || (mine === 'moderator' && m.role === 'member'));
        return `<div class="row" style="cursor:default">${av(p)}<span class="t"><b>${esc(p.display_name)}${me ? ' (you)' : ''}</b><small>@${esc(p.username)}</small></span>${roleCtl}${canKick ? `<button class="cmx" data-k="${m.user_id}" aria-label="Remove ${esc(p.display_name)}" title="Remove from community">${ic('x', 16)}</button>` : ''}</div>`;
      }).join('') || '<p class="muted">No members.</p>';
      box.querySelectorAll('select[data-r]').forEach(sel => sel.onchange = async () => {
        const u = sel.dataset.r, role = sel.value;
        const go = async () => {
          const r = await sb.rpc('set_community_role', { p_id: id, p_user: u, p_role: role });
          if (r.error) fail(r.error); else toast(role === 'owner' ? 'Ownership handed over' : 'Role updated');
          await afterChange(); paint(bg);
        };
        if (role === 'owner') confirmBox('Hand over ownership?', `${prof(u).display_name} becomes the owner. The current owner stays on as a moderator.`, 'Hand over', async () => { await go(); }); else go();
        if (role === 'owner') paint(bg);
      });
      box.querySelectorAll('button[data-k]').forEach(b => b.onclick = () => {
        const u = b.dataset.k;
        confirmBox('Remove from community?', `${prof(u).display_name} will leave ${x.name}. They can join again unless you remove them again.`, 'Remove', async () => {
          const r = await sb.rpc('remove_community_member', { p_id: id, p_user: u });
          if (r.error) { fail(r.error); return false; }
          toast('Member removed'); await afterChange(); paint(bg);
        });
      });
    };
    const canRoles = isStaff() || myRole(id) === 'owner';
    modal('Members of ' + x.name, `<p class="cmnote" style="margin:0 0 8px">${canRoles ? 'Change roles or remove people.' : 'Moderators can remove regular members.'}</p><div class="list" id="cmml" style="max-height:380px"></div>`,
      [{ label: 'Done', cls: 'ghost' }], bg => paint(bg));
  }
  function delCommunity(id) {
    const x = get(id); if (!x || !canEdit(id)) return;
    confirmBox('Delete ' + x.name + '?', 'This removes the community with all its posts, events and memberships for everyone. It cannot be undone.', 'Delete community', async () => {
      const r = await sb.rpc('delete_community', { p_id: id });
      if (r.error) { fail(r.error); return false; }
      toast('Community deleted'); await afterChange();
    });
  }
  async function toggleVerify(id) {
    const x = get(id); if (!x || !isStaff()) return;
    const r = await sb.rpc('update_community', { p_id: id, p_name: x.name, p_description: x.description, p_category: x.category, p_icon: x.icon, p_color: x.color, p_tags: x.tags || [], p_verified: !x.verified });
    if (r.error) return fail(r.error);
    toast(x.verified ? x.name + ' is no longer verified' : x.name + ' is verified'); await afterChange();
  }

  /* ───────── clicks ───────── */
  function bindMain(main) {
    if (main.__cm) return; main.__cm = true;
    main.addEventListener('click', e => { const b = e.target.closest('[data-cm]'); if (b && main.contains(b)) { e.stopPropagation(); act(b); } });
    main.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.cmfeat,.cmm')) { e.preventDefault(); act(e.target); } if (e.key === 'Enter' && e.target.id === 'cr') $('[data-cm="reply"]')?.click(); });
  }
  function act(b) {
    const d = b.dataset, id = d.id;
    switch (d.cm) {
      case 'open': return openCommunity(id);
      case 'join': return join(id);
      case 'leave': return leave(id);
      case 'accept': return join(id);
      case 'decline': return declineInvite(id);
      case 'cat': C.cat = d.k; C.showAll = false; return paintPage();
      case 'more': C.more = true; return paintPage();
      case 'all': C.showAll = !C.showAll; return paintPage();
      case 'create': return createModal();
      case 'browse': C.q = ''; C.cat = 'all'; { const q = $('#cmq'); if (q) q.value = ''; } paintPage(); return $('#cmcenter')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      case 'friends': return c.navTo('friends');
      case 'invite': return inviteModal();
      case 'invite1': return inviteModal(id);
      case 'inv': return $('#cmside .cminv') ? $('#cmside .cminv').scrollIntoView({ behavior: 'smooth', block: 'center' }) : toast('No pending invitations.');
      case 'me': return c.profileModal(S.me.id);
      case 'prof': return d.u && c.profileModal(d.u);
      case 'event': return openCommunity(id, 'events');
      case 'joinev': { const e = C.events[0]; return e ? openCommunity(e.community_id, 'events') : toast('No community events are scheduled yet.'); }
      case 'back': return back();
      case 'tab': C.tab = d.k; C.open = null; { const comp = $('#cmcomp'); if (comp) comp.dataset.dirty = ''; if (comp) comp.innerHTML = composerHtml(get(C.id)); } paintDetail(); return;
      case 'post': return post(d.kind);
      case 'thread': C.open = C.open === id ? null : id; if (C.open) loadReplies(id).then(() => paintDetail()); return paintDetail();
      case 'reply': return reply(id);
      case 'delpost': return delPost(id);
      case 'delrep': return sb.from('community_replies').delete().eq('id', id).then(async r => { if (r.error) return fail(r.error); await loadDetail(); paintDetail(); });
      case 'zoom': return zoom(id);
      case 'hostev': return hostEvent();
      case 'rsvp': return rsvp(id);
      case 'delev': return delEvent(id);
      case 'manage': return manageModal(id);
      case 'members': return membersModal(id);
      case 'delcomm': return delCommunity(id);
      case 'verify': return toggleVerify(id);
      case 'admin': C.admin = !C.admin; return paintPage();
    }
  }

  /* ───────── hooks for app.js ───────── */
  const VIEWS = ['communities', 'community'];
  return {
    VIEWS, start, stop, load: () => load(),
    handles: v => VIEWS.includes(v),
    render(main) { S.view === 'community' ? renderDetail(main) : renderPage(main); },
    onNav(k) { if (k === 'communities') { C.id = null; load().then(() => S.view === 'communities' && paintPage()); } },
    invites: () => C.invites.length,
    open: (id, tab) => openCommunity(id, tab),
  };
}
