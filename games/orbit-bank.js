/* ---------- Orbit bank: ONE Orbits balance for Orbit and the games ----------
   The balance lives on the Orbit server (orbit_ledger). The games add to it with a percent of each round's score and the
   Prize Room spends from it. window.OrbitBank keeps a cached copy (localStorage "orbit-balance") so pages can show it at once.
   Events: "orbits-changed" and (for older code) "coins-changed" fire whenever the balance changes. */
(function () {
  var ORBIT = 'https://qtmrtxgkisshdtqshjre.supabase.co', SESSION_KEY = 'sb-qtmrtxgkisshdtqshjre-auth-token';
  var CACHE = 'orbit-balance', QUEUE = 'orbit-claim-queue';
  // share of the final score that becomes Orbits (0.05 = 5%, 8 = 800%) (these are only the starting values: the owner can change them in the games admin panel, so the live table is loaded from the server below, and the server is the one that counts)
  var RATES = { game2048: 0.25, blockblast: 0.75, breakout: 0.5, dino: 0.5, flappy: 10, geodash: 1, minesweeper: 0.5, pacman: 0.1, slope: 1, snake: 20, tetris: 0.05, girder: 0.05, sudoku: 0.25 };
  function get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
  function session() { try { var s = JSON.parse(get(SESSION_KEY) || 'null'); return s && s.user && s.access_token ? s : null; } catch (e) { return null; } }
  var bal = parseInt(get(CACHE), 10) || 0, anonP = null;
  function fire() {
    try { window.dispatchEvent(new CustomEvent('orbits-changed', { detail: { balance: bal } })); } catch (e) { /* ignore */ }
    try { window.dispatchEvent(new CustomEvent('coins-changed', { detail: { balance: bal } })); } catch (e) { /* ignore */ }
  }
  function setBal(n) { n = Math.max(0, Math.floor(Number(n)) || 0); if (n === bal) return; bal = n; put(CACHE, String(n)); fire(); }
  function anonKey() { return anonP || (anonP = import('../chatter/config.js').then(function (c) { return c.SUPABASE_ANON_KEY; })); }
  function rpc(name, args) {
    var s = session();
    if (!s) return Promise.reject(new Error('Log in to Orbit first.'));
    return anonKey().then(function (k) {
      return fetch(ORBIT + '/rest/v1/rpc/' + name, { method: 'POST', headers: { apikey: k, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) });
    }).then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { if (!r.ok) throw new Error((j && j.message) || 'Request failed'); return j; }); });
  }
  // load the live payout table (the owner edits it in the games admin panel); updates RATES in place and tells the page
  function loadRates() {
    return anonKey().then(function (k) {
      return fetch(ORBIT + '/rest/v1/rpc/get_game_rates', { method: 'POST', headers: { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, body: '{}' });
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (rows) {
      if (!rows || !rows.length) return RATES;
      Object.keys(RATES).forEach(function (g) { delete RATES[g]; });
      rows.forEach(function (x) { RATES[x.game] = Number(x.permille) / 1000; });
      try { window.dispatchEvent(new CustomEvent('orbit-rates-changed', { detail: { rates: RATES } })); } catch (e) { /* ignore */ }
      return RATES;
    }).catch(function () { return RATES; });
  }
  function refresh() { return rpc('my_orbits').then(function (n) { setBal(n); return bal; }).catch(function () { return bal; }); }
  // what a round would pay (for the pop-up and the "Ways to earn" table); rounded to the nearest whole Orbit; the server decides the real amount
  function preview(game, score) { var r = RATES[game]; score = Math.floor(Number(score)); return Number.isFinite(r) && r > 0 && Number.isFinite(score) && score > 0 && score <= 10000000 ? Math.floor((score * Math.round(r * 1000) + 500) / 1000) : 0; }
  function queueGet() { try { return JSON.parse(get(QUEUE) || '[]') || []; } catch (e) { return []; } }
  function queuePut(q) { put(QUEUE, JSON.stringify(q.slice(-20))); }
  // pay a finished round. Resolves with the Orbits granted (0 if none). Failed claims are retried later.
  function claimGame(game, score, noQueue) {
    score = Math.floor(Number(score));
    if (!RATES[game] || !(score > 0) || preview(game, score) < 1) return Promise.resolve(0);
    var ref = (noQueue && noQueue.ref) || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
    return rpc('claim_game_orbits', { p_game: game, p_score: score, p_ref: ref }).then(function (n) {
      n = Number(n) || 0; if (n > 0) setBal(bal + n); refresh(); return n;
    }).catch(function () {
      if (!noQueue) { var q = queueGet(); q.push({ g: game, s: score, r: ref }); queuePut(q); }
      return 0;
    });
  }
  function flushQueue() {
    var q = queueGet(); if (!q.length || !session()) return; queuePut([]);
    q.reduce(function (p, it) { return p.then(function () { return claimGame(it.g, it.s, { ref: it.r }); }); }, Promise.resolve());
  }
  function adjust(n) { setBal(bal + n); }
  // take Orbits for a Prize Room item; rejects if the server says no (the caller undoes its optimistic change)
  function spend(item, price) { return rpc('spend_orbits', { p_item: item, p_price: price }).then(function (n) { setBal(n); return bal; }); }
  window.OrbitBank = { balance: function () { return bal; }, refresh: refresh, claimGame: claimGame, spend: spend, adjust: adjust, preview: preview, rates: RATES, loadRates: loadRates, rpc: rpc, signedIn: function () { return !!session(); } };
  window.addEventListener('storage', function (e) { if (e.key === CACHE) { bal = parseInt(e.newValue, 10) || 0; fire(); } });
  loadRates();
  if (session()) { refresh().then(flushQueue); setInterval(function () { if (!document.hidden) refresh(); }, 60000); }
})();
