'use strict';
// Motion+ : a thin progress line on page changes. Adds it on hash changes (site) and when a view enters (Orbit).
(function(){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches&&!document.documentElement.classList.contains('force-motion'))return;
  var bar=document.createElement('i');bar.id='mp-bar';bar.setAttribute('aria-hidden','true');
  function add(){document.body&&document.body.appendChild(bar)}
  if(document.body)add();else addEventListener('DOMContentLoaded',add);
  var t=0;
  function go(){clearTimeout(t);bar.classList.remove('go');void bar.offsetWidth;bar.classList.add('go');t=setTimeout(function(){bar.classList.remove('go')},700)}
  addEventListener('hashchange',go);
  if(window.MutationObserver){
    new MutationObserver(function(l){for(var i=0;i<l.length;i++){var e=l[i].target;if(e.classList&&e.classList.contains('pg-in')&&(l[i].oldValue||'').indexOf('pg-in')<0){go();return}}})
      .observe(document.documentElement,{attributes:true,attributeFilter:['class'],attributeOldValue:true,subtree:true});
  }
})();
