// Native game hooks without advertising or external navigation.
window.ShowAbout=()=>{document.getElementById('about').style.display='block';};
window.HideAbout=()=>{document.getElementById('about').style.display='none';};
window.HideAds=()=>window.HideAbout();window.ShowAds=()=>{};window.ShowDisplayAd=()=>{};
window.StartGame=()=>{HideAds();window.paperio2api.startGame();};window.ShowPreroll=window.StartGame;
window.ads={showAds:()=>{}};window.open=()=>null;
document.addEventListener('click',event=>{const a=event.target.closest?.('a[href]');if(!a)return;try{const u=new URL(a.getAttribute('href'),location.href);if(/^https?:$/.test(u.protocol)&&u.origin!==location.origin){event.preventDefault();event.stopImmediatePropagation();}}catch{}},true);
