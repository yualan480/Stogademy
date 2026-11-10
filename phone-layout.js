/* Keep phone dialogs and chat within the visible viewport, including the on-screen keyboard. */
(()=>{
 const media=matchMedia('(max-width:800px), (pointer:coarse) and (max-height:500px)');
 let scheduled=false;
 function update(){scheduled=false;const view=window.visualViewport;
  if(media.matches&&view&&Math.abs(view.scale-1)<0.01&&!document.fullscreenElement){
   document.documentElement.style.setProperty('--phone-height',Math.round(view.height)+'px');
  }else document.documentElement.style.removeProperty('--phone-height');
 }
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(update);}}
 window.visualViewport?.addEventListener('resize',schedule);
 addEventListener('resize',schedule);document.addEventListener('fullscreenchange',schedule);media.addEventListener('change',schedule);update();
})();
