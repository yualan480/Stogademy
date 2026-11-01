/* Orbit Games uses the Orbit account. There is no separate games login: whoever is signed in to Orbit is the player.
   This file copies the Orbit chat profile (name and picture) into the games on every load. Not signed in to Orbit: a notice asks the player to log in there. */
(function () {
  var ORBIT = 'https://qtmrtxgkisshdtqshjre.supabase.co', SESSION_KEY = 'sb-qtmrtxgkisshdtqshjre-auth-token';
  function get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  var session = null;
  try { session = JSON.parse(get(SESSION_KEY) || 'null'); } catch (e) { /* unreadable */ }
  var uid = session && session.user && session.user.id;
  if (!uid || !session.access_token) {
    document.addEventListener('DOMContentLoaded', function () {
      var d = document.createElement('div');
      d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:1.5rem;background:rgba(4,6,30,.92);color:#f4f3ff;text-align:center;font:16px/1.5 system-ui,sans-serif';
      d.innerHTML = '<div style="max-width:380px"><h2 style="margin:0 0 .6rem;font-size:1.5rem">Log in to Orbit to play</h2><p style="margin:0 0 1.2rem;color:#dcdaf3">Orbit Games uses your Orbit account for your name, scores and Orbits.</p><button type="button" style="padding:.7rem 1.4rem;border:0;border-radius:8px;background:#2563eb;color:#fff;font:600 1rem system-ui,sans-serif;cursor:pointer">Open Orbit</button></div>';
      d.querySelector('button').onclick = function () { try { top.location.hash = '#/chat'; } catch (e) { location.href = '../chatter/'; } };
      document.body.appendChild(d);
    });
    return;
  }
  /* The games always show the Orbit chat profile: same name, same picture (or the same colour + first letter when there is no photo).
     It is re-read from Orbit on every load, so a rename or new picture in chat shows up in the games the next time they open.
     The games can no longer edit it; their own copy of name/picture is never synced from the games account either. */
  var stored = get('orbit-profile-sig'), sameUser = get('orbit-uid') === uid && get('player-name');
  if (!sameUser) { try { localStorage.removeItem('player-name'); localStorage.removeItem('player-avatar'); localStorage.removeItem('orbit-profile-sig'); } catch (e) { /* storage unavailable */ } }   // another account used this browser before
  function letterAvatar(name, color) {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var x = c.getContext('2d'); x.fillStyle = /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#6b6b7b'; x.fillRect(0, 0, 64, 64);
    x.fillStyle = '#fff'; x.font = '700 34px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText((name || '?').charAt(0).toUpperCase(), 32, 34);
    return c.toDataURL('image/jpeg', 0.85);
  }
  function photoAvatar(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          var s = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement('canvas'); c.width = c.height = 64;
          c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 64, 64);
          resolve(c.toDataURL('image/jpeg', 0.8));
        } catch (e) { reject(e); }
      };
      img.onerror = reject; img.src = url;
    });
  }
  import('../chatter/config.js').then(function (c) {
    return fetch(ORBIT + '/rest/v1/profiles?id=eq.' + encodeURIComponent(uid) + '&select=display_name,avatar_url,avatar_color', { headers: { apikey: c.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + session.access_token } });
  }).then(function (r) { return r.json(); }).then(function (rows) {
    var p = rows && rows[0], n = p && String(p.display_name || '').trim().slice(0, 12);   // the games' database keeps names to 12 characters
    if (!n) return;
    var sig = [p.display_name, p.avatar_url || '', p.avatar_color || ''].join('|');
    if (sameUser && stored === sig) return;   // already identical to the chat profile
    var photo = p.avatar_url && /^https:\/\//.test(p.avatar_url) ? photoAvatar(p.avatar_url).catch(function () { return letterAvatar(n, p.avatar_color); }) : Promise.resolve(letterAvatar(n, p.avatar_color));
    return photo.then(function (avatar) {
      try {
        localStorage.setItem('player-name', n); localStorage.setItem('orbit-uid', uid);
        localStorage.setItem('player-avatar', avatar); localStorage.setItem('orbit-profile-sig', sig);
      } catch (e) { return; }
      location.reload();
    });
  }).catch(function () { /* the Orbit app will link the account when it loads */ });
})();
