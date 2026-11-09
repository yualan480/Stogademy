(function(){'use strict';
 if(new URLSearchParams(location.search).get('embed')==='1')document.body.classList.add('embed');
 document.getElementById('fullscreen').addEventListener('click',()=>{
  const action=document.fullscreenElement?document.exitFullscreen?.():document.documentElement.requestFullscreen?.();
  action?.catch(()=>{});
 });
})();
