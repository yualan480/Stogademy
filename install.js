'use strict';
// "Install as app" button on the Stogademy home page only.
(function(){
  var btn=document.getElementById('installBtn');if(!btn)return;
  var ev=null,done=false;
  var standalone=function(){return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true};
  function show(){btn.hidden=done||standalone()||!(ev||/Chrome\//.test(navigator.userAgent))}
  addEventListener('beforeinstallprompt',function(e){e.preventDefault();ev=e;show()});
  addEventListener('appinstalled',function(){done=true;ev=null;show()});
  btn.onclick=async function(){
    if(ev){var p=ev;ev=null;try{await p.prompt();await p.userChoice}catch(e){}show();return}
    var m=document.getElementById('authmsg');
    if(m){m.textContent='To install: in Chrome, click the install icon at the right end of the address bar (or ⋮ menu → Cast, save, and share → Install page as app). On Android: ⋮ menu → Install app.';m.hidden=false;setTimeout(function(){m.hidden=true},12000)}
  };
  if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(function(){});
  show();
})();
