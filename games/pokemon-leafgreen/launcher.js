(()=>{'use strict';
const $=id=>document.getElementById(id),status=$('status');let gba=null,ready=false,loading=false;
const bios=fetch('resources/bios.bin').then(r=>{if(!r.ok)throw Error('Emulator could not load. Refresh and try again.');return r.arrayBuffer();});bios.catch(()=>{});
function say(message){status.textContent=message;}
function release(){if(gba)gba.keypad.currentDown=0x3ff;document.querySelectorAll('.held').forEach(b=>b.classList.remove('held'));}
function pause(){if(!ready)return;release();gba.pause();$('pause').textContent='Resume';}
function persist(){if(ready&&gba.mmu.save)gba.storeSavedata();}
$('rom').addEventListener('change',async e=>{
const file=e.target.files[0];if(!file||loading)return;
if(!/\.gba$/i.test(file.name)||file.size<192||file.size>32*1024*1024){say('Choose an uncompressed LeafGreen .gba file, up to 32 MB.');return;}
loading=true;say('Loading your game…');
try{
 const data=await file.arrayBuffer(),bytes=new Uint8Array(data),code=String.fromCharCode(...bytes.slice(0xac,0xb0));
 if(bytes[0xb2]!==0x96||!code.startsWith('BPG'))throw Error('This file is not a recognized Pokémon LeafGreen cartridge. Choose your original .gba file.');
 const firmware=await bios;persist();if(gba)gba.pause();
 if(!gba){gba=new GameBoyAdvance();gba.SYS_ID='orbit.leafgreen';gba.keypad.eatInput=true;gba.setCanvas($('screen'));gba.logLevel=gba.LOG_ERROR;gba.setLogger(()=>{pause();say('The emulator stopped. Try reloading your game file; your saved progress is kept.');});window.orbitLeafGreen=gba;}
 gba.setBios(firmware);if(!gba.setRom(data))throw Error('The emulator could not read this game file.');
 await gba.audio.context?.resume();ready=true;$('player').hidden=false;$('pause').textContent='Pause';gba.runStable();say('Game loaded. Your file stays on this device.');
}catch(error){say(error.message);}finally{loading=false;e.target.value='';}
});
$('pause').onclick=async()=>{if(gba.paused){await gba.audio.context?.resume();gba.runStable();$('pause').textContent='Pause';}else pause();};
$('sound').onclick=()=>{gba.audio.masterEnable=!gba.audio.masterEnable;$('sound').textContent=gba.audio.masterEnable?'Sound on':'Sound off';$('sound').setAttribute('aria-pressed',String(gba.audio.masterEnable));};
$('save').onclick=()=>{if(!gba.mmu.save){say('No save data yet. Save through the game’s menu first.');return;}persist();const url=URL.createObjectURL(new Blob([gba.mmu.save.buffer],{type:'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download='pokemon-leafgreen.sav';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('Save exported.');};
$('load-save').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(!gba.mmu.save||file.size!==gba.mmu.save.buffer.byteLength)throw Error('The save size does not match this game.');pause();gba.setSavedata(await file.arrayBuffer());persist();say('Save imported. Reload your game file to start from the imported save.');}catch(error){say(error.message);}e.target.value='';};
for(const button of document.querySelectorAll('[data-key]')){const pointers=new Set();button.onpointerdown=e=>{e.preventDefault();pointers.add(e.pointerId);button.setPointerCapture(e.pointerId);gba.keypad.currentDown&=~(1<<gba.keypad[button.dataset.key]);button.classList.add('held');};for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,e=>{pointers.delete(e.pointerId);if(!pointers.size){gba.keypad.currentDown|=1<<gba.keypad[button.dataset.key];button.classList.remove('held');}});}
window.addEventListener('blur',()=>{pause();persist();});document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();persist();}});window.addEventListener('pagehide',persist);
})();
