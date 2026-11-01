/* Orbit Gamble: casino-style mini-games played with Orbits (a free, non-purchasable play currency).
   Orbit Casino (the tab used to be called Orbit Gamble). The casino floor is a scene with a table per game; clicking a table zooms in and opens that game.
   Part 1: BLACKJACK, against the Orbit Bot (7 free tries a day shared with Slots and Roulette, then 500 Orbits per extra try) and against other players (unlimited).

   Everything that matters happens on the server (migration-gamble.sql): the shuffle, every card dealt, the dealer's face-down card,
   the daily try count, bets and payouts. This file only draws the screens and calls those functions, so editing it in the browser
   can't peek at a card, change a bet, skip the try fee or change a payout.
   Part 2: SLOTS and ROULETTE (slots_spin / roulette_spin in migration-casino-slots-roulette.sql). The reels, the wheel, the limits and the payouts
   are all decided on the server; the page only animates the answer it is given. */

const MIN_BET = 10, MAX_BET = 5000, FREE_TRIES = 7, EXTRA_FEE = 500;   // ONE shared daily counter: Bot blackjack hands, slot spins and roulette spins. Must match gamble_free_tries() / gamble_extra_fee() in migration-casino-tries-7.sql
const CHIPS = [10, 50, 100, 500, 1000, 5000];
const SUITS = [['♠', 'blu', 'Spades'], ['♥', 'red', 'Hearts'], ['♦', 'red', 'Diamonds'], ['♣', 'blu', 'Clubs']];   // card = 0..51, rank = card % 13 (0 = Ace), suit = floor(card / 13)
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_NAMES = ['Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King'];
const GAMES = [
  { id: 'bj', title: 'Blackjack', blurb: 'Beat the Bot or another player to 21', icon: 'cards', live: true },
  { id: 'slots', title: 'Slot Machines', blurb: 'Line up cosmic symbols from the left', icon: 'slot', live: true },
  { id: 'roulette', title: 'Roulette', blurb: 'Call a number, a colour or a dozen', icon: 'wheel', live: true },
];
const num = n => Number(n || 0).toLocaleString();
const short = v => (v >= 1000 ? v / 1000 + 'K' : String(v));
const clampBet = n => Math.min(MAX_BET, Math.max(MIN_BET, Math.floor(Number(n)) || MIN_BET));
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + num(Math.abs(n));
const emsg = e => String(e?.message || e || 'Something went wrong. Try again.');
const getLS = k => { try { return localStorage.getItem(k); } catch { return null; } };
const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window: the choice just isn't remembered */ } };
function dur(s) {
  s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`;
}
function ago(s) { s = Math.max(0, s); return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`; }

/* one playing card. c = -1 is a face-down card */
function cardHtml(c, cls = '', delay = 0) {
  const st = `style="--dl:${delay}ms"`;
  if (c < 0) return `<div class="gb-card back ${cls}" ${st} role="img" aria-label="Face-down card"><span class="gb-cb"><i></i><i></i></span></div>`;
  const r = c % 13, [sym, col, name] = SUITS[Math.floor(c / 13)];
  return `<div class="gb-card face ${col} ${cls}" ${st} role="img" aria-label="${RANK_NAMES[r]} of ${name}"><b class="tl">${RANKS[r]}<i>${sym}</i></b><span class="mid">${sym}</span><b class="br">${RANKS[r]}<i>${sym}</i></b></div>`;
}
const slotHtml = n => Array.from({ length: n }, () => '<div class="gb-card slot" aria-hidden="true"></div>').join('');

export function initGamble(c) {
  const { S, sb, esc, ic, I, toast, menuBtn, bindMenu, prof, av, needProfiles, setOrbits, loadOrbits } = c;

  Object.assign(I, {
    gback: '<polyline points="15 18 9 12 15 6"/>',
    dice: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none"/>',
    cards: '<rect x="3" y="5" width="12" height="16" rx="2.5"/><path d="M9 3.2l.9-.2 10.6 2.4a2 2 0 0 1 1.5 2.4L19.2 17.5"/><path d="M9 10.6c-1.4-1.7-3.2-.3-2.2 1.1L9 14.4l2.2-2.7c1-1.4-.8-2.8-2.2-1.1z" fill="currentColor" stroke="none"/>',
    slot: '<rect x="3" y="4" width="18" height="14" rx="3"/><path d="M9 4v14M15 4v14"/><path d="M21 9h1.5v4H21M7 21h10"/>',
    wheel: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6M5.6 5.6l4.2 4.2M14.2 14.2l4.2 4.2M18.4 5.6l-4.2 4.2M9.8 14.2l-4.2 4.2"/>',
  });

  const G = {
    loaded: false, err: '', st: null, game: 'bj', mode: 'bot', scene: 'lobby', zooming: false,
    bet: clampBet(getLS('orbit-gamble-bet') || 100), ante: clampBet(getLS('orbit-gamble-ante') || 100),
    bal: Number(S.orbits || 0), shownBal: null,
    busy: false, confirmPaid: false, bound: false,
    bot: null, pvp: null, lobby: [], lobbyBusy: false,
    seen: {}, disp: { p: null, d: null, me: null, opp: null }, anim: 0, resShown: false, pvpId: null, pvpDone: false,
    stAt: 0, pvpAt: 0, tick: 0, n: 0, fx: [],
    sl: { reels: [0, 1, 2, 3, 4], busy: false, res: null },
    rl: { bets: {}, hist: [], chip: Number(getLS('orbit-roulette-chip')) || 100, busy: false, rot: 0, res: null, past: [] },
  };
  const handles = v => v === 'gamble';
  const $q = s => document.querySelector(s);
  const later = (fn, ms) => { const t = setTimeout(() => { G.fx = G.fx.filter(x => x !== t); fn(); }, ms); G.fx.push(t); return t; };
  const clearFx = () => { G.fx.forEach(clearTimeout); G.fx = []; };
  const focusTable = () => later(() => $q('#gb-body .gb-modes')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);   // bring the table and its buttons on screen
  const freeLeft = () => Math.max(0, FREE_TRIES - (G.st?.tries_used || 0));
  const tryFee = () => freeLeft() ? 0 : EXTRA_FEE;   // the server charges this on top of the bet once the free tries are used
  const feeTxt = f => f ? ` + ${num(f)} try fee` : '';
  const gotTries = r => { if (G.st && r && r.tries != null) G.st.tries_used = r.tries; };

  /* ───────── balance (the number shown here is the same one as the sidebar chip) ───────── */
  function setBal(n, delay = 0) {
    n = Math.max(0, Math.floor(Number(n)) || 0);
    const apply = () => { G.bal = n; setOrbits?.(n); paintBal(); };
    if (delay > 0) later(apply, delay); else apply();
  }
  function paintBal() {
    const zb = $q('#cz-bal'); if (zb) zb.textContent = num(G.bal);
    const el = $q('#gb-bal'); if (!el) return;
    const from = G.shownBal ?? G.bal, to = G.bal; G.shownBal = to;
    if (from === to) { el.textContent = num(to); return; }
    const t0 = performance.now(), D = 700;
    el.classList.remove('up', 'down'); void el.offsetWidth; el.classList.add(to > from ? 'up' : 'down');
    const step = t => { const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3); const e2 = $q('#gb-bal'); if (!e2) return; e2.textContent = num(Math.round(from + (to - from) * e)); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  /* ───────── data ───────── */
  async function loadStatus() {
    const { data, error } = await sb.rpc('gamble_status');
    if (!handles(S.view) && G.loaded) return;
    if (error) {
      G.err = /could not find the function|does not exist|schema cache/i.test(error.message || '') ? 'setup' : emsg(error);
      G.loaded = true; if (handles(S.view)) { paintStats(); paintBody(); } return;
    }
    G.err = ''; G.st = data; G.stAt = Date.now(); G.loaded = true;
    G.bal = Number(data.balance || 0); setOrbits?.(G.bal);
    G.bot = data.bot_game || null; G.pvp = data.pvp_game || null;
    if (G.pvp) { G.mode = 'pvp'; G.pvpAt = Date.now(); G.pvpId = G.pvp.id; G.pvpDone = false; } else if (G.bot) G.mode = 'bot';
    if (G.bot?.status === 'active' || (G.pvp && G.pvp.status !== 'done' && G.pvp.status !== 'cancelled')) { G.scene = 'game'; G.game = 'bj'; }
    G.resShown = true;   // a hand found on the page already was dealt earlier: no result fanfare for it
    if (G.pvp?.opponent) needProfiles?.([G.pvp.opponent, G.pvp.host, G.pvp.guest]).then(() => handles(S.view) && paintBody());
    if (!handles(S.view)) return;
    applyScene(); paintStats(); paintBody();
    if (G.mode === 'pvp' && !G.pvp) loadLobby();
  }
  async function refreshStats() {   // quietly update tries / balance / today's result without redrawing the table
    const { data } = await sb.rpc('gamble_status'); if (!data || !handles(S.view)) return;
    G.st = data; G.stAt = Date.now(); G.bal = Number(data.balance || 0); setOrbits?.(G.bal); paintStats(); updateDeal();
  }
  async function loadLobby() {
    if (G.lobbyBusy) return; G.lobbyBusy = true;
    const { data, error } = await sb.rpc('bj_pvp_list'); G.lobbyBusy = false;
    if (error || !handles(S.view) || G.mode !== 'pvp' || G.pvp) return;
    G.lobby = data || []; paintLobbyList();
  }

  /* ───────── blackjack vs the Orbit Bot ───────── */
  async function botDeal() {
    if (G.busy || G.bot?.status === 'active') return;
    const fee = freeLeft() ? 0 : EXTRA_FEE;
    if (G.bal < G.bet + fee) return updateDeal();
    if (fee && !G.confirmPaid) {   // an extra try costs Orbits, so ask once more before spending them
      G.confirmPaid = true; updateDeal(); later(() => { G.confirmPaid = false; updateDeal(); }, 4500); return;
    }
    G.confirmPaid = false; G.busy = true; paintActions();
    const { data, error } = await sb.rpc('bj_bot_start', { p_bet: G.bet });
    G.busy = false;
    if (error) { toast(emsg(error), true); paintActions(); return; }
    clearFx(); G.seen = {}; G.disp = { p: null, d: null }; G.resShown = false; G.bot = data.game;
    if (G.st) { G.st.tries_used = data.tries; }
    setBal(data.balance);   // the bet (and any try fee) leaves right away...
    paintStats(); paintBody(); focusTable();
    if (data.game.status === 'done') { setBal(data.balance + data.game.payout, G.anim + 350); later(refreshStats, G.anim + 1400); }   // ...but a payout lands after the cards are shown (a natural 21 ends the hand at once)
  }
  async function botAct(action) {
    const g = G.bot; if (G.busy || !g || g.status !== 'active') return;
    G.busy = true; paintActions();
    const { data, error } = await sb.rpc('bj_bot_act', { p_game: g.id, p_action: action });
    G.busy = false;
    if (error) { toast(emsg(error), true); paintBody(); return; }
    G.bot = data.game; paintBody();
    if (data.game.status === 'done') { setBal(data.balance, G.anim + 350); later(refreshStats, G.anim + 1400); }
  }

  /* ───────── blackjack vs players ───────── */
  const meId = () => S.me?.id;
  async function pvpCreate() {
    if (G.busy || G.pvp) return;
    if (G.bal < G.ante) return toast('Not enough Orbits for that ante.', true);
    G.busy = true; paintBody();
    const { data, error } = await sb.rpc('bj_pvp_create', { p_ante: G.ante });
    G.busy = false;
    if (error) { toast(emsg(error), true); return paintBody(); }
    startPvp(data.game); setBal(data.balance); paintBody();
  }
  async function pvpJoin(id) {
    if (G.busy || G.pvp) return;
    G.busy = true; paintLobbyList();
    const { data, error } = await sb.rpc('bj_pvp_join', { p_id: id });
    G.busy = false;
    if (error) { toast(emsg(error), true); loadLobby(); return paintBody(); }
    startPvp(data.game); setBal(data.balance);
    if (data.game.status === 'done') refreshStats();   // a natural 21 settles at once, so fetch the true balance
    paintBody(); focusTable();
  }
  async function pvpCancel() {
    const g = G.pvp; if (!g || G.busy) return; G.busy = true; paintBody();
    const { data, error } = await sb.rpc('bj_pvp_cancel', { p_id: g.id });
    G.busy = false;
    if (error) { toast(emsg(error), true); await pvpPoll(); return paintBody(); }
    setBal(data.balance); G.pvp = null; toast('Table closed. Your ante was returned.'); paintBody(); loadLobby();
  }
  async function pvpAct(action) {
    const g = G.pvp; if (G.busy || !g || g.status !== 'playing' || !g.my_turn) return;
    G.busy = true; paintBody();
    const { data, error } = await sb.rpc('bj_pvp_act', { p_id: g.id, p_action: action });
    G.busy = false;
    if (error) { toast(emsg(error), true); await pvpPoll(); return; }
    applyPvp(data.game, data.balance);
  }
  async function pvpPoll() {
    const g = G.pvp; if (!g || g.status === 'done' || g.status === 'cancelled' || G.busy) return;
    const { data, error } = await sb.rpc('bj_pvp_get', { p_id: g.id });
    if (error || !handles(S.view) || !G.pvp || G.pvp.id !== g.id) return;
    applyPvp(data.game, data.balance);
  }
  function startPvp(game) {
    clearFx(); G.seen = {}; G.disp = { me: null, opp: null }; G.pvp = game; G.pvpId = game.id; G.pvpAt = Date.now(); G.pvpDone = false; G.resShown = false;
    needProfiles?.([game.opponent, game.host, game.guest]).then(() => handles(S.view) && paintBody());
  }
  function applyPvp(game, balance) {
    const was = G.pvp, sig = x => JSON.stringify([x?.status, x?.mine, x?.theirs, x?.my_turn, x?.my_stand, x?.their_stand, x?.guest]);
    G.pvp = game; G.pvpAt = Date.now();
    if (game.guest && !was?.guest) needProfiles?.([game.guest, game.host]).then(() => handles(S.view) && paintBody());
    const finished = game.status === 'done' || game.status === 'cancelled';
    if (finished && !G.pvpDone) {
      G.pvpDone = true; G.resShown = false; paintBody();
      setBal(balance, G.anim + 350); later(refreshStats, G.anim + 1200);
    } else if (sig(was) !== sig(game)) { if (!finished) G.bal = Number(balance), paintBal(); paintBody(); }   // an unchanged poll doesn't redraw, so card animations are never cut off
  }
  function pvpBack() { G.pvp = null; G.seen = {}; G.pvpDone = false; paintBody(); loadLobby(); refreshStats(); }


  /* ───────── the casino floor: art drawn over casino-bg.jpg (1671 x 941, so every number below is a pixel of that picture) ───────── */
  const SPOTS = [
    { id: 'bj', x: .18, y: .615, fx: .14, fy: .765, art: 'cards' },
    { id: 'slots', x: .5, y: .545, fx: .5, fy: .725, art: 'slot', up: true },     // up: the button sits ABOVE the machine and grows upward, so it never reaches the logo
    { id: 'roulette', x: .83, y: .575, fx: .846, fy: .73, art: 'wheel' },
  ];
  function wheelSvg() {
    const order = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
    const reds = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
    const pt = (r, a) => `${(Math.sin(a) * r).toFixed(1)} ${(-Math.cos(a) * r).toFixed(1)}`;
    const step = Math.PI * 2 / order.length;
    const wedges = order.map((n, i) => {
      const a0 = i * step, a1 = (i + 1) * step, col = n === 0 ? '#12a35a' : reds.has(n) ? '#d11f5e' : '#0b0f2b';
      return `<path d="M${pt(112, a0)}A112 112 0 0 1 ${pt(112, a1)}L${pt(78, a1)}A78 78 0 0 0 ${pt(78, a0)}Z" fill="${col}" stroke="#e6c46a" stroke-width=".8"/>`;
    }).join('');
    const spokes = [0, 45, 90, 135].map(a => `<rect x="-3" y="-44" width="6" height="88" rx="3" fill="#e6c46a" transform="rotate(${a})"/>`).join('');
    return `<ellipse cx="0" cy="9" rx="126" ry="126" fill="#1a0f4d"/>
      <circle r="126" fill="url(#cz-gold)"/><circle r="118" fill="#120a46"/>
      <g class="cz-spin">${wedges}<circle r="76" fill="url(#cz-dish)"/><circle r="56" fill="#1b1470" stroke="#e6c46a" stroke-width="1.4"/>${spokes}<circle r="17" fill="url(#cz-gold)"/><circle r="6" fill="#fff6d2"/></g>
      <g class="cz-ball"><circle cx="0" cy="-96" r="5.5" fill="#fff" filter="url(#cz-soft)"/></g>`;
  }
  const card = (x, y, rot, rank, suit, red) => `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-23" y="-32" width="46" height="64" rx="5" fill="#f4f6ff" stroke="#9fb4ff" stroke-width="1.2"/>
      <text x="-17" y="-14" font-size="15" font-weight="700" fill="${red ? '#d11f5e' : '#16206b'}" font-family="Georgia,serif">${rank}</text><text x="0" y="12" font-size="30" text-anchor="middle" fill="${red ? '#d11f5e' : '#16206b'}">${suit}</text></g>`;
  const chips = (x, y, col, n) => Array.from({ length: n }, (_, i) => `<ellipse cx="${x}" cy="${y - i * 4}" rx="13" ry="5" fill="${col}" stroke="#fff" stroke-width="1" stroke-dasharray="4 3"/>`).join('');
  /* The slot machine is drawn to match the cabinets along the left wall of casino-bg.jpg: a dark glossy navy body, a glowing cyan rim light,
     a marquee screen on top and a bright symbol screen with planets and gems. Its origin is the middle of its base, standing on the floor. */
  const SLOT_COLS = [['cyan', 'amber', 'pink', 'violet', 'star', 'seven'], ['pink', 'seven', 'cyan', 'amber', 'violet', 'star'], ['star', 'violet', 'seven', 'pink', 'cyan', 'amber'], ['amber', 'cyan', 'star', 'seven', 'pink', 'violet'], ['violet', 'pink', 'amber', 'star', 'seven', 'cyan']];
  function slotDefs() {
    return `<linearGradient id="cz-cab" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#24349f"/><stop offset=".14" stop-color="#101a63"/><stop offset=".55" stop-color="#070c36"/><stop offset=".88" stop-color="#0c1550"/><stop offset="1" stop-color="#2a3cb8"/></linearGradient>
      <linearGradient id="cz-cabv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f8cff" stop-opacity=".28"/><stop offset=".25" stop-color="#6f8cff" stop-opacity="0"/><stop offset=".8" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>
      <linearGradient id="cz-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9ff0ff"/><stop offset=".5" stop-color="#5a7bff"/><stop offset="1" stop-color="#b79cff"/></linearGradient>
      <linearGradient id="cz-scr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101f9a"/><stop offset=".55" stop-color="#070f5c"/><stop offset="1" stop-color="#03072f"/></linearGradient>
      <linearGradient id="cz-mq" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c34d8"/><stop offset=".6" stop-color="#3a22b4"/><stop offset="1" stop-color="#0a1060"/></linearGradient>
      <linearGradient id="cz-deck" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3ccc"/><stop offset=".12" stop-color="#16227f"/><stop offset="1" stop-color="#080d40"/></linearGradient>
      <linearGradient id="cz-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#02051f" stop-opacity=".85"/><stop offset=".22" stop-color="#02051f" stop-opacity="0"/><stop offset=".78" stop-color="#02051f" stop-opacity="0"/><stop offset="1" stop-color="#02051f" stop-opacity=".85"/></linearGradient>
      <linearGradient id="cz-rmask-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset=".55" stop-color="#555"/><stop offset="1" stop-color="#fff"/></linearGradient>
      <mask id="cz-rmask" maskUnits="userSpaceOnUse" x="-120" y="-310" width="240" height="320"><rect x="-120" y="-310" width="240" height="320" fill="url(#cz-rmask-g)"/></mask>
      <radialGradient id="cz-s-cyan" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#d8fbff"/><stop offset=".45" stop-color="#3fc9ff"/><stop offset="1" stop-color="#1a47d0"/></radialGradient>
      <radialGradient id="cz-s-pink" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#ffe0ee"/><stop offset=".45" stop-color="#ff4f9a"/><stop offset="1" stop-color="#8a1458"/></radialGradient>
      <radialGradient id="cz-s-amber" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#fff4c4"/><stop offset=".45" stop-color="#ffb02e"/><stop offset="1" stop-color="#c4480a"/></radialGradient>
      <linearGradient id="cz-s-violet" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0e4ff"/><stop offset=".5" stop-color="#9a6cff"/><stop offset="1" stop-color="#3a1fa8"/></linearGradient>
      <linearGradient id="cz-s-star" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6c8"/><stop offset=".55" stop-color="#ffd24a"/><stop offset="1" stop-color="#d98a12"/></linearGradient>
      <radialGradient id="cz-b-cy" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#e8fdff"/><stop offset=".5" stop-color="#37c8ff"/><stop offset="1" stop-color="#1650d8"/></radialGradient>
      <radialGradient id="cz-b-pk" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#ffe6f1"/><stop offset=".5" stop-color="#ff4f9a"/><stop offset="1" stop-color="#8a1458"/></radialGradient>
      <radialGradient id="cz-b-am" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#fff6cc"/><stop offset=".5" stop-color="#ffb02e"/><stop offset="1" stop-color="#b8480a"/></radialGradient>
      <radialGradient id="cz-planet" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#e9d9ff"/><stop offset=".4" stop-color="#7a6cff"/><stop offset="1" stop-color="#1a1a7a"/></radialGradient>
      <g id="cz-sy-cyan"><ellipse rx="12.5" ry="3.6" transform="rotate(-22)" fill="none" stroke="#8fe6ff" stroke-width="1.3" opacity=".7"/><circle r="7.6" fill="url(#cz-s-cyan)"/><ellipse rx="12.5" ry="3.6" transform="rotate(-22)" fill="none" stroke="#dff8ff" stroke-width="1.3" stroke-dasharray="14 40" stroke-dashoffset="-6"/><ellipse cx="-2.4" cy="-2.8" rx="2.6" ry="1.6" fill="#fff" opacity=".6"/></g>
      <g id="cz-sy-pink"><circle r="8.6" fill="url(#cz-s-pink)"/><ellipse cx="-2.6" cy="-3" rx="3" ry="1.8" fill="#fff" opacity=".6"/></g>
      <g id="cz-sy-amber"><circle r="8.6" fill="url(#cz-s-amber)"/><ellipse cx="-2.6" cy="-3" rx="3" ry="1.8" fill="#fff" opacity=".65"/></g>
      <g id="cz-sy-violet"><path d="M0-9.5L8.5-2.5 0 9.5-8.5-2.5Z" fill="url(#cz-s-violet)" stroke="#e4d4ff" stroke-width=".7"/><path d="M-8.5-2.5H8.5M-3-2.5L0-9.5 3-2.5 0 9.5Z" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width=".6"/></g>
      <g id="cz-sy-star"><path d="M0-10L2.9-3.4 10-3 4.5 1.7 6.2 8.6 0 4.9-6.2 8.6-4.5 1.7-10-3-2.9-3.4Z" fill="url(#cz-s-star)" stroke="#fff3b8" stroke-width=".7"/></g>
      <g id="cz-sy-seven"><text y="7.4" font-size="21" font-weight="900" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" fill="url(#cz-s-pink)" stroke="#ffd2e6" stroke-width=".7">7</text></g>`;
  }
  function slotSvg() {
    const colW = 23.2, x0 = -58 + colW / 2;
    const reels = SLOT_COLS.map((col, i) => {
      const strip = Array.from({ length: 28 }, (_, k) => `<use href="#cz-sy-${col[k % 6]}" y="${-195 + k * 30}"/>`).join('');
      return `<g transform="translate(${(x0 + i * colW).toFixed(1)} 0)"><g class="cz-reel" style="--rd:${(i * .17).toFixed(2)}s">${strip}</g></g>`;
    }).join('');
    const seams = [1, 2, 3, 4].map(i => `<line x1="${(-58 + i * colW).toFixed(1)}" y1="-210" x2="${(-58 + i * colW).toFixed(1)}" y2="-120" stroke="#3b4fe0" stroke-opacity=".55" stroke-width=".7"/>`).join('');
    const stars = [[-50, -262], [-42, -240], [44, -265], [52, -243], [-22, -268], [26, -237], [-56, -250], [58, -256]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r=".9" fill="#fff" class="cz-twk" style="--td:${i * .4}s"/>`).join('');
    const leds = (x) => `<path d="M${x} -66L${x * 1.03} -212" fill="none" stroke="url(#cz-rim)" stroke-width="2" stroke-linecap="round" stroke-dasharray="7 9" class="cz-led"/>`;
    const grille = [0, 1, 2].map(r => [0, 1, 2, 3].map(c => `<circle cx="${-62 + c * 5.4}" cy="${-62 + r * 5.4}" r="1.2" fill="#04061f" stroke="#3b4fe0" stroke-width=".4"/>`).join('')).join('');
    return `<ellipse cx="0" cy="6" rx="118" ry="15" fill="#37c8ff" opacity=".32" filter="url(#cz-blur)"/>
      <ellipse cx="0" cy="3" rx="92" ry="7" fill="#7ee0ff" opacity=".28" filter="url(#cz-soft)"/>
      <g transform="scale(1 -.32)" opacity=".34" mask="url(#cz-rmask)"><path d="M-78 -12L-80 -214C-82 -262-78 -282-52 -288H52C78 -282 82 -262 80 -214L78 -12Z" fill="url(#cz-cab)"/><rect x="-58" y="-270" width="116" height="38" fill="#3a5bff"/><rect x="-58" y="-210" width="116" height="90" fill="#35a8ff"/><rect x="-88" y="-10" width="176" height="10" fill="#37c8ff"/></g>
      <rect x="-90" y="-12" width="180" height="12" rx="4" fill="#060a2c" stroke="url(#cz-rim)" stroke-width="1"/><rect x="-82" y="-6" width="164" height="2" rx="1" fill="#7ee0ff" class="cz-strip"/>
      <path d="M-78 -12L-80 -214C-82 -262-78 -282-52 -288H52C78 -282 82 -262 80 -214L78 -12Z" fill="url(#cz-cab)" stroke="#5a7bff" stroke-width="5" stroke-opacity=".2"/>
      <path d="M-78 -12L-80 -214C-82 -262-78 -282-52 -288H52C78 -282 82 -262 80 -214L78 -12Z" fill="url(#cz-cabv)" stroke="url(#cz-rim)" stroke-width="2"/>
      <path d="M-70 -16L-72 -212C-73 -254-70 -272-48 -279H48C70 -272 73 -254 72 -212L70 -16Z" fill="none" stroke="#fff" stroke-opacity=".07" stroke-width="1"/>
      ${leds(-72)}${leds(72)}
      <g class="cz-lamp"><rect x="-9" y="-296" width="18" height="9" rx="3" fill="#0b1250" stroke="#7ee0ff" stroke-width=".8"/><path d="M-6 -296a6 6 0 0 1 12 0z" fill="#ff7ab6"/><ellipse cx="0" cy="-298" rx="14" ry="9" fill="#ff4f9a" opacity=".35" filter="url(#cz-blur)" class="cz-lampglow"/></g>
      <rect x="-64" y="-276" width="128" height="50" rx="9" fill="#02041c" stroke="#6b5cff" stroke-width="1.3"/>
      <rect x="-58" y="-270" width="116" height="38" rx="5" fill="url(#cz-mq)"/>${stars}
      <g transform="translate(0 -251)"><g transform="rotate(-18)"><ellipse rx="21" ry="5.2" fill="none" stroke="#7ee0ff" stroke-width="1.2" opacity=".55"/></g><circle r="10" fill="url(#cz-planet)"/><ellipse cx="-4" cy="-4.5" rx="4.5" ry="2.6" fill="#fff" opacity=".35"/>
        <g transform="rotate(-18) scale(1 .24)"><g class="cz-orbit"><circle cx="21" r="2.8" fill="#ffd56b"/></g></g><g transform="rotate(-18)"><path d="M-21 0A21 5.2 0 0 0 21 0" fill="none" stroke="#dff8ff" stroke-width="1.4" stroke-dasharray="22 60" stroke-dashoffset="-6" opacity=".9"/></g></g>
      <text x="-42" y="-248.6" font-size="6.8" font-weight="700" letter-spacing="1" text-anchor="middle" fill="#dff0ff" font-family="Audiowide,system-ui,sans-serif" class="cz-mqtxt">ORBIT</text><text x="42" y="-248.6" font-size="6.8" font-weight="700" letter-spacing="1" text-anchor="middle" fill="#ffd56b" font-family="Audiowide,system-ui,sans-serif" class="cz-mqtxt">SLOTS</text>
      <rect x="-66" y="-218" width="132" height="98" rx="11" fill="#02041c" stroke="url(#cz-rim)" stroke-width="1.6"/><rect x="-62" y="-214" width="124" height="90" rx="8" fill="none" stroke="#fff" stroke-opacity=".09"/>
      <rect x="-58" y="-210" width="116" height="90" rx="6" fill="url(#cz-scr)"/>
      <clipPath id="cz-scrclip"><rect x="-58" y="-210" width="116" height="90" rx="6"/></clipPath>
      <g clip-path="url(#cz-scrclip)">${reels}${seams}
        <rect x="-58" y="-180" width="116" height="30" fill="#ffd56b" opacity="0" class="cz-winrow"/><rect x="-57" y="-179" width="114" height="28" rx="3" fill="none" stroke="#ffd56b" stroke-width="1.4" opacity="0" class="cz-winrow"/>
        <rect x="-58" y="-166" width="116" height="2" fill="#ff5d8f" opacity=".6" class="cz-payline"/>
        <rect x="-58" y="-210" width="116" height="90" fill="url(#cz-shade)"/>
        <path d="M-58 -210H-6L-58 -128Z" fill="#fff" opacity=".07"/><path d="M4 -210H14L-58 -112V-128Z" fill="#fff" opacity=".04"/></g>
      <path d="M-76 -112H76L72 -72H-72Z" fill="url(#cz-deck)" stroke="#7ee0ff" stroke-opacity=".55" stroke-width="1"/><path d="M-74 -110H74" stroke="#fff" stroke-opacity=".22" stroke-width="1"/>
      <rect x="-64" y="-104" width="30" height="13" rx="3" fill="#02041c" stroke="#3b4fe0" stroke-width=".8"/><text x="-49" y="-94.4" font-size="7.6" font-weight="700" text-anchor="middle" fill="#7ee0ff" font-family="'Share Tech Mono',ui-monospace,monospace" class="cz-credit">0500</text>
      <circle cx="-26" cy="-92" r="4.4" fill="url(#cz-b-pk)" stroke="#fff" stroke-opacity=".5" stroke-width=".6" class="cz-btn" style="--bd:.2s"/><circle cx="-14" cy="-92" r="4.4" fill="url(#cz-b-am)" stroke="#fff" stroke-opacity=".5" stroke-width=".6" class="cz-btn" style="--bd:.7s"/>
      <circle cx="0" cy="-90" r="15" fill="#02041c" stroke="url(#cz-rim)" stroke-width="1.2"/><circle cx="0" cy="-90" r="15" fill="none" stroke="#37c8ff" stroke-width="5" opacity=".25" class="cz-spinglow"/><circle cx="0" cy="-90" r="11.4" fill="url(#cz-b-cy)" stroke="#fff" stroke-opacity=".6" stroke-width=".8" class="cz-spinbtn"/>
      <path d="M-4.6 -90A4.6 4.6 0 1 1 0 -85.4" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/><path d="M-1.4 -88.4L0 -85.2 2.6 -87.2" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="14" cy="-92" r="4.4" fill="url(#cz-b-cy)" stroke="#fff" stroke-opacity=".5" stroke-width=".6" class="cz-btn" style="--bd:.45s"/><circle cx="26" cy="-92" r="4.4" fill="url(#cz-b-pk)" stroke="#fff" stroke-opacity=".5" stroke-width=".6" class="cz-btn" style="--bd:.95s"/>
      <rect x="34" y="-104" width="30" height="13" rx="3" fill="#02041c" stroke="#3b4fe0" stroke-width=".8"/><text x="49" y="-94.4" font-size="6.6" font-weight="700" text-anchor="middle" fill="#ffd56b" font-family="'Share Tech Mono',ui-monospace,monospace">BET 50</text>
      <rect x="-71" y="-72" width="142" height="60" fill="#050934"/><path d="M-71 -72V-14M71 -72V-14" fill="none" stroke="#fff" stroke-opacity=".08"/>
      ${grille}<rect x="-24" y="-64" width="48" height="9" rx="3" fill="#02041a" stroke="#37c8ff" stroke-width=".9"/><rect x="-20" y="-60.2" width="40" height="1.6" rx=".8" fill="#7ee0ff" class="cz-slotled"/>
      <rect x="-18" y="-47" width="36" height="5" rx="2" fill="#02041a" stroke="#6b5cff" stroke-width=".8"/>
      <circle cx="50" cy="-56" r="7" fill="#02041a" stroke="#37c8ff" stroke-width="1"/><circle cx="50" cy="-56" r="3.2" fill="#37c8ff" class="cz-btn" style="--bd:.3s"/><rect x="38" y="-45" width="24" height="3" rx="1.5" fill="#6b5cff" opacity=".7"/>
      <path d="M-80 -212C-82 -262-78 -282-52 -288H-20L-70 -212Z" fill="#fff" opacity=".05"/>`;
  }
  function artSvg() {
    return `<svg class="cz-art" viewBox="0 0 1671 941" aria-hidden="true">
      <defs>
        <linearGradient id="cz-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset=".5" stop-color="#d9a93c"/><stop offset="1" stop-color="#8a5a12"/></linearGradient>
        <radialGradient id="cz-dish"><stop offset="0" stop-color="#2d1fa8"/><stop offset="1" stop-color="#0c0a3a"/></radialGradient>
        <linearGradient id="cz-body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a34e0"/><stop offset=".55" stop-color="#1b2fb8"/><stop offset="1" stop-color="#0a124f"/></linearGradient>
        <radialGradient id="cz-ball" cx=".35" cy=".3"><stop offset="0" stop-color="#ffd0dc"/><stop offset="1" stop-color="#d11f5e"/></radialGradient>
        <filter id="cz-blur"><feGaussianBlur stdDeviation="9"/></filter><filter id="cz-soft"><feGaussianBlur stdDeviation=".6"/></filter>
        ${slotDefs()}
      </defs>
      <g class="cz-bjart" transform="translate(222 728)">
        <ellipse cx="0" cy="6" rx="150" ry="40" fill="#37c8ff" opacity=".16" filter="url(#cz-blur)"/>
        <g transform="scale(1 .62)">
          <g class="cz-c1">${card(-78, -16, -14, 'K', '♠', false)}${card(-44, -6, 4, 'A', '♥', true)}</g>
          <g class="cz-c2">${card(46, 8, 10, '10', '♦', true)}${card(80, -2, -6, 'A', '♠', false)}</g>
          <g class="cz-c3">${card(0, 30, 2, '7', '♣', false)}</g>
        </g>
        ${chips(-118, 38, '#d11f5e', 4)}${chips(-98, 44, '#2563eb', 3)}${chips(118, 40, '#7a5cff', 5)}${chips(140, 34, '#ffd56b', 2)}
      </g>
      <g transform="translate(1415 690) scale(.96 .3)" class="cz-wheelart"><ellipse cx="0" cy="0" rx="150" ry="150" fill="#37c8ff" opacity=".16" filter="url(#cz-blur)"/>${wheelSvg()}</g>
      <g transform="translate(835 848) scale(1.08)" class="cz-slotart">${slotSvg()}</g>
    </svg>`;
  }
  function casinoHtml() {
    const spots = SPOTS.map((sp, i) => { const g = GAMES.find(x => x.id === sp.id);
      return `<button class="cz-spot${g.live ? '' : ' soon'}${sp.up ? ' up' : ''}" data-gb="enter" data-g="${g.id}" data-x="${sp.x}" data-y="${sp.y}" style="left:${sp.x * 100}%;top:${sp.y * 100}%;--d:${1.5 + i * .22}s" aria-label="${g.title}: ${g.live ? g.blurb : 'coming soon'}">
        <span class="cz-spot-in"><span class="cz-ico">${ic(g.icon, 30)}</span><b>${g.title}</b><small>${g.live ? 'Tap to play' : 'Coming soon'}</small></span></button>`; }).join('');
    const list = GAMES.map(g => `<button class="cz-row" data-gb="enter" data-fast="1" data-g="${g.id}"><span class="cz-ico">${ic(g.icon, 26)}</span><span><b>${g.title}</b><small>${g.live ? g.blurb : 'Coming soon'}</small></span></button>`).join('');
    return `<div class="cz" id="cz"><div class="cz-stage" id="cz-stage"><div class="cz-zoom" id="cz-zoom">
        <img class="cz-bg" src="casino-bg.jpg" alt="" draggable="false">
        <div class="cz-logo" role="img" aria-label="Orbit Casino"><span class="cz-lg-halo"></span>
          <img class="cz-lg-mark" src="orbit-logo-planet.png" alt="" draggable="false">
          <img class="cz-lg-word" src="orbit-wordmark.png" alt="" draggable="false">
          <span class="cz-lg-tag" aria-hidden="true"><i class="l"></i><span>${[...'CASINO'].map((c, i) => `<b style="--i:${i}">${c}</b>`).join('')}</span><i class="r"></i></span></div>
        ${artSvg()}${spots}</div></div>
      <div class="cz-hud" aria-label="Your Orbit balance"><img src="logo.svg" width="22" height="22" alt=""><b id="cz-bal">${num(G.shownBal ?? G.bal)}</b><span>Orbits</span></div>
      <div class="cz-list">${list}</div><div class="cz-flash" id="cz-flash"></div></div>`;
  }
  /* The picture is cropped to fill the screen, so on narrower windows its edges (and the Blackjack / Roulette buttons on them) can end up
     against the edge of the page. Slide each button inwards until it has some breathing room. */
  function layoutSpots() {
    const z = $q('#cz'), st = $q('#cz-stage'); if (!z || !st || z.hidden) return;
    const cw = z.clientWidth, sw = st.offsetWidth; if (!cw || !sw) return;
    const crop = Math.max(0, (sw - cw) / 2), pad = Math.max(28, cw * .06);
    st.querySelectorAll('.cz-spot').forEach(b => {
      const sp = SPOTS.find(x => x.id === b.dataset.g); if (!sp) return;
      const half = (b.querySelector('.cz-spot-in')?.offsetWidth || b.offsetWidth) / 2 * 1.16;
      const lo = crop + pad + half, hi = sw - crop - pad - half;
      b.style.left = (lo > hi ? sw / 2 : Math.min(Math.max(sp.x * sw, lo), hi)) / sw * 100 + '%';
    });
  }
  function applyScene() {
    const lobby = G.scene === 'lobby', z = $q('#cz'), m = $q('#gb-main'), sc = $q('.gbscreen');
    if (z) z.hidden = !lobby; if (m) m.hidden = lobby; if (sc) sc.classList.toggle('in-lobby', lobby);
    if (lobby) requestAnimationFrame(layoutSpots);
  }
  function enterGame(id, fast) {
    if (G.zooming) return;
    const go = () => { G.zooming = false; G.game = id; G.scene = 'game'; applyScene(); paintBody(); $q('.gbscreen')?.scrollTo?.({ top: 0 }); if (id === 'bj') focusTable(); };
    const st = $q('#cz-stage'), zm = $q('#cz-zoom'), fl = $q('#cz-flash');
    if (fast || !st || !zm) return go();
    G.zooming = true;
    const sp = SPOTS.find(x => x.id === id), W = st.offsetWidth, H = st.offsetHeight, s = id === 'bj' ? 3.4 : id === 'roulette' ? 3.8 : 2.7;
    $q('#cz').classList.add('zooming');
    zm.style.transform = `translate(${W / 2 - s * sp.fx * W}px,${H / 2 - s * sp.fy * H}px) scale(${s})`;
    later(() => fl?.classList.add('on'), 950);
    later(go, 1350);
  }
  function leaveGame() {
    if (G.zooming) return;
    if (G.sl.busy || G.rl.busy) return toast('Let the spin finish first.', true);
    if (G.bot?.status === 'active' || (G.pvp && (G.pvp.status === 'playing' || G.pvp.status === 'open'))) return toast(G.pvp?.status === 'open' ? 'Cancel your open table first.' : 'Finish your hand first.', true);
    const sp = SPOTS.find(x => x.id === G.game) || SPOTS[0];
    G.scene = 'lobby'; G.zooming = true; applyScene();
    const st = $q('#cz-stage'), zm = $q('#cz-zoom'), fl = $q('#cz-flash'), z = $q('#cz'); if (!st || !zm) { G.zooming = false; return; }
    const W = st.offsetWidth, H = st.offsetHeight, s = G.game === 'bj' ? 3.4 : G.game === 'roulette' ? 3.8 : 2.7;
    z.classList.add('zooming'); fl.classList.add('on'); zm.style.transition = 'none';
    zm.style.transform = `translate(${W / 2 - s * sp.fx * W}px,${H / 2 - s * sp.fy * H}px) scale(${s})`;
    void zm.offsetWidth; zm.style.transition = ''; z.classList.add('out');
    requestAnimationFrame(() => { z.classList.remove('zooming'); fl.classList.remove('on'); zm.style.transform = ''; });
    later(() => { z.classList.remove('out'); G.zooming = false; }, 950);
  }

  /* ───────── page ───────── */
  function shell() {
    const stars = Array.from({ length: 46 }, (_, i) => `<i style="left:${(i * 37 + 11) % 100}%;top:${(i * 53 + 7) % 100}%;--d:${(i % 9) * .5}s;--s:${1 + (i % 3)}px"></i>`).join('');
    return `<div class="gbscreen in-lobby"><div class="gb-sky" aria-hidden="true">${stars}<span class="gb-neb a"></span><span class="gb-neb b"></span></div>
      <div class="top gbtop"><button class="ib gtog" id="gbtog" data-gb="side" aria-label="${S.sideOff ? 'Show sidebar' : 'Hide sidebar'}" title="${S.sideOff ? 'Show sidebar' : 'Hide sidebar'}">${ic('chev')}</button>${menuBtn()}<span class="hashi">${ic('dice', 20)}</span><b class="title">Orbit Casino</b></div>
      ${casinoHtml()}
      <div class="gb" id="gb-main" hidden>
        <header class="gb-head"><button class="gb-back" data-gb="back" aria-label="Back to the casino floor">${ic('gback', 18)}<span>Casino</span></button><span class="gb-logo">${ic('dice', 34)}</span>
          <div><h1>Orbit Casino</h1><p>Test your luck with Orbits. Play for fun: Orbits are free, can’t be bought and have no cash value.</p></div></header>
        <section class="gb-stats" id="gb-stats" aria-label="Your Orbits and daily tries"></section>
        <section id="gb-body" class="gb-body" aria-live="polite"></section>
        <p class="gb-fine">Orbits are a free play currency. Casino winnings never count toward the Orbit Leaderboard’s earned boards, and nothing here can be bought or cashed out. Take a break any time.</p>
      </div></div>`;
  }

  function paintStats() {
    const el = $q('#gb-stats'); if (!el) return;
    const st = G.st, left = freeLeft(), used = st?.tries_used || 0, extra = Math.max(0, used - FREE_TRIES), net = Number(st?.today_net || 0);
    const pips = Array.from({ length: FREE_TRIES }, (_, i) => `<i class="gb-pip${i < left ? ' on' : ''}"></i>`).join('');
    el.innerHTML = `
      <div class="gb-stat gb-balance"><span class="gb-lab">Your Orbit balance</span>
        <div class="gb-balrow"><img src="logo.svg" width="34" height="34" alt=""><b id="gb-bal">${num(G.shownBal ?? G.bal)}</b><span>Orbits</span></div>
        <small>Spend them in the Orbit Shop or play them here</small></div>
      <div class="gb-stat gb-tries"><span class="gb-lab">Daily tries · all games</span>
        <div class="gb-pips" role="img" aria-label="${left} of ${FREE_TRIES} free tries left today">${pips}<b>${left} <small>of ${FREE_TRIES} free</small></b></div>
        <small>${left ? `Extra tries cost ${num(EXTRA_FEE)} Orbits each` : `Free tries used${extra ? ` · ${extra} extra today` : ''} · each extra costs ${num(EXTRA_FEE)} + your bet`}${st ? ` · resets in <span id="gb-reset">${dur(Math.max(0, (st.resets_in || 0) - (Date.now() - G.stAt) / 1000))}</span>` : ''}</small></div>
      <div class="gb-stat gb-net ${net > 0 ? 'pos' : net < 0 ? 'neg' : ''}"><span class="gb-lab">Today’s result</span>
        <div class="gb-netrow"><b>${st ? signed(net) : '—'}</b><span>Orbits</span></div>
        <small>Bot Blackjack, Slots and Roulette share your tries. Player tables are free</small></div>`;
    G.shownBal = G.bal;
    const zb = $q('#cz-bal'); if (zb) zb.textContent = num(G.bal);
  }

  function paintBody() {
    const el = $q('#gb-body'); if (!el) return;
    G.anim = 0;
    if (!G.loaded) { el.innerHTML = '<div class="gb-load"><span class="gb-spin"></span>Opening the Orbit Casino…</div>'; return; }
    if (G.err === 'setup') { el.innerHTML = '<div class="gb-panel gb-setup"><h3>Orbit Casino needs one-time setup</h3><p>Ask the site owner to run <code>migration-gamble.sql</code> and <code>migration-casino-slots-roulette.sql</code> in the Orbit Supabase project (SQL Editor), then reload this page.</p></div>'; return; }
    if (G.err) { el.innerHTML = `<div class="gb-panel gb-setup"><h3>Couldn’t open the casino</h3><p>${esc(G.err)}</p><button class="gb-btn" data-gb="retry">Try again</button></div>`; return; }
    if (G.game === 'slots') { el.innerHTML = slotsHtml(); return; }
    if (G.game === 'roulette') { el.innerHTML = rouletteHtml(); return; }
    const modes = `<div class="gb-modes" role="tablist" aria-label="Blackjack mode">
      <button role="tab" class="gb-mode${G.mode === 'bot' ? ' on' : ''}" data-gb="mode" data-m="bot" aria-selected="${G.mode === 'bot'}"><span>🤖</span> vs Orbit Bot <em>${freeLeft() ? `${freeLeft()} free left` : `${num(EXTRA_FEE)}/try`}</em></button>
      <button role="tab" class="gb-mode${G.mode === 'pvp' ? ' on' : ''}" data-gb="mode" data-m="pvp" aria-selected="${G.mode === 'pvp'}"><span>👥</span> vs Players <em>Unlimited</em></button></div>`;
    el.innerHTML = modes + (G.mode === 'bot' ? botHtml() : pvpHtml());
    afterPaint();
  }

  /* cards: new ones fly in (one after another), a face-down card that was turned over flips. Cards already on the table never replay. */
  let maxDelay = 0, initDeal = false;
  const beginZones = () => { initDeal = Object.values(G.seen).every(v => !v.length); };   // nothing on the table yet: deal one card to each side in turn
  function zoneHtml(zone, cards, index) {
    const prev = G.seen[zone] || [], init = initDeal;
    let k = 0, out = '';
    cards.forEach((cd, i) => {
      let cls = '', dl = 0;
      if (prev[i] === undefined) { cls = 'deal'; dl = init ? (i * 2 + index) * 320 : index ? 250 + (k++) * 480 : 0; }
      else if (prev[i] < 0 && cd >= 0) { cls = 'flip'; dl = 250; k++; }
      if (cls) maxDelay = Math.max(maxDelay, dl + 520);
      out += cardHtml(cd, cls, dl);
    });
    G.seen[zone] = cards.slice();
    return out;
  }
  function afterPaint() {
    G.anim = maxDelay; maxDelay = 0;
    const sync = () => {
      const pt = $q('#gb-pt'), dt = $q('#gb-dt'), me = $q('#gb-mt'), op = $q('#gb-ot');
      if (G.mode === 'bot' && G.bot) { G.disp.p = G.bot.player_total; G.disp.d = G.bot.dealer_total; }
      if (G.mode === 'pvp' && G.pvp) { G.disp.me = G.pvp.my_total; G.disp.opp = G.pvp.their_total; }
      const v = x => (x == null ? '—' : x);
      if (pt) { pt.textContent = v(G.disp.p); pt.parentElement.classList.toggle('bust', G.disp.p > 21); }
      if (dt) { dt.innerHTML = G.disp.d == null ? '—' : G.disp.d + (G.bot?.dealer_hidden ? '<small> + ?</small>' : ''); dt.parentElement.classList.toggle('bust', G.disp.d > 21); }
      if (me) { me.textContent = v(G.disp.me); me.parentElement.classList.toggle('bust', G.disp.me > 21); }
      if (op) { op.textContent = G.disp.opp == null ? '?' : G.disp.opp; op.parentElement.classList.toggle('bust', G.disp.opp > 21); }
    };
    if (G.anim) later(sync, Math.min(G.anim, 900)); else sync();
    // the outcome is announced once the last card has landed
    const over = (G.mode === 'bot' && G.bot?.status === 'done') || (G.mode === 'pvp' && G.pvp && (G.pvp.status === 'done' || G.pvp.status === 'cancelled'));
    if (over && !G.resShown) later(showResult, G.anim + 250);
    else if (over && G.resShown) { const r = $q('#gb-result'); if (r) r.innerHTML = resultHtml(); }
  }

  /* ----- bot table ----- */
  function dealState() {
    const left = freeLeft(), fee = left ? 0 : EXTRA_FEE, need = G.bet + fee, poor = G.bal < need;
    let label = G.busy ? 'Dealing…' : poor ? 'Not enough Orbits' : fee ? (G.confirmPaid ? `Tap again to pay ${num(need)}` : `Deal · ${num(fee)} try fee`) : 'Deal · Free try';
    const note = poor ? `You need ${num(need)} Orbits${fee ? ` (${num(G.bet)} bet + ${num(fee)} try fee)` : ''}. You have ${num(G.bal)}.`
      : fee ? `Your ${FREE_TRIES} free tries are used. This extra try costs ${num(fee)} Orbits on top of your ${num(G.bet)} bet.`
      : `Free try ${(G.st?.tries_used || 0) + 1} of ${FREE_TRIES} today. Win ${num(G.bet)}, or ${num(Math.floor(G.bet * 2.5))} with a blackjack.`;
    return { label, note, poor, fee };
  }
  function updateDeal() {
    const b = $q('#gb-deal'); if (!b) return; const d = dealState();
    b.textContent = d.label; b.disabled = d.poor || G.busy; b.classList.toggle('pay', !!d.fee && !d.poor); b.classList.toggle('confirm', G.confirmPaid);
    const n = $q('#gb-dealnote'); if (n) { n.textContent = d.note; n.classList.toggle('warn', d.poor || !!d.fee); }
  }
  function paintActions() { if (G.mode === 'bot') { const a = $q('#gb-controls'); if (a) a.innerHTML = botControls(); } else paintBody(); }
  function botControls() {
    const g = G.bot;
    if (g?.status === 'active') return `<div class="gb-actions"><button class="gb-btn hit" data-gb="hit"${G.busy ? ' disabled' : ''}>Hit <kbd>H</kbd></button><button class="gb-btn stand" data-gb="stand"${G.busy ? ' disabled' : ''}>Stand <kbd>S</kbd></button></div>
      <p class="gb-note">${num(g.bet)} Orbits on the table · you can’t leave a hand unfinished</p>`;
    const d = dealState();
    return `<div class="gb-bet"><div class="gb-chips" role="group" aria-label="Choose your bet">${CHIPS.map((v, i) => `<button class="gb-chip c${i}${G.bet === v ? ' on' : ''}" data-gb="chip" data-v="${v}" aria-pressed="${G.bet === v}" aria-label="Bet ${num(v)} Orbits"><span>${short(v)}</span></button>`).join('')}</div>
      <label class="gb-custom"><span>Bet</span><input id="gb-betin" type="number" min="${MIN_BET}" max="${MAX_BET}" step="10" inputmode="numeric" value="${G.bet}" aria-label="Bet in Orbits"><span>Orbits</span></label>
      <button class="gb-btn deal${d.fee && !d.poor ? ' pay' : ''}${G.confirmPaid ? ' confirm' : ''}" id="gb-deal" data-gb="deal"${d.poor || G.busy ? ' disabled' : ''}>${d.label}</button></div>
      <p class="gb-note${d.poor || d.fee ? ' warn' : ''}" id="gb-dealnote">${d.note}</p>`;
  }
  function botHtml() {
    const g = G.bot, has = !!g;
    beginZones();
    const pCards = has ? zoneHtml('player', g.player, 0) : slotHtml(2), dCards = has ? zoneHtml('dealer', g.dealer, 1) : slotHtml(2);
    const pt = G.disp.p ?? '—', dt = G.disp.d == null ? '—' : G.disp.d + (g?.dealer_hidden ? '<small> + ?</small>' : '');
    return `<div class="gb-felt${g?.status === 'active' ? ' live' : ''}" id="gb-felt"><div class="gb-feltlabel">ORBIT BLACKJACK</div>
      <div class="gb-seat"><div class="gb-seathead"><span class="gb-who"><i class="gb-botav">🤖</i><b>Orbit Bot</b><small>Dealer</small></span><span class="gb-tot${G.disp.d > 21 ? ' bust' : ''}"><span id="gb-dt">${dt}</span></span></div><div class="gb-hand" id="gb-dh">${dCards}</div></div>
      <div class="gb-mid"><span class="gb-rule">Dealer stands on 17 · Blackjack pays 3:2</span>${has ? `<span class="gb-pot"><img src="logo.svg" width="18" height="18" alt="">${num(g.bet)}</span>` : ''}</div>
      <div id="gb-result" class="gb-resultwrap">${has && g.status === 'done' && G.resShown ? resultHtml() : ''}</div>
      <div class="gb-seat you"><div class="gb-seathead"><span class="gb-who">${av(S.me)}<b>You</b></span><span class="gb-tot${G.disp.p > 21 ? ' bust' : ''}"><span id="gb-pt">${pt}</span></span></div><div class="gb-hand" id="gb-ph">${pCards}</div></div>
      <div class="gb-sparks" id="gb-sparks" aria-hidden="true"></div></div>
      <div class="gb-controls" id="gb-controls">${botControls()}</div>`;
  }

  /* ----- players tables ----- */
  const opp = () => prof(G.pvp?.opponent);
  function pvpHtml() {
    const g = G.pvp;
    if (!g) return lobbyHtml();
    if (g.status === 'open') return `<div class="gb-panel gb-wait"><div class="gb-orbitload" aria-hidden="true"><i></i><i></i><b>${ic('dice', 30)}</b></div>
      <h3>Your table is open</h3><p>Ante <b>${num(g.ante)}</b> Orbits · pot <b>${num(g.pot)}</b>. Waiting for a challenger… this page updates by itself.</p>
      <button class="gb-btn ghost" data-gb="pvpcancel"${G.busy ? ' disabled' : ''}>Cancel table (ante refunded)</button></div>`;
    const over = g.status === 'done' || g.status === 'cancelled', mt = G.disp.me ?? '—';
    beginZones();
    const mine = zoneHtml('me', g.mine, 0), them = g.theirs.length ? zoneHtml('opp', g.theirs, 1) : slotHtml(2);
    const o = opp(), ot = G.disp.opp == null ? '?' : G.disp.opp;
    const status = over ? '' : g.my_turn ? '<b class="gb-turn you">Your turn</b>' : g.my_stand ? `<b class="gb-turn">You stand · waiting for ${esc(o?.display_name || 'opponent')}</b>` : `<b class="gb-turn">${esc(o?.display_name || 'Opponent')} is playing…</b>`;
    return `<div class="gb-felt pvp${!over && g.my_turn ? ' live' : ''}" id="gb-felt"><div class="gb-feltlabel">HEAD TO HEAD</div>
      <div class="gb-seat"><div class="gb-seathead"><span class="gb-who">${o ? av(o) : ''}<b>${esc(o?.display_name || 'Opponent')}</b>${g.their_stand && !over ? '<small class="stand">Standing</small>' : ''}</span><span class="gb-tot${G.disp.opp > 21 ? ' bust' : ''}"><span id="gb-ot">${ot}</span></span></div><div class="gb-hand" id="gb-dh">${them}</div></div>
      <div class="gb-mid"><span class="gb-rule">Closest to 21 wins · bust loses · tie returns both antes</span><span class="gb-pot"><img src="logo.svg" width="18" height="18" alt="">Pot ${num(g.pot)}</span></div>
      <div id="gb-result" class="gb-resultwrap">${over && G.resShown ? resultHtml() : ''}</div>
      <div class="gb-seat you"><div class="gb-seathead"><span class="gb-who">${av(S.me)}<b>You</b>${g.my_stand && !over ? '<small class="stand">Standing</small>' : ''}</span><span class="gb-tot${G.disp.me > 21 ? ' bust' : ''}"><span id="gb-mt">${mt}</span></span></div><div class="gb-hand" id="gb-ph">${mine}</div></div>
      <div class="gb-sparks" id="gb-sparks" aria-hidden="true"></div></div>
      <div class="gb-controls">${over ? `<div class="gb-actions"><button class="gb-btn deal" data-gb="pvpback">Back to the lobby</button></div>`
        : `<div class="gb-turnrow">${status}<span class="gb-timer${g.my_turn ? ' you' : ''}" title="Turns time out after 45 seconds"><i></i><span id="gb-ptimer">${dur(Math.max(0, (g.secs_left ?? 0) - (Date.now() - G.pvpAt) / 1000))}</span></span></div>
        <div class="gb-actions"><button class="gb-btn hit" data-gb="phit"${g.my_turn && !G.busy ? '' : ' disabled'}>Hit <kbd>H</kbd></button><button class="gb-btn stand" data-gb="pstand"${g.my_turn && !G.busy ? '' : ' disabled'}>Stand <kbd>S</kbd></button></div>`}</div>`;
  }
  function lobbyHtml() {
    return `<div class="gb-lobby"><div class="gb-panel gb-create"><h3>Open a table</h3><p>Pick an ante. When someone joins, you both play head to head: the hand closest to 21 takes the whole pot.</p>
        <div class="gb-chips" role="group" aria-label="Choose your ante">${CHIPS.map((v, i) => `<button class="gb-chip c${i}${G.ante === v ? ' on' : ''}" data-gb="ante" data-v="${v}" aria-pressed="${G.ante === v}" aria-label="Ante ${num(v)} Orbits"><span>${short(v)}</span></button>`).join('')}</div>
        <label class="gb-custom"><span>Ante</span><input id="gb-antein" type="number" min="${MIN_BET}" max="${MAX_BET}" step="10" inputmode="numeric" value="${G.ante}" aria-label="Ante in Orbits"><span>Orbits</span></label>
        <button class="gb-btn deal" data-gb="pvpcreate"${G.busy || G.bal < G.ante ? ' disabled' : ''}>${G.bal < G.ante ? 'Not enough Orbits' : `Open table · ${num(G.ante)} ante`}</button>
        <p class="gb-note">No tries, no fee, no daily limit. Turns time out after 45 seconds so nobody can stall a table.</p></div>
      <div class="gb-panel gb-tables"><h3>Open tables <small><i class="gb-live"></i>live</small></h3><div id="gb-list">${lobbyListHtml()}</div></div></div>`;
  }
  function lobbyListHtml() {
    if (!G.lobby.length) return '<p class="gb-empty">No open tables right now. Open one and a challenger can jump in.</p>';
    return `<ul class="gb-rows">${G.lobby.map((t, i) => { const p = prof(t.host), poor = G.bal < t.ante;
      return `<li style="--i:${i}"><span class="gb-who">${p ? av(p) : ''}<b>${esc(t.name)}</b><small>${ago(t.age)}</small></span><span class="gb-antepill"><img src="logo.svg" width="16" height="16" alt="">${num(t.ante)}</span>
        <button class="gb-btn sm" data-gb="pvpjoin" data-id="${esc(t.id)}"${poor || G.busy ? ' disabled' : ''}>${poor ? 'Need more Orbits' : 'Join'}</button></li>`; }).join('')}</ul>`;
  }
  function paintLobbyList() { const el = $q('#gb-list'); if (el) el.innerHTML = lobbyListHtml(); }

  /* ----- result banner and effects ----- */
  function outcomeInfo() {
    if (G.mode === 'bot' && G.bot?.status === 'done') {
      const g = G.bot, net = g.payout - g.bet;
      const t = { blackjack: ['bj', 'Blackjack!', 'Natural 21 pays 3:2'], win: ['win', 'You win!', `You beat the Bot ${g.player_total} to ${g.dealer_total}`], dealer_bust: ['win', 'Dealer busts!', `The Bot went over with ${g.dealer_total}`],
        push: ['push', 'Push', 'Same total: your bet is returned'], lose: ['lose', 'The Bot wins', g.dealer_total === 21 && g.dealer.length === 2 ? 'The Bot had blackjack' : `${g.dealer_total} beats ${g.player_total}`], bust: ['lose', 'Bust!', `You went over with ${g.player_total}`] }[g.outcome] || ['push', 'Hand over', ''];
      return { kind: t[0], title: t[1], sub: t[2], net };
    }
    const g = G.pvp; if (!g) return null;
    if (g.status === 'cancelled') return { kind: 'push', title: 'Table closed', sub: 'Your ante was returned', net: 0 };
    const won = g.winner && g.winner === meId(), push = !g.winner, oname = opp()?.display_name || 'Your opponent';
    if (push) return { kind: 'push', title: 'Push', sub: g.my_total > 21 && g.their_total > 21 ? 'You both busted: antes returned' : 'Same total: antes returned', net: 0 };
    if (won) return { kind: g.outcome === 'blackjack' ? 'bj' : 'win', title: g.outcome === 'blackjack' ? 'Blackjack! You win!' : 'You win the pot!', sub: g.outcome === 'bust' ? `${oname} busted with ${g.their_total}` : `${g.my_total} beats ${g.their_total}`, net: g.ante };
    return { kind: 'lose', title: g.my_total > 21 ? 'Bust!' : `${oname} wins`, sub: g.my_total > 21 ? `You went over with ${g.my_total}` : `${g.their_total} beats ${g.my_total}`, net: -g.ante };
  }
  function resultHtml() {
    const o = outcomeInfo(); if (!o) return '';
    return `<div class="gb-result ${o.kind}" role="status"><b>${esc(o.title)}</b><span>${esc(o.sub)}</span>${o.kind === 'push' ? '' : `<em class="gb-delta ${o.net >= 0 ? 'pos' : 'neg'}">${signed(o.net)} Orbits</em>`}</div>`;
  }
  function showResult() {
    G.resShown = true; const r = $q('#gb-result'); if (!r) return; const o = outcomeInfo(); if (!o) return;
    r.innerHTML = resultHtml();
    const felt = $q('#gb-felt');
    if (o.kind === 'lose') { felt?.classList.add('shake'); later(() => felt?.classList.remove('shake'), 600); }
    else if (o.kind === 'win' || o.kind === 'bj') sparks(o.kind);
  }
  function sparks(kind) {
    const box = $q('#gb-sparks'); if (!box) return;
    const cols = kind === 'bj' ? ['#ffd56b', '#ff7ad9', '#b79cff', '#fff'] : ['#37e0ff', '#7aa6ff', '#b79cff', '#fff'];
    box.innerHTML = Array.from({ length: kind === 'bj' ? 44 : 28 }, () => {
      const a = Math.random() * Math.PI * 2, d = 80 + Math.random() * 190;
      return `<i style="--x:${Math.cos(a) * d | 0}px;--y:${Math.sin(a) * d | 0}px;--c:${cols[Math.random() * cols.length | 0]};--s:${3 + Math.random() * 5 | 0}px;--t:${900 + Math.random() * 700 | 0}ms"></i>`;
    }).join('');
    later(() => { const b = $q('#gb-sparks'); if (b) b.innerHTML = ''; }, 1800);
  }

  /* ───────── slots ───────── */
  const SL = [
    { n: 'Planet', pay: [1, 4, 15, 70] }, { n: 'Comet', pay: [1, 5, 20, 90] }, { n: 'Sun', pay: [2, 8, 30, 150] },
    { n: 'Gem', pay: [2, 15, 60, 300] }, { n: 'Star', pay: [4, 30, 120, 600] }, { n: 'Lucky 7', pay: [8, 60, 300, 2000] },
  ];   // display only: the real multipliers live in slots_spin
  const slDefs = () => `<svg class="sl-defs" width="0" height="0" aria-hidden="true"><defs>
    <radialGradient id="sl-g0" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#d8fbff"/><stop offset=".45" stop-color="#3fc9ff"/><stop offset="1" stop-color="#1a47d0"/></radialGradient>
    <radialGradient id="sl-g1" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#ffe0ee"/><stop offset=".45" stop-color="#ff4f9a"/><stop offset="1" stop-color="#8a1458"/></radialGradient>
    <radialGradient id="sl-g2" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#fff4c4"/><stop offset=".45" stop-color="#ffb02e"/><stop offset="1" stop-color="#c4480a"/></radialGradient>
    <linearGradient id="sl-g3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0e4ff"/><stop offset=".5" stop-color="#9a6cff"/><stop offset="1" stop-color="#3a1fa8"/></linearGradient>
    <linearGradient id="sl-g4" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6c8"/><stop offset=".55" stop-color="#ffd24a"/><stop offset="1" stop-color="#d98a12"/></linearGradient></defs></svg>`;
  function slSym(i) {
    const body = [
      '<ellipse rx="11.5" ry="3.4" transform="rotate(-22)" fill="none" stroke="#8fe6ff" stroke-width="1.2" opacity=".75"/><circle r="7" fill="url(#sl-g0)"/><ellipse cx="-2.3" cy="-2.6" rx="2.4" ry="1.4" fill="#fff" opacity=".6"/>',
      '<path d="M-3-3L-11 8 4-1z" fill="#ff7ab6" opacity=".55"/><circle r="6.8" fill="url(#sl-g1)"/><ellipse cx="-2.2" cy="-2.6" rx="2.4" ry="1.5" fill="#fff" opacity=".6"/>',
      '<g stroke="#ffcf5a" stroke-width="1.6" stroke-linecap="round">' + [0, 45, 90, 135, 180, 225, 270, 315].map(a => `<line x1="0" y1="-8.4" x2="0" y2="-11" transform="rotate(${a})"/>`).join('') + '</g><circle r="6.4" fill="url(#sl-g2)"/><ellipse cx="-2.2" cy="-2.6" rx="2.2" ry="1.4" fill="#fff" opacity=".65"/>',
      '<path d="M0-10.5L8.6-2.6 0 10.5-8.6-2.6Z" fill="url(#sl-g3)" stroke="#e4d4ff" stroke-width=".7"/><path d="M-8.6-2.6H8.6M-3.2-2.6L0-10.5 3.2-2.6 0 10.5Z" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width=".6"/>',
      '<path d="M0-10.5L3-3.6 10.5-3.1 4.7 1.8 6.5 9 0 5.1-6.5 9-4.7 1.8-10.5-3.1-3-3.6Z" fill="url(#sl-g4)" stroke="#fff3b8" stroke-width=".7"/>',
      '<text y="7.6" font-size="21" font-weight="900" text-anchor="middle" font-family="Georgia,serif" fill="#ff5fa8" stroke="#ffd2e6" stroke-width=".7">7</text>',
    ][i];
    return `<svg viewBox="-12 -12 24 24" role="img" aria-label="${SL[i].n}">${body}</svg>`;
  }
  function slotsHtml() {
    const s = G.sl, fee = tryFee(), poor = G.bal < G.bet + fee;
    return `<div class="sl" id="sl">${slDefs()}
      <div class="sl-cab"><div class="sl-mq"><b>ORBIT</b><i></i><b>SLOTS</b></div>
        <div class="sl-win" id="sl-win">${s.reels.map((r, i) => `<div class="sl-reel" id="sl-r${i}">${slSym(r)}</div>`).join('')}<span class="sl-line" aria-hidden="true"></span></div>
        <div class="sl-result" id="sl-result" role="status" aria-live="polite">${s.res ? slResultHtml(s.res) : '<span>Match symbols in a row from the left reel. Two in a row already pays.</span>'}</div>
        <div class="gb-bet"><div class="gb-chips" role="group" aria-label="Choose your bet">${CHIPS.map((v, i) => `<button class="gb-chip c${i}${G.bet === v ? ' on' : ''}" data-gb="slchip" data-v="${v}" aria-pressed="${G.bet === v}" aria-label="Bet ${num(v)} Orbits"><span>${short(v)}</span></button>`).join('')}</div>
          <label class="gb-custom"><span>Bet</span><input id="sl-betin" type="number" min="${MIN_BET}" max="${MAX_BET}" step="10" inputmode="numeric" value="${G.bet}" aria-label="Bet in Orbits"><span>Orbits</span></label>
          <button class="gb-btn deal" id="sl-spin" data-gb="slspin"${poor || s.busy ? ' disabled' : ''}>${s.busy ? 'Spinning…' : poor ? 'Not enough Orbits' : `Spin · ${num(G.bet)}${feeTxt(fee)}`}</button></div>
        <p class="gb-note${fee ? ' warn' : ''}" id="sl-note">${slNote(poor, fee)}</p></div>
      <div class="gb-panel sl-pay"><h3>Prizes <small>× your bet, for a run starting on the left reel</small></h3>
        <div class="sl-paytbl" role="table"><div class="sl-ph" role="row"><span></span><span>2</span><span>3</span><span>4</span><span>5</span></div>
        ${SL.map((x, i) => `<div role="row"><span class="sl-pn">${slSym(i)}<b>${x.n}</b></span>${x.pay.map(m => `<span>${num(m)}×</span>`).join('')}</div>`).join('')}</div></div></div>`;
  }
  const slNote = (poor, fee) => poor ? `You need ${num(G.bet + fee)} Orbits${fee ? ` (${num(G.bet)} bet + ${num(fee)} try fee)` : ''}. You have ${num(G.bal)}.`
    : fee ? `Your ${FREE_TRIES} free tries today are used. Each spin now costs ${num(fee)} Orbits on top of your bet.`
    : `${num(MIN_BET)} to ${num(MAX_BET)} Orbits a spin. Free try ${(G.st?.tries_used || 0) + 1} of ${FREE_TRIES} today, shared with Blackjack and Roulette.`;
const slResultHtml = r => r.payout > 0
    ? `<b class="win">${r.run} ${SL[r.symbol].n}${r.run > 1 ? 's' : ''} in a row · ${num(r.mult)}×</b><em class="gb-delta ${r.net >= 0 ? 'pos' : 'neg'}">${r.net > 0 ? 'You won ' : 'Returned '}${num(r.payout)} Orbits${r.net > 0 ? ` (${signed(r.net)})` : ''}</em>`
    : `<b>No match</b><em class="gb-delta neg">${signed(-r.bet)} Orbits</em>`;
  function updateSl() {
    const fee = tryFee(), poor = G.bal < G.bet + fee, b = $q('#sl-spin'); if (!b) return;
    b.disabled = poor || G.sl.busy; b.textContent = G.sl.busy ? 'Spinning…' : poor ? 'Not enough Orbits' : `Spin · ${num(G.bet)}${feeTxt(fee)}`;
    const n = $q('#sl-note'); if (n) { n.classList.toggle('warn', poor || !!fee); n.textContent = slNote(poor, fee); }
  }
  const sleep = ms => new Promise(r => later(r, ms));
  async function slSpin() {
    const s = G.sl; if (s.busy || G.bal < G.bet + tryFee()) return;
    s.busy = true; s.res = null; updateSl();
    const rs = $q('#sl-result'); if (rs) rs.innerHTML = '<span>Spinning…</span>';
    const reel = i => $q('#sl-r' + i), stopped = [false, false, false, false, false];
    for (let i = 0; i < 5; i++) { reel(i)?.classList.remove('win', 'land'); reel(i)?.classList.add('spin'); }
    const tick = setInterval(() => { for (let i = 0; i < 5; i++) if (!stopped[i] && reel(i)) reel(i).innerHTML = slSym(Math.floor(Math.random() * 6)); }, 85);
    const t0 = Date.now(); let res = null, err = null;
    try { const { data, error } = await sb.rpc('slots_spin', { p_bet: G.bet }); if (error) throw error; res = data; } catch (e) { err = e; }
    await sleep(Math.max(0, 900 - (Date.now() - t0)));
    if (err || !res) {
      clearInterval(tick); s.busy = false;
      for (let i = 0; i < 5; i++) { reel(i)?.classList.remove('spin'); if (reel(i)) reel(i).innerHTML = slSym(s.reels[i]); }
      const m = emsg(err); if (rs && $q('#sl-result')) $q('#sl-result').innerHTML = '<span>Spin cancelled. Your Orbits were not taken.</span>';
      toast(/could not find the function|schema cache/i.test(m) ? 'Slots need migration-casino-slots-roulette.sql run once in Supabase.' : m, true); updateSl(); return;
    }
    for (let i = 0; i < 5; i++) later(() => { stopped[i] = true; const el = reel(i); if (el) { el.innerHTML = slSym(res.reels[i]); el.classList.remove('spin'); el.classList.add('land'); } }, i * 380);
    await sleep(4 * 380 + 420);
    clearInterval(tick); s.reels = res.reels.slice(); s.res = res; s.busy = false; gotTries(res);
    if ($q('#sl-result')) $q('#sl-result').innerHTML = slResultHtml(res);
    if (res.payout > 0 && res.run >= 2) for (let i = 0; i < res.run; i++) reel(i)?.classList.add('win');
    if (res.net > 0) sparksAt('#sl-win', res.mult >= 30 ? 'bj' : 'win');
    setBal(res.balance); updateSl(); later(refreshStats, 600);
  }
  function sparksAt(sel, kind) {
    const box = $q(sel); if (!box) return;
    const cols = kind === 'bj' ? ['#ffd56b', '#ff7ad9', '#b79cff', '#fff'] : ['#37e0ff', '#7aa6ff', '#b79cff', '#fff'];
    const f = document.createElement('div'); f.className = 'gb-sparks'; f.setAttribute('aria-hidden', 'true');
    f.innerHTML = Array.from({ length: kind === 'bj' ? 44 : 26 }, () => { const a = Math.random() * Math.PI * 2, d = 70 + Math.random() * 170; return `<i style="--x:${Math.cos(a) * d | 0}px;--y:${Math.sin(a) * d | 0}px;--c:${cols[Math.random() * cols.length | 0]};--s:${3 + Math.random() * 5 | 0}px;--t:${900 + Math.random() * 700 | 0}ms"></i>`; }).join('');
    box.appendChild(f); later(() => f.remove(), 1800);
  }

  /* ───────── roulette ───────── */
  const RL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const RL_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const rlCol = n => (n === 0 ? 'green' : RL_RED.has(n) ? 'red' : 'black');
  const RL_MAX_CHIPS = 14;
  const rlKey = (t, v) => (t === 'n' ? 'n:' + v : t);
  const rlTotal = () => Object.values(G.rl.bets).reduce((a, b) => a + b, 0);
  function rlWheelSvg() {
    const step = Math.PI * 2 / 37, pt = (r, a) => `${(Math.sin(a) * r).toFixed(2)} ${(-Math.cos(a) * r).toFixed(2)}`, fills = { green: '#12a35a', red: '#d11f5e', black: '#0b0f2b' };
    const wedges = RL_ORDER.map((n, i) => {
      const a0 = i * step, a1 = (i + 1) * step, mid = (i + .5) * step;
      return `<path d="M${pt(100, a0)}A100 100 0 0 1 ${pt(100, a1)}L${pt(66, a1)}A66 66 0 0 0 ${pt(66, a0)}Z" fill="${fills[rlCol(n)]}" stroke="#e6c46a" stroke-width=".7"/>
        <text transform="translate(${pt(83, mid)}) rotate(${(mid * 180 / Math.PI).toFixed(1)})" font-size="9.5" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="system-ui,sans-serif">${n}</text>`;
    }).join('');
    return `<svg viewBox="-112 -112 224 224" aria-hidden="true"><circle r="110" fill="#8a5a12"/><circle r="107" fill="#e6c46a"/><circle r="102" fill="#120a46"/>${wedges}<circle r="62" fill="#1b1470" stroke="#e6c46a" stroke-width="1.4"/>
      <g stroke="#e6c46a" stroke-width="4" stroke-linecap="round"><line x1="-34" x2="34"/><line y1="-34" y2="34"/></g><circle r="11" fill="#e6c46a"/><circle r="4.5" fill="#fff6d2"/></svg>`;
  }
  const rlCell = (t, v, label, cls, style = '') => { const k = rlKey(t, v), amt = G.rl.bets[k]; return `<button class="rl-c ${cls}${amt ? ' has' : ''}" data-gb="rlcell" data-t="${t}"${v != null ? ` data-v="${v}"` : ''} style="${style}" aria-label="${esc(String(label))}${amt ? `, ${num(amt)} Orbits placed` : ''}"><span>${label}</span>${amt ? `<i class="rl-chip">${amt >= 1000 ? +(amt / 1000).toFixed(1) + 'K' : amt}</i>` : ''}</button>`; };
  function rlBoardHtml() {
    const nums = [];
    for (let r = 0; r < 3; r++) for (let c = 1; c <= 12; c++) { const n = c * 3 - r; nums.push(rlCell('n', n, n, 'num ' + rlCol(n), `grid-column:${c + 1};grid-row:${r + 1}`)); }
    const cols = [['c3', 1], ['c2', 2], ['c1', 3]].map(([t, row]) => rlCell(t, null, '2:1', 'out', `grid-column:14;grid-row:${row}`)).join('');
    const doz = [['d1', '1st 12', 2], ['d2', '2nd 12', 6], ['d3', '3rd 12', 10]].map(([t, l, c]) => rlCell(t, null, l, 'out', `grid-column:${c}/span 4;grid-row:4`)).join('');
    const outs = [['low', '1–18', 'out'], ['even', 'Even', 'out'], ['red', 'Red', 'out redc'], ['black', 'Black', 'out blackc'], ['odd', 'Odd', 'out'], ['high', '19–36', 'out']].map(([t, l, cl], i) => rlCell(t, null, l, cl, `grid-column:${2 + i * 2}/span 2;grid-row:5`)).join('');
    return `<div class="rl-grid">${rlCell('n', 0, 0, 'num green', 'grid-column:1;grid-row:1/span 3')}${nums.join('')}${cols}${doz}${outs}</div>`;
  }
  function rlCtrlHtml() {
    const tot = rlTotal(), n = Object.keys(G.rl.bets).length, fee = tryFee(), poor = G.bal < tot + fee, s = G.rl;
    return `<div class="gb-chips" role="group" aria-label="Chip value">${CHIPS.map((v, i) => `<button class="gb-chip c${i}${s.chip === v ? ' on' : ''}" data-gb="rlchip" data-v="${v}" aria-pressed="${s.chip === v}" aria-label="Chip worth ${num(v)} Orbits"><span>${short(v)}</span></button>`).join('')}</div>
      <div class="rl-tot"><span>On the table</span><b>${num(tot)}</b><small>Orbits · ${n} bet${n === 1 ? '' : 's'}</small></div>
      <div class="rl-btns"><button class="gb-btn ghost sm" data-gb="rlundo"${!s.hist.length || s.busy ? ' disabled' : ''}>Undo</button><button class="gb-btn ghost sm" data-gb="rlclear"${!n || s.busy ? ' disabled' : ''}>Clear</button>
        <button class="gb-btn deal" data-gb="rlspin"${!tot || poor || s.busy ? ' disabled' : ''}>${s.busy ? 'Spinning…' : !tot ? 'Place a chip' : poor ? 'Not enough Orbits' : `Spin · ${num(tot)}${feeTxt(fee)}`}</button></div>
      <p class="gb-note${(poor && tot) || fee ? ' warn' : ''}">${poor && tot ? `You need ${num(tot + fee)} Orbits${fee ? ` (${num(tot)} on the table + ${num(fee)} try fee)` : ''}. You have ${num(G.bal)}.` : fee ? `Your ${FREE_TRIES} free tries today are used. Each spin now costs ${num(fee)} Orbits on top of your chips.` : `One spin is one try (free try ${(G.st?.tries_used || 0) + 1} of ${FREE_TRIES} today, shared with Blackjack and Slots). Tap the table to place a chip. Up to ${RL_MAX_CHIPS} bets and ${num(MAX_BET)} Orbits a spin. Numbers pay 35 to 1, dozens and columns 2 to 1, colours and the rest 1 to 1.`}</p>`;
  }
  function rouletteHtml() {
    const r = G.rl;
    return `<div class="rl"><div class="rl-top"><div class="rl-wheelbox" id="rl-wheelbox"><span class="rl-ptr" aria-hidden="true"></span><div class="rl-wheel" id="rl-wheel" style="transform:rotate(${r.rot}deg)">${rlWheelSvg()}</div></div>
        <div class="rl-side"><div class="rl-result" id="rl-result" role="status" aria-live="polite">${r.res ? rlResultHtml(r.res) : '<span>Place your chips, then spin. The wheel has 37 pockets, 0 to 36.</span>'}</div>
          <div class="rl-past" id="rl-past" aria-label="Recent numbers">${rlPastHtml()}</div></div></div>
      <div class="rl-board" id="rl-board">${rlBoardHtml()}</div><div class="rl-ctrl" id="rl-ctrl">${rlCtrlHtml()}</div></div>`;
  }
  const rlPastHtml = () => G.rl.past.map(n => `<i class="rl-p ${rlCol(n)}">${n}</i>`).join('');
  const rlResultHtml = r => `<div class="rl-num ${r.color}">${r.number}</div><div><b>${r.color === 'green' ? 'Zero' : r.color === 'red' ? 'Red' : 'Black'} ${r.number}</b>${r.payout > 0 ? `<em class="gb-delta ${r.net >= 0 ? 'pos' : 'neg'}">Paid ${num(r.payout)} Orbits (${signed(r.net)})</em>` : `<em class="gb-delta neg">${signed(-r.bet)} Orbits</em>`}</div>`;
  const paintRl = () => { const b = $q('#rl-board'), c = $q('#rl-ctrl'); if (b) b.innerHTML = rlBoardHtml(); if (c) c.innerHTML = rlCtrlHtml(); };
  function rlAdd(key) {
    const r = G.rl; if (r.busy) return;
    if (!(key in r.bets) && Object.keys(r.bets).length >= RL_MAX_CHIPS) return toast(`At most ${RL_MAX_CHIPS} different bets per spin.`, true);
    if (rlTotal() + r.chip > MAX_BET) return toast(`At most ${num(MAX_BET)} Orbits on one spin.`, true);
    r.bets[key] = (r.bets[key] || 0) + r.chip; r.hist.push([key, r.chip]); paintRl();
  }
  function rlUndo() {
    const r = G.rl; if (r.busy || !r.hist.length) return; const [k, a] = r.hist.pop(); r.bets[k] -= a; if (r.bets[k] <= 0) delete r.bets[k]; paintRl();
  }
  async function rlSpin() {
    const r = G.rl, tot = rlTotal(); if (r.busy || !tot || G.bal < tot + tryFee()) return;
    const bets = Object.entries(r.bets).map(([k, a]) => k.startsWith('n:') ? { t: 'n', v: Number(k.slice(2)), a } : { t: k, a });
    r.busy = true; r.res = null; paintRl(); const rs = $q('#rl-result'); if (rs) rs.innerHTML = '<span>No more bets. Spinning…</span>';
    const w = $q('#rl-wheel'); if (w) { w.style.transition = 'transform 30s linear'; w.style.transform = `rotate(${r.rot + 3600}deg)`; }
    const t0 = Date.now(); let res = null, err = null;
    try { const { data, error } = await sb.rpc('roulette_spin', { p_bets: bets }); if (error) throw error; res = data; } catch (e) { err = e; }
    if (err || !res) {
      r.busy = false; const w2 = $q('#rl-wheel'); if (w2) { w2.style.transition = 'none'; w2.style.transform = `rotate(${r.rot}deg)`; }
      if ($q('#rl-result')) $q('#rl-result').innerHTML = '<span>Spin cancelled. Your Orbits were not taken.</span>'; paintRl();
      const m = emsg(err); return toast(/could not find the function|schema cache/i.test(m) ? 'Roulette needs migration-casino-slots-roulette.sql run once in Supabase.' : m, true);
    }
    const idx = RL_ORDER.indexOf(res.number), ca = (idx + .5) * 360 / 37;
    const target = r.rot + 360 * 6 + ((((-ca - r.rot) % 360) + 360) % 360);
    const w3 = $q('#rl-wheel'); if (w3) { w3.style.transition = 'none'; w3.style.transform = `rotate(${r.rot}deg)`; void w3.offsetWidth; w3.style.transition = 'transform 4.6s cubic-bezier(.12,.62,.12,1)'; w3.style.transform = `rotate(${target}deg)`; }
    r.rot = target;
    await sleep(Math.max(0, 4800 - (Date.now() - t0)) + 200);
    r.res = res; r.busy = false; gotTries(res); r.past = [res.number, ...r.past].slice(0, 12);
    const rr = $q('#rl-result'); if (rr) rr.innerHTML = rlResultHtml(res); const pp = $q('#rl-past'); if (pp) pp.innerHTML = rlPastHtml();
    // mark the winning chips on the table
    res.bets.forEach(b => { if (b.win) $q(`#rl-board [data-t="${b.t}"]${b.t === 'n' ? `[data-v="${b.v}"]` : ''}`)?.classList.add('hit'); });
    if (res.net > 0) sparksAt('#rl-wheelbox', res.payout >= res.bet * 10 ? 'bj' : 'win');
    setBal(res.balance); const c = $q('#rl-ctrl'); if (c) c.innerHTML = rlCtrlHtml(); later(refreshStats, 600);
  }

  /* ───────── events ───────── */
  const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable); };
  function bind() {
    if (G.bound) return; G.bound = true;
    document.addEventListener('click', e => {
      if (!handles(S.view)) return;
      const b = e.target.closest('[data-gb]'); if (!b || b.disabled) return;
      const k = b.dataset.gb;
      if (k === 'enter') enterGame(b.dataset.g, !!b.dataset.fast);
      else if (k === 'back') leaveGame();
      else if (k === 'side') { S.sideOff = !S.sideOff; document.getElementById('app')?.classList.toggle('side-off', !!S.sideOff); const t = S.sideOff ? 'Show sidebar' : 'Hide sidebar'; b.setAttribute('aria-label', t); b.title = t; }
      else if (k === 'mode') { if (G.mode !== b.dataset.m) { if (G.bot?.status === 'active' && b.dataset.m === 'pvp') toast('Finish your hand with the Bot first.', true); else if (G.pvp && G.pvp.status !== 'done' && b.dataset.m === 'bot') toast('You have an open table. Finish it first.', true); else { G.mode = b.dataset.m; G.seen = {}; G.disp = { p: null, d: null, me: null, opp: null }; G.confirmPaid = false; if (G.mode === 'bot' && G.bot) G.disp = { p: G.bot.player_total, d: G.bot.dealer_total }; paintBody(); if (G.mode === 'pvp' && !G.pvp) loadLobby(); } } }
      else if (k === 'chip') { G.bet = clampBet(b.dataset.v); setLS('orbit-gamble-bet', G.bet); G.confirmPaid = false; paintActions(); }
      else if (k === 'ante') { G.ante = clampBet(b.dataset.v); setLS('orbit-gamble-ante', G.ante); paintBody(); }
      else if (k === 'slchip') { G.bet = clampBet(b.dataset.v); setLS('orbit-gamble-bet', G.bet); if (!G.sl.busy) paintBody(); }
      else if (k === 'slspin') slSpin();
      else if (k === 'rlchip') { G.rl.chip = Number(b.dataset.v); setLS('orbit-roulette-chip', G.rl.chip); paintRl(); }
      else if (k === 'rlcell') rlAdd(b.dataset.t === 'n' ? 'n:' + b.dataset.v : b.dataset.t);
      else if (k === 'rlundo') rlUndo();
      else if (k === 'rlclear') { if (!G.rl.busy) { G.rl.bets = {}; G.rl.hist = []; paintRl(); } }
      else if (k === 'rlspin') rlSpin();
      else if (k === 'deal') botDeal();
      else if (k === 'hit') botAct('hit');
      else if (k === 'stand') botAct('stand');
      else if (k === 'phit') pvpAct('hit');
      else if (k === 'pstand') pvpAct('stand');
      else if (k === 'pvpcreate') pvpCreate();
      else if (k === 'pvpjoin') pvpJoin(b.dataset.id);
      else if (k === 'pvpcancel') pvpCancel();
      else if (k === 'pvpback') pvpBack();
      else if (k === 'retry') { G.loaded = false; G.err = ''; paintBody(); loadStatus(); }
    });
    document.addEventListener('change', e => {
      if (!handles(S.view)) return;
      if (e.target.id === 'gb-betin') { G.bet = clampBet(e.target.value); e.target.value = G.bet; setLS('orbit-gamble-bet', G.bet); G.confirmPaid = false; paintActions(); }
      if (e.target.id === 'sl-betin') { G.bet = clampBet(e.target.value); e.target.value = G.bet; setLS('orbit-gamble-bet', G.bet); updateSl(); }
      if (e.target.id === 'gb-antein') { G.ante = clampBet(e.target.value); setLS('orbit-gamble-ante', G.ante); paintBody(); }
    });
    document.addEventListener('input', e => {
      if (handles(S.view) && e.target.id === 'sl-betin') { const v = Math.floor(Number(e.target.value)); if (v >= MIN_BET && v <= MAX_BET) { G.bet = v; updateSl(); } return; }
      if (!handles(S.view) || e.target.id !== 'gb-betin') return;
      const v = Math.floor(Number(e.target.value)); if (v >= MIN_BET && v <= MAX_BET) { G.bet = v; G.confirmPaid = false; updateDeal(); }
    });
    document.addEventListener('keydown', e => {
      if (!handles(S.view) || typing() || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.modalbg')) return;
      const k = e.key.toLowerCase();
      if (G.scene === 'game' && G.game === 'slots' && (k === ' ' || k === 'enter')) { e.preventDefault(); slSpin(); return; }
      if (G.scene !== 'game' || G.game !== 'bj') return;
      if (G.mode === 'bot' && G.bot?.status === 'active') { if (k === 'h') botAct('hit'); else if (k === 's') botAct('stand'); }
      else if (G.mode === 'pvp' && G.pvp?.status === 'playing') { if (k === 'h') pvpAct('hit'); else if (k === 's') pvpAct('stand'); }
    });
  }

  /* one-second heartbeat while the page is open: countdowns, plus polling for table changes */
  function startTick() {
    clearInterval(G.tick); G.n = 0;
    G.tick = setInterval(() => {
      if (!handles(S.view)) { clearInterval(G.tick); G.tick = 0; return; }
      G.n++;
      const rs = $q('#gb-reset');
      if (rs && G.st) { const left = (G.st.resets_in || 0) - (Date.now() - G.stAt) / 1000; if (left <= 0) refreshStats(); else rs.textContent = dur(left); }
      const g = G.pvp;
      if (g && g.status === 'playing') { const t = $q('#gb-ptimer'); const left = Math.max(0, (g.secs_left ?? 0) - (Date.now() - G.pvpAt) / 1000); if (t) t.textContent = dur(left); }
      if (document.hidden) return;
      if (g && (g.status === 'open' || g.status === 'playing')) { const expired = g.status === 'playing' && (g.secs_left ?? 0) - (Date.now() - G.pvpAt) / 1000 <= 0; if (G.n % 2 === 0 || expired) pvpPoll(); }
      else if (G.mode === 'pvp' && !g && G.n % 4 === 0) loadLobby();
    }, 1000);
  }

  function render(main) {
    bind();
    main.innerHTML = shell(); bindMenu?.();
    applyScene(); paintStats(); paintBody(); startTick();
    const cz = $q('#cz'); if (cz && window.ResizeObserver) new ResizeObserver(layoutSpots).observe(cz);   // window resized, or the sidebar tucked in or out
    if (!G.loaded) loadStatus();
  }
  function onNav(k) {
    if (k !== 'gamble') return;
    if (!(G.bot?.status === 'active' || (G.pvp && G.pvp.status !== 'done' && G.pvp.status !== 'cancelled'))) G.scene = 'lobby';
    G.zooming = false; G.seen = {}; G.loaded = G.loaded && !G.err; G.confirmPaid = false; G.shownBal = null;
    if (G.bot) G.disp = { p: G.bot.player_total, d: G.bot.dealer_total };
    loadStatus(); startTick();
  }
  const stop = () => {
    clearInterval(G.tick); G.tick = 0; clearFx();
    Object.assign(G, { scene: 'lobby', zooming: false, game: 'bj', loaded: false, err: '', st: null, bot: null, pvp: null, lobby: [], seen: {}, busy: false, confirmPaid: false, pvpDone: false, shownBal: null });
    Object.assign(G.sl, { busy: false }); Object.assign(G.rl, { busy: false, bets: {}, hist: [] });
    loadOrbits?.();
  };
  return { handles, render, onNav, stop };
}
