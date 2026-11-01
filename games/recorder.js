/* Game recorder. Used by every game page (and by index.html for the library + sharing in chat).

   On a game page:   <script src="recorder.js" data-game="snake" data-canvas="#cv" data-grace="2500"></script>
     data-game    the leaderboard id of the game (needed for the Rec button to appear)
     data-canvas  CSS selector of the game's main <canvas>. Leave it out for games that are not drawn on a canvas
                  (2048, Block Blast): those record the tab through the browser's screen-capture picker instead.
     data-grace   how long (ms) the game must be "not playing" before the recording ends (default 3300).
                  Kept long enough to ride out short animations like Pac-Man's death or a Tetris line clear.
     data-corner  tr (default) | tl | br | bl, where the Rec button sits

   How it works: click Rec BEFORE the game starts -> the button says "Armed" -> the recording starts by itself the moment
   a round starts and ends by itself when the round ends (pausing pauses the recording too). The clip is uploaded to the
   player's own folder in Orbit's storage (the Orbit login is used automatically, there is no separate games login) and can then be
   watched, downloaded or copied as a link from "My recordings".

   Sound is captured by listening in on the page's Web Audio output and <audio> elements, so this file must be loaded
   BEFORE the game's own scripts (put it first). Games without a status of their own call GameRec.hook({ playing, paused }). */
(function () {
  'use strict';

  var MAX_SECS = 1200;             // one clip is at most 20 minutes (bitrate below keeps that under the 50 MB storage cap)
  var MIN_SECS = 3;                // anything shorter is thrown away
  var DEFAULT_KEEP = 8;            // overridden by the recordings_max setting
  var GAME_NAMES = { blockblast: 'Block Blast', tetris: 'Tetris', game2048: '2048', snake: 'Snake', pacman: 'Pac-Man', breakout: 'Block Breaker', minesweeper: 'Minesweeper', flappy: 'Flappy Bird', dino: 'Dino Run', blockout: 'Blockout', slope: 'Slope', geodash: 'Geometry Dash', girder: 'Girder Gorilla', sudoku: 'Sudoku' };
  var me = document.currentScript;
  var CFG = {
    game: me && me.getAttribute('data-game') || '',
    canvas: me && me.getAttribute('data-canvas') || '',
    grace: parseInt(me && me.getAttribute('data-grace'), 10) || 3300,
    corner: me && me.getAttribute('data-corner') || 'tr',
    area: me && me.getAttribute('data-area') || ''
  };

  /* =====================================================================
     1. Sound tap: copy everything the page plays into a stream we can record
     ===================================================================== */
  var tapOf = typeof WeakMap === 'function' ? new WeakMap() : null, tapList = [], elStreams = [], mix = null;

  function mixAdd(stream) {
    if (!mix || !stream || !stream.getAudioTracks().length) return;
    try { var s = mix.ctx.createMediaStreamSource(stream); s.connect(mix.dest); mix.srcs.push(s); } catch (e) { /* ignore */ }
  }
  try {
    if (!CFG.game) throw 0;      // the home page only needs the library, not the sound tap
    var AN = window.AudioNode && AudioNode.prototype;
    if (AN && tapOf && window.AudioDestinationNode) {
      var origConnect = AN.connect;
      AN.connect = function (dest) {
        var r = origConnect.apply(this, arguments);
        try {
          if (dest instanceof AudioDestinationNode) {
            var ctx = dest.context, t = tapOf.get(ctx);
            if (!t) { t = ctx.createMediaStreamDestination(); tapOf.set(ctx, t); tapList.push(t); mixAdd(t.stream); }
            origConnect.call(this, t);
          }
        } catch (e) { /* never break a game's sound */ }
        return r;
      };
    }
    var HM = window.HTMLMediaElement && HTMLMediaElement.prototype;
    if (HM && HM.play) {
      var origPlay = HM.play;
      HM.play = function () {
        try {
          var el = this;
          if (!el.__recW) {
            el.__recW = 1;
            var grab = function () {
              try {
                var st = el.captureStream ? el.captureStream() : (el.mozCaptureStream ? el.mozCaptureStream() : null);
                if (st && st.getAudioTracks().length) { elStreams.push(st); mixAdd(st); }
              } catch (e) { /* ignore */ }
            };
            if (el.readyState >= 2) grab(); else el.addEventListener('loadeddata', grab, { once: true });
          }
        } catch (e) { /* ignore */ }
        return origPlay.apply(this, arguments);
      };
    }
  } catch (e) { /* sound capture is a bonus; recording still works without it */ }

  function startMix() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      var ctx = new AC(), dest = ctx.createMediaStreamDestination();
      mix = { ctx: ctx, dest: dest, srcs: [] };
      tapList.forEach(function (t) { mixAdd(t.stream); });
      elStreams.forEach(mixAdd);
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      return dest.stream.getAudioTracks();
    } catch (e) { mix = null; return null; }
  }
  function stopMix() {
    if (!mix) return;
    try { mix.srcs.forEach(function (s) { try { s.disconnect(); } catch (e) { /* ignore */ } }); mix.ctx.close(); } catch (e) { /* ignore */ }
    mix = null;
  }

  /* =====================================================================
     2. Small helpers: accounts, requests
     ===================================================================== */
  function LB() { return window.Leaderboard || null; }
  /* Recordings are stored in Orbit (same account as the chat app), so the Orbit session is the login: nothing else to sign in to.
     The games backend (Leaderboard.config) is only used for the admin's recording settings and the old games chat. */
  var ORBIT = {
    url: 'https://qtmrtxgkisshdtqshjre.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0bXJ0eGdraXNzaGR0cXNoanJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwOTQyMDEsImV4cCI6MjEwNzY3MDIwMX0.CROrmFcFvrVEzKi-qFGagmm3TapDN2PSh6KPtBkEV5A',
    session: 'sb-qtmrtxgkisshdtqshjre-auth-token'
  };
  function conf() { return ORBIT; }
  function gconf() { var l = LB(); return l && l.config ? l.config : null; }
  function orbitSession() { try { var s = JSON.parse(localStorage.getItem(ORBIT.session) || 'null'); return s && s.access_token && s.user ? s : null; } catch (e) { return null; } }
  function token() {
    var s = orbitSession();
    if (!s) return Promise.resolve(null);
    if (!s.expires_at || s.expires_at * 1000 > Date.now() + 30000) return Promise.resolve(s.access_token);
    // the Orbit app keeps this fresh while it is open; if it has gone stale, refresh it the same way the app does and store it back
    return fetch(ORBIT.url + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: ORBIT.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) {
        try { s.access_token = j.access_token; s.refresh_token = j.refresh_token; s.expires_at = j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600); if (j.user) s.user = j.user; localStorage.setItem(ORBIT.session, JSON.stringify(s)); } catch (e) { /* ignore */ }
        return j.access_token;
      }).catch(function () { return null; });
  }
  function uidOf(t) { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || ''; } catch (e) { return ''; } }
  function hdr(t, extra, c) { c = c || conf(); return Object.assign({ apikey: c.key, Authorization: 'Bearer ' + (t || c.key) }, extra || {}); }
  function gname(g) { return GAME_NAMES[g] || g; }
  function fmtTime(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function fmtSize(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function fmtDate(iso) { try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch (e) { return ''; } }
  function pubUrl(path) { return conf().url + '/storage/v1/object/public/recordings/' + path; }
  function rnd() { return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function errText(r, fallback) { return r.json().then(function (j) { return j.message || j.error || fallback; }, function () { return fallback; }); }

  function api(path, opts, t, c) {
    c = c || conf();
    var o = Object.assign({}, opts || {}); o.headers = hdr(t, o.headers, c);
    return fetch(c.url + path, o);
  }
  function listMine(t) {
    var uid = uidOf(t);
    return api('/rest/v1/recordings?select=*&user_id=eq.' + uid + '&order=id.desc', {}, t).then(function (r) {
      if (!r.ok) return errText(r, 'Could not load your recordings.').then(function (m) { throw new Error(/relation|does not exist|schema cache/i.test(m) ? 'Recordings are not set up yet (run chatter/migration-recordings.sql in the Orbit Supabase project).' : m); });
      return r.json();
    });
  }
  function keepLimit() {
    var g = gconf(); if (!g) return Promise.resolve(DEFAULT_KEEP);
    return api('/rest/v1/site_settings?select=value&key=eq.recordings_max', {}, null, g).then(function (r) { return r.ok ? r.json() : []; })
      .then(function (a) { var v = a && a[0] && parseInt(a[0].value, 10); return v > 0 ? v : DEFAULT_KEEP; }, function () { return DEFAULT_KEEP; });
  }
  function uploadFile(t, path, blob, type, onProgress) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open('POST', conf().url + '/storage/v1/object/recordings/' + path);
      var h = hdr(t, { 'Content-Type': type, 'cache-control': 'max-age=31536000' });
      Object.keys(h).forEach(function (k) { x.setRequestHeader(k, h[k]); });
      x.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      x.onload = function () {
        if (x.status >= 200 && x.status < 300) { resolve(); return; }
        var why = ''; try { var j = JSON.parse(x.responseText); why = j.message || j.error || ''; } catch (e) { /* ignore */ }
        if (/bucket not found/i.test(why)) why = 'Recording storage is not set up yet (run chatter/migration-recordings.sql in the Orbit Supabase project).';
        else if (/row-level security|policy|unauthorized|not allowed/i.test(why)) why = 'Uploads are blocked by Supabase permissions (re-run chatter/migration-recordings.sql).';
        else if (/exceeded|too large|maximum/i.test(why)) why = 'That clip is too big to store.';
        reject(new Error(why || 'Upload failed (' + x.status + ').'));
      };
      x.onerror = function () { reject(new Error('Could not upload. Check your connection.')); };
      x.send(blob);
    });
  }
  function removeRec(t, rec) {
    return api('/rest/v1/recordings?id=eq.' + rec.id, { method: 'DELETE' }, t).then(function (r) {
      if (!r.ok) throw new Error('Could not delete that recording.');
      return api('/storage/v1/object/recordings/' + rec.path, { method: 'DELETE' }, t).catch(function () { /* the library row is already gone */ });
    });
  }

  /* ---- sharing in chat: same rules as the chat itself (Google login, server checks the clip is yours) ---- */
  function chatTok() {
    var v = ''; try { v = JSON.parse(localStorage.getItem('chat-token') || '""') || ''; } catch (e) { v = ''; }
    if (!v) { try { v = rnd(); localStorage.setItem('chat-token', JSON.stringify(v)); } catch (e) { v = ''; } }
    return v;
  }
  function sha256(s) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (b) { return Array.from(new Uint8Array(b)).map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); });
  }
  function channels() {
    return api('/rest/v1/chat_channels?select=id,title,score_only,staff_only&order=sort_order', {}, null, gconf()).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; })
      .then(function (a) {
        a = (a || []).filter(function (c) { return !c.score_only && !c.staff_only; });
        return a.length ? a : [{ id: 'general', title: 'general' }, { id: 'game-chat', title: 'game-chat' }, { id: 'memes', title: 'memes' }];
      });
  }
  function shareToChat(rec, channel) {
    var l = LB(), name = l && l.getName ? l.getName() : '';
    if (!name) return Promise.reject(new Error('Finish making your profile on the home page first.'));
    if (l.isCleanName && !l.isCleanName(name)) return Promise.reject(new Error('Please change your profile name to chat.'));
    var acct = l.getAccount && l.getAccount();
    if (!acct || acct.provider !== 'google') return Promise.reject(new Error('Sharing into the games chat needs the games chat login. Use Copy link to share this clip anywhere.'));
    return Promise.all([l.freshToken ? l.freshToken() : null, sha256(chatTok() || 'none')]).then(function (a) {
      var body = { name: name, avatar: l.getAvatar ? l.getAvatar() : undefined, message: 'shared a recording', channel: channel, kind: 'recording', meta: { path: rec.path }, owner_hash: a[1] };
      return api('/rest/v1/chat_messages', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body) }, a[0], gconf());
    }).then(function (r) {
      if (r.ok) return true;
      return errText(r, 'Could not send.').then(function (m) { throw new Error(/violates|constraint/i.test(m) ? 'Chat is not set up for recordings yet (run recordings-setup.sql in Supabase).' : m); });
    });
  }
  function canShare() { var l = LB(), a = l && l.getAccount && l.getAccount(); return !!(a && a.provider === 'google'); }
  function download(urlOrBlobUrl, game, ext) {
    var name = 'gamer4school-' + (game || 'game') + '-' + new Date().toISOString().slice(0, 10) + '.' + (ext || 'webm');
    function save(href, revoke) {
      var a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      if (revoke) setTimeout(function () { URL.revokeObjectURL(href); }, 4000);
    }
    if (/^blob:/.test(urlOrBlobUrl)) { save(urlOrBlobUrl, false); return Promise.resolve(); }
    return fetch(urlOrBlobUrl).then(function (r) { if (!r.ok) throw new Error('Could not download that recording.'); return r.blob(); }).then(function (b) { save(URL.createObjectURL(b), true); });
  }
  // recordings made by MediaRecorder have no length stored, so seeking looks broken until this nudge
  function fixDuration(v) {
    v.addEventListener('loadedmetadata', function () {
      if (v.duration === Infinity) {
        var back = function () { v.removeEventListener('timeupdate', back); v.currentTime = 0; };
        v.addEventListener('timeupdate', back); v.currentTime = 1e101;
      }
    });
  }

  /* =====================================================================
     3. Look and feel (one stylesheet, only built when something is shown)
     ===================================================================== */
  var cssDone = false;
  function css() {
    if (cssDone) return; cssDone = true;
    var s = document.createElement('style');
    s.textContent =
      '#gr-btn{position:fixed;z-index:9100;display:none;align-items:center;gap:8px;height:42px;padding:0 18px 0 14px;border-radius:21px;border:3px solid #fff;' +
      'background:#e11d48;color:#fff;font:700 18px/1 "Pixelify Sans","Courier New",monospace;letter-spacing:.5px;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;white-space:nowrap;' +
      'box-shadow:0 0 0 0 rgba(225,29,72,.7),0 3px 10px rgba(0,0,0,.45);animation:grp 1.8s ease-out infinite}' +
      '#gr-btn:hover{background:#be123c}#gr-btn:focus-visible{outline:3px solid #ffd166;outline-offset:3px}' +
      '#gr-btn i{width:14px;height:14px;border-radius:50%;background:#fff;display:inline-block}' +
      '#gr-btn.armed{background:#f59e0b;color:#1b1b2f;animation:none}#gr-btn.armed i{background:#1b1b2f}' +
      '#gr-btn.rec{height:24px;padding:0 9px 0 7px;border-width:0;border-radius:12px;background:rgba(10,6,28,.55);font-size:13px;opacity:.65;pointer-events:none;animation:none;box-shadow:none}' +
      '#gr-btn.rec i{width:9px;height:9px;background:#ff3b5c;animation:grb 1s steps(2,jump-none) infinite}' +
      '@keyframes grp{70%{box-shadow:0 0 0 12px rgba(225,29,72,0),0 3px 10px rgba(0,0,0,.45)}100%{box-shadow:0 0 0 0 rgba(225,29,72,0),0 3px 10px rgba(0,0,0,.45)}}' +
      '@keyframes grb{50%{opacity:.15}}' +
      '#gr-btn.free,#gr-btn.free.tr,#gr-btn.free.tl,#gr-btn.free.br,#gr-btn.free.bl{right:auto;bottom:auto}' +   // placed beside the game: only left/top apply, or the pill stretches across the screen
      '@media (max-width:600px){#gr-btn{height:36px;padding:0 14px 0 11px;font-size:15px}}' +
      '#gr-btn.tr{right:calc(10px + env(safe-area-inset-right));top:calc(10px + env(safe-area-inset-top))}' +
      '#gr-btn.tl{left:calc(10px + env(safe-area-inset-left));top:calc(10px + env(safe-area-inset-top))}' +
      '#gr-btn.br{right:calc(60px + env(safe-area-inset-right));bottom:calc(10px + env(safe-area-inset-bottom))}' +
      '#gr-btn.bl{left:calc(10px + env(safe-area-inset-left));bottom:calc(10px + env(safe-area-inset-bottom))}' +
      '#gr-tip{position:fixed;z-index:9100;left:50%;transform:translateX(-50%);top:calc(52px + env(safe-area-inset-top));max-width:min(92vw,420px);padding:8px 14px;border-radius:10px;' +
      'background:rgba(10,6,28,.88);color:#fff;font:600 14px/1.35 "Pixelify Sans","Courier New",monospace;text-align:center;display:none;pointer-events:none}' +
      '.gr-card{position:fixed;z-index:9600;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom));width:min(94vw,440px);box-sizing:border-box;padding:14px 16px;border-radius:14px;' +
      'background:#14102b;color:#fff;border:2px solid #6366f1;box-shadow:0 8px 30px rgba(0,0,0,.5);font:600 15px/1.4 "Pixelify Sans","Courier New",monospace}' +
      '.gr-card p{margin:0 0 10px}.gr-card .gr-sub{opacity:.75;font-size:13px}' +
      '.gr-bar{height:8px;border-radius:4px;background:rgba(255,255,255,.18);overflow:hidden;margin:6px 0 2px}.gr-bar b{display:block;height:100%;width:0;background:#4ade80;transition:width .2s}' +
      '.gr-row{display:flex;flex-wrap:wrap;gap:8px}' +
      '.gr-b{font:700 14px "Pixelify Sans","Courier New",monospace;padding:.45em .9em;border-radius:9px;border:0;background:#2d2a52;color:#fff;cursor:pointer}' +
      '.gr-b:hover{background:#3d3a6b}.gr-b:focus-visible{outline:3px solid #ffd166;outline-offset:2px}.gr-b.pri{background:#ffd166;color:#1b1b2f}.gr-b.dng{background:#5a1f33}.gr-b:disabled{opacity:.5;cursor:default}' +
      '.gr-x{position:absolute;right:8px;top:6px;background:none;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1}' +
      '.gr-ov{position:fixed;inset:0;z-index:9700;background:rgba(5,3,18,.82);display:flex;align-items:center;justify-content:center;padding:14px;box-sizing:border-box}' +
      '.gr-panel{position:relative;width:min(96vw,640px);max-height:92vh;overflow:auto;box-sizing:border-box;padding:16px;border-radius:16px;background:#14102b;color:#fff;border:2px solid #6366f1;font:600 15px/1.4 "Pixelify Sans","Courier New",monospace}' +
      '.gr-panel h2{margin:0 34px 4px 0;font-size:24px}.gr-panel .gr-sub{opacity:.75;font-size:13px;margin:0 0 12px}' +
      '.gr-item{padding:10px;margin-bottom:10px;border-radius:12px;background:#1e1a40}.gr-item video{width:100%;max-height:300px;background:#000;border-radius:8px;display:block;margin-bottom:8px}' +
      '.gr-meta{display:flex;justify-content:space-between;gap:8px;margin-bottom:8px;flex-wrap:wrap}.gr-meta span{opacity:.75;font-size:13px}' +
      '.gr-sel{font:600 14px "Pixelify Sans","Courier New",monospace;padding:.4em .6em;border-radius:8px;border:2px solid #6366f1;background:#0e0b22;color:#fff}' +
      '.gr-msg{margin:6px 0 0;font-size:13px;color:#ffd166;min-height:1em}' +
      '@media (prefers-reduced-motion:reduce){#gr-btn,#gr-btn.rec i{animation:none}}';
    document.head.appendChild(s);
  }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function btn(label, fn, cls) { var b = el('button', 'gr-b' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.addEventListener('click', fn); return b; }

  /* =====================================================================
     4. The library ("My recordings") + share + watch
     ===================================================================== */
  var libEl = null;
  function closeLib() { if (libEl) { libEl.remove(); libEl = null; document.removeEventListener('keydown', libKey, true); } }
  function libKey(e) { if (e.key === 'Escape') { e.stopPropagation(); closeLib(); } }
  function overlay(title, sub) {
    css(); closeLib();
    var ov = el('div', 'gr-ov'), p = el('div', 'gr-panel');
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', title);
    var x = el('button', 'gr-x', '\u00D7'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.addEventListener('click', closeLib);
    p.append(x, el('h2', null, title)); if (sub) p.appendChild(el('p', 'gr-sub', sub));
    ov.appendChild(p); ov.addEventListener('click', function (e) { if (e.target === ov) closeLib(); });
    document.body.appendChild(ov); document.addEventListener('keydown', libKey, true); libEl = ov;
    x.focus();
    return p;
  }
  function watchLocal(res) {
    var p = overlay('Your recording', gname(res.game) + ' \u2022 ' + fmtTime(res.secs));
    var v = el('video'); v.src = res.url; v.controls = true; v.autoplay = true; v.playsInline = true; v.style.cssText = 'width:100%;max-height:70vh;background:#000;border-radius:8px';
    fixDuration(v); p.appendChild(v);
  }
  function openLibrary(opts) {
    opts = opts || {};
    var p = overlay('\uD83C\uDFAC My recordings', 'Clips are saved to your own storage. Each one is up to ' + (MAX_SECS / 60) + ' minutes.');
    var box = el('div'); box.textContent = 'Loading\u2026'; p.appendChild(box);
    token().then(function (t) {
      if (!t) {
        box.replaceChildren(el('p', null, 'Your Orbit login has expired. Open Orbit and log in again to see your recordings.'));
        var a = el('a', 'gr-b pri', 'Open Orbit'); a.href = '../chatter/'; a.target = '_top'; a.style.textDecoration = 'none'; a.style.display = 'inline-block'; box.appendChild(a);
        return;
      }
      return Promise.all([listMine(t), keepLimit()]).then(function (res) {
        var rows = res[0], lim = res[1];
        box.replaceChildren();
        box.appendChild(el('p', 'gr-sub', rows.length + ' of ' + lim + ' saved'));
        if (!rows.length) { box.appendChild(el('p', null, 'Nothing here yet. Click the red Rec button on a game page before you start playing.')); return; }
        rows.forEach(function (r) { box.appendChild(itemEl(r, t, function () { openLibrary(opts); })); });
      });
    }).catch(function (e) { box.replaceChildren(el('p', null, e.message || 'Could not load your recordings.')); });
  }
  function itemEl(r, t, refresh) {
    var it = el('div', 'gr-item'), url = pubUrl(r.path), ext = /\.mp4$/.test(r.path) ? 'mp4' : 'webm';
    var v = el('video'); v.controls = true; v.preload = 'metadata'; v.playsInline = true; v.src = url + '#t=0.1'; fixDuration(v); it.appendChild(v);
    var m = el('div', 'gr-meta'); m.appendChild(el('b', null, gname(r.game) + (r.score ? ' \u2022 ' + r.score.toLocaleString() : '')));
    m.appendChild(el('span', null, fmtTime(r.secs) + ' \u2022 ' + fmtSize(r.bytes) + ' \u2022 ' + fmtDate(r.created_at))); it.appendChild(m);
    var row = el('div', 'gr-row'), msg = el('p', 'gr-msg');
    row.appendChild(btn('\u2B07 Download', function () { msg.textContent = 'Downloading\u2026'; download(url, r.game, ext).then(function () { msg.textContent = ''; }, function (e) { msg.textContent = e.message; }); }));
    if (canShare()) row.appendChild(btn('\uD83D\uDCAC Share in chat', function () { shareBox(it, r, msg); }));
    row.appendChild(btn('\uD83D\uDD17 Copy link', function () {
      var done = function () { msg.textContent = 'Link copied.'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { msg.textContent = url; }); else msg.textContent = url;
    }));
    var del = btn('\uD83D\uDDD1 Delete', function () {
      if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = 'Tap again to delete'; setTimeout(function () { del.dataset.sure = ''; del.textContent = '\uD83D\uDDD1 Delete'; }, 3500); return; }
      del.disabled = true; msg.textContent = 'Deleting\u2026';
      removeRec(t, r).then(function () { it.remove(); refresh(); }, function (e) { del.disabled = false; msg.textContent = e.message; });
    }, 'dng');
    row.appendChild(del); it.append(row, msg);
    return it;
  }
  function shareBox(host, r, msg) {
    var old = host.querySelector('.gr-share'); if (old) { old.remove(); return; }
    var row = el('div', 'gr-row gr-share'); row.style.marginTop = '8px';
    var sel = el('select', 'gr-sel'); sel.setAttribute('aria-label', 'Channel');
    var go = btn('Send', function () {
      go.disabled = true; msg.textContent = 'Sending\u2026';
      shareToChat(r, sel.value).then(function () { msg.textContent = 'Shared in # ' + sel.options[sel.selectedIndex].text + '. Open the chat to see it.'; row.remove(); }, function (e) { go.disabled = false; msg.textContent = e.message; });
    }, 'pri');
    row.append(sel, go); host.insertBefore(row, msg);
    channels().then(function (cs) { cs.forEach(function (c) { var o = el('option', null, c.title || c.id); o.value = c.id; sel.appendChild(o); }); var gc = Array.from(sel.options).filter(function (o) { return o.value === 'game-chat'; })[0]; if (gc) sel.value = 'game-chat'; });
  }
  // for the chat's own "share a recording" picker
  function pick() { return token().then(function (t) { if (!t) throw new Error('Log in to Orbit to use your recordings.'); return listMine(t); }); }

  /* =====================================================================
     5. Recording on a game page
     ===================================================================== */
  var S = { phase: 'idle', hookFn: null, disp: null, out: null, raf: 0, rec: null, chunks: [], mime: '', t0: 0, acc: 0, pausedAt: 0, idleSince: 0, score: 0, lastLabel: '', tipTimer: 0 };
  var btnEl = null, tipEl = null, card = null;

  function status() {
    if (S.hookFn) { try { return S.hookFn(); } catch (e) { return null; } }
    return window.GamePause && GamePause.status ? GamePause.status() : null;
  }
  function screenMode() { return !CFG.canvas; }
  function supported() {
    if (!window.MediaRecorder) return 'Recording is not supported in this browser.';
    if (screenMode()) { if (!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)) return 'This game records your screen, which this device cannot do. Try a computer with Chrome.'; }
    else if (!HTMLCanvasElement.prototype.captureStream) return 'Recording is not supported in this browser.';
    return '';
  }
  function pickMime() {
    var c = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'];
    for (var i = 0; i < c.length; i++) { try { if (MediaRecorder.isTypeSupported(c[i])) return c[i]; } catch (e) { /* ignore */ } }
    return '';
  }
  function tip(text, ms) {
    css(); if (!tipEl) { tipEl = el('div'); tipEl.id = 'gr-tip'; tipEl.setAttribute('role', 'status'); document.body.appendChild(tipEl); }
    tipEl.textContent = text; tipEl.style.display = text ? 'block' : 'none';
    clearTimeout(S.tipTimer); if (text && ms) S.tipTimer = setTimeout(function () { tipEl.style.display = 'none'; }, ms);
  }
  function setBtn(cls, label) {
    if (!btnEl) return;
    if (btnEl.dataset.k === cls + label) return; btnEl.dataset.k = cls + label;
    btnEl.className = cls + ' ' + CFG.corner; btnEl.replaceChildren(el('i'), document.createTextNode(label)); btnEl.title = cls === '' ? 'Click this BEFORE you start playing to record the round' : ''; S.placed = '';
  }
  /* puts the button in empty space around the game (above, below, or beside it) so it never covers the board;
     only when the page leaves no room at all does it sit in a corner, and then only while no round is running */
  function place() {
    var a = document.querySelector(CFG.area || CFG.canvas), vw = window.innerWidth, vh = window.innerHeight, x = null, y = null;
    if (a && btnEl.offsetWidth) {
      var r = a.getBoundingClientRect(), w = btnEl.offsetWidth, h = btnEl.offsetHeight, m = 8;
      var cx = Math.min(Math.max(m, r.left + r.width / 2 - w / 2), vw - w - m);
      if (r.width > 0 && r.top >= h + 2 * m) { x = cx; y = r.top - h - m; }
      else if (vh - r.bottom >= h + 2 * m) { x = cx; y = r.bottom + m; }
      else if (vw - r.right >= w + 2 * m) { x = r.right + m; y = Math.max(m, r.top + m); }
      else if (r.left >= w + 2 * m) { x = r.left - w - m; y = Math.max(m, r.top + m); }
    }
    var key = x === null ? 'corner' : Math.round(x) + ',' + Math.round(y) + btnEl.className;
    if (S.placed === key) return; S.placed = key;
    if (x === null) { btnEl.classList.remove('free'); btnEl.style.left = btnEl.style.top = ''; }
    else { btnEl.classList.add('free'); btnEl.style.left = x + 'px'; btnEl.style.top = y + 'px'; }
  }
  var baseTitle = '';
  function titleTag(t) {
    if (t) { if (document.title.indexOf('\u25CF REC') !== 0) baseTitle = document.title; document.title = t + ' - ' + baseTitle; }
    else if (document.title.indexOf('\u25CF REC') === 0) document.title = baseTitle;
  }
  function build() {
    css();
    btnEl = el('button'); btnEl.id = 'gr-btn'; btnEl.type = 'button'; btnEl.className = CFG.corner;
    btnEl.addEventListener('click', function (e) { e.stopPropagation(); onBtn(); btnEl.blur(); });
    btnEl.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    document.body.appendChild(btnEl);
    setInterval(tick, 150);
  }

  function onBtn() {
    if (S.phase === 'armed') { disarm('Recording cancelled.'); return; }
    if (S.phase !== 'idle') return;
    var why = supported(); if (why) { tip(why, 5000); return; }
    wrapLB();
    if (screenMode()) {
      tip('Pick THIS tab in the window that pops up, then start your game.', 7000);
      navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude' }).then(function (st) {
        S.disp = st;
        st.getVideoTracks()[0].addEventListener('ended', function () { if (S.phase === 'armed') disarm('Screen sharing stopped.'); else if (S.phase === 'rec') finish('stopped'); });
        S.phase = 'armed'; tip('Armed. Recording starts when your game starts.', 4000);
      }, function () { tip('Screen recording was cancelled.', 3000); });
    } else {
      S.phase = 'armed'; tip('Armed. Recording starts when your game starts.', 4000);
    }
  }
  function disarm(msg) {
    if (S.disp) { S.disp.getTracks().forEach(function (t) { t.stop(); }); S.disp = null; }
    S.phase = 'idle'; if (msg) tip(msg, 3000);
  }

  // makes a steady-size canvas copy of the game's canvas (crisp pixels, survives window resizes) and records that
  function canvasSource() {
    var src = document.querySelector(CFG.canvas);
    if (!src || src.tagName !== 'CANVAS' || !src.width) return null;
    var k = 800 / Math.max(src.width, src.height), ow = Math.max(2, Math.round(src.width * k / 2) * 2), oh = Math.max(2, Math.round(src.height * k / 2) * 2);
    var out = document.createElement('canvas'); out.width = ow; out.height = oh;
    var g = out.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, ow, oh);
    S.out = out;
    (function draw() {
      if (S.phase !== 'rec' && S.phase !== 'armed') return;
      S.raf = requestAnimationFrame(draw);
      if (S.pausedAt || !src.width) return;
      var s = Math.min(ow / src.width, oh / src.height), w = src.width * s, h = src.height * s;
      g.imageSmoothingEnabled = s < 1;
      try { g.drawImage(src, (ow - w) / 2, (oh - h) / 2, w, h); } catch (e) { /* ignore */ }
    })();
    return out.captureStream(30);
  }
  function startRec() {
    var vstream = null;
    S.phase = 'rec';
    try {
      vstream = S.disp ? S.disp : canvasSource();
      if (!vstream) throw new Error('no video');
      var tracks = vstream.getVideoTracks().slice(), at = startMix();
      if (at) tracks = tracks.concat(at);
      S.mime = pickMime(); S.chunks = [];
      var o = { videoBitsPerSecond: 200000, audioBitsPerSecond: 48000 }; if (S.mime) o.mimeType = S.mime;
      S.rec = new MediaRecorder(new MediaStream(tracks), o);
      S.rec.ondataavailable = function (e) { if (e.data && e.data.size) S.chunks.push(e.data); };
      S.rec.start(1000);
    } catch (e) { cleanup(); S.phase = 'idle'; tip('Could not start recording on this device.', 4000); return; }
    S.t0 = performance.now(); S.acc = 0; S.pausedAt = 0; S.idleSince = 0; S.score = 0; S.lastLabel = '';
    tip('');
  }
  function elapsed() { return S.acc + (S.pausedAt ? 0 : performance.now() - S.t0); }
  function cleanup() {
    cancelAnimationFrame(S.raf);
    if (S.disp) { S.disp.getTracks().forEach(function (t) { t.stop(); }); S.disp = null; }
    S.out = null; stopMix();
  }
  function finish(reason) {
    if (S.phase !== 'rec') return;
    var secs = Math.round(elapsed() / 1000), rec = S.rec, chunks = S.chunks, score = S.score, game = CFG.game;
    S.phase = 'saving';
    var mimeFull = S.mime || (rec && rec.mimeType) || 'video/webm', type = mimeFull.split(';')[0];
    var done = function () {
      cleanup(); S.rec = null;
      var blob = new Blob(chunks, { type: type });
      if (secs < MIN_SECS || !blob.size) { S.phase = 'idle'; tip('That round was too short to save.', 3500); return; }
      handleResult({ blob: blob, url: URL.createObjectURL(blob), secs: Math.min(secs, MAX_SECS + 5), game: game, score: score, type: type, ext: type === 'video/mp4' ? 'mp4' : 'webm', limit: reason === 'limit' });
    };
    try {
      if (rec.state === 'inactive') done(); else { rec.onstop = done; if (rec.state === 'paused') rec.resume(); rec.stop(); }
    } catch (e) { done(); }
  }

  function tick() {
    var st = status(); if (!st) return;
    var active = st.playing || st.paused, now = performance.now();
    if (S.phase === 'idle') {
      titleTag(''); if (!active) { setBtn('', 'RECORD'); btnEl.style.display = 'flex'; place(); } else btnEl.style.display = 'none';
    } else if (S.phase === 'armed') {
      btnEl.style.display = 'flex'; setBtn('armed', 'ARMED: start playing'); place();
      if (st.playing && !st.paused) startRec();
    } else if (S.phase === 'rec') {
      btnEl.style.display = 'flex';
      if (st.paused) {
        if (!S.pausedAt) { S.pausedAt = now; S.acc += now - S.t0; try { if (S.rec.state === 'recording') S.rec.pause(); } catch (e) { /* ignore */ } }
        S.idleSince = 0; setBtn('rec', 'Paused ' + fmtTime(elapsed() / 1000)); place(); return;
      }
      if (S.pausedAt) { S.pausedAt = 0; S.t0 = now; try { if (S.rec.state === 'paused') S.rec.resume(); } catch (e) { /* ignore */ } }
      if (st.playing) S.idleSince = 0;
      else if (!S.idleSince) S.idleSince = now;
      else if (now - S.idleSince >= CFG.grace) { finish('over'); return; }
      if (elapsed() >= MAX_SECS * 1000) { finish('limit'); return; }
      setBtn('rec', fmtTime(elapsed() / 1000)); place(); titleTag('\u25CF REC ' + fmtTime(elapsed() / 1000));
    } else if (S.phase === 'saving') {
      btnEl.style.display = 'none';
    }
  }

  // remembers the score the game reports while recording, so the clip can show it
  function wrapLB() {
    var l = LB(); if (!l || l.__recW) return; l.__recW = 1;
    ['submit', 'save'].forEach(function (k) {
      var f = l[k]; if (typeof f !== 'function') return;
      l[k] = function (game, score) { try { if ((S.phase === 'rec' || S.phase === 'saving') && +score > 0) S.score = Math.max(S.score || 0, Math.min(10000000, Math.floor(+score))); } catch (e) { /* ignore */ } return f.apply(this, arguments); };
    });
  }

  /* ---- after the round: show the result, upload, offer download / share ---- */
  function closeCard() { if (card) { card.remove(); card = null; } }
  function newCard() {
    css(); closeCard(); card = el('div', 'gr-card'); card.setAttribute('role', 'status');
    var x = el('button', 'gr-x', '\u00D7'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.addEventListener('click', closeCard); card.appendChild(x);
    document.body.appendChild(card); return card;
  }
  function resultCard(res, headline, sub, saved) {
    var c = newCard();
    c.append(el('p', null, headline), el('p', 'gr-sub', sub));
    var row = el('div', 'gr-row');
    row.appendChild(btn('\u25B6 Watch', function () { watchLocal(res); }, 'pri'));
    row.appendChild(btn('\u2B07 Download', function () { download(res.url, res.game, res.ext); }));
    if (saved) {
      row.appendChild(btn('\uD83C\uDFAC My recordings', function () { openLibrary(); }));
    }
    c.appendChild(row);
  }
  function handleResult(res) {
    S.phase = 'idle';
    var lead = (res.limit ? 'Reached the ' + (MAX_SECS / 60) + ' minute limit. ' : '');
    var c = newCard(); c.append(el('p', null, '\uD83C\uDFAC Saving your recording\u2026'));
    var bar = el('div', 'gr-bar'), fill = el('b'); bar.appendChild(fill); c.appendChild(bar);
    var sub = el('p', 'gr-sub', gname(res.game) + ' \u2022 ' + fmtTime(res.secs) + ' \u2022 ' + fmtSize(res.blob.size)); c.appendChild(sub);
    token().then(function (t) {
      if (!t) { resultCard(res, '\uD83C\uDFAC Recording ready', lead + 'Your Orbit login has expired, so it was not saved. Open Orbit and log in again to keep clips. You can still download it now.', false); return; }
      var uid = uidOf(t);
      return Promise.all([listMine(t), keepLimit()]).then(function (a) {
        if (a[0].length >= a[1]) { resultCard(res, '\uD83C\uDFAC Recording ready, but your storage is full', 'You already have ' + a[0].length + ' saved. Delete one in My recordings to save more. Download this one now so you do not lose it.', false); card.querySelector('.gr-row').appendChild(btn('\uD83C\uDFAC My recordings', function () { openLibrary(); })); return; }
        var path = uid + '/' + rnd() + '.' + res.ext;
        return uploadFile(t, path, res.blob, res.type, function (f) { fill.style.width = Math.round(f * 100) + '%'; }).then(function () {
          var l = LB(), name = (l && l.getName && l.getName()) || 'Player';
          var body = { name: name.slice(0, 12), game: res.game, path: path, secs: Math.max(1, res.secs), bytes: res.blob.size };
          if (res.score > 0) body.score = res.score;
          return api('/rest/v1/recordings', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body) }, t).then(function (r) {
            if (r.ok) { resultCard(res, '\uD83C\uDFAC Saved to your recordings!', lead + gname(res.game) + ' \u2022 ' + fmtTime(res.secs) + (res.score ? ' \u2022 score ' + res.score.toLocaleString() : ''), true); return; }
            return errText(r, 'Could not save.').then(function (m) {
              api('/storage/v1/object/recordings/' + path, { method: 'DELETE' }, t).catch(function () { /* ignore */ });
              throw new Error(m);
            });
          });
        });
      });
    }).catch(function (e) {
      resultCard(res, '\uD83C\uDFAC Recording ready, but it was not saved', (e && e.message ? e.message + ' ' : '') + 'You can still download it.', false);
    });
  }

  /* =====================================================================
     6. Start up
     ===================================================================== */
  window.GameRec = {
    openLibrary: openLibrary, pick: pick, shareToChat: shareToChat, url: pubUrl, fixDuration: fixDuration, download: download,
    hook: function (fn) { S.hookFn = typeof fn === 'function' ? fn : (fn && fn.playing ? function () { return { playing: !!fn.playing(), paused: !!(fn.paused && fn.paused()) }; } : null); },
    gameName: gname, fmtTime: fmtTime
  };
  if (CFG.game) {
    var go = function () { build(); };
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
    window.addEventListener('pagehide', function () { try { cleanup(); } catch (e) { /* ignore */ } });
  }
})();
