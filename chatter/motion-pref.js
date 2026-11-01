'use strict';
/* Orbit motion preference.
   A website can't change a device's "reduce motion" setting, so when that setting is on we ask once on entering Orbit,
   explain how to turn animations on, and offer "Play animations anyway". Choosing it adds html.force-motion, which the
   CSS and JS check, and loads motion-plus-force.css. The choice is remembered on this device. */
(function () {
  var KEY = 'orbit-motion-play', ASKED = 'orbit-motion-asked', root = document.documentElement;
  var mq = matchMedia('(prefers-reduced-motion: reduce)');
  function get(s, k) { try { return s.getItem(k); } catch (e) { return null; } }
  function set(s, k, v) { try { s.setItem(k, v); } catch (e) {} }
  function enable() {
    if (root.classList.contains('force-motion')) return;
    root.classList.add('force-motion');
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'motion-plus-force.css'; l.id = 'mp-force';
    document.head.appendChild(l);
    var s = document.createElement('script'); s.src = 'motion-plus.js'; document.head.appendChild(s);   // progress line (it was skipped at load)
    window.dispatchEvent(new Event('orbit-motion'));
  }
  if (get(localStorage, KEY) === '1') enable();

  function steps() {
    var ua = navigator.userAgent || '', touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    if (/iPhone|iPad|iPod/.test(ua) || touchMac) return 'iPhone or iPad: Settings > Accessibility > Motion > turn Reduce Motion off.';
    if (/Android/.test(ua)) return 'Android: Settings > Accessibility > turn off Remove animations.';
    if (/CrOS/.test(ua)) return 'Chromebook: Settings > Accessibility > Display and magnification > turn off Reduce animations.';
    if (/Macintosh/.test(ua)) return 'Mac: System Settings > Accessibility > Display > turn Reduce motion off.';
    if (/Windows/.test(ua)) return 'Windows: Settings > Accessibility > Visual effects > turn Animation effects on (Windows 10: Ease of Access > Display > Show animations in Windows).';
    return 'Open your device\u2019s accessibility settings and turn off \u201cReduce motion\u201d (or turn on animation effects).';
  }

  function ask() {
    if (!mq.matches || root.classList.contains('force-motion') || get(sessionStorage, ASKED) === '1' || document.getElementById('motionpref')) return;
    set(sessionStorage, ASKED, '1');
    if (!document.getElementById('motionpref-css')) {
      var st = document.createElement('style'); st.id = 'motionpref-css';
      st.textContent = '#motionpref{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:16px;background:#02051acc;backdrop-filter:blur(6px)}' +
        '#motionpref .mpbox{max-width:420px;width:100%;padding:22px;border:1px solid #2b3fa8;border-radius:16px;background:#0b1322;color:#e8eeff;box-shadow:0 20px 60px #000a;font:15px/1.5 system-ui,sans-serif}' +
        '#motionpref h2{margin:0 0 8px;font-size:19px}#motionpref p{margin:0 0 10px}#motionpref .mpsteps{color:#fff}#motionpref small{display:block;color:#8fa6e8;margin-bottom:14px}' +
        '#motionpref .mpact{display:flex;gap:10px;flex-wrap:wrap}#motionpref button{padding:10px 16px;border-radius:10px;border:1px solid #3a63e0;background:#2f6bff;color:#fff;font:inherit;font-weight:600;cursor:pointer}' +
        '#motionpref button.ghost{background:none;color:#cfe0ff}#motionpref button:focus-visible{outline:2px solid #9bbcff;outline-offset:2px}';
      document.head.appendChild(st);
    }
    var d = document.createElement('div'); d.id = 'motionpref'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'mpt');
    d.innerHTML = '<div class="mpbox"><h2 id="mpt">Animations are turned off</h2>' +
      '<p>Your device has \u201creduce motion\u201d on, so Orbit would show without its animations. To see them, turn animations back on:</p>' +
      '<p class="mpsteps"></p><small>Websites can\u2019t open your device settings for you. You can also just play Orbit\u2019s animations here without changing anything.</small>' +
      '<div class="mpact"><button type="button" id="mpplay">Play animations</button><button type="button" class="ghost" id="mpskip">Keep them off</button></div></div>';
    d.querySelector('.mpsteps').textContent = steps();
    var prev = document.activeElement;
    function close() { d.remove(); if (prev && prev.focus) try { prev.focus(); } catch (e) {} }
    d.querySelector('#mpplay').onclick = function () { set(localStorage, KEY, '1'); enable(); close(); };
    d.querySelector('#mpskip').onclick = close;
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    document.body.appendChild(d); d.querySelector('#mpplay').focus();
  }
  window.OrbitMotion = { ask: ask, enable: enable };
})();
