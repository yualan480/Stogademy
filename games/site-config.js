/* Applies what the admin panel controls: maintenance mode, announcements, game on/off + names + badges + order, chat on/off.
   Load it right after leaderboard.js on index.html (and on any game page that should obey "game disabled"). */
(function () {
  'use strict';
  var L = window.Leaderboard; if (!L || !L.config || !window.fetch) return;
  var H = { apikey: L.config.key, Authorization: 'Bearer ' + L.config.key }, B = L.config.url + '/rest/v1/';
  var get = function (p) { return fetch(B + p, { headers: H }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }); };
  var page = (location.pathname.split('/').pop() || 'index.html');
  var home = page === 'index.html' || page === '';
  Promise.all([get('site_settings?select=key,value'), get('games_config?select=*&order=sort_order'),
               home ? get('announcements?select=*&order=pinned.desc,id.desc&limit=5') : []]).then(function (a) {
    var S = {}; a[0].forEach(function (r) { S[r.key] = r.value; });
    var G = a[1], N = a[2];
    if (S.maintenance === true) {
      var m = document.createElement('div');
      m.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0b0b14;color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;padding:2rem;font:600 1.4rem "Pixelify Sans","Courier New",monospace';
      m.textContent = S.maintenance_msg || 'We are updating the site. Back soon!';
      document.body.appendChild(m); return;
    }
    if (!home) {   // a game page: leave if an admin switched this game off
      var me = G.filter(function (g) { return g.page === page; })[0];
      if (me && me.enabled === false) location.replace('index.html');
      return;
    }
    if (S.chat_enabled === false) ['chatFab', 'chatPanel', 'chatHint'].forEach(function (id) { var e = document.getElementById(id); if (e) e.remove(); });
    if (S.suggestions_enabled === false) { var sg = document.getElementById('suggest'); if (sg) sg.remove(); }
    var box = document.getElementById('carts');
    G.forEach(function (g) {
      var card = document.querySelector('.cart[data-href="' + g.page + '"]'), btn = document.querySelector('#menu [data-href="' + g.page + '"]');
      if (g.enabled === false) { if (card) card.remove(); if (btn && btn.parentNode) btn.parentNode.remove(); return; }
      if (!card) return;
      if (box) box.insertBefore(card, box.querySelector('.cart.empty'));   // follows sort_order, "Next cartridge" stays last
      var h3 = card.querySelector('h3'), p = card.querySelector('.cart-body > p');
      if (g.title && h3) { h3.textContent = g.title; card.dataset.title = g.title; }
      if (g.description && p) p.textContent = g.description;
      [[g.featured, 'Featured'], [g.is_new, 'New'], [g.is_popular, 'Popular']].forEach(function (f) {
        if (!f[0]) return; var s = document.createElement('span'); s.className = 'badge'; s.textContent = f[1]; s.style.marginLeft = '4px';
        var b = card.querySelector('.badge'); if (b) b.after(s);
      });
    });
    // cartridges the admin list doesn't know yet (like a newly added game) go to the end, in their page order
    if (box) {
      var known = {}; G.forEach(function (g) { known[g.page] = true; });
      var order = [].slice.call(box.querySelectorAll('.cart.playable')).filter(function (c) { return !known[c.getAttribute('data-href')]; });
      order.forEach(function (c) { box.insertBefore(c, box.querySelector('.cart.empty')); });
    }
    N.forEach(function (n) {
      var key = 'ann-' + n.id; try { if (sessionStorage.getItem(key)) return; } catch (e) { /* ignore */ }
      var d = document.createElement('div'); d.setAttribute('role', 'status');
      d.style.cssText = 'position:relative;z-index:50;padding:.55rem 2.2rem .55rem 1rem;text-align:center;background:#ff6b8b;color:#fff;font:600 15px "Pixelify Sans","Courier New",monospace';
      var b = document.createElement('b'); b.textContent = n.title + (n.body ? ': ' : ''); d.appendChild(b); d.appendChild(document.createTextNode(n.body || ''));
      var x = document.createElement('button'); x.textContent = '×'; x.setAttribute('aria-label', 'Dismiss');
      x.style.cssText = 'position:absolute;right:.6rem;top:50%;transform:translateY(-50%);background:none;border:0;color:#fff;font-size:1.3rem;cursor:pointer';
      x.onclick = function () { d.remove(); try { sessionStorage.setItem(key, '1'); } catch (e) { /* ignore */ } };
      d.appendChild(x); document.body.insertBefore(d, document.body.firstChild);
    });
  });
})();
