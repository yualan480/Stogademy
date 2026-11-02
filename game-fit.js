// Give embedded games a usable logical viewport, then fit it into their available space.
// CSS scaling preserves the browser's pointer/touch coordinate conversion into the frame.
(() => {
  const selector = '.gamescreen.live iframe, iframe.gs-game, iframe.ar-game, iframe.gframe:not([data-orbitcraft])';
  const attached = new WeakSet();
  const originals = new WeakMap();
  let pending = false;
  function fit(frame) {
    if (!frame.isConnected) return;
    // The game catalogue keeps its normal responsive layout.
    if (frame.classList.contains('gframe')) {
      let path;
      try { path = frame.contentWindow.location.pathname; } catch { return; }
      if (!/\/games\/(?!index\.html$)[\w-]+\.html$/.test(path)) {
        if (originals.has(frame)) { frame.style.cssText = originals.get(frame); originals.delete(frame); }
        return;
      }
    }
    if (!originals.has(frame)) originals.set(frame, frame.style.cssText);
    const full = frame.classList.contains('gs-game');
    const host = frame.parentElement;
    const width = full ? document.documentElement.clientWidth : host.clientWidth;
    const height = full ? window.innerHeight : host.clientHeight;
    if (!width || !height) return;
    const scale = Math.min(1, width / 640, height / 600);
    if (!full && getComputedStyle(host).position === 'static') host.style.position = 'relative';
    Object.assign(frame.style, {
      border: '0', position: full ? 'fixed' : 'absolute', inset: 'auto', left: '50%', top: '50%',
      width: `${width / scale}px`, height: `${height / scale}px`, maxWidth: 'none',
      transformOrigin: 'center', transform: `translate(-50%, -50%) scale(${scale})`
    });
  }
  function refresh() {
    pending = false;
    document.querySelectorAll(selector).forEach(frame => {
      if (!attached.has(frame)) {
        attached.add(frame);
        frame.addEventListener('load', schedule);
        new ResizeObserver(schedule).observe(frame.parentElement);
      }
      fit(frame);
    });
  }
  function schedule() { if (!pending) { pending = true; requestAnimationFrame(refresh); } }
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'src'] });
  window.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  schedule();
})();
