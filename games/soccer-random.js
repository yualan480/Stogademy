(function(){'use strict';const $=id=>document.getElementById(id);if(new URLSearchParams(location.search).get('embed')==='1')document.body.classList.add('embed');let timer;
$('retry').onclick=()=>location.reload();function fail(){if(window.soccerReady)return;$('status').textContent='The game could not load. Please try again.';$('retry').hidden=false;}
window.addEventListener('error',e=>{if(/soccer-random|box2d|c3runtime/.test(e.filename||''))fail();});
window.addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();});
const watch=setInterval(()=>{const runtime=window.c3_runtimeInterface?._GetLocalRuntime?.();if(runtime&&window.c3canvas&&runtime.GetMainRunningLayout?.()){window.soccerReady=true;$('loading').hidden=true;clearInterval(watch);clearTimeout(timer);window.c3canvas.tabIndex=0;window.c3canvas.focus({preventScroll:true});}},100);timer=setTimeout(()=>{if(!window.soccerReady){clearInterval(watch);fail();}},60000);
})();
