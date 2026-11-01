/* Orbit home ambience: one seamless sound loop (orbit-ambient.wav) plus the matching phase for the horizon animation.
   The loop file was cut from the design video and cross-faded end-into-start, so its last sample flows straight into its first.
   Web Audio plays it as a looping buffer, which has no gap or click at the join (a plain <audio loop> can leave a tiny gap).
   Browsers only allow sound after a tap or key press, so it starts on the first one. The speaker button turns it off for good. */

export const PERIOD = 2.74;                       // seconds; exactly the length of the audio loop, so picture and sound repeat together
const SRC = 'orbit-ambient.wav', KEY = 'orbit-ambient', LEVEL = 0.8, FADE_IN = 1.2, FADE_OUT = 0.5;
/* background music for the home page: a calm, slow space piece (soft pads, deep drone, glassy bells) that matches the night-sky backdrop.
   orbit-music.wav is 48 seconds long and loops seamlessly. It plays underneath the ambience, on the same speaker button. */
const MUSIC = 'orbit-music.wav', M_LEVEL = 0.4, M_FADE_IN = 4, M_FADE_OUT = 1.2;

let ctx = null, master = null, buf = null, loading = null, node = null, t0 = 0;
let mMaster = null, mBuf = null, mLoading = null, mNode = null;
let host = null, btn = null, mbtn = null, vid = null, armed = false;
/* the music plays everywhere in Orbit. It only pauses while a game in Orbit Games is open (gameOpen), or after the person signs out (booted = false). */
let booted = false, gameOpen = false;
const allowed = () => booted && !gameOpen && !document.hidden;

const wanted = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } };
const store = on => { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch {} };
/* the melody has its own on/off (the music-note button), separate from the ambience, so a player can keep the hum and mute the tune */
const MKEY = 'orbit-music-on';
const mWanted = () => { try { return localStorage.getItem(MKEY) !== 'off'; } catch { return true; } };
const mStore = on => { try { localStorage.setItem(MKEY, on ? 'on' : 'off'); } catch {} };

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  mMaster = ctx.createGain(); mMaster.gain.value = 0; mMaster.connect(ctx.destination);
  return true;
}

function load() {
  if (buf) return Promise.resolve(buf);
  loading ??= fetch(new URL(SRC, import.meta.url))
    .then(r => { if (!r.ok) throw new Error('audio ' + r.status); return r.arrayBuffer(); })
    .then(d => new Promise((ok, no) => ctx.decodeAudioData(d, ok, no)))
    .then(b => (buf = b))
    .catch(() => { loading = null; return null; });
  return loading;
}

function loadMusic() {
  if (mBuf) return Promise.resolve(mBuf);
  mLoading ??= fetch(new URL(MUSIC, import.meta.url))
    .then(r => { if (!r.ok) throw new Error('music ' + r.status); return r.arrayBuffer(); })
    .then(d => new Promise((ok, no) => ctx.decodeAudioData(d, ok, no)))
    .then(b => (mBuf = b))
    .catch(() => { mLoading = null; return null; });
  return mLoading;
}
/* the music is optional: if it cannot load, the ambience carries on without it */
async function startMusic() {
  if (mNode || !ctx || !mWanted()) return;
  const b = await loadMusic();
  if (!b || mNode || !node || !wanted() || !mWanted() || !allowed()) return;   // only while the ambience is playing
  mNode = ctx.createBufferSource();
  mNode.buffer = b; mNode.loop = true; mNode.loopStart = 0; mNode.loopEnd = b.duration;
  mNode.connect(mMaster);
  const now = ctx.currentTime;
  mMaster.gain.cancelScheduledValues(now); mMaster.gain.setValueAtTime(0, now); mMaster.gain.linearRampToValueAtTime(M_LEVEL, now + M_FADE_IN);
  mNode.start(now);
}
function stopMusic() {
  if (!mNode) return;
  const n = mNode, now = ctx.currentTime; mNode = null;
  mMaster.gain.cancelScheduledValues(now); mMaster.gain.setValueAtTime(mMaster.gain.value, now); mMaster.gain.linearRampToValueAtTime(0, now + M_FADE_OUT);
  setTimeout(() => { try { n.stop(); n.disconnect(); } catch {} }, M_FADE_OUT * 1000 + 60);
}

/* where the picture should be in its cycle right now (seconds), so a redraw of the page never makes the backdrop jump */
export function cycleTime() {
  const s = node ? (performance.now() - t0) / 1000 : performance.now() / 1000;
  return s % PERIOD;
}

function paint() {
  if (!btn) return;
  const on = wanted();
  btn.classList.toggle('off', !on); btn.setAttribute('aria-pressed', String(on));
  btn.setAttribute('aria-label', on ? 'Turn Orbit sound off' : 'Turn Orbit sound on'); btn.title = on ? 'Sound on' : 'Sound off';
}

function paintMusic() {
  if (!mbtn) return;
  const on = mWanted();
  mbtn.classList.toggle('off', !on); mbtn.setAttribute('aria-pressed', String(on));
  mbtn.setAttribute('aria-label', on ? 'Turn Orbit music off' : 'Turn Orbit music on'); mbtn.title = on ? 'Music on' : 'Music off';
}

async function start() {
  if (node || !wanted() || !allowed() || !ensure()) return;
  const [b] = await Promise.all([load(), mWanted() ? loadMusic() : null]);
  if (!b || node || !wanted() || !allowed()) return;
  if (ctx.state !== 'running') { try { await ctx.resume(); } catch {} }
  if (ctx.state !== 'running') return;               // still blocked: the first tap or key press tries again
  node = ctx.createBufferSource();
  node.buffer = b; node.loop = true; node.loopStart = 0; node.loopEnd = b.duration;
  node.connect(master);
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now); master.gain.setValueAtTime(0, now); master.gain.linearRampToValueAtTime(LEVEL, now + FADE_IN);
  node.start(now); t0 = performance.now();
  startMusic();
  if (vid) { try { vid.currentTime = 0; const p = vid.play(); if (p && p.catch) p.catch(() => {}); } catch {} }   // picture and sound begin the loop together
}

function stop() {
  stopMusic();
  if (!node) return;
  const n = node, now = ctx.currentTime; node = null;
  master.gain.cancelScheduledValues(now); master.gain.setValueAtTime(master.gain.value, now); master.gain.linearRampToValueAtTime(0, now + FADE_OUT);
  setTimeout(() => { try { n.stop(); n.disconnect(); } catch {} }, FADE_OUT * 1000 + 60);
}

function arm() {
  if (armed) return; armed = true;
  const go = async () => { await start(); if (node) { armed = false; ['pointerdown', 'keydown', 'touchend'].forEach(e => removeEventListener(e, go, true)); } };
  ['pointerdown', 'keydown', 'touchend'].forEach(e => addEventListener(e, go, true));
}

document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (booted) start(); });

export const ambient = {
  /* called when Orbit opens after sign-in: the music now plays on every page (the first tap or key press lets the browser start it) */
  boot() { booted = true; start(); if (!node) arm(); },
  /* called when the person signs out */
  quit() { booted = false; gameOpen = false; stop(); },
  /* Orbit Games tells us when a game is open (music pauses) and when the game list or another page is showing again (music resumes) */
  setGameOpen(on) { on = !!on; if (on === gameOpen) return; gameOpen = on; if (on) stop(); else if (booted) { start(); if (!node) arm(); } },
  /* called each time the home page is drawn (it is redrawn on live updates, so this must be safe to repeat). It only wires the speaker and music buttons and the backdrop. */
  attach(el, button, video, musicButton) {
    host = el; btn = button; mbtn = musicButton || null; vid = video || null; paint(); paintMusic();
    if (btn) btn.onclick = () => {
      const on = !wanted(); store(on); paint();
      if (on) { start(); if (!node) arm(); } else stop();
    };
    if (mbtn) mbtn.onclick = () => {
      const on = !mWanted(); mStore(on); paintMusic();
      if (on) { if (node) startMusic(); } else stopMusic();   // music follows the ambience: it only plays while the ambience does
    };
    if (booted) { if (node) { if (vid) { try { vid.currentTime = cycleTime() % (vid.duration || PERIOD); } catch {} } } else { start(); if (!node) arm(); } }
  },
  /* called when the person leaves the home page: only lets go of the buttons; the sound keeps playing */
  detach() { host = null; btn = null; mbtn = null; vid = null; },
};
