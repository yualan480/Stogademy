(function(){'use strict';
 if(new URLSearchParams(location.search).get('embed')==='1')document.body.classList.add('embed');
 const dialog=document.getElementById('showdown-help');
 for(const id of['help','embedded-help'])document.getElementById(id).onclick=()=>dialog.showModal();
 document.getElementById('help-close').onclick=()=>dialog.close();
 document.getElementById('fullscreen').onclick=()=>{
  const action=document.fullscreenElement?document.exitFullscreen?.():document.documentElement.requestFullscreen?.();action?.catch(()=>{});
 };
})();
