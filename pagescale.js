/* Stogademy page scale. Windows laptops usually run at 125-175% display scaling, so at a browser zoom of 100% the whole site looks
   oversized (the browser then reads "67%" at 100% zoom only after pressing Ctrl and -). This shrinks the page by exactly that scaling,
   so what you see at 100% matches 1 page pixel = 1 screen pixel.
   - Only the top-level desktop page is scaled (never an iframe, phone or tablet) and only when a display scaling of 125-175% is detected.
   - Ctrl + and Ctrl - still work on top of it; the scale is worked out from the display scaling, not from your current zoom.
   - Override for testing: localStorage stg_pagescale = a number such as 0.667 (or 1 to switch the scale off). */
(function () {
  'use strict';
  var d = document.documentElement;
  function set(z) {
    z = Math.round(z * 10000) / 10000;
    window.__pz = z;
    if (z === 1) { d.style.removeProperty('zoom'); d.style.removeProperty('--pz'); return; }
    d.style.zoom = String(z); d.style.setProperty('--pz', String(z));
  }
  function calc() {
    try {
      if (window.top !== window.self) return 1;
    } catch (e) { if (window.top !== window.self) return 1; }
    if (matchMedia('(pointer:coarse)').matches || !matchMedia('(min-width:801px)').matches) return 1;
    try { var o = parseFloat(localStorage.getItem('stg_pagescale')); if (o >= 0.4 && o <= 1) return o; } catch (e) { /* storage unavailable */ }
    /* browser zoom = window width (not affected by zoom) / page width (shrinks as you zoom in) */
    var oi = window.outerWidth / window.innerWidth;
    if (!(oi > 0.2 && oi < 6)) return 1;
    var steps = [.25, .33, .5, .67, .75, .8, .9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5], bz = 1, best = 9;
    steps.forEach(function (s) { var e = Math.abs(Math.log(oi / s)); if (e < best) { best = e; bz = s; } });
    var sys = (window.devicePixelRatio || 1) / bz;       /* Windows display scaling, e.g. 1.5 for 150% */
    if (sys < 1.2 || sys > 1.8) return 1;
    return 1 / (Math.round(sys * 4) / 4);                  /* 125% -> .8, 150% -> .6667, 175% -> .5714 */
  }
  set(calc());
  var t; addEventListener('resize', function () { clearTimeout(t); t = setTimeout(function () { set(calc()); }, 120); });
})();
