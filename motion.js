'use strict';
// Stogademy motion: small helpers for the CSS animations (scroll reveal, page enter, parallax, particles).
// All visual work is CSS (opacity/transform); this file only adds classes and a few CSS variables.
(function(){
  var root=document.documentElement,$=function(i){return document.getElementById(i)};
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var conn=navigator.connection||{};
  var lite=(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=2)||(navigator.deviceMemory&&navigator.deviceMemory<=2)||conn.saveData===true;
  if(lite)root.classList.add('lite');
  var narrow=matchMedia('(max-width:760px)').matches;

  // boot screen cleanup
  var boot=$('boot');if(boot)boot.addEventListener('animationend',function(e){if(e.animationName==='bootOut')boot.remove()});

  // drifting particles
  var fx=$('fx');
  if(fx&&!reduce&&!lite){
    var n=narrow?6:14,f=document.createDocumentFragment();
    for(var i=0;i<n;i++){var p=document.createElement('i');p.className='fxp';
      p.style.cssText='--x:'+(Math.random()*100).toFixed(1)+'%;--s:'+(2+Math.random()*2.5).toFixed(1)+'px;--dur:'+(26+Math.random()*30).toFixed(0)+'s;--del:-'+(Math.random()*40).toFixed(0)+'s;--dx:'+((Math.random()*120-60)).toFixed(0)+'px';
      f.appendChild(p)}
    fx.appendChild(f);
  }

  // ---- scroll reveal / staggered entrance ----
  var quietUntil=0,fastUntil=0,io=null;
  if('IntersectionObserver' in window&&!reduce){
    io=new IntersectionObserver(function(entries){
      var vis=entries.filter(function(e){return e.isIntersecting}).sort(function(a,b){return a.boundingClientRect.top-b.boundingClientRect.top||a.boundingClientRect.left-b.boundingClientRect.left});
      var fast=Date.now()<fastUntil;
      vis.forEach(function(e,idx){
        var t=e.target;io.unobserve(t);
        t.style.setProperty('--d',fast?'0ms':Math.min(idx*70,420)+'ms');
        t.classList.add('in');
        setTimeout(function(){t.classList.remove('rv','rvf','noanim');t.style.removeProperty('--d')},fast?500:1300);
      });
    },{threshold:.08,rootMargin:'0px 0px -5% 0px'});
    root.classList.add('mo');
  }
  function mark(el){
    if(!io||!el||el.nodeType!==1||el.classList.contains('rv')||el.classList.contains('in'))return;
    el.classList.add('rv');
    if(Date.now()<quietUntil){el.classList.add('noanim','in');setTimeout(function(){el.classList.remove('rv','noanim')},60);return}
    if(Date.now()<fastUntil)el.classList.add('rvf');
    io.observe(el);
  }
  function markAll(sel,scope){(scope||document).querySelectorAll(sel).forEach(mark)}
  markAll('#home .mbanner,#home .fhead,#home .feats a,#home .pillbar,#home .sh,#home .row2 .panel,#home footer');
  markAll('#tools>.card,#quick>.qrow,#act>*');
  if(io&&window.MutationObserver){
    var mo=new MutationObserver(function(list){list.forEach(function(m){m.addedNodes.forEach(function(n){if(n.nodeType===1)mark(n)})})});
    ['tools','quick','act'].forEach(function(id){var e=$(id);if(e)mo.observe(e,{childList:true})});
  }
  // clicks that re-render the dashboard (favorites, goals) should not replay the entrance
  document.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('.star'))quietUntil=Date.now()+500},true);
  document.addEventListener('input',function(e){if(e.target.id==='search'||e.target.id==='hsearch')fastUntil=Date.now()+700},true);

  // checkbox pop: the list is rebuilt on change, so re-find the box by position
  document.addEventListener('change',function(e){
    var t=e.target;if(!t.closest||!t.closest('#goals'))return;
    var idx=[].indexOf.call($('goals').querySelectorAll('input'),t);quietUntil=Date.now()+500;
    setTimeout(function(){var b=$('goals').querySelectorAll('input')[idx];if(b){b.classList.add('pop');setTimeout(function(){b.classList.remove('pop')},450)}},0);
  },true);

  // ---- page transitions ----
  var links=[].slice.call(document.querySelectorAll('.tl a'));
  function onRoute(first){
    var h=location.hash||'#/';
    links.forEach(function(a){a.classList.toggle('on',a.getAttribute('href')===h&&h!=='#/')});
    var fr=document.querySelector('.frame:not([hidden])');
    root.classList.toggle('paused',!!fr);
    if(first)return;
    var s=document.querySelector('main>section:not([hidden])');
    if(s){s.classList.remove('pg-in');void s.offsetWidth;s.classList.add('pg-in');setTimeout(function(){s.classList.remove('pg-in')},700)}
    if(h==='#/'||h===''){var r=$('ring');if(r&&!reduce){var v=r.style.getPropertyValue('--p');r.style.setProperty('--p',0);void r.offsetWidth;r.style.setProperty('--p',v||0)}}
  }
  addEventListener('hashchange',function(){onRoute(false)});onRoute(true);

  // ---- banner parallax (mouse + scroll), only while visible ----
  var ban=$('mbanner');
  if(ban&&io&&!reduce&&!lite&&matchMedia('(pointer:fine)').matches){
    var px=0,py=0,sy=0,raf=0,seen=true;
    new IntersectionObserver(function(e){seen=e[0].isIntersecting}).observe(ban);
    function paint(){raf=0;ban.style.setProperty('--px',px.toFixed(3));ban.style.setProperty('--py',py.toFixed(3));ban.style.setProperty('--sy',sy.toFixed(3))}
    function ask(){if(seen&&!raf)raf=requestAnimationFrame(paint)}
    addEventListener('pointermove',function(e){px=(e.clientX/innerWidth-.5)*2;py=(e.clientY/innerHeight-.5)*2;ask()},{passive:true});
    addEventListener('scroll',function(){sy=Math.min(Math.max(scrollY/320,0),1);ask()},{passive:true});
  }
})();
