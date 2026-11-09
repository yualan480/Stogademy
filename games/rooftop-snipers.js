(function(){'use strict';const $=id=>document.getElementById(id);if(new URLSearchParams(location.search).get('embed')==='1')document.body.classList.add('embed');
function fail(){ $('status').textContent='The game could not load. Please try again.';$('retry').hidden=false;$('loading').hidden=false;}
$('retry').onclick=()=>location.reload();$('fullscreen').onclick=()=>{const target=$('gameContainer');if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});else target.requestFullscreen?.().catch(()=>{});};
function focus(){const canvas=$('gameContainer').querySelector('canvas');if(canvas){canvas.tabIndex=0;canvas.focus({preventScroll:true});}}
$('gameContainer').addEventListener('pointerdown',focus);addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)&&!e.target.closest('button,a'))e.preventDefault();});
try{if(!window.UnityLoader)throw Error('loader');window.gameInstance=UnityLoader.instantiate('gameContainer','rooftop-snipers/Build/rooftop-snipers.json',{onProgress(instance,p){if(p==='complete'||Number(p)>=1){$('loading').hidden=true;focus();}else{$('progress').value=Number(p)||0;$('status').textContent=`Loading game… ${Math.round((Number(p)||0)*100)}%`;}},Module:{onRuntimeInitialized(){window.rooftopReady=true;$('loading').hidden=true;focus();},onAbort:fail}});}catch(e){fail();}
})();
