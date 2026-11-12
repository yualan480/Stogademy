(() => {
'use strict';
const $ = id => document.getElementById(id);
const status = $('status');
let gba = null, ready = false, loading = false;
const DB_NAME = 'orbit-leafgreen-local-game-v1', DB_STORE = 'local-games', DB_KEY = 'leafgreen';
const bios = fetch('resources/bios.bin').then(r => {
  if (!r.ok) throw Error('The emulator firmware could not load. Please refresh.');
  return r.arrayBuffer();
});
bios.catch(() => {});

function say(message) { status.textContent = message; }
function openGameDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(Error('Local game storage is unavailable.'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || Error('Could not open local game storage.'));
    request.onblocked = () => reject(Error('Close other LeafGreen tabs and try again.'));
  });
}
async function gameStorage(mode, method, value) {
  const db = await openGameDb();
  return new Promise((resolve, reject) => {
    let result;
    const tx = db.transaction(DB_STORE, mode);
    const store = tx.objectStore(DB_STORE);
    const request = method === 'get' ? store.get(DB_KEY)
      : method === 'put' ? store.put(value, DB_KEY) : store.delete(DB_KEY);
    request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error || Error('Local game storage failed.')); };
    tx.onabort = () => { db.close(); reject(tx.error || Error('Local game storage was cancelled.')); };
  });
}
function release() {
  if (gba) gba.keypad.currentDown = 0x3ff;
  document.querySelectorAll('.held').forEach(b => b.classList.remove('held'));
}
function pause() {
  if (!ready || !gba) return;
  release(); gba.pause(); $('pause').textContent = 'Resume';
}
function persist() { if (ready && gba && gba.mmu.save) gba.storeSavedata(); }
function checkGame(data) {
  const bytes = new Uint8Array(data);
  if (bytes.byteLength < 0xc0 || bytes.byteLength > 32 * 1024 * 1024)
    throw Error('Select an uncompressed LeafGreen .gba cartridge file (up to 32 MB).');
  const code = String.fromCharCode(...bytes.slice(0xac, 0xb0));
  if (bytes[0xb2] !== 0x96 || !code.startsWith('BPG'))
    throw Error('That is not a recognized Pokémon LeafGreen GBA cartridge file.');
}
async function bootGame(data, fromStorage = false) {
  if (loading) return false;
  loading = true;
  say(fromStorage ? 'Resuming your saved local LeafGreen copy…' : 'Loading LeafGreen…');
  try {
    checkGame(data);
    const firmware = await bios;
    persist(); if (gba) gba.pause();
    if (!gba) {
      gba = new GameBoyAdvance();
      gba.SYS_ID = 'orbit.leafgreen';
      gba.keypad.eatInput = true;
      gba.setCanvas($('screen'));
      gba.logLevel = gba.LOG_ERROR;
      gba.setLogger(() => {
        pause();
        say('The emulator stopped. Reload your game file; saved progress should remain available.');
      });
      window.orbitLeafGreen = gba;
    }
    gba.setBios(firmware);
    if (!gba.setRom(data)) throw Error('The emulator could not open this LeafGreen cartridge.');
    try { await gba.audio.context?.resume(); } catch (_) { /* Audio requires a user gesture in some browsers. */ }
    ready = true;
    $('setup').hidden = true;
    $('player').hidden = false;
    $('pause').textContent = 'Pause';
    gba.runStable();
    say(fromStorage ? 'Your LeafGreen game resumed from this device.' : 'LeafGreen loaded. Your game file stays on this device.');
    return true;
  } catch (error) {
    say(error?.message || 'Unable to start this game.');
    return false;
  } finally { loading = false; }
}
$('rom').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file || loading) return;
  try {
    const data = await file.arrayBuffer();
    if (await bootGame(data)) {
      try {
        await gameStorage('readwrite', 'put', { name: file.name, data });
        say('LeafGreen is running. This browser remembers your locally selected game file for next time.');
      } catch (_) {
        say('LeafGreen is running. Browser storage is unavailable; choose your file again next visit.');
      }
    }
  } catch (error) {
    say(error?.message || 'Could not read the selected game file.');
  } finally { event.target.value = ''; }
});
$('change-rom').onclick = () => $('rom').click();
$('forget-rom').onclick = async () => {
  if (!confirm('Forget the game file stored in this browser? In-game saves are not deleted.')) return;
  try {
    await gameStorage('readwrite', 'delete');
    pause();
    ready = false;
    $('player').hidden = true;
    $('setup').hidden = false;
    say('This browser has forgotten the game file. Choose a LeafGreen .gba file to play again.');
  } catch (error) { say(error?.message || 'Could not remove the stored game file.'); }
};
$('pause').onclick = async () => {
  if (!gba || !ready) return;
  if (gba.paused) {
    try { await gba.audio.context?.resume(); } catch (_) { /* Browser may need a tap. */ }
    gba.runStable(); $('pause').textContent = 'Pause';
  } else pause();
};
$('sound').onclick = async () => {
  if (!gba || !ready) return;
  try { await gba.audio.context?.resume(); } catch (_) {}
  gba.audio.masterEnable = !gba.audio.masterEnable;
  $('sound').textContent = gba.audio.masterEnable ? 'Sound on' : 'Sound off';
  $('sound').setAttribute('aria-pressed', String(gba.audio.masterEnable));
};
$('save').onclick = () => {
  if (!gba || !ready || !gba.mmu.save) {
    say('No save data yet. Save through the game menu first.'); return;
  }
  persist();
  const url = URL.createObjectURL(new Blob([gba.mmu.save.buffer], {type:'application/octet-stream'}));
  const a = document.createElement('a');
  a.href = url; a.download = 'pokemon-leafgreen.sav'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  say('Save exported.');
};
$('load-save').onchange = async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (!gba || !ready || !gba.mmu.save || file.size !== gba.mmu.save.buffer.byteLength)
      throw Error('The save size does not match this game.');
    pause();
    gba.setSavedata(await file.arrayBuffer());
    persist();
    say('Save imported. Restart your game to load the imported save.');
  } catch (error) { say(error?.message || 'Could not import the save.'); }
  event.target.value = '';
};
for (const button of document.querySelectorAll('[data-key]')) {
  const pointers = new Set();
  button.onpointerdown = event => {
    if (!ready || !gba) return;
    event.preventDefault();
    pointers.add(event.pointerId);
    button.setPointerCapture(event.pointerId);
    gba.keypad.currentDown &= ~(1 << gba.keypad[button.dataset.key]);
    button.classList.add('held');
    try { gba.audio.context?.resume(); } catch (_) {}
  };
  for (const type of ['pointerup','pointercancel','lostpointercapture']) {
    button.addEventListener(type, event => {
      pointers.delete(event.pointerId);
      if (!pointers.size && gba) {
        gba.keypad.currentDown |= 1 << gba.keypad[button.dataset.key];
        button.classList.remove('held');
      }
    });
  }
}
window.addEventListener('keydown', () => { try { gba?.audio?.context?.resume(); } catch (_) {} }, { passive: true });
window.addEventListener('blur', () => { pause(); persist(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); persist(); } });
window.addEventListener('pagehide', persist);

gameStorage('readonly', 'get').then(saved => {
  if (saved?.data) bootGame(saved.data, true);
  else say('Choose your locally owned LeafGreen .gba cartridge file to start.');
}).catch(() => say('Choose your locally owned LeafGreen .gba cartridge file to start.'));
})();
