'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const cities = [
    {name:'Chang’an / Xi’an',label:'Chang’an',region:'China',lon:108.94,lat:34.34,detail:'A major imperial capital and an eastern hub. Silk and other goods moved west through a chain of markets and intermediaries.'},
    {name:'Dunhuang',label:'Dunhuang',region:'China · Gansu corridor',lon:94.66,lat:40.14,detail:'Near the edge of the Taklamakan Desert, this oasis connected travelers with routes around the desert. The Mogao Caves preserve evidence of Buddhist art and cultural exchange.'},
    {name:'Kashgar',label:'Kashgar',region:'Central Asian crossroads',lon:75.99,lat:39.47,detail:'At the western edge of the Tarim Basin, routes met before travelers crossed mountain passes toward Central and South Asia. Markets and oasis settlements made difficult journeys possible.'},
    {name:'Samarkand',label:'Samarkand',region:'Central Asia · present-day Uzbekistan',lon:66.96,lat:39.65,detail:'A major oasis city associated with Sogdian merchants. Their trading networks, languages and communities helped connect markets across Central Asia and China.'},
    {name:'Baghdad',label:'Baghdad',region:'West Asia · present-day Iraq',lon:44.37,lat:33.32,detail:'Founded in the eighth century, the Abbasid capital became a center of commerce and scholarship, linked to routes across West Asia and the Indian Ocean.'},
    {name:'Constantinople',label:'Constantinople',region:'Mediterranean · present-day Istanbul',lon:28.98,lat:41.01,detail:'At the meeting of land and sea routes, the Byzantine capital linked Mediterranean markets with goods arriving through West and Central Asia.'}
  ];
  let selected=0;
  function selectCity(index) {
    selected=(index+cities.length)%cities.length;
    const city=cities[selected];$('city-name').textContent=city.name;$('city-region').textContent=city.region;$('city-detail').textContent=city.detail;
    $('map-pins').querySelectorAll('button').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===selected)));
  }
  cities.forEach((city,index)=>{
    const button=document.createElement('button');button.type='button';button.className='pin';
    button.style.left=((city.lon+18)/148*100)+'%';button.style.top=((63-city.lat)/71*100)+'%';
    button.setAttribute('aria-label','Explore '+city.name);button.setAttribute('aria-pressed',String(index===0));
    const label=document.createElement('span');label.textContent=city.label;button.append(label);
    button.onclick=()=>selectCity(index);$('map-pins').append(button);
  });
  $('city-prev').onclick=()=>selectCity(selected-1);$('city-next').onclick=()=>selectCity(selected+1);
  document.querySelectorAll('.tabs button').forEach(button=>button.onclick=()=>{
    $('route-map').dataset.route=button.dataset.route;
    document.querySelectorAll('.tabs button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  });
  const menu=$('menuBtn'),nav=$('history-nav');
  menu.onclick=()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));nav.classList.toggle('open',open);};
  nav.querySelectorAll('a').forEach(link=>link.onclick=()=>{nav.classList.remove('open');menu.setAttribute('aria-expanded','false');});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){nav.classList.remove('open');menu.setAttribute('aria-expanded','false');}});

  // Keep the existing Morse sequence and Orbit's same-origin session gate.
  const MORSE_HASH='472c5b7ed9a012becc4e8aff30acdef07744e73e30e22fa60fa021d6fe1487a3';
  const normalize=s=>String(s).replace(/[\u00b7\u2022\u2219]/g,'.').replace(/[\u2212\u2013\u2014\u2012_]/g,'-').replace(/\s+/g,' ').trim();
  function unlocked(){try{return localStorage.getItem('stg_ok')==='1';}catch{return false;}}
  let messageTimer=0;
  function message(text){$('orbit-message').textContent=text;$('orbit-message').hidden=false;clearTimeout(messageTimer);messageTimer=setTimeout(()=>$('orbit-message').hidden=true,5000);}
  function openRoute(){
    const view=location.hash==='#/chat'?'chat':location.hash==='#/games'?'games':null;
    if(view&&!unlocked()){history.replaceState(null,'',location.pathname+location.search);return openRoute();}
    $('home').hidden=!!view;$('orbx').hidden=!view;document.body.classList.toggle('in-orbit',!!view);
    for(const name of ['chat','games']){
      const frame=$('f-'+name);frame.hidden=name!==view;
      if(name===view&&!frame.getAttribute('src')){
        let src=name==='chat'?'chatter/':'games/';
        try{const pending=JSON.parse(sessionStorage.getItem('stg_fwd')||'null');if(pending?.v===name){src+=pending.u||'';sessionStorage.removeItem('stg_fwd');}}catch{}
        frame.src=src;
      }else if(name!==view&&frame.getAttribute('src'))frame.removeAttribute('src');
    }
  }
  window.StgUnlock=async source=>{
    const code=normalize(source);
    if(!/^[.-]{1,8}( [.-]{1,8})+$/.test(code)||!globalThis.crypto?.subtle)return false;
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code));
    const hash=Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
    if(hash!==MORSE_HASH)return false;
    try{localStorage.setItem('stg_ok','1');}catch{message('Allow site storage to open this destination.');return false;}
    location.hash='#/chat';openRoute();return true;
  };
  $('orbx').onclick=()=>{try{localStorage.setItem('stg_ok','0');}catch{}location.hash='#top';openRoute();};
  // Preserve an OAuth return for Orbit without loading the retired study dashboard.
  if(unlocked()&&(location.hash.startsWith('#access_token=')||new URLSearchParams(location.search).has('code'))){
    try{sessionStorage.setItem('stg_fwd',JSON.stringify({v:'chat',u:location.search+location.hash}));history.replaceState(null,'',location.pathname+'#/chat');}catch{}
  }
  addEventListener('hashchange',openRoute);openRoute();
})();
