/* Shared leaderboard + profile pictures (Supabase). Used by index.html and every game page.
   The key below is the public "anon" key: it is meant to be in the page.
   What visitors can do is limited by the database rules (read + add only). */
(function () {
  'use strict';
  var BASE = 'https://ysopxengerkvbwhrdnwq.supabase.co/rest/v1/scores';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlzb3B4ZW5nZXJrdmJ3aHJkbndxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3NTM5MDIsImV4cCI6MjEwNzMyOTkwMn0.7jOqjsJ2yAsRVThEuIyK6KI6D3cgs5SrxHg79nXlDBM';
  var GAMES = ['blockblast', 'tetris', 'game2048', 'snake', 'pacman', 'breakout', 'minesweeper', 'flappy', 'dino', 'blockout', 'slope', 'geodash', 'girder', 'sudoku', 'slither', 'wordle', 'fruitninja'];
  var MAX_SCORE = 10000000;
  // Capture bests before a game updates its own storage at the end of a round.
  var guideBests = {};
  // A cartridge can be nested inside the Orbit Games launcher. Only relay events
  // from an actual same-origin child frame; the Orbit shell validates its frame too.
  window.addEventListener('message', function (event) {
    if (event.origin !== location.origin || event.data?.orbitGuide !== 'personal-best' || parent === window) return;
    if (!Array.from(document.querySelectorAll('iframe')).some(function (f) { return f.contentWindow === event.source; })) return;
    parent.postMessage(event.data, location.origin);
  });

  var NAME_KEY = 'player-name';
  var AVATAR_KEY = 'player-avatar';
  var DEFAULT_AVATAR = 'gamer';
  var MAX_AVATAR_LEN = 12000;

  /* One-time: every score on the boards was cut in half, so cut the copies saved in this browser in half too
     (personal bests, and the record of what was already sent). Without this an old, higher record would stop new scores from being sent. */
  (function () {
    try {
      if (localStorage.getItem('lb-halved-v1')) return;
      var half = function (n) { return Math.max(1, Math.floor(n / 2)); };
      GAMES.forEach(function (g) {
        var b = parseInt(localStorage.getItem(g + '-best'), 10) || 0;
        if (b > 0) localStorage.setItem(g + '-best', String(half(b)));
      });
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('lb-sent-') === 0) {
          var p = String(localStorage.getItem(k) || '').split('|'), sc = parseInt(p[0], 10) || 0;
          if (sc > 0) { p[0] = String(half(sc)); localStorage.setItem(k, p.join('|')); }
        }
      }
      localStorage.setItem('lb-halved-v1', '1');
    } catch (e) { /* storage unavailable */ }
  })();

  GAMES.forEach(function (g) { try { guideBests[g] = Number(localStorage.getItem(g + '-best')) || 0; } catch (e) { guideBests[g] = 0; } });

  /* ---------- names ---------- */
  // names are checked in a simplified form (lowercase, look-alike characters swapped, spaces and symbols removed)
  var BAD_PARTS = ['fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fagg', 'whore', 'slut', 'porn', 'rapist', 'nazi', 'hitler', 'penis', 'vagina', 'dildo', 'dickhead', 'pussy'];
  var BAD_WHOLE = ['ass', 'sex', 'fag', 'cum', 'tit', 'tits', 'anus', 'rape', 'cock'];
  function simplify(s) {
    return String(s).toLowerCase()
      .replace(/[0]/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/4|@/g, 'a')
      .replace(/5|\$/g, 's').replace(/7/g, 't').replace(/[^a-z]/g, '');
  }
  function isCleanName(name) {
    var s = simplify(name);
    if (!s) return String(name).trim().length > 0;
    if (BAD_WHOLE.indexOf(s) !== -1) return false;
    for (var i = 0; i < BAD_PARTS.length; i++) if (s.indexOf(BAD_PARTS[i]) !== -1) return false;
    return true;
  }
  function getName() {
    try { return (localStorage.getItem(NAME_KEY) || '').trim().slice(0, 12); } catch (e) { return ''; }
  }

  /* ---------- avatars: 16 pixel-art pictures (10x10 grids) ---------- */
  var SPRITES = {
    gamer: { name: 'Gamer', bg: '#312e81', c: { g: '#6366f1', w: '#ffffff', y: '#facc15', b: '#38bdf8', r: '#ef4444', n: '#4ade80' }, g: [
      '..........', '.gggggggg.', 'gggggggggg', 'gggwgggygg', 'ggwwwgbgrg', 'gggwgggngg', 'gggggggggg', 'ggg....ggg', '.gg....gg.', '..........'] },
    cat: { name: 'Cat', bg: '#fef3c7', c: { a: '#f59e0b', e: '#1b1b2f', d: '#ff8fab', w: '#ffffff' }, g: [
      'aa......aa', 'aaa....aaa', 'aaaaaaaaaa', 'aaaaaaaaaa', 'aaeaaaaeaa', 'aaeaaaaeaa', 'aaaaddaaaa', 'aaawwwwaaa', '.aaaaaaaa.', '..aaaaaa..'] },
    dog: { name: 'Dog', bg: '#dbeafe', c: { a: '#d9a066', b: '#7a4a21', e: '#1b1b2f', w: '#f3e0c7' }, g: [
      '..aaaaaa..', '.aaaaaaaa.', 'baaaaaaaab', 'baaeaaeaab', 'baaeaaeaab', 'baaaaaaaab', '.aawwwwaa.', '.aaweewaa.', '..awwwwa..', '...aaaa...'] },
    fox: { name: 'Fox', bg: '#cffafe', c: { a: '#f97316', w: '#ffffff', e: '#1b1b2f', n: '#1b1b2f' }, g: [
      'a........a', 'aa......aa', 'aaaaaaaaaa', 'aaaaaaaaaa', 'aaeaaaaeaa', 'awaaaaaawa', 'wwwaaaawww', '.wwwwwwww.', '..wwwwww..', '....nn....'] },
    panda: { name: 'Panda', bg: '#bbf7d0', c: { w: '#ffffff', k: '#1b1b2f' }, g: [
      'kk......kk', 'kkk....kkk', 'wwwwwwwwww', 'wwwwwwwwww', 'wkkwwwwkkw', 'wkkwwwwkkw', 'wwwwkkwwww', 'wwwwkkwwww', '.wwwwwwww.', '..wwwwww..'] },
    frog: { name: 'Frog', bg: '#fef9c3', c: { g: '#4ade80', w: '#ffffff', k: '#1b1b2f' }, g: [
      '.gg....gg.', 'gwwg..gwwg', 'gwkg..gkwg', 'gggggggggg', 'gggggggggg', 'gggggggggg', 'gggggggggg', 'gkgggggkgg', '.gkkkkkkg.', '..gggggg..'] },
    robot: { name: 'Robot', bg: '#1e293b', c: { c: '#94a3b8', b: '#0f172a', y: '#22d3ee', r: '#ef4444', k: '#fbbf24' }, g: [
      '....rr....', '....cc....', '.cccccccc.', 'cccccccccc', 'cbbbbbbbbc', 'cbyybbyybc', 'cbbbbbbbbc', 'cbkkkkkkbc', 'cccccccccc', '.cc....cc.'] },
    ghost: { name: 'Ghost', bg: '#1e1b4b', c: { p: '#c084fc', k: '#1b1b2f', w: '#ffffff' }, g: [
      '..pppppp..', '.pppppppp.', 'pppppppppp', 'pwkpppwkpp', 'pwkpppwkpp', 'pppppppppp', 'pppppppppp', 'pppppppppp', 'pppppppppp', 'p.pp.pp.pp'] },
    alien: { name: 'Alien', bg: '#0f172a', c: { g: '#4ade80' }, g: [
      '..........', '..g....g..', '...g..g...', '..gggggg..', '.gg.gg.gg.', 'gggggggggg', 'g.gggggg.g', 'g.g....g.g', '...gg.gg..', '..........'] },
    shroom: { name: 'Shroom', bg: '#bae6fd', c: { r: '#ef4444', w: '#ffffff', s: '#fde68a', k: '#1b1b2f' }, g: [
      '...rrrr...', '..rwwrrr..', '.rrwwrrrr.', 'rrrrrrwwrr', 'rrrrrrwwrr', '.ssssssss.', '..skssks..', '..ssssss..', '..ssssss..', '...ssss...'] },
    heart: { name: 'Heart', bg: '#fbcfe8', c: { r: '#ef4444', w: '#fecaca' }, g: [
      '..........', '.rrr..rrr.', 'rwrrrrrrrr', 'rwrrrrrrrr', 'rrrrrrrrrr', 'rrrrrrrrrr', '.rrrrrrrr.', '..rrrrrr..', '...rrrr...', '....rr....'] },
    star: { name: 'Star', bg: '#312e81', c: { y: '#facc15', k: '#1b1b2f' }, g: [
      '....yy....', '....yy....', '...yyyy...', 'yyyyyyyyyy', '.yykyykyy.', '..yyyyyy..', '..yyyyyy..', '.yyy..yyy.', '.yy....yy.', 'yy......yy'] },
    penguin: { name: 'Penguin', bg: '#bfdbfe', c: { k: '#1e293b', w: '#ffffff', o: '#fb923c' }, g: [
      '...kkkk...', '..kkkkkk..', '.kkwkkwkk.', '.kkkookkk.', 'kkwwwwwwkk', 'kwwwwwwwwk', 'kwwwwwwwwk', 'kkwwwwwwkk', '.kkwwwwkk.', '..oo..oo..'] },
    bunny: { name: 'Bunny', bg: '#c7d2fe', c: { w: '#f1f5f9', p: '#f9a8d4', k: '#1b1b2f' }, g: [
      '.ww....ww.', '.wp....pw.', '.wp....pw.', '.wwwwwwww.', 'wwwwwwwwww', 'wwkwwwwkww', 'wwwwppwwww', 'wwwwwwwwww', '.wwwwwwww.', '..wwwwww..'] },
    bear: { name: 'Bear', bg: '#d9f99d', c: { b: '#a16207', t: '#e9c18a', k: '#1b1b2f' }, g: [
      'bb......bb', 'bbb....bbb', '.bbbbbbbb.', 'bbbbbbbbbb', 'bbkbbbbkbb', 'bbbbbbbbbb', 'bbbttttbbb', 'bbbtkktbbb', '.bbbbbbbb.', '..bbbbbb..'] },
    skull: { name: 'Skull', bg: '#3f3f46', c: { w: '#f4f4f5', k: '#1b1b2f' }, g: [
      '..wwwwww..', '.wwwwwwww.', 'wwwwwwwwww', 'wkkwwwwkkw', 'wkkwwwwkkw', 'wwwwkkwwww', '.wwwwwwww.', '..wkwkwk..', '..wwwwww..', '..........'] }
  };
  var AVATAR_IDS = ['gamer', 'cat', 'dog', 'fox', 'panda', 'frog', 'robot', 'ghost', 'alien', 'shroom', 'heart', 'star', 'penguin', 'bunny', 'bear', 'skull'];
  var DATA_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/;

  // make sure every grid is a clean 10 x 10
  AVATAR_IDS.forEach(function (id) {
    SPRITES[id].g = SPRITES[id].g.map(function (row) { return (row + '..........').slice(0, 10); });
  });

  function spriteSVG(id) {
    var s = SPRITES[id];
    var out = '<svg viewBox="0 0 10 10" shape-rendering="crispEdges" aria-hidden="true"><rect width="10" height="10" fill="' + s.bg + '"/>';
    s.g.forEach(function (row, y) {
      var x = 0;
      while (x < 10) {
        var ch = row.charAt(x);
        if (ch === '.') { x++; continue; }
        var x2 = x;
        while (x2 < 10 && row.charAt(x2) === ch) x2++;
        out += '<rect x="' + x + '" y="' + y + '" width="' + (x2 - x) + '" height="1" fill="' + (s.c[ch] || '#fff') + '"/>';
        x = x2;
      }
    });
    return out + '</svg>';
  }
  function isValidAvatar(v) {
    if (typeof v !== 'string') return false;
    if (SPRITES.hasOwnProperty(v)) return true;
    return v.length <= MAX_AVATAR_LEN && DATA_RE.test(v);
  }
  function normalizeAvatar(v) { return isValidAvatar(v) ? v : DEFAULT_AVATAR; }
  function getAvatar() {
    try { return normalizeAvatar(localStorage.getItem(AVATAR_KEY)); } catch (e) { return DEFAULT_AVATAR; }
  }
  function setAvatar(v) {
    try { localStorage.setItem(AVATAR_KEY, normalizeAvatar(v)); } catch (e) { /* storage unavailable */ }
    setTimeout(function () { if (window.Leaderboard) Leaderboard.syncAvatar(); }, 0);
  }
  // a round picture: a built-in pixel avatar, or the visitor's own photo
  function avatarEl(value, size) {
    var el = document.createElement('span');
    el.className = 'av';
    if (size) { el.style.width = size + 'px'; el.style.height = size + 'px'; }
    var v = normalizeAvatar(value);
    if (v.indexOf('data:') === 0) {
      var img = document.createElement('img');
      img.alt = '';
      img.src = v;
      el.appendChild(img);
    } else {
      el.innerHTML = spriteSVG(v);
    }
    return el;
  }
  function avatarName(v) { return SPRITES.hasOwnProperty(v) ? SPRITES[v].name : 'Your photo'; }

  // photos are cropped to a square and shrunk to 64 x 64, so they stay tiny
  function imageToAvatar(src, w, h) {
    var s = Math.min(w, h), c = document.createElement('canvas');
    c.width = c.height = 64;
    c.getContext('2d').drawImage(src, (w - s) / 2, (h - s) / 2, s, s, 0, 0, 64, 64);
    return c.toDataURL('image/jpeg', 0.8);
  }
  function fileToAvatar(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) { reject(new Error('not an image')); return; }
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        try { resolve(imageToAvatar(img, img.naturalWidth, img.naturalHeight)); } catch (e) { reject(e); }
        URL.revokeObjectURL(url);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.src = url;
    });
  }

  /* ---------- scores ---------- */
  function formatScore(game,score){if(game!=='wordle')return String(score);var rows=7-Math.floor(score/1000000),seconds=999999-score%1000000;return rows+'/6 · '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');}
  function headers(extra) {
    var h = { apikey: KEY, Authorization: 'Bearer ' + KEY };
    for (var k in extra) h[k] = extra[k];
    return h;
  }
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h); }

  // send a finished game's score (with the player's picture). It is sent when it beats this device's last
  // score for the game, or when the picture changed, so the leaderboard shows the newest picture.
  var lastError = '';
  /* Orbit tournaments: tell the Orbit server about a finished round. If the player has entered a live leaderboard tournament for this game,
     the server records their NEXT score as their tournament score (even if it is lower than their personal best); later scores only replace it when higher.
     This runs for every round, before the "only send a new personal best" check below. It never throws into a game. */
  var tSent = {};
  function tournamentRound(game, score) {
    try {
      if (!(score > (tSent[game] || 0))) return;
      var B = window.OrbitBank;
      if (!B || !B.signedIn() || !B.rpc) return;
      tSent[game] = score;
      B.rpc('tournament_record_score', { p_game: game, p_score: score }).catch(function () { tSent[game] = 0; });
    } catch (e) { /* tournaments are a bonus, never break a game */ }
  }
  function sendScore(game, score) {
    score = Math.floor(Number(score));
    var name = getName();
    if (GAMES.indexOf(game) === -1 || !name || !isCleanName(name)) return Promise.resolve(false);
    if (!(score > 0) || score > MAX_SCORE) return Promise.resolve(false);
    tournamentRound(game, score);   // Orbit tournaments: the first score after entering counts, then only higher ones (the server decides)
    markPlayed();   // a real score means a game was played today
    var avatar = getAvatar(), av = hash(avatar);
    var memo = 'lb-sent-' + game + '-' + name.toLowerCase();
    var old = '';
    try { old = localStorage.getItem(memo) || ''; } catch (e) { old = ''; }
    var parts = old.split('|'), prevScore = parseInt(parts[0], 10) || 0, prevAv = parts[1] || '';
    if (score <= prevScore && av === prevAv) return Promise.resolve(false);
    try { localStorage.setItem(memo, Math.max(score, prevScore) + '|' + av); } catch (e) { /* storage unavailable */ }
    var revert = function () { try { localStorage.setItem(memo, old); } catch (e) { /* ignore */ } };
    return fetch(BASE, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({ game: game, name: name, score: score, avatar: avatar }),
      keepalive: true
    }).then(function (r) {
      if (r.ok) { lastError = ''; return true; }
      revert();
      return r.text().then(function (t) { lastError = 'HTTP ' + r.status + ' ' + String(t || '').replace(/\s+/g, ' ').slice(0, 160); return false; },
                           function () { lastError = 'HTTP ' + r.status; return false; });
    }).catch(function () { revert(); lastError = 'no connection'; return false; });
  }

  // best score per name, highest first; each name shows its newest picture.
  // Every player is returned (the database hands out at most 1000 rows per request, so we read it in pages).
  // always returns every player (n is kept only so older callers do not break).
  var PAGE = 1000, MAX_PAGES = 30;
  var cache = {};
  function fetchAllScores(game) {
    var base = BASE + '?game=eq.' + encodeURIComponent(game) + '&select=name,score,avatar,created_at&order=score.desc,id.asc&limit=' + PAGE;
    var all = [];
    function page(i) {
      return fetch(base + '&offset=' + (i * PAGE), { headers: headers({}) }).then(function (r) {
        if (!r.ok) throw new Error('bad status');
        return r.json();
      }).then(function (rows) {
        all = all.concat(rows);
        return (rows.length === PAGE && i + 1 < MAX_PAGES) ? page(i + 1) : all;
      });
    }
    return page(0);
  }
  function top(game, n, fresh) {
    n = n || 10;
    var c = cache[game];
    if (c && !fresh && Date.now() - c.t < 30000) return Promise.resolve(c.rows);
    return fetchAllScores(game).then(function (rows) {
      var by = {}, out = [];
      rows.forEach(function (row) {
        var k = String(row.name).toLowerCase(), e = by[k];
        if (!e) {
          e = by[k] = { name: isCleanName(row.name) ? row.name : 'Player', score: row.score, avatar: row.avatar, t: row.created_at || '' };
          out.push(e);
        } else if ((row.created_at || '') > e.t) {
          e.avatar = row.avatar; e.t = row.created_at || '';
        }
      });
      var me = getName().toLowerCase(), mine = getAvatar();
      var list = out.map(function (e) {
        // the player's own row always uses the picture they have chosen now
        return { name: e.name, score: e.score, avatar: (me && e.name.toLowerCase() === me) ? mine : normalizeAvatar(e.avatar) };
      });
      cache[game] = { t: Date.now(), rows: list };
      return list;   // everyone, best first (the n argument is ignored so older pages that ask for 10 still get all players)
    });
  }

  /* ---------- the rank banner shown after a game ends ---------- */
  var toastEl = null, toastTimer = 0;
  function injectToastCss() {
    if (document.getElementById('lb-toast-css')) return;
    var st = document.createElement('style');
    st.id = 'lb-toast-css';
    st.textContent =
      '.lb-toast{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 62px);transform:translateX(-50%);z-index:2147483000;' +
      'max-width:min(92vw,420px);display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;' +
      'background:rgba(20,20,42,.96);border:2px solid #ff6b8b;color:#fff;box-shadow:0 6px 22px rgba(0,0,0,.55);' +
      'font:600 15px "Pixelify Sans","Courier New",monospace;line-height:1.25;cursor:pointer;-webkit-user-select:none;user-select:none}' +
      '.lb-toast .av{display:inline-block;flex:none;width:34px;height:34px;border-radius:50%;overflow:hidden;background:#2b2b3c}' +
      '.lb-toast .av svg,.lb-toast .av img{display:block;width:100%;height:100%;object-fit:cover}' +
      '.lb-toast .rk{font-size:1.5em;font-weight:700;color:#ffd166;white-space:nowrap}' +
      '.lb-toast small{display:block;font-weight:500;font-size:.8em;color:#c9c8e0}' +
      '.lb-toast a{color:#ffd166}';
    document.head.appendChild(st);
  }
  function hideToast() {
    clearTimeout(toastTimer);
    if (toastEl && toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
    toastEl = null;
  }
  function toast(build) {
    if (!document.body) return;
    injectToastCss();
    hideToast();
    toastEl = document.createElement('div');
    toastEl.className = 'lb-toast';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    toastEl.title = 'Tap to close';
    build(toastEl);
    toastEl.addEventListener('click', function (e) { if (e.target.tagName !== 'A') hideToast(); });
    document.body.appendChild(toastEl);
    toastTimer = setTimeout(hideToast, 9000);
  }
  function text(parent, tag, cls, str) {
    var el = document.createElement(tag); if (cls) el.className = cls; el.textContent = str; parent.appendChild(el); return el;
  }
  function showRank(game, score, sending) {
    var name = getName();
    score = Math.floor(Number(score)) || 0;
    if (!name) {
      toast(function (t) {
        var box = document.createElement('div');
        text(box, 'span', '', 'Want a leaderboard rank?');
        var s = text(box, 'small', '', ''); s.appendChild(document.createTextNode('Pick a name on the '));
        var a = document.createElement('a'); a.href = 'index.html'; a.textContent = 'home page'; s.appendChild(a);
        s.appendChild(document.createTextNode(' first.'));
        t.appendChild(box);
      });
      return;
    }
    if (!isCleanName(name)) return;
    sending.then(function () { return top(game, Infinity, true); }).then(function (rows) {
      var me = name.toLowerCase(), idx = -1, i;
      for (i = 0; i < rows.length; i++) if (rows[i].name.toLowerCase() === me) { idx = i; break; }
      if (idx === -1) {
        if (score > 0) toast(function (t) {
          var box = document.createElement('div');
          text(box, 'span', '', 'Could not save your score right now.');
          if (lastError) text(box, 'small', '', 'Server said: ' + lastError);
          t.appendChild(box);
        });
        return;
      }
      var row = rows[idx], total = rows.length;
      toast(function (t) {
        t.appendChild(avatarEl(getAvatar(), 34));
        text(t, 'span', 'rk', '#' + (idx + 1));
        var box = document.createElement('div');
        text(box, 'span', '', 'Rank ' + (idx + 1) + ' of ' + total);
        text(box, 'small', '', 'Your best here: ' + formatScore(game,row.score) + (score > 0 && score >= row.score ? ' (new best!)' : ''));
        t.appendChild(box);
      });
    }).catch(function () {
      toast(function (t) { text(t, 'span', '', 'Could not load your rank right now.'); });
    });
  }
  // what the games call when a round ends: send the score, then show where the player stands
  function submit(game, score) {
    var p = sendScore(game, score);
    var numeric = Math.floor(Number(score)), previous = guideBests[game];
    if (GAMES.indexOf(game) !== -1 && numeric > 0 && numeric <= MAX_SCORE && numeric > previous) {
      guideBests[game] = numeric;
      p.then(function (saved) {
        if (!saved) { if (guideBests[game] === numeric) guideBests[game] = previous; return; }
        if (parent === window) return;
        var uid = ''; try { uid = localStorage.getItem('orbit-uid') || ''; } catch (e) { /* guest */ }
        parent.postMessage({ orbitGuide: 'personal-best', uid: uid, game: GAME_NAMES[game] || game, score: numeric }, location.origin);
      }).catch(function () { /* A celebration must never interfere with gameplay. */ });
    }
    try { showRank(game, score, p); } catch (e) { /* the banner is a bonus, never break a game */ }
    try { coinRound(game, score); } catch (e) { /* Orbits are a bonus, never break a game */ }
    return p;
  }

  // the MVP: the player with the most Orbits right now. The balance is everything earned minus everything spent,
  // so spending Orbits lowers a player's place. The Orbit server works it out (orbit_mvp(), see orbit-mvp-setup.sql).
  var mvpCache = null, orbitCfg = null;
  function orbitConfig() { return orbitCfg || (orbitCfg = import('../chatter/config.js')); }
  function mvp(fresh) {
    if (mvpCache && !fresh && Date.now() - mvpCache.t < 60000) return Promise.resolve(mvpCache.v);
    return orbitConfig().then(function (c) {
      return fetch(c.SUPABASE_URL + '/rest/v1/rpc/orbit_mvp', {
        method: 'POST',
        headers: { apikey: c.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + c.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_limit: 10 })
      });
    }).then(function (r) {
      if (!r.ok) throw new Error('bad status');
      return r.json();
    }).then(function (rows) {
      var v = null;
      for (var i = 0; i < rows.length; i++) {
        if (isCleanName(rows[i].display_name)) { v = { name: rows[i].display_name, total: rows[i].total }; break; }
      }
      mvpCache = { t: Date.now(), v: v };
      return v;
    });
  }

  // save a score quietly (no rank banner), used when a round is left unfinished
  function save(game, score) { return sendScore(game, score); }

  // Games call this once: track(game, getScore) returns a bank() function that saves the round's current score
  // (getScore should return 0 when no round is in progress). It also runs by itself when the page is hidden or
  // closed, or when a link back to the home page is clicked, so quitting before dying still counts. Only a score
  // that beats the player's last saved one is sent, so calling it often is harmless.
  function track(game, getScore) {
    function bank() { try { var s = Number(getScore()); if (s > 0) sendScore(game, s); } catch (e) { /* never break a game */ } }
    window.addEventListener('pagehide', bank);
    document.addEventListener('visibilitychange', function () { if (document.hidden) bank(); });
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (a && /(^|\/)index\.html(\?|#|$)/.test(a.getAttribute('href') || '')) bank();
    }, true);
    return bank;
  }

  /* keep every game's leaderboard row in step with the profile picture the player has chosen now: for each game they
     have a best score in, send that best again with the current picture (only when the picture changed, or the score
     was never sent, for example because the name was picked later) */
  var syncingAv = false;
  function syncAvatar() {
    var name = getName();
    if (syncingAv || !name || !isCleanName(name)) return Promise.resolve(0);
    syncingAv = true;
    var avatar = getAvatar(), av = hash(avatar), jobs = [];
    GAMES.forEach(function (game) {
      var old = '';
      var memo = 'lb-sent-' + game + '-' + name.toLowerCase();
      try { old = localStorage.getItem(memo) || ''; } catch (e) { old = ''; }
      // Only refresh the picture on a score THIS name already earned and sent. The best score saved in the
      // browser belongs to whoever played it, so it is never uploaded under a different (new) name.
      if (!old) return;
      var parts = old.split('|'), prevScore = parseInt(parts[0], 10) || 0, prevAv = parts[1] || '';
      var score = prevScore;
      if (!(score > 0) || score > MAX_SCORE) return;
      if (prevAv === av) return;                                      // already up to date
      try { localStorage.setItem(memo, score + '|' + av); } catch (e) { /* storage unavailable */ }
      jobs.push(fetch(BASE, {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify({ game: game, name: name, score: score, avatar: avatar }),
        keepalive: true
      }).then(function (r) { if (!r.ok) { try { localStorage.setItem(memo, old); } catch (e) { /* ignore */ } } return r.ok; })
        .catch(function () { try { localStorage.setItem(memo, old); } catch (e) { /* ignore */ } return false; }));
    });
    return Promise.all(jobs).then(function () { syncingAv = false; cache = {}; return jobs.length; },
                                  function () { syncingAv = false; return 0; });
  }
  setTimeout(syncAvatar, 1500);

  /* ---------- accounts + saved progress (Supabase Auth: Google) ----------
     A signed-in player's profile, best scores, settings and saved games are copied to their account and
     copied back on any other device. Only the keys matched by SYNC_RE are ever sent. */
  var HOST = 'https://ysopxengerkvbwhrdnwq.supabase.co';
  var AUTH = HOST + '/auth/v1';
  var REST = HOST + '/rest/v1';
  var ACCOUNT_KEY = 'player-account';
  var PENDING_KEY = 'player-pending';
  var SESSION_KEY = 'player-session';
  var TS_KEY = 'sync-ts';          // when each synced key last changed on this device
  var LINK_KEY = 'sync-account';   // which account this device last synced with
  var PROVIDERS = [{ id: 'google', name: 'Google' }];
  var SYNC_RE = /^(site-theme|sfx-muted|streak|coin-wallet|(blockblast|tetris|game2048|snake|pacman|breakout|minesweeper|flappy|dino|blockout|slope|geodash|girder|sudoku|slither|wordle|fruitninja)-(best|sfx|music|vibrate|autohold|diff|save))$/;
  var MAX_VALUE = 100000;          // longest value (in characters) that is synced

  var origSet = Storage.prototype.setItem, origRemove = Storage.prototype.removeItem;
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSetRaw(k, v) { try { origSet.call(localStorage, k, v); } catch (e) { /* storage unavailable */ } }
  function lsRemoveRaw(k) { try { origRemove.call(localStorage, k); } catch (e) { /* storage unavailable */ } }
  function readJSON(k, fallback) { try { var v = JSON.parse(lsGet(k) || 'null'); return v === null ? fallback : v; } catch (e) { return fallback; } }

  function getAccount() { var a = readJSON(ACCOUNT_KEY, null); return a && a.provider ? a : null; }
  function getSession() { var s = readJSON(SESSION_KEY, null); return s && s.refresh_token ? s : null; }
  function signOut() { lsRemoveRaw(ACCOUNT_KEY); lsRemoveRaw(SESSION_KEY); lsRemoveRaw(LINK_KEY); }

  /* --- a valid access token (refreshed when it is about to run out) --- */
  var tokenCache = null, refreshing = null;
  function jwtSub(token) {
    try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || ''; } catch (e) { return ''; }
  }
  function freshToken() {
    var s = getSession();
    if (!s) return Promise.resolve(null);
    if (s.expires_at && s.expires_at * 1000 > Date.now() + 60000) {
      tokenCache = { token: s.access_token, exp: s.expires_at * 1000 };
      return Promise.resolve(s.access_token);
    }
    if (refreshing) return refreshing;
    refreshing = fetch(AUTH + '/token?grant_type=refresh_token', {
      method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    }).then(function (r) { if (!r.ok) throw new Error('bad status'); return r.json(); })
      .then(function (j) {
        var n = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600) };
        lsSetRaw(SESSION_KEY, JSON.stringify(n));
        tokenCache = { token: n.access_token, exp: n.expires_at * 1000 };
        return n.access_token;
      }).catch(function () { return null; })
      .then(function (t) { refreshing = null; return t; });
    return refreshing;
  }

  /* --- what this device holds, as { key: { v: value-or-null, t: last-changed } } --- */
  function localKeys() {
    var ts = readJSON(TS_KEY, {}), out = {}, k, i;
    try {
      for (i = 0; i < localStorage.length; i++) {
        k = localStorage.key(i);
        if (SYNC_RE.test(k)) { var v = localStorage.getItem(k); if (v !== null && v.length <= MAX_VALUE) out[k] = { v: v, t: ts[k] || 0 }; }
      }
    } catch (e) { /* storage unavailable */ }
    for (k in ts) if (SYNC_RE.test(k) && !out[k]) out[k] = { v: null, t: ts[k] };
    return out;
  }
  function validEntry(k, e) {
    return SYNC_RE.test(k) && e && typeof e === 'object' && typeof e.t === 'number' &&
      (e.v === null || (typeof e.v === 'string' && e.v.length <= MAX_VALUE));
  }

  /* --- combine this device with the account: highest score wins, anything else the newest change wins.
         The first time a device meets an account, the account's profile and settings win. --- */
  function merge(remote, firstLink) {
    var local = localKeys(), ts = readJSON(TS_KEY, {}), keys = {}, changed = false, needPush = false, seen = {}, k;
    function applyRemote(key, e) {
      var cur = local[key] ? local[key].v : null;
      if (e.v === null) lsRemoveRaw(key); else lsSetRaw(key, e.v);
      ts[key] = e.t;
      if (cur !== e.v) changed = true;
    }
    for (k in local) seen[k] = 1;
    for (k in remote) if (validEntry(k, remote[k])) seen[k] = 1;
    Object.keys(seen).forEach(function (key) {
      var l = local[key], r = validEntry(key, remote[key]) ? remote[key] : null;
      if (key === 'streak') {
        var ls = parseStreak(l && l.v), rs = parseStreak(r && r.v), win = ls, wv, lv0 = l ? l.v : null, rv0 = r ? r.v : null;
        if (!ls && !rs) return;
        if (!ls || (rs && (rs.d > ls.d || (rs.d === ls.d && rs.c > ls.c)))) win = rs;
        wv = JSON.stringify({ c: win.c, b: Math.max(ls ? ls.b : 0, rs ? rs.b : 0), d: win.d });
        if (wv !== lv0) { lsSetRaw(key, wv); ts[key] = Date.now(); changed = true; }
        if (wv !== rv0) needPush = true;
        keys[key] = { v: wv, t: (wv !== lv0 || wv !== rv0) ? Date.now() : Math.max((l && l.t) || 0, (r && r.t) || 0) };
        return;
      }
      if (/-best$/.test(key)) {
        var lv = parseInt(l && l.v, 10) || 0, rv = parseInt(r && r.v, 10) || 0, m = Math.max(lv, rv);
        if (!m) return;
        if (m > lv) { lsSetRaw(key, String(m)); ts[key] = Date.now(); changed = true; }
        if (m > rv) needPush = true;
        keys[key] = { v: String(m), t: (m > lv || m > rv) ? Date.now() : Math.max((l && l.t) || 0, (r && r.t) || 0) };
        return;
      }
      if (!r) { if (l) { keys[key] = l; needPush = true; } return; }
      if (!l) { applyRemote(key, r); keys[key] = r; return; }
      var remoteWins = (firstLink && !/-save$/.test(key)) || r.t >= l.t;
      if (key === 'coin-wallet') { var ln = walletN(l.v), rn = walletN(r.v); remoteWins = rn > ln || (rn === ln && r.t >= l.t); }   // the wallet with more changes wins
      if (remoteWins) { if (l.v !== r.v) applyRemote(key, r); keys[key] = r; }
      else { keys[key] = l; needPush = true; }
    });
    lsSetRaw(TS_KEY, JSON.stringify(ts));
    return { keys: keys, changed: changed, needPush: needPush };
  }

  function authHeaders(token, extra) {
    var h = { apikey: KEY, Authorization: 'Bearer ' + token };
    for (var k in extra) h[k] = extra[k];
    return h;
  }
  function pull(token) {
    return fetch(REST + '/profiles?select=data&limit=1', { headers: authHeaders(token) })
      .then(function (r) { if (!r.ok) throw new Error('bad status'); return r.json(); })
      .then(function (rows) { var d = rows[0] && rows[0].data; return (d && d.keys && typeof d.keys === 'object') ? d.keys : {}; });
  }
  function pushDoc(token, keys, keepalive) {
    return fetch(REST + '/profiles?on_conflict=user_id', {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ user_id: jwtSub(token), data: { v: 1, keys: keys } }),
      keepalive: !!keepalive
    }).then(function (r) { return r.ok; });
  }

  var syncing = null, lastKeys = null;
  // copy this device and the account to each other. Resolves { signedIn, changed } (changed: this device got new data)
  function sync() {
    if (syncing) return syncing;
    syncing = freshToken().then(function (token) {
      if (!token) return { signedIn: false, changed: false };
      var uid = jwtSub(token), first = lsGet(LINK_KEY) !== uid;
      return pull(token).then(function (remote) {
        var res = merge(remote, first);
        lsSetRaw(LINK_KEY, uid);
        lastKeys = res.keys;
        if (!res.needPush && !first) return { signedIn: true, changed: res.changed };
        return pushDoc(token, res.keys).then(function () { return { signedIn: true, changed: res.changed }; });
      });
    }).catch(function () { return { signedIn: false, changed: false, error: true }; })
      .then(function (r) { syncing = null; return r; });
    return syncing;
  }

  /* --- push soon after something changes (a calm pace while a game saves every move) --- */
  var pushTimer = 0, pendingSince = 0;
  function schedulePush() {
    var now = Date.now();
    if (!pendingSince) pendingSince = now;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { pendingSince = 0; sync(); }, Math.min(3000, Math.max(0, pendingSince + 20000 - now)));
  }
  function noteWrite(k) {
    var ts = readJSON(TS_KEY, {});
    ts[k] = Date.now();
    lsSetRaw(TS_KEY, JSON.stringify(ts));
    if (getSession()) schedulePush();
  }
  try {
    Storage.prototype.setItem = function (k) { origSet.apply(this, arguments); if (this === window.localStorage && SYNC_RE.test(k)) noteWrite(k); };
    Storage.prototype.removeItem = function (k) { origRemove.apply(this, arguments); if (this === window.localStorage && SYNC_RE.test(k)) noteWrite(k); };
  } catch (e) { /* storage unavailable */ }

  // last chance when the page is closing: send what changed (if the sign-in is still valid)
  function flush() {
    if (!pendingSince || !tokenCache || tokenCache.exp < Date.now() + 5000 || !lastKeys) return;
    var doc = {}, k, local = localKeys();
    for (k in lastKeys) doc[k] = lastKeys[k];
    for (k in local) {
      var d = doc[k], l = local[k];
      if (/-best$/.test(k)) { if ((parseInt(l.v, 10) || 0) > (parseInt(d && d.v, 10) || 0)) doc[k] = l; }
      else if (!d || l.t > d.t) doc[k] = l;
    }
    pendingSince = 0;
    pushDoc(tokenCache.token, doc, true).catch(function () { /* the next visit sends it */ });
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);

  // on every page load, for signed-in players: pick up changes made on another device
  // (the page reloads once so it shows them; a sign-in return is handled by index.html)
  if (getSession() && (location.hash || '').indexOf('access_token=') === -1) {
    sync().then(function (r) {
      if (!r.changed) return;
      var last = 0;
      try { last = parseInt(sessionStorage.getItem('sync-reload'), 10) || 0; } catch (e) { last = 0; }
      if (Date.now() - last < 15000) return;
      try { sessionStorage.setItem('sync-reload', String(Date.now())); } catch (e) { /* ignore */ }
      location.reload();
    });
  }

  /* --- signing in --- */
  // is this sign-in method switched on in the Supabase project?
  function providerEnabled(id) {
    return fetch(AUTH + '/settings', { headers: { apikey: KEY } })
      .then(function (r) { if (!r.ok) throw new Error('bad status'); return r.json(); })
      .then(function (s) { return !!(s && s.external && s.external[id]); });
  }
  // send the visitor to the provider's sign-in page. "pending" (their half-made profile) is kept for when they come back.
  // Resolves 'off' (method not switched on), 'error' (could not check), or 'go' (the page is leaving).
  function signIn(id, pending) {
    return providerEnabled(id).then(function (ok) {
      if (!ok) return 'off';
      try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending || {})); } catch (e) { /* ignore */ }
      (window.top || window).location.href = AUTH + '/authorize?provider=' + encodeURIComponent(id) +
        '&redirect_to=' + encodeURIComponent(location.origin + location.pathname);
      return 'go';
    }).catch(function () { return 'error'; });
  }
  // call once when the page loads: finishes a sign-in that has just come back from the provider.
  // Returns null if this page load is not a sign-in return, else { ok, pending, done, synced }:
  // done resolves to the account (or null); synced resolves to the result of the first sync.
  function finishSignIn() {
    var h = location.hash || '';
    if (h.indexOf('access_token=') === -1 && h.indexOf('error=') === -1) return null;
    var params = new URLSearchParams(h.slice(1)), token = params.get('access_token'), pending = null;
    try { pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null'); sessionStorage.removeItem(PENDING_KEY); } catch (e) { pending = null; }
    if (!token && !pending) return null;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
    var done = Promise.resolve(null), synced = Promise.resolve({ signedIn: false, changed: false });
    if (token) {
      lsSetRaw(SESSION_KEY, JSON.stringify({
        access_token: token, refresh_token: params.get('refresh_token') || '',
        expires_at: parseInt(params.get('expires_at'), 10) || Math.floor(Date.now() / 1000) + (parseInt(params.get('expires_in'), 10) || 3600)
      }));
      done = fetch(AUTH + '/user', { headers: { apikey: KEY, Authorization: 'Bearer ' + token } })
        .then(function (r) { if (!r.ok) throw new Error('bad status'); return r.json(); })
        .then(function (u) {
          var m = u.user_metadata || {};
          var acc = {
            provider: (u.app_metadata && u.app_metadata.provider) || '',
            id: u.id, email: u.email || m.email || '',
            name: String(m.full_name || m.name || m.user_name || '').slice(0, 60)
          };
          if (!acc.provider) return null;
          lsSetRaw(ACCOUNT_KEY, JSON.stringify(acc));
          return acc;
        }).catch(function () { return null; });
      synced = done.then(function () { return sync(); });
    }
    return { ok: !!token, pending: pending, done: done, synced: synced };
  }

  /* ---------- daily play streak ----------
     One game played on a day keeps the streak going. Stored as {c: days in a row, b: best ever, d: last day played (local time)}. */
  var STREAK_KEY = 'streak';
  function dayKey(dt) {
    function z(n) { return (n < 10 ? '0' : '') + n; }
    return dt.getFullYear() + '-' + z(dt.getMonth() + 1) + '-' + z(dt.getDate());
  }
  function parseStreak(v) {
    try {
      var o = JSON.parse(v);
      if (o && typeof o.d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.d) && o.c > 0 && o.c < 100000) {
        return { c: Math.floor(o.c), b: Math.max(Math.floor(o.b) || 0, Math.floor(o.c)), d: o.d };
      }
    } catch (e) { /* not a streak */ }
    return null;
  }
  function getStreak() {
    var s = null, now = new Date(), today = dayKey(now), yest = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    try { s = parseStreak(localStorage.getItem(STREAK_KEY)); } catch (e) { s = null; }
    if (!s) return { count: 0, best: 0, extended: false, alive: false };
    if (s.d === today) return { count: s.c, best: s.b, extended: true, alive: true };
    if (s.d === yest) return { count: s.c, best: s.b, extended: false, alive: true };   // still saveable today
    return { count: 0, best: s.b, extended: false, alive: false };                    // missed a day: it starts over
  }
  function markPlayed() {
    var now = new Date(), today = dayKey(now), yest = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)), s = null;
    try { s = parseStreak(localStorage.getItem(STREAK_KEY)); } catch (e) { s = null; }
    if (s && s.d === today) return false;                    // already counted today
    var c = (s && s.d === yest) ? s.c + 1 : 1;
    try { localStorage.setItem(STREAK_KEY, JSON.stringify({ c: c, b: Math.max(s ? s.b : 0, c), d: today })); } catch (e) { return false; }
    try { window.dispatchEvent(new Event('streak-changed')); } catch (e) { /* ignore */ }
    return true;
  }
  // on a game page, playing counts once the person has touched the game and stayed 10 seconds
  (function () {
    var page = (location.pathname.split('/').pop() || 'index.html');
    if (page === 'index.html' || page === '' || page === 'admin.html') return;
    var armed = false;
    function arm() {
      if (armed) return; armed = true;
      ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { window.removeEventListener(ev, arm, true); });
      setTimeout(markPlayed, 10000);
    }
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, arm, true); });
  })();

  /* ---------- unique names: the database lets only one player (or device) hold a name ---------- */
  function deviceId() {
    try {
      var d = localStorage.getItem('device-id');
      if (!d) { d = 'd' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('device-id', d); }
      return d;
    } catch (e) { return 'nodev'; }
  }
  function nameRpc(fn, body) {
    return freshToken().then(function (t) {
      return fetch(REST + '/rpc/' + fn, { method: 'POST', headers: authHeaders(t || KEY, { 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  // resolves 'ok' (it's yours), 'taken' (someone else has it) or 'error' (couldn't check: let it through)
  function claimName(name) {
    return nameRpc('claim_name', { n: String(name), dev: deviceId() }).then(function (ok) { return ok === true ? 'ok' : ok === false ? 'taken' : 'error'; });
  }
  function releaseName(name) { return nameRpc('release_name', { n: String(name), dev: deviceId() }); }

  /* ---------- Orbits in the games ----------
     There are no separate coins any more: games pay ORBITS, the same balance Orbit uses (window.OrbitBank, orbit-link.js).
     A finished round pays a percent of its final score (the owner sets the percentages in the games admin panel; the live table is loaded by orbit-bank.js). Starting values: 2048 25%, Block Blast 75%, Block Breaker 50%, Dino Run 50%, Flappy Bird 1000%, Geometry Dash 100%, Minesweeper 50%, Pac-Man 10%, Slope 100%, Snake 2000%, Tetris 5%, Girder Gorilla 5%, Sudoku 25%.
     The Prize Room spends from the same balance. This local "coin-wallet" key now only remembers which frames and badges you own
     and which ones are equipped, so it still syncs with a signed-in account. */
  var WALLET_KEY = 'coin-wallet';
  var COIN_RULES = {};
  // every game page needs the shared Orbit bank (orbit-bank.js sits next to this file); the hub page loads it itself
  if (!window.OrbitBank && document.createElement) {
    try {
      var cs = document.currentScript, bs = document.createElement('script');
      bs.src = (cs && cs.src ? cs.src.replace(/[^\/]*$/, '') : '') + 'orbit-bank.js?v=9';
      (document.head || document.documentElement).appendChild(bs);
    } catch (e) { /* the bank is a bonus, never break a game */ }
  }
  function weekKey(dt) {
    var d = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - ((dt.getDay() + 6) % 7));   // that week's Monday
    return dayKey(d);
  }
  function blankWallet() {
    return { n: 0, b: 0, e: 0, d: '', r: 0, nb: {}, bb: {}, td: {}, ds: '', tw: {}, pb: {}, last: 0, own: [], eq: { frame: '', badge: '' } };
  }
  function cleanMap(o) { var out = {}; if (o && typeof o === 'object') Object.keys(o).slice(0, 40).forEach(function (k) { out[String(k).slice(0, 24)] = o[k]; }); return out; }
  function parseWallet(v) {
    var o; try { o = JSON.parse(v); } catch (e) { return null; }
    if (!o || typeof o !== 'object') return null;
    var w = blankWallet(), num = function (x, max) { x = Math.floor(Number(x)); return (x >= 0 && x <= (max || 1e9)) ? x : 0; };
    w.n = num(o.n); w.b = num(o.b); w.e = num(o.e); w.r = num(o.r, 99); w.last = num(o.last, 1e14);
    w.d = /^\d{4}-\d{2}-\d{2}$/.test(o.d) ? o.d : ''; w.ds = /^\d{4}-\d{2}-\d{2}$/.test(o.ds) ? o.ds : '';
    w.nb = cleanMap(o.nb); w.bb = cleanMap(o.bb); w.td = cleanMap(o.td); w.tw = cleanMap(o.tw); w.pb = cleanMap(o.pb);
    w.own = Array.isArray(o.own) ? o.own.filter(function (x) { return typeof x === 'string' && /^[a-z0-9_]{1,24}$/.test(x); }).slice(0, 80) : [];
    w.eq = { frame: (o.eq && typeof o.eq.frame === 'string' && /^[a-z0-9_]{0,24}$/.test(o.eq.frame)) ? o.eq.frame : '',
             badge: (o.eq && typeof o.eq.badge === 'string' && /^[a-z0-9_]{0,24}$/.test(o.eq.badge)) ? o.eq.badge : '' };
    return w;
  }
  function walletN(v) { var w = parseWallet(v); return w ? w.n : 0; }
  function rollDay(w) {
    var today = dayKey(new Date());
    if (w.d !== today) { w.d = today; w.r = 0; w.nb = {}; w.bb = {}; w.td = {}; }
    return w;
  }
  function readWallet() {
    var w = null; try { w = parseWallet(localStorage.getItem(WALLET_KEY)); } catch (e) { w = null; }
    return rollDay(w || blankWallet());
  }
  function writeWallet(w) {
    w.n = (w.n || 0) + 1;
    try { localStorage.setItem(WALLET_KEY, JSON.stringify(w)); } catch (e) { return false; }
    try { window.dispatchEvent(new CustomEvent('coins-changed', { detail: { balance: w.b } })); } catch (e) { /* ignore */ }
    return true;
  }
  // remember each game's best as it was before this page started, so "new personal best" can be told apart
  // (games update their own -best key just before they submit a score)
  function snapshotBests() {
    var w = readWallet(), changed = false;
    GAMES.forEach(function (g) {
      if (w.pb[g] === undefined) {
        var b = 0; try { b = parseInt(localStorage.getItem(g + '-best'), 10) || 0; } catch (e) { b = 0; }
        w.pb[g] = b; changed = true;
      }
    });
    if (changed) writeWallet(w);
  }
  /* small "+5 Orbits" pop-up so players see what they earned, on every page */
  var coinToastEl = null, coinToastTimer = 0;
  function coinToast(amount, lines) {
    if (!(amount > 0) || !document.body) return;
    if (!document.getElementById('coin-toast-css')) {
      var st = document.createElement('style'); st.id = 'coin-toast-css';
      st.textContent = '.coin-toast{position:fixed;top:64px;right:14px;z-index:2147483000;max-width:260px;padding:.6rem .85rem .6rem .7rem;border-radius:10px;' +
        'background:#14142a;color:#ecebf5;border:2px solid #ffd166;box-shadow:0 6px 0 rgba(0,0,0,.35);font:600 14px/1.35 "Pixelify Sans","Courier New",monospace;' +
        'display:flex;gap:.6rem;align-items:flex-start;transform:translateY(-12px);opacity:0;transition:transform .25s,opacity .25s;pointer-events:none}' +
        '.coin-toast.on{transform:none;opacity:1}.coin-toast .ct-coin{flex:none;width:26px;height:26px;border-radius:50%;background:url(../chatter/logo.svg) center/contain no-repeat}.coin-toast b{color:#ffd166;font-size:16px}.coin-toast small{display:block;color:#a9a8c4;font-size:12px;font-weight:500}' +
        '@media (prefers-reduced-motion:reduce){.coin-toast{transition:none}}';
      document.head.appendChild(st);
    }
    if (!coinToastEl) {
      coinToastEl = document.createElement('div'); coinToastEl.className = 'coin-toast'; coinToastEl.setAttribute('role', 'status');
      document.body.appendChild(coinToastEl);
    }
    coinToastEl.textContent = '';
    var c = document.createElement('span'); c.className = 'ct-coin'; c.setAttribute('aria-hidden', 'true');
    var t = document.createElement('div'), b = document.createElement('b'); b.textContent = '+' + amount.toLocaleString() + ' Orbit' + (amount === 1 ? '' : 's'); t.appendChild(b);
    lines.forEach(function (ln) { var sm = document.createElement('small'); sm.textContent = ln; t.appendChild(sm); });
    coinToastEl.appendChild(c); coinToastEl.appendChild(t);
    void coinToastEl.offsetWidth; coinToastEl.classList.add('on');
    clearTimeout(coinToastTimer);
    coinToastTimer = setTimeout(function () { if (coinToastEl) coinToastEl.classList.remove('on'); }, 3800);
  }
  var GAME_NAMES = { fruitninja: 'Fruit Ninja', wordle: 'Wordle', slither: 'Slither', game2048: '2048', blockblast: 'Block Blast', breakout: 'Block Breaker', dino: 'Dino Run', flappy: 'Flappy Bird', geodash: 'Geometry Dash', minesweeper: 'Minesweeper', pacman: 'Pac-Man', slope: 'Slope', snake: 'Snake', tetris: 'Tetris', girder: 'Girder Gorilla', sudoku: 'Sudoku' };
  // called for every finished round (Leaderboard.submit); never throws into a game
  function coinRound(game, score) {
    score = Math.floor(Number(score));
    if (GAMES.indexOf(game) === -1 || !(score > 0) || score > MAX_SCORE) return;
    var B = window.OrbitBank;
    if (!B || !B.signedIn()) return;
    B.claimGame(game, score).then(function (n) {
      if (n > 0) coinToast(n, [(GAME_NAMES[game] || game) + ': ' + score.toLocaleString() + ' points']);
    });
  }
  var coins = {
    rules: COIN_RULES,
    wallet: function () { return readWallet(); },
    // the Orbits balance (same number Orbit shows beside your profile)
    balance: function () { return window.OrbitBank ? window.OrbitBank.balance() : 0; },
    owns: function (id) { return readWallet().own.indexOf(id) !== -1; },
    // buy an item: takes the Orbits (shown at once, confirmed by the server) and adds it to the collection. false if it can't be bought.
    purchase: function (id, price) {
      var B = window.OrbitBank, w = readWallet(); price = Math.floor(Number(price));
      if (!B || !B.signedIn() || !/^[a-z0-9_]{1,24}$/.test(String(id)) || !(price >= 1) || w.own.indexOf(id) !== -1 || B.balance() < price) return false;
      w.own.push(id); B.adjust(-price);
      if (!writeWallet(w)) { B.adjust(price); return false; }
      B.spend(id, price).catch(function () {   // the server said no: give the item back and show the real balance
        var w2 = readWallet(); w2.own = w2.own.filter(function (x) { return x !== id; });
        if (w2.eq.frame === id) w2.eq.frame = ''; if (w2.eq.badge === id) w2.eq.badge = '';
        writeWallet(w2); B.refresh();
      });
      return true;
    },
    equip: function (kind, id) {
      if (kind !== 'frame' && kind !== 'badge') return false;
      var w = readWallet();
      if (id && w.own.indexOf(id) === -1) return false;
      w.eq[kind] = id || '';
      return writeWallet(w);
    },
    equipped: function () { var e = readWallet().eq; return { frame: e.frame, badge: e.badge }; },
    toast: coinToast
  };
  window.addEventListener('storage', function (e) {
    if (e.key === WALLET_KEY) { try { window.dispatchEvent(new CustomEvent('coins-changed')); } catch (er) { /* ignore */ } }
  });
  window.Leaderboard = {
    claimName: claimName, releaseName: releaseName,
    // the public Supabase address + anon key, shared with Battleship's online matchmaking (Realtime)
    config: { url: HOST, key: KEY },
    getAccount: getAccount, freshToken: freshToken, signOut: signOut, signIn: signIn, finishSignIn: finishSignIn, providers: PROVIDERS, sync: sync,
    formatScore: formatScore, getStreak: getStreak, markPlayed: markPlayed, submit: submit, save: save, track: track, mvp: mvp, top: top, syncAvatar: syncAvatar, isCleanName: isCleanName, getName: getName, games: GAMES,
    avatars: AVATAR_IDS.map(function (id) { return { id: id, name: SPRITES[id].name }; }),
    coins: coins, getAvatar: getAvatar, setAvatar: setAvatar, isValidAvatar: isValidAvatar, avatarEl: avatarEl, avatarName: avatarName,
    imageToAvatar: imageToAvatar, fileToAvatar: fileToAvatar
  };
})();
