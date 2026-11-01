/* Shared pause button (+ pause screen for games that have none of their own). Loaded by every game page.
   GamePause.init({
     playing:  () => true while a round is being played,
     paused:   () => true while the game is paused          (games that already have their own pause)
     pause:    () => pause the game                         (games that already have their own pause)
     resume:   () => resume the game                        (games that already have their own pause)
     own:      false/omitted -> this file does the pausing itself (freezes input, shows "Paused" + Resume)
                              and the game checks GamePause.paused in its loop
     onPause:  () => extra work when paused (own:false only), e.g. save the round's score
     onResume: (ms) => extra work when resumed; ms = how long the pause lasted (own:false only)
     button:   false to hide the floating button (game already has a visible one)
     corner:   'br' (default) | 'bl' | 'tr' | 'tl'
     offset:   extra inline style for the button, e.g. { bottom: '72px' } to clear on-screen controls
   }) */
(function () {
  'use strict';
  var o = null, ui = null, btn = null, since = 0;
  var GP = { paused: false };
  window.GamePause = GP;

  function css() {
    var s = document.createElement('style');
    s.textContent =
      '#gp-btn{position:fixed;z-index:9000;width:42px;height:42px;border-radius:50%;border:2px solid rgba(255,255,255,.55);' +
      'background:rgba(10,6,28,.62);color:#fff;font:700 15px/1 system-ui,sans-serif;cursor:pointer;display:none;align-items:center;justify-content:center;' +
      'padding:0;-webkit-tap-highlight-color:transparent;touch-action:manipulation;letter-spacing:-1px}' +
      '#gp-btn:hover{background:rgba(10,6,28,.88)}#gp-btn:focus-visible{outline:3px solid #ffd166;outline-offset:2px}' +
      '#gp-btn.br{right:calc(10px + env(safe-area-inset-right));bottom:calc(10px + env(safe-area-inset-bottom))}' +
      '#gp-btn.bl{left:calc(10px + env(safe-area-inset-left));bottom:calc(10px + env(safe-area-inset-bottom))}' +
      '#gp-btn.tr{right:calc(10px + env(safe-area-inset-right));top:calc(10px + env(safe-area-inset-top))}' +
      '#gp-btn.tl{left:calc(10px + env(safe-area-inset-left));top:calc(10px + env(safe-area-inset-top))}' +
      '#gp-ui{position:fixed;inset:0;z-index:9500;display:none;align-items:center;justify-content:center;flex-direction:column;gap:14px;' +
      'background:rgba(5,10,26,.88);color:#fff;font-family:"Pixelify Sans","Courier New",monospace;text-align:center;padding:20px;touch-action:manipulation}' +
      '#gp-ui h2{font-size:44px;font-weight:700;margin:0}#gp-ui p{font-size:17px;opacity:.85;margin:0}' +
      '#gp-ui button{font:700 22px "Pixelify Sans","Courier New",monospace;padding:.5em 1.6em;border-radius:12px;border:0;background:#ffd166;color:#1b1b2f;cursor:pointer}' +
      '#gp-ui button:focus-visible{outline:3px solid #fff;outline-offset:3px}';
    document.head.appendChild(s);
  }

  function ready(fn) { if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn); }

  function build() {
    css();
    btn = document.createElement('button');
    btn.id = 'gp-btn'; btn.type = 'button'; btn.className = o.corner || 'br';
    btn.setAttribute('aria-label', 'Pause'); btn.title = 'Pause (P)';
    btn.innerHTML = '&#10074;&#10074;';
    btn.addEventListener('click', function (e) { e.stopPropagation(); toggle(); btn.blur(); });
    btn.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    if (o.offset) for (var k in o.offset) btn.style[k] = o.offset[k];
    if (o.button !== false) document.body.appendChild(btn);
    if (!o.own) {
      ui = document.createElement('div');
      ui.id = 'gp-ui'; ui.setAttribute('role', 'dialog'); ui.setAttribute('aria-label', 'Paused');
      ui.innerHTML = '<h2>Paused</h2><p>Your game is saved right where you left it.</p><button type="button" id="gp-resume">Resume</button><p>or press P / Esc</p>';
      document.body.appendChild(ui);
      ui.querySelector('#gp-resume').addEventListener('click', function () { GP.resume(); });
    }
    setInterval(sync, 150);
  }

  function isPaused() { return o.own ? !!o.paused() : GP.paused; }
  function sync() {
    if (!o || !btn) return;
    var p = isPaused(), pl = !!o.playing();
    btn.style.display = (p || pl) ? 'flex' : 'none';
    var html = p ? '&#9654;' : '&#10074;&#10074;';
    if (btn.dataset.s !== (p ? 'r' : 'p')) { btn.dataset.s = p ? 'r' : 'p'; btn.innerHTML = html; btn.setAttribute('aria-label', p ? 'Resume' : 'Pause'); btn.title = (p ? 'Resume' : 'Pause') + ' (P)'; }
    if (ui && ui.style.display !== (GP.paused ? 'flex' : 'none')) ui.style.display = GP.paused ? 'flex' : 'none';
  }

  GP.pause = function () {
    if (!o) return;
    if (o.own) { if (!o.paused() && o.playing()) o.pause(); return; }
    if (GP.paused || !o.playing()) return;
    GP.paused = true; since = Date.now();
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) { /* ignore */ }
    if (o.onPause) { try { o.onPause(); } catch (e) { /* ignore */ } }
    sync();
    var r = ui && ui.querySelector('#gp-resume'); if (r) r.focus();
  };
  GP.resume = function () {
    if (!o) return;
    if (o.own) { if (o.paused()) o.resume(); return; }
    if (!GP.paused) return;
    GP.paused = false;
    if (o.onResume) { try { o.onResume(Date.now() - since); } catch (e) { /* ignore */ } }
    sync();
  };
  function toggle() { if (isPaused()) GP.resume(); else GP.pause(); }
  GP.toggle = toggle;

  /* while paused, the game must not see any key presses (this runs first because pause.js is loaded before the game) */
  function swallow(e) {
    if (!o || o.own || !GP.paused) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;                         // browser shortcuts keep working
    if (e.key === 'Tab' || /^F\d+$/.test(e.key)) return;
    if (e.code === 'KeyP' || e.key === 'Escape') { if (!e.repeat) GP.resume(); e.stopImmediatePropagation(); e.preventDefault(); return; }
    e.stopImmediatePropagation();
    if (!(e.target && e.target.closest && e.target.closest('#gp-ui'))) e.preventDefault();   // Enter / Space still press the Resume button
  }
  window.addEventListener('keydown', swallow, true);

  /* P pauses / resumes (not in games that already use the key themselves) */
  window.addEventListener('keydown', function (e) {
    if (!o || o.key === false || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.code !== 'KeyP') return;
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (o.own) toggle(); else if (!GP.paused) GP.pause();
  });

  /* leaving the tab pauses the round (it stays paused until you press Resume) */
  document.addEventListener('visibilitychange', function () { if (document.hidden && o && o.autoPause !== false) GP.pause(); });

  /* read by recorder.js: is a round being played, and is it paused right now */
  GP.status = function () { if (!o) return null; var p = false, pl = false; try { p = !!isPaused(); pl = !!o.playing(); } catch (e) { /* ignore */ } return { playing: pl, paused: p }; };

  GP.init = function (opts) { o = opts; ready(build); };
})();
