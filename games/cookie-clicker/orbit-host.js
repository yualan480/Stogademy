// Keep play inside Orbit and preserve progress when leaving the player.
(()=>{
const save=()=>{try{if(window.Game?.ready)Game.WriteSave();}catch{}};
addEventListener('pagehide',save);addEventListener('beforeunload',save);
document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});
window.open=()=>null;
document.addEventListener('click',event=>{const a=event.target.closest?.('a[href]');if(!a)return;try{const url=new URL(a.getAttribute('href'),location.href);if(/^https?:$/.test(url.protocol)&&url.origin!==location.origin){event.preventDefault();event.stopImmediatePropagation();}}catch{}},true);
})();
