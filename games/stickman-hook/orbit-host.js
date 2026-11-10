// Keep the native game lifecycle running without an external advertising SDK.
(()=>{const noop=()=>{};window.PokiSDK={init:()=>Promise.resolve(),commercialBreak:()=>Promise.resolve(),rewardedBreak:()=>Promise.resolve(false)};
for(const name of ['setDebug','gameLoadingStart','gameLoadingFinished','gameplayStart','gameplayStop','happyTime','displayAd','destroyAd'])PokiSDK[name]=noop;
window.open=()=>null;
document.addEventListener('click',event=>{const a=event.target.closest?.('a[href]');if(!a)return;try{const u=new URL(a.getAttribute('href'),location.href);if(/^https?:$/.test(u.protocol)&&u.origin!==location.origin){event.preventDefault();event.stopImmediatePropagation();}}catch{}},true);
})();
