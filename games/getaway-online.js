/* Getaway Shootout: online play (host streams the game).

   The game itself is a compiled Unity build (two players, one keyboard), so it has no network code and there is
   no source to add any to. So ONE computer runs the game and everyone else watches it:
     1. Matchmaking: "Find an opponent" (public rooms) or a 4-letter room code / invite link, over the same
        Supabase Realtime connection that Block Breaker Duel uses. The first player in the room is the HOST
        (Player 1), the second is the GUEST (Player 2).
     2. The HOST's browser is the only one that runs the match. It streams the game canvas as live video to the
        guest over WebRTC (Supabase is only used to set the connection up).
     3. The GUEST sees that video instead of their own copy of the game. Their button presses and clicks are sent
        back over a WebRTC data channel, and the host's browser presses them as Player 2's key / mouse.
     So there is one authoritative game (the host's), and both players are in it. The guest sees some lag.
   Load it on getaway.html after leaderboard.js. */
(function () {
  'use strict';

  var SB = (window.Leaderboard && window.Leaderboard.config) || null;
  if (!SB || !window.WebSocket || !document.body) return;   // no matchmaking server: the game stays local only

  /* ---- the keys the Unity build listens for (one button per player). Change these two lines if your build differs. ---- */
  var SEAT_KEYS = [
    { key: 'w',         code: 'KeyW',    kc: 87, label: 'W' },        // Player 1
    { key: 'ArrowUp',   code: 'ArrowUp', kc: 38, label: '\u2191' }    // Player 2
  ];
  var MY_CODES = ['KeyW', 'ArrowUp', 'Space'];   // any of these presses your own seat's key

  var CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  var ROOM_PREFIX = 'getaway-';
  var rnd = function (n) { return Math.floor(Math.random() * n); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var myId = Math.random().toString(36).slice(2, 10);
  var myName = function () { var n = ''; try { n = window.Leaderboard && window.Leaderboard.getName(); } catch (e) { n = ''; } return String(n || 'Player').slice(0, 20); };
  var myAvatar = function () { try { return window.Leaderboard ? window.Leaderboard.getAvatar() : ''; } catch (e) { return ''; } };
  var gameCanvas = function () { return document.querySelector('#game canvas'); };

  /* ================= realtime: a tiny client for Supabase Realtime (Phoenix channels) ================= */
  function Chan(rt, name, key) { this.rt = rt; this.topic = 'realtime:' + name; this.key = key; this.h = {}; this.presence = {}; this.joined = false; this.onPresence = null; this.onClose = null; }
  Chan.prototype.on = function (ev, fn) { this.h[ev] = fn; return this; };
  Chan.prototype.join = function () {
    var self = this;
    return new Promise(function (res, rej) {
      var ref = self.rt.ref(); self.joinRef = ref; self._res = res; self._rej = rej;
      self.rt.send({ topic: self.topic, event: 'phx_join', ref: ref, join_ref: ref,
        payload: { config: { broadcast: { ack: false, self: false }, presence: { key: self.key }, postgres_changes: [], private: false }, access_token: SB.key } });
      setTimeout(function () { if (!self.joined) rej(new Error('join timeout')); }, 8000);
    });
  };
  Chan.prototype.send = function (ev, payload) { this.rt.send({ topic: this.topic, event: 'broadcast', ref: this.rt.ref(), payload: { type: 'broadcast', event: ev, payload: payload || {} } }); };
  Chan.prototype.track = function (meta) { this.rt.send({ topic: this.topic, event: 'presence', ref: this.rt.ref(), payload: { type: 'presence', event: 'track', payload: meta } }); };
  Chan.prototype.leave = function () { this.rt.send({ topic: this.topic, event: 'phx_leave', payload: {}, ref: this.rt.ref() }); this.rt.chans.delete(this.topic); this.h = {}; this.onPresence = null; };
  Chan.prototype._msg = function (m) {
    var p = m.payload || {}, self = this;
    if (m.event === 'phx_reply') {
      if (m.ref === this.joinRef && !this.joined) {
        if (p.status === 'ok') { this.joined = true; this._res(); } else this._rej(new Error('join refused'));
      }
    } else if (m.event === 'broadcast') {
      if (p.event && this.h[p.event]) this.h[p.event](p.payload || {});
    } else if (m.event === 'presence_state') {
      this.presence = {};
      Object.keys(p).forEach(function (k) { self.presence[k] = (p[k].metas || []).slice(); });
      if (this.onPresence) this.onPresence();
    } else if (m.event === 'presence_diff') {
      var lv = p.leaves || {}, jn = p.joins || {};
      Object.keys(lv).forEach(function (k) {
        var refs = (lv[k].metas || []).map(function (x) { return x.phx_ref; });
        self.presence[k] = (self.presence[k] || []).filter(function (x) { return refs.indexOf(x.phx_ref) === -1; });
        if (!self.presence[k].length) delete self.presence[k];
      });
      Object.keys(jn).forEach(function (k) { self.presence[k] = (self.presence[k] || []).concat(jn[k].metas || []); });
      if (this.onPresence) this.onPresence();
    } else if (m.event === 'phx_error' || m.event === 'phx_close') {
      if (this.onClose) this.onClose();
    }
  };
  function RT() { this.n = 0; this.chans = new Map(); this.ws = null; this.hb = 0; this.onClose = null; this.dead = false; }
  RT.prototype.ref = function () { return String(++this.n); };
  RT.prototype.connect = function () {
    var self = this;
    return new Promise(function (res, rej) {
      var done = false;
      var url = SB.url.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(SB.key) + '&vsn=1.0.0';
      try { self.ws = new WebSocket(url); } catch (e) { rej(e); return; }
      var fail = function (e) { if (!done) { done = true; rej(e || new Error('closed')); } };
      setTimeout(function () { fail(new Error('timeout')); }, 8000);
      self.ws.onopen = function () {
        done = true; res();
        self.hb = setInterval(function () { self.send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: self.ref() }); }, 20000);
      };
      self.ws.onerror = function () { fail(new Error('error')); };
      self.ws.onclose = function () { clearInterval(self.hb); fail(); if (!self.dead && self.onClose) self.onClose(); };
      self.ws.onmessage = function (ev) {
        var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        var c = self.chans.get(m.topic); if (c) c._msg(m);
      };
    });
  };
  RT.prototype.channel = function (name, key) { var c = new Chan(this, name, key); this.chans.set(c.topic, c); return c; };
  RT.prototype.send = function (o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); };
  RT.prototype.close = function () { this.dead = true; clearInterval(this.hb); try { this.ws && this.ws.close(); } catch (e) { /* ignore */ } };

  /* ================= state ================= */
  var rt = null, room = null, tracked = false, isHost = false, myTs = 0, myState = 'lobby';
  var roomCode = '', roomPublic = false, joinToken = 0, autoT = 0, linkT = 0, discT = 0;
  var phase = 'idle';            // idle | menu | connect | lobby | play
  var mode = '';                 // during a match: 'host' (runs + streams the game) or 'guest' (watches + sends buttons)
  var mySeat = 0;                // 0 = Player 1 (host), 1 = Player 2 (guest)
  var rttNow = 0, linked = false;
  var heldMine = false, seatHeld = [false, false], mouseHeld = false;
  var oppInfo = null;


  /* ================= small UI ================= */
  var css = document.createElement('style');
  css.textContent =
    '#gwOnBtn{position:fixed;top:calc(10px + env(safe-area-inset-top));right:10px;z-index:20;padding:.35em 1em;border-radius:99px;color:#fff;background:rgba(212,40,95,.9);border:2px solid rgba(255,255,255,.55);font:600 15px var(--pixel,"Pixelify Sans","Courier New",monospace);cursor:pointer}' +
    '#gwOnBtn:hover{background:rgba(232,73,125,1)}#gwOnBtn[hidden]{display:none}' +
    '#gwOv{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(6,4,20,.78);font-family:var(--pixel,"Pixelify Sans","Courier New",monospace);color:#fff}#gwOv[hidden]{display:none}' +
    '#gwOv .gwc{width:min(92vw,390px);max-height:92vh;overflow:auto;padding:18px 18px 16px;border-radius:14px;background:#14142a;border:2px solid rgba(255,255,255,.28);box-shadow:0 10px 40px rgba(0,0,0,.6);text-align:center}#gwOv .gwc[hidden]{display:none}' +
    '#gwOv h2{font-size:1.5rem;margin:0 0 6px}#gwOv p{margin:6px 0;line-height:1.35;color:#d7d6ee}#gwOv .fine{font-size:.82rem;color:#a9a8c4}' +
    '#gwOv .col{display:flex;flex-direction:column;gap:8px;margin-top:12px}#gwOv .row{display:flex;gap:8px;justify-content:center;margin-top:12px;flex-wrap:wrap}' +
    '#gwOv .b{padding:9px 16px;border-radius:8px;border:2px solid #1b1b2f;background:#e8497d;color:#fff;font:700 1rem var(--pixel,"Pixelify Sans","Courier New",monospace);cursor:pointer;box-shadow:0 3px 0 #8e1b46}' +
    '#gwOv .b.alt{background:#3a3a5c;box-shadow:0 3px 0 #1b1b2f}#gwOv .b.go{background:#2e9e57;box-shadow:0 3px 0 #1a5e33}#gwOv .b:disabled{opacity:.5;cursor:default}' +
    '#gwOv .b.small{padding:6px 12px;font-size:.9rem}' +
    '#gwOv .codein{width:7.5ch;padding:8px 10px;border-radius:8px;border:2px solid #3a3a5c;background:#0e0e20;color:#fff;font:700 1.4rem var(--pixel,"Pixelify Sans","Courier New",monospace);text-align:center;letter-spacing:.2em;text-transform:uppercase}' +
    '#gwOv .code{font-size:2.4rem;font-weight:700;letter-spacing:.3em;margin:6px 0;color:#ffd166}' +
    '#gwOv .slots{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}' +
    '#gwOv .slots li{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;background:rgba(255,255,255,.07);text-align:left}' +
    '#gwOv .slots .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#gwOv .slots .tag{font-size:.8rem;color:#ffd166}#gwOv .slots li.empty{color:#8886a8}' +
    '#gwOv .avw{flex:none;display:inline-block;width:26px;height:26px;border-radius:50%;overflow:hidden;background:#2b2b3c}#gwOv .avw svg,#gwOv .avw img{display:block;width:100%;height:100%;object-fit:cover;border-radius:50%}' +
    '#gwOv .spin{width:34px;height:34px;margin:10px auto;border-radius:50%;border:4px solid rgba(255,255,255,.2);border-top-color:#e8497d;animation:gwspin .9s linear infinite}@keyframes gwspin{to{transform:rotate(360deg)}}' +
    '#gwHud{position:fixed;top:calc(10px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:30;display:flex;align-items:center;gap:10px;padding:5px 8px 5px 14px;border-radius:99px;background:rgba(10,6,28,.78);border:2px solid rgba(255,255,255,.4);color:#fff;font:600 14px var(--pixel,"Pixelify Sans","Courier New",monospace);white-space:nowrap;max-width:94vw}#gwHud[hidden]{display:none}' +
    '#gwHud .me{color:#7fe08b}#gwHud .png{color:#a9a8c4}#gwHud button{padding:3px 10px;border-radius:99px;border:0;background:#3a3a5c;color:#fff;font:700 13px var(--pixel,"Pixelify Sans","Courier New",monospace);cursor:pointer}' +
    '#gwTap{position:fixed;left:50%;bottom:calc(22px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:30;width:min(62vw,260px);height:84px;border-radius:42px;border:3px solid rgba(255,255,255,.7);background:rgba(212,40,95,.8);color:#fff;font:700 1.5rem var(--pixel,"Pixelify Sans","Courier New",monospace);touch-action:none;-webkit-user-select:none;user-select:none}#gwTap[hidden]{display:none}#gwTap.on{background:rgba(255,120,150,.95)}' +
    '#gwVid{position:fixed;inset:0;z-index:15;width:100%;height:100%;object-fit:contain;background:#000;touch-action:none;-webkit-user-select:none;user-select:none}#gwVid[hidden]{display:none}' +
    '#gwOv .codein{-webkit-user-select:text;user-select:text}' +
    '#gwToast{position:fixed;left:50%;top:calc(58px + env(safe-area-inset-top));transform:translateX(-50%);z-index:35;max-width:92vw;padding:6px 14px;border-radius:12px;background:rgba(212,40,95,.95);color:#fff;font:700 14px var(--pixel,"Pixelify Sans","Courier New",monospace);text-align:center;pointer-events:none;opacity:0;transition:opacity .25s}#gwToast.on{opacity:1}';
  document.head.appendChild(css);

  function txt(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(label, cls, fn) { var b = txt('button', 'b' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function avatarWrap(avatar) {
    var w = txt('span', 'avw', ''), el = null;
    try { if (window.Leaderboard && avatar && window.Leaderboard.isValidAvatar(avatar)) el = window.Leaderboard.avatarEl(avatar, 26); } catch (e) { el = null; }
    if (el) w.appendChild(el);
    return w;
  }

  var onBtn = txt('button', '', 'Play online'); onBtn.id = 'gwOnBtn'; onBtn.type = 'button';
  var ov = txt('div', '', ''); ov.id = 'gwOv'; ov.hidden = true;
  var hud = txt('div', '', ''); hud.id = 'gwHud'; hud.hidden = true;
  var tap = txt('button', '', 'JUMP'); tap.id = 'gwTap'; tap.type = 'button'; tap.hidden = true;
  var toastEl = txt('div', '', ''); toastEl.id = 'gwToast'; toastEl.setAttribute('role', 'status');
  var vid = document.createElement('video'); vid.id = 'gwVid'; vid.hidden = true; vid.muted = true; vid.autoplay = true; vid.playsInline = true; vid.setAttribute('playsinline', '');
  document.body.appendChild(vid);
  document.body.appendChild(onBtn); document.body.appendChild(ov); document.body.appendChild(hud); document.body.appendChild(tap); document.body.appendChild(toastEl);

  // panels
  var pMenu = txt('section', 'gwc', ''), pJoin = txt('section', 'gwc', ''), pConn = txt('section', 'gwc', ''), pLobby = txt('section', 'gwc', ''), pInfo = txt('section', 'gwc', '');
  [pMenu, pJoin, pConn, pLobby, pInfo].forEach(function (p) { p.hidden = true; ov.appendChild(p); });
  var panels = { menu: pMenu, join: pJoin, connect: pConn, lobby: pLobby, info: pInfo };
  function showPanel(name) { Object.keys(panels).forEach(function (k) { panels[k].hidden = k !== name; }); ov.hidden = false; }
  function closeOverlay() { ov.hidden = true; }

  // menu
  pMenu.appendChild(txt('h2', '', 'GETAWAY SHOOTOUT'));
  pMenu.appendChild(txt('p', '', 'Play it online against another player. You each control one seat with one button.'));
  var col = txt('div', 'col', '');
  col.appendChild(btn('Find an opponent', '', function () { quickPlay(); }));
  col.appendChild(btn('Create a room (share a code)', 'alt', function () { makeRoom(); }));
  col.appendChild(btn('Join with a code', 'alt', function () { showPanel('join'); codeIn.focus(); }));
  col.appendChild(btn('Back to the game', 'alt small', function () { closeOverlay(); phase = 'idle'; renderBtn(); }));
  pMenu.appendChild(col);
  pMenu.appendChild(txt('p', 'fine', 'Needs a connection to the matchmaking server. Both players need to keep this page open and in front.'));

  // join
  pJoin.appendChild(txt('h2', '', 'Join a room'));
  pJoin.appendChild(txt('p', '', 'Ask your friend for the 4-letter room code.'));
  var codeIn = txt('input', 'codein', ''); codeIn.maxLength = 4; codeIn.placeholder = 'CODE'; codeIn.setAttribute('autocomplete', 'off'); codeIn.setAttribute('autocapitalize', 'characters'); codeIn.setAttribute('spellcheck', 'false'); codeIn.setAttribute('aria-label', 'Room code');
  var joinRow = txt('div', 'row', ''); joinRow.appendChild(codeIn); joinRow.appendChild(btn('Join', 'alt', function () { joinCode(); }));
  pJoin.appendChild(joinRow);
  var joinBack = txt('div', 'row', ''); joinBack.appendChild(btn('Back', 'alt small', function () { showPanel('menu'); })); pJoin.appendChild(joinBack);
  codeIn.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') joinCode(); });
  codeIn.addEventListener('keyup', function (e) { e.stopPropagation(); });
  function joinCode() { var c = codeIn.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c.length === 4) joinCodeRoom(c); else codeIn.focus(); }

  // connect
  var cTitle = txt('h2', '', 'Connecting...'), cText = txt('p', '', 'Looking for a room.');
  pConn.appendChild(cTitle); pConn.appendChild(txt('div', 'spin', '')); pConn.appendChild(cText);
  var cRow = txt('div', 'row', ''); cRow.appendChild(btn('Cancel', 'alt small', function () { toMenu(); })); pConn.appendChild(cRow);

  // lobby
  var lTitle = txt('h2', '', 'Lobby'), lCode = txt('div', 'code', ''), lSub = txt('p', '', ''), lSlots = txt('ul', 'slots', ''), lFine = txt('p', 'fine', '');
  var startBtn = btn('Start match', 'go', function () { hostStart(); });
  var inviteBtn = btn('Copy invite link', 'alt', function () { copyInvite(); });
  var lRow = txt('div', 'row', ''); lRow.appendChild(startBtn); lRow.appendChild(inviteBtn); lRow.appendChild(btn('Leave', 'alt', function () { toMenu(); }));
  pLobby.appendChild(lTitle); pLobby.appendChild(lCode); pLobby.appendChild(lSub); pLobby.appendChild(lSlots); pLobby.appendChild(lRow); pLobby.appendChild(lFine);

  // info
  var iTitle = txt('h2', '', 'Oops'), iText = txt('p', '', '');
  pInfo.appendChild(iTitle); pInfo.appendChild(iText);
  var iRow = txt('div', 'row', ''); iRow.appendChild(btn('OK', '', function () { toMenu(); })); pInfo.appendChild(iRow);
  function info(title, text) { iTitle.textContent = title; iText.textContent = text; showPanel('info'); }

  var toastT = 0;
  function toast(msg, ms) { toastEl.textContent = msg; toastEl.className = 'on'; clearTimeout(toastT); toastT = setTimeout(function () { toastEl.className = ''; }, ms || 3500); }

  function renderBtn() { onBtn.hidden = phase === 'play' || !ov.hidden; }
  onBtn.addEventListener('click', function () { if (phase === 'idle') { phase = 'menu'; showPanel('menu'); renderBtn(); } });

  // the keyboard goes to the game, so keep key presses typed in the overlay away from it
  ov.addEventListener('keydown', function (e) { e.stopPropagation(); });
  ov.addEventListener('keyup', function (e) { e.stopPropagation(); });

  /* ================= members / presence ================= */
  var sendRoom = function (ev, p) { if (room && tracked) room.send(ev, p); };
  function members() {
    if (!room) return [];
    var out = [], seen = {};
    Object.keys(room.presence).forEach(function (k) {
      var arr = room.presence[k], m = arr[arr.length - 1];
      if (!m || typeof m.id !== 'string' || seen[m.id]) return;
      seen[m.id] = 1; out.push(m);
    });
    return out.sort(function (a, b) { return ((a.ts || 0) - (b.ts || 0)) || (a.id < b.id ? -1 : 1); });
  }
  var meta = function () { return { id: myId, name: myName(), avatar: myAvatar(), ts: myTs, st: myState }; };
  function setMyState(s) { myState = s; if (room && tracked) room.track(meta()); }

  function renderLobby() {
    var all = members();
    lTitle.textContent = roomPublic ? 'Public room' : 'Private room';
    lCode.hidden = roomPublic; lCode.textContent = roomCode; inviteBtn.hidden = roomPublic || !roomCode;
    lSlots.textContent = '';
    for (var i = 0; i < 2; i++) {
      var m = all[i], li = txt('li', m ? '' : 'empty', '');
      if (m) { li.appendChild(avatarWrap(m.avatar)); li.appendChild(txt('span', 'nm', m.name + (m.id === myId ? ' (you)' : ''))); }
      else li.appendChild(txt('span', 'nm', 'Waiting for a player...'));
      li.appendChild(txt('span', 'tag', 'Player ' + (i + 1) + ' \u00b7 ' + SEAT_KEYS[i].label));
      lSlots.appendChild(li);
    }
    var ready = all.length >= 2;
    if (!ready) lSub.textContent = roomPublic ? 'Waiting for an opponent to join...' : 'Tell your friend this code. Waiting for them to join...';
    else lSub.textContent = isHost ? (roomPublic ? 'Opponent found! Starting...' : 'Your friend is here.') : 'The host starts the match.';
    startBtn.hidden = !(isHost && ready && !roomPublic);
    lFine.textContent = 'The first player in the room is the host: the game runs on their computer and is streamed to the other player. The host should use Chrome, Edge or Firefox on a computer and keep this tab in front. Click the two-player mode in the game, then press W, \u2191 or Space (or the big button on a phone) to control your own player.';
    if (isHost && roomPublic && ready && !autoT) { autoT = setTimeout(function () { autoT = 0; if (phase === 'lobby' && isHost && members().length >= 2) hostStart(); }, 3000); }
  }

  function onPresence() {
    if (!tracked || !room || phase === 'connect' || phase === 'menu' || phase === 'idle') return;
    var all = members(), idx = all.findIndex(function (m) { return m.id === myId; });
    if (idx === -1) return;
    if (idx >= 2 && phase === 'lobby') { leaveWith('Room full', 'That room already has 2 players.'); return; }
    isHost = all[0].id === myId;
    if (phase === 'lobby') { renderLobby(); return; }
    if (phase === 'play' && oppInfo && !all.some(function (m) { return m.id === oppInfo.id; })) endOnline('Your opponent left the match.');
  }


  /* ================= firing keys and clicks into the game ================= */
  function mark(ev) { ev.__gwNet = true; return ev; }
  function defNum(ev, name, v) { try { Object.defineProperty(ev, name, { get: function () { return v; } }); } catch (e) { /* ignore */ } }
  function fireKey(seat, down) {
    var k = SEAT_KEYS[seat], cv = gameCanvas() || document;
    if (seatHeld[seat] === down) return;
    seatHeld[seat] = down;
    var ev = new KeyboardEvent(down ? 'keydown' : 'keyup', { key: k.key, code: k.code, bubbles: true, cancelable: true, composed: true });
    defNum(ev, 'keyCode', k.kc); defNum(ev, 'which', k.kc); defNum(ev, 'charCode', 0);
    cv.dispatchEvent(mark(ev));
  }
  function fireMouse(kind, nx, ny) {
    var cv = gameCanvas(); if (!cv) return;
    var r = cv.getBoundingClientRect(), x = r.left + clamp(+nx || 0, 0, 1) * r.width, y = r.top + clamp(+ny || 0, 0, 1) * r.height;
    var base = { clientX: x, clientY: y, screenX: x + (window.screenX || 0), screenY: y + (window.screenY || 0), bubbles: true, cancelable: true, view: window, button: 0 };
    function send(type, buttons) { cv.dispatchEvent(mark(new MouseEvent(type, Object.assign({}, base, { buttons: buttons })))); }
    send('mousemove', mouseHeld ? 1 : 0);
    if (kind === 'd') { mouseHeld = true; send('mousedown', 1); }
    else { mouseHeld = false; send('mouseup', 0); send('click', 0); }
  }
  function releaseAll() {
    [0, 1].forEach(function (s) { if (seatHeld[s]) fireKey(s, false); });
    if (mouseHeld) mouseHeld = false;
    heldMine = false;
  }

  /* ================= the stream: the host runs the game, the guest watches it and sends buttons ================= */
  var ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
  // Players behind very strict networks may also need a TURN relay. Add one here if needed:
  //   { urls: 'turn:your.turn.server:3478', username: '...', credential: '...' }
  var pc = null, dc = null, outStream = null, pendingIce = [], pingT = 0;

  var dcOpen = function () { return !!dc && dc.readyState === 'open'; };
  var oppId = function () { return oppInfo ? oppInfo.id : ''; };
  // guest -> host: over the data channel, or (until it opens) over the matchmaking connection
  function sendInput(msg) {
    if (dcOpen()) { try { dc.send(JSON.stringify(msg)); return; } catch (e) { /* fall through */ } }
    sendRoom('gin', msg);
  }
  // host: apply what the guest sent
  function onRemoteMsg(p) {
    if (mode !== 'host' || phase !== 'play' || !p) return;
    if (p.t === 'k') fireKey(1, p.d === 1);
    else if (p.t === 'm') fireMouse(p.k === 'd' ? 'd' : 'u', +p.x, +p.y);
    else if (p.t === 'p' && dcOpen()) { try { dc.send(JSON.stringify({ t: 'o', s: p.s })); } catch (e) { /* ignore */ } }
  }

  function closePC() {
    clearInterval(pingT); pingT = 0; clearTimeout(linkT); linkT = 0; clearTimeout(discT); discT = 0;
    linked = false; pendingIce = [];
    if (dc) { try { dc.close(); } catch (e) { /* ignore */ } dc = null; }
    if (pc) { try { pc.close(); } catch (e) { /* ignore */ } pc = null; }
    if (outStream) { outStream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { /* ignore */ } }); outStream = null; }
    try { vid.srcObject = null; } catch (e) { /* ignore */ }
    vid.hidden = true;
  }
  function newPC() {
    closePC();
    var conn = new RTCPeerConnection(ICE); pc = conn;
    conn.onicecandidate = function (e) {
      if (e.candidate && conn === pc) sendRoom('rtc', { to: oppId(), k: 'ice', d: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate });
    };
    conn.onconnectionstatechange = function () {
      if (conn !== pc || phase !== 'play') return;
      var s = conn.connectionState;
      if (s === 'connected') { linked = true; clearTimeout(linkT); linkT = 0; clearTimeout(discT); discT = 0; renderHud(); }
      else if (s === 'failed' || s === 'closed') endOnline('The video link failed. Your network may be blocking peer-to-peer connections.');
      else if (s === 'disconnected' && !discT) {
        toast('Connection unstable...', 2500);
        discT = setTimeout(function () { discT = 0; if (conn === pc && phase === 'play' && conn.connectionState !== 'connected') endOnline('Connection lost. The online match ended.'); }, 8000);
      }
    };
    return conn;
  }
  function wireDC(ch) {
    ch.onopen = function () {
      if (mode === 'guest') { clearInterval(pingT); pingT = setInterval(function () { sendInput({ t: 'p', s: Date.now() }); }, 2000); }
      renderHud();
    };
    ch.onmessage = function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (mode === 'host') onRemoteMsg(m);
      else if (m && m.t === 'o') { rttNow = Math.max(0, Date.now() - (+m.s || Date.now())); renderHud(); }
    };
  }
  function tuneSender(s) {
    try {
      var p = s.getParameters(); if (!p.encodings || !p.encodings.length) p.encodings = [{}];
      p.encodings[0].maxBitrate = 6000000; p.degradationPreference = 'maintain-framerate';
      s.setParameters(p);
    } catch (e) { /* ignore */ }
  }

  // HOST: capture the game canvas and offer it to the guest
  async function startHostStream() {
    var cv = gameCanvas();
    if (!cv || !cv.captureStream || !window.RTCPeerConnection) { endOnline('This browser cannot stream the game. The host needs Chrome, Edge or Firefox on a computer.'); return; }
    try {
      var conn = newPC();
      outStream = cv.captureStream(60);
      var track = outStream.getVideoTracks()[0];
      if (!track) throw new Error('no video track');
      try { track.contentHint = 'motion'; } catch (e) { /* ignore */ }
      var sender = conn.addTrack(track, outStream);
      dc = conn.createDataChannel('in', { ordered: true }); wireDC(dc);
      var offer = await conn.createOffer();
      await conn.setLocalDescription(offer);
      tuneSender(sender);
      sendRoom('rtc', { to: oppId(), k: 'offer', d: { type: offer.type, sdp: offer.sdp } });
    } catch (e) { endOnline('Could not start streaming the game.'); }
  }
  async function flushIce(conn) {
    var q = pendingIce; pendingIce = [];
    for (var i = 0; i < q.length; i++) { try { await conn.addIceCandidate(q[i]); } catch (e) { /* ignore */ } }
  }
  // both sides: signaling messages
  async function onRtc(p) {
    if (!p || p.to !== myId || phase !== 'play') return;
    try {
      if (p.k === 'offer' && mode === 'guest') {
        var conn = newPC();
        conn.ontrack = function (e) {
          vid.srcObject = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
          vid.hidden = false;
          try { var pl = vid.play(); if (pl && pl.catch) pl.catch(function () { /* ignore */ }); } catch (x) { /* ignore */ }
          try { e.receiver.playoutDelayHint = 0; } catch (x) { /* ignore */ }
          try { e.receiver.jitterBufferTarget = 0; } catch (x) { /* ignore */ }
        };
        conn.ondatachannel = function (e) { dc = e.channel; wireDC(dc); };
        await conn.setRemoteDescription(p.d);
        await flushIce(conn);
        var ans = await conn.createAnswer();
        await conn.setLocalDescription(ans);
        sendRoom('rtc', { to: oppId(), k: 'answer', d: { type: ans.type, sdp: ans.sdp } });
      } else if (p.k === 'answer' && mode === 'host' && pc) {
        await pc.setRemoteDescription(p.d);
        await flushIce(pc);
      } else if (p.k === 'ice' && pc) {
        if (pc.remoteDescription) await pc.addIceCandidate(p.d); else pendingIce.push(p.d);
      }
    } catch (e) { /* ignore a bad message */ }
  }

  /* ---- catch the player's own input while a match is on ---- */
  function myInput(down) {
    if (phase !== 'play' || heldMine === down) return;
    heldMine = down;
    if (mode === 'host') fireKey(0, down);                       // I am Player 1: press it in my own game
    else if (mode === 'guest') sendInput({ t: 'k', d: down ? 1 : 0 });   // I am Player 2: ask the host to press it
  }
  function seatKeyEvent(e) {
    if (phase !== 'play' || !mode || e.__gwNet) return;
    if (MY_CODES.indexOf(e.code) === -1) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat) return;
    myInput(e.type === 'keydown');
  }
  window.addEventListener('keydown', seatKeyEvent, true);
  window.addEventListener('keyup', seatKeyEvent, true);

  // GUEST: clicks and taps on the video go to the host's game (the picture may be letterboxed, so map carefully)
  function vidPos(e) {
    var r = vid.getBoundingClientRect(), vw = vid.videoWidth, vh = vid.videoHeight;
    if (!r.width || !r.height) return null;
    var w = r.width, h = r.height, ox = 0, oy = 0;
    if (vw && vh) { var s = Math.min(r.width / vw, r.height / vh); w = vw * s; h = vh * s; ox = (r.width - w) / 2; oy = (r.height - h) / 2; }
    return { x: clamp((e.clientX - r.left - ox) / w, 0, 1), y: clamp((e.clientY - r.top - oy) / h, 0, 1) };
  }
  vid.addEventListener('pointerdown', function (e) {
    if (mode !== 'guest' || phase !== 'play') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault(); var p = vidPos(e); if (p) sendInput({ t: 'm', k: 'd', x: p.x, y: p.y });
  });
  vid.addEventListener('pointerup', function (e) {
    if (mode !== 'guest' || phase !== 'play') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault(); var p = vidPos(e); if (p) sendInput({ t: 'm', k: 'u', x: p.x, y: p.y });
  });
  vid.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  window.addEventListener('blur', function () { if (heldMine) myInput(false); });

  // the big button for touch screens
  tap.addEventListener('pointerdown', function (e) { e.preventDefault(); tap.className = 'on'; try { tap.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } myInput(true); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) { tap.addEventListener(t, function () { tap.className = ''; myInput(false); }); });

  /* ================= match start / end ================= */
  function renderHud() {
    hud.textContent = '';
    var opp = oppInfo ? oppInfo.name : 'opponent';
    if (mode === 'host') hud.appendChild(txt('span', 'me', 'You: Player 1 \u00b7 W/Space (you run the game)'));
    else hud.appendChild(txt('span', 'me', 'You: Player 2 \u00b7 W/\u2191/Space'));
    hud.appendChild(txt('span', '', mode === 'host' ? 'vs ' + opp : 'host: ' + opp));
    hud.appendChild(txt('span', 'png', rttNow ? rttNow + ' ms' : (linked ? 'live' : 'connecting...')));
    var lv = txt('button', '', 'Leave'); lv.type = 'button'; lv.addEventListener('click', function () { endOnline(''); });
    hud.appendChild(lv);
  }
  function enterPlay(seat) {
    clearTimeout(autoT); autoT = 0;
    mySeat = seat; mode = seat === 0 ? 'host' : 'guest'; rttNow = 0; linked = false;
    var all = members(); oppInfo = all.filter(function (m) { return m.id !== myId; })[0] || null;
    releaseAll();
    phase = 'play'; setMyState('play');
    closeOverlay(); renderBtn(); renderHud(); hud.hidden = false;
    tap.hidden = !(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    try { window.focus(); } catch (e) { /* ignore */ }
    clearTimeout(linkT);
    linkT = setTimeout(function () { linkT = 0; if (phase === 'play' && !linked) endOnline('Could not connect to the other player\u2019s game. Try again; your network may block peer-to-peer video.'); }, 20000);
    if (mode === 'host') {
      toast('Match on! You run the game and stream it to your opponent. Choose the two-player mode, then press W or Space (you are Player 1). Keep this tab in front.', 8000);
      startHostStream();
    } else {
      toast('Connecting to the host\u2019s game... You are Player 2: press \u2191, W or Space.', 6000);
    }
  }
  function hostStart() {
    if (!isHost || members().length < 2 || phase !== 'lobby') return;
    clearTimeout(autoT); autoT = 0;
    sendRoom('start', {});
    enterPlay(0);
  }
  function onStart() { if (phase === 'lobby' && !isHost) enterPlay(1); }


  function resetLocal() {
    clearTimeout(autoT); autoT = 0; closePC(); mode = ''; rttNow = 0;
    releaseAll();
    oppInfo = null; isHost = false; tracked = false; myState = 'lobby'; roomCode = ''; roomPublic = false;
    hud.hidden = true; tap.hidden = true; tap.className = '';
  }
  function closeNet() {
    joinToken++;
    if (room) { try { room.leave(); } catch (e) { /* ignore */ } room = null; }
    if (rt) { rt.close(); rt = null; }
    resetLocal();
  }
  function toMenu() { closeNet(); phase = 'menu'; showPanel('menu'); renderBtn(); }
  function leaveWith(title, text) { closeNet(); phase = 'menu'; info(title, text); renderBtn(); }
  function endOnline(msg) {
    var wasPlaying = phase === 'play';
    closeNet(); phase = 'idle'; closeOverlay(); renderBtn();
    if (msg) toast(msg, 5000);
    else if (wasPlaying) toast('You left the online match.', 3000);
  }
  function connectFail() { leaveWith('Could not connect', 'The matchmaking server could not be reached. Your network may be blocking it.'); }
  function netLost() { if (phase === 'idle' || phase === 'menu') return; if (phase === 'connect') { connectFail(); return; } if (phase === 'play') { if (linked) return; endOnline('Connection lost. The online match ended.'); return; } leaveWith('Connection lost', 'The connection to the matchmaking server dropped.'); }
  function connecting(title, text) { phase = 'connect'; cTitle.textContent = title; cText.textContent = text; showPanel('connect'); renderBtn(); }

  /* ================= matchmaking ================= */
  var HANDLED = { start: onStart, rtc: onRtc, gin: onRemoteMsg };
  // 'ok', 'busy' (a match is running), 'full', 'empty' (nobody there), 'taken' or 'fail'
  async function joinRoom(name, opts, token) {
    var ch = rt.channel(name, myId); room = ch; tracked = false;
    Object.keys(HANDLED).forEach(function (t) { ch.on(t, function (p) { HANDLED[t](p); }); });
    ch.onPresence = onPresence; ch.onClose = netLost;
    var bail = function (r) { try { ch.leave(); } catch (e) { /* ignore */ } if (room === ch) room = null; tracked = false; return r; };
    try { await ch.join(); } catch (e) { return bail('fail'); }
    await sleep(800); if (token !== joinToken) return bail('fail');
    var ex = members();
    if (ex.some(function (m) { return m.st === 'play'; })) return bail('busy');
    if (ex.length >= 2) return bail('full');
    if (opts.need && !ex.length) return bail('empty');
    if (opts.create && ex.length) return bail('taken');
    myTs = Math.max.apply(null, [Date.now()].concat(ex.map(function (m) { return (m.ts || 0) + 1; })));
    myState = 'lobby'; ch.track(meta()); tracked = true;
    await sleep(700); if (token !== joinToken) return bail('fail');
    var all = members(), idx = all.findIndex(function (m) { return m.id === myId; });
    if (idx === -1 || idx >= 2) return bail('full');
    if (all.some(function (m) { return m.st === 'play'; })) return bail('busy');
    isHost = all[0].id === myId; roomPublic = !!opts.pub; roomCode = opts.code || '';
    phase = 'lobby'; renderLobby(); showPanel('lobby'); renderBtn();
    return 'ok';
  }
  async function startNet(title, text) {
    closeNet(); var token = joinToken; connecting(title, text);
    rt = new RT();
    try { await rt.connect(); } catch (e) { if (token === joinToken) connectFail(); return null; }
    if (token !== joinToken) { rt.close(); return null; }
    rt.onClose = netLost;
    return token;
  }
  async function quickPlay() {
    var token = await startNet('Finding an opponent...', 'Looking for a room with space.'); if (token === null) return;
    for (var n = 1; n <= 20; n++) {
      cText.textContent = 'Checking room ' + n + '...';
      var r = await joinRoom(ROOM_PREFIX + 'pub-' + n, { pub: true }, token);
      if (token !== joinToken) return;
      if (r === 'ok') return;
      if (r === 'fail') { connectFail(); return; }
    }
    leaveWith('All rooms are busy', 'Every public room is full or in a match right now. Try again in a minute, or create a private room.');
  }
  async function makeRoom() {
    var token = await startNet('Creating a room...', 'Setting things up.'); if (token === null) return;
    for (var i = 0; i < 4; i++) {
      var code = ''; for (var k = 0; k < 4; k++) code += CODE_CHARS[rnd(CODE_CHARS.length)];
      var r = await joinRoom(ROOM_PREFIX + 'code-' + code, { create: true, code: code }, token);
      if (token !== joinToken) return;
      if (r === 'ok') return;
      if (r === 'fail') { connectFail(); return; }
    }
    connectFail();
  }
  async function joinCodeRoom(code) {
    var token = await startNet('Joining...', 'Looking for room ' + code + '...'); if (token === null) return;
    var r = await joinRoom(ROOM_PREFIX + 'code-' + code, { need: true, code: code }, token);
    if (token !== joinToken || r === 'ok') return;
    if (r === 'empty') leaveWith('Room not found', 'No one is in room ' + code + '. Check the code and try again.');
    else if (r === 'full') leaveWith('Room full', 'That room already has 2 players.');
    else if (r === 'busy') leaveWith('Match in progress', 'That match already started. Ask your friend to make a new room.');
    else connectFail();
  }

  window.addEventListener('pagehide', function () { if (room) { try { room.leave(); } catch (e) { /* ignore */ } } });

  // invite link: ?room=ABCD opens straight into that room, so nobody has to type the code
  function copyInvite() {
    if (!roomCode) return;
    var link = '';
    try { var u = new URL(location.href); u.searchParams.set('room', roomCode); u.hash = ''; link = u.toString(); } catch (e) { link = location.href; }
    var done = function () { inviteBtn.textContent = 'Copied!'; setTimeout(function () { inviteBtn.textContent = 'Copy invite link'; }, 2000); };
    var manual = function () { window.prompt('Copy this link and send it to your friend:', link); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, manual); else manual();
  }
  try {
    var qRoom = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (qRoom.length === 4) setTimeout(function () { if (phase === 'idle') { phase = 'menu'; joinCodeRoom(qRoom); } }, 800);
  } catch (e) { /* ignore */ }

  renderBtn();

  // small hook so the page (or a test) can see the state
  window.GetawayOnline = { state: function () { return { phase: phase, mode: mode, seat: mySeat, host: isHost, linked: linked, rtt: rttNow }; }, leave: function () { endOnline(''); } };
})();
