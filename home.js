'use strict';
// Home page extras: "View all tools" toggle (the grid shows the first five tools, like the design), hero search + buttons.
(function(){
  var $=function(i){return document.getElementById(i)};
  var tools=$('tools'),vall=$('vall'),hs=$('hsearch'),head=$('toolsHead'),open=false;
  if(!tools||!vall||!hs)return;
  function jump(){if(head)head.scrollIntoView({behavior:'smooth',block:'start'})}
  function sync(){
    var q=hs.value.trim(),lab=vall.querySelector('span');
    tools.classList.toggle('all',open||!!q);
    lab.textContent=open?'Show fewer':'View all tools';
    vall.setAttribute('aria-expanded',open?'true':'false');
    vall.hidden=!!q;
  }
  vall.addEventListener('click',function(){open=!open;sync()});
  hs.addEventListener('input',sync);
  hs.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();jump()}});
  var go=$('hgo');if(go)go.addEventListener('click',function(){if(hs.value.trim())jump();else hs.focus()});
  var ex=$('exploreBtn');if(ex)ex.addEventListener('click',function(){open=true;sync();jump()});
  sync();
})();
