// Stogademy sign-in and account creation. Uses the same Supabase project (and the same saved login) as Orbit,
// so an account made here also works in Orbit. Sign-in buttons: Google (school email) and email + password.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var btn = $('signinBtn'), box = $('userbox'), nameEl = $('uname'), out = $('signoutBtn'), msg = $('authmsg'), start = $('startBtn');
  if (!btn || !box || !msg || !start) return;
  var SCHOOL = /^[0-9]{2}[a-z]{2,}[0-9]*@tesdk12\.net$/;
  var ready = false;
  // Used by the calculator code (stogademy.js): if nobody is signed in yet, press the top-right sign-in button for them and
  // remember to open Orbit once they are back. Returns true when it started the sign-in, false when Orbit can just open.
  window.StgSignIn = function () {
    if (!ready || btn.hidden || btn.disabled) return false;
    try { sessionStorage.setItem('stg_go_orbit', String(Date.now())); } catch (e) { /* ignore */ }
    btn.click();
    return true;
  };

  function say(t, ms) {
    msg.textContent = t; msg.hidden = !t;
    if (t) setTimeout(function () { msg.hidden = true; }, ms || 14000);
  }

  // Google/Supabase report problems in the URL after the redirect. Read them first, then clean the URL.
  (function () {
    var q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.replace(/^#/, ''));
    var desc = q.get('error_description') || h.get('error_description');
    if (!desc) return;
    var friendly = /database error|school email|device|saving new user/i.test(desc)
      ? 'We couldn’t create your account. Make sure you chose your school Google account (like 30yua@tesdk12.net). If it still fails, ask the owner to check that your email is on the approved list.'
      : 'Sign-in failed: ' + desc;
    setTimeout(function () { say(friendly); }, 0);
    try { history.replaceState(null, '', location.pathname + '#/'); } catch (e) { /* ignore */ }
  })();

  // Same device id Orbit uses, so one browser = one account everywhere.
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function deviceId() {
    var id = null;
    try { id = localStorage.getItem('chatter-device'); } catch (e) { /* ignore */ }
    if (!UUID.test(id || '')) { var m = document.cookie.match(/(?:^|; )chatter_device=([0-9a-f-]{36})/i); id = m ? m[1] : null; }
    if (!UUID.test(id || '')) id = crypto.randomUUID();
    try { localStorage.setItem('chatter-device', id); } catch (e) { /* ignore */ }
    document.cookie = 'chatter_device=' + id + '; max-age=63072000; path=/; SameSite=Lax';
    return id;
  }

  var hcLoad = null;
  function loadHcaptcha() {
    if (hcLoad) return hcLoad;
    hcLoad = new Promise(function (ok, no) {
      if (window.hcaptcha) return ok(window.hcaptcha);
      var s = document.createElement('script'); s.src = 'https://js.hcaptcha.com/1/api.js?render=explicit'; s.async = true;
      s.onload = function () { window.hcaptcha ? ok(window.hcaptcha) : no(new Error('load')); };
      s.onerror = function () { hcLoad = null; no(new Error('load')); };
      document.head.appendChild(s);
    });
    return hcLoad;
  }

  function init(sb, cfg) {
    var session = null, SITE = cfg.HCAPTCHA_SITE_KEY || '';

    function show(s) {
      session = s || null;
      var u = session && session.user;
      if (u && !/^[0-9]{2}[a-z]{2,}[0-9]*@tesdk12\.net$/i.test(u.email || '')) {
        session = null; u = null;
        sb.auth.signOut({ scope: 'local' });
        say('Please sign in with your school Google account (like 30yua@tesdk12.net).');
      }
      btn.hidden = !!u; box.hidden = !u; btn.disabled = false;
      if (u) { var m = u.user_metadata || {}; nameEl.textContent = m.full_name || m.name || u.email || 'Signed in'; closeModal(); }
    }
    sb.auth.getSession().then(function (r) {
      if (/access_token=|refresh_token=/.test(location.hash)) { try { history.replaceState(null, '', location.pathname + '#/'); } catch (e) { /* ignore */ } }
      var s = r.data && r.data.session; ready = true; show(s);
      // Back from the sign-in the calculator code started: open Orbit (the code only counts for 10 minutes).
      var t = 0; try { t = +sessionStorage.getItem('stg_go_orbit') || 0; sessionStorage.removeItem('stg_go_orbit'); } catch (e) { /* ignore */ }
      if (s && s.user && t && Date.now() - t < 6e5) { try { if (localStorage.getItem('stg_ok') === '1') location.hash = '#/chat'; } catch (e) { /* ignore */ } }
    });
    sb.auth.onAuthStateChange(function (_e, s) { show(s); });

    // Sign in with school email (Google)
    btn.onclick = async function () {
      btn.disabled = true;
      var r = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account', hd: 'tesdk12.net' } }
      });
      if (r.error) { say('Sign-in failed: ' + r.error.message); btn.disabled = false; }
    };
    out.onclick = async function () { await sb.auth.signOut({ scope: 'local' }); say('Signed out.', 4000); };

    // Get started: signing in with a school Google account creates the account automatically the first time (no separate sign-up step).
    // If already signed in, go straight to the tools.
    start.onclick = function () { if (session) { location.hash = '#/study'; return; } btn.click(); };

    function closeModal() { var m = $('amodal'); if (m) m.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') closeModal(); }
  }

  // Reuse Orbit's Supabase URL and key so there is only one place to change them.
  import('./chatter/config.js').then(function (c) {
    if (!window.supabase) throw new Error('Supabase library did not load');
    init(window.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } }), c);
  }).catch(function () {
    var down = function () { say('Sign-in is unavailable right now. Reload the page and try again.'); };
    btn.onclick = down; start.onclick = function () { location.hash = '#/study'; };
  });
})();
