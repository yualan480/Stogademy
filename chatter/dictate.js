/* Voice typing for the message box: press the mic, talk, and your words are typed into the box. Nothing is sent until you press Send.
   Uses the browser's built-in speech recognition (Chrome, Edge and Safari have it; Firefox does not, so the button is hidden there).
   In Chrome the browser sends the audio to its own speech service to turn it into text. Orbit never receives or stores the audio. */

const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
export const dictationSupported = !!SR;
let cur = null;   // the one active session: { stop() }

export const dictateBtn = ic => dictationSupported
  ? `<button class="ib" id="dic" type="button" title="Type with your voice" aria-label="Type with your voice" aria-pressed="false">${ic('mic')}</button>` : '';

export function bindDictate(ta, btn, toast) {
  if (cur) cur.stop();
  if (!SR || !ta || !btn) return;
  let rec = null, on = false, pre = '', post = '', fin = '';
  const paint = interim => {
    ta.value = pre + fin + interim + post;
    const p = (pre + fin + interim).length; try { ta.setSelectionRange(p, p); } catch {}
    ta.dispatchEvent(new Event('input'));   // resize the box and run the usual input handling
  };
  const ui = () => { btn.classList.toggle('rec', on); btn.setAttribute('aria-pressed', String(on)); btn.title = on ? 'Stop voice typing' : 'Type with your voice'; btn.setAttribute('aria-label', btn.title); };
  const stop = () => { if (!on) return; on = false; try { rec.stop(); } catch {} ui(); if (cur === api) cur = null; };
  const api = { stop };
  const space = (a, b) => (a && b && !/\s$/.test(a) && !/^\s/.test(b) ? ' ' : '');

  function start() {
    if (cur && cur !== api) cur.stop();
    const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? s;
    pre = ta.value.slice(0, s); post = ta.value.slice(e); fin = '';
    rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = navigator.language || 'en-US';
    rec.onresult = ev => {
      if (!ta.isConnected) return stop();
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) { fin += space(pre + fin, t.trim()) + t.trim(); } else interim += t;
      }
      const lead = space(pre + fin, interim.trim());
      paint(interim ? lead + interim.trim() : '');
      if (ta.value.length > ta.maxLength) { ta.value = ta.value.slice(0, ta.maxLength); toast('That is the longest a message can be.', true); stop(); }
    };
    rec.onerror = ev => {
      const m = { 'not-allowed': 'Orbit needs microphone permission for voice typing. Allow the microphone in your browser, then try again.', 'service-not-allowed': 'Voice typing is blocked on this browser.', 'audio-capture': 'No microphone was found.', network: 'Voice typing needs an internet connection.' }[ev.error];
      if (m) toast(m, true); if (ev.error !== 'no-speech' && ev.error !== 'aborted') stop();
    };
    rec.onend = () => { if (on) { on = false; ui(); if (cur === api) cur = null; } if (ta.isConnected) paint(''); };
    try { rec.start(); on = true; cur = api; ui(); ta.focus(); } catch { toast('Could not start voice typing.', true); }
  }
  btn.onclick = () => (on ? stop() : start());
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) stop(); });   // sending ends dictation
  document.getElementById('snd')?.addEventListener('click', stop);
}
