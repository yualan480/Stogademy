import {LAND_PATHS,SEA_ROUTE,CITIES,CHAPTERS} from './map-data.js?v=1';
(() => {
  const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const xy=(lon,lat)=>[(lon+18)/148*1000,(63-lat)/71*450];
  const base={x:90,y:70,w:850,h:335};
  const roadCoordinates=[[108.94,34.34],[103.8,36.06],[94.66,40.14],[89.2,42.95],[82.96,41.72],[75.99,39.47],[66.96,39.65],[62.18,37.66],[58.8,36.2],[51.4,35.7],[44.37,33.32],[38.27,34.55],[36.16,36.2],[28.98,41.01],[23.32,42.7],[14.5,46.05],[12.5,41.9]];
  const roadPoints=roadCoordinates.map(p=>xy(...p)),road='M'+roadPoints.map(p=>p.map(n=>n.toFixed(2)).join(' ')).join('L');
  const distances=[0];for(let i=1;i<roadPoints.length;i++)distances.push(distances[i-1]+Math.hypot(roadPoints[i][0]-roadPoints[i-1][0],roadPoints[i][1]-roadPoints[i-1][1]));
  const roadLength=distances.at(-1);
  const cityDistances=CITIES.map(c=>{const p=xy(c.lon,c.lat);let nearest=0;for(let i=1;i<roadPoints.length;i++)if(Math.hypot(p[0]-roadPoints[i][0],p[1]-roadPoints[i][1])<Math.hypot(p[0]-roadPoints[nearest][0],p[1]-roadPoints[nearest][1]))nearest=i;return distances[nearest];});
  function node(tag,attrs={},text){const e=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attrs))e.setAttribute(key,value);if(text!==undefined)e.textContent=text;return e;}
  function makeMap(host,explore){
    const svg=node('svg',{viewBox:'90 70 850 335',role:'group','aria-label':explore?'Interactive atlas of the Silk Roads':'Timeline map of Eurasian trading networks'});
    svg.append(node('rect',{x:-500,y:-500,width:2000,height:1600,class:'map-water'}));
    const grid=node('g',{'aria-hidden':'true',class:'map-grid'});for(let x=90;x<1000;x+=70)grid.append(node('path',{d:'M'+x+' 50V500'}));for(let y=70;y<450;y+=55)grid.append(node('path',{d:'M50 '+y+'H1100'}));svg.append(grid);
    const land=node('g',{class:'map-land','aria-hidden':'true'});for(const d of LAND_PATHS)land.append(node('path',{d}));svg.append(land);
    const labels=node('g',{'aria-hidden':'true'});for(const [text,x,y]of[['EUROPE',220,110],['CENTRAL ASIA',590,105],['CHINA',855,230],['INDIAN OCEAN',640,345]])labels.append(node('text',{x,y,class:'map-label'},text));svg.append(labels);
    const sea=node('path',{d:SEA_ROUTE,class:'map-sea-route','aria-hidden':'true'}),roadBase=node('path',{d:road,class:'map-road-base','aria-hidden':'true'}),progress=node('path',{d:road,class:'map-road-progress','aria-hidden':'true'});
    svg.append(sea,roadBase,progress);progress.style.strokeDasharray=String(roadLength);progress.style.strokeDashoffset=explore?'0':String(roadLength);
    const groups=[];
    CITIES.forEach((city,index)=>{
      const [x,y]=xy(city.lon,city.lat),g=node('g',{class:'map-city',tabindex:'0',role:'button','data-city':city.id,'aria-label':'Explore '+city.short,'aria-pressed':'false'});
      g.append(node('circle',{cx:x,cy:y,r:19,class:'hit'}),node('circle',{cx:x,cy:y,r:8,class:'city-halo'}),node('circle',{cx:x,cy:y,r:4,class:'city-dot'}),node('text',{x,y:y+city.dy},city.short));
      g.onclick=()=>explore?selectCity(index,true):jumpChapter(city.chapter);
      g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();g.onclick();}};
      groups.push(g);svg.append(g);
    });
    const marker=node('circle',{r:6,class:'journey-marker','aria-hidden':'true'});svg.append(marker);host.append(svg);
    function markerAt(length){const p=progress.getPointAtLength(clamp(length,0,roadLength));marker.setAttribute('transform','translate('+p.x+' '+p.y+')');}
    markerAt(0);
    return {svg,groups,progress,marker,sea,roadBase,markerAt,highlight(ids){groups.forEach((g,i)=>{const active=ids.includes(CITIES[i].id);g.classList.toggle('is-hot',active);g.setAttribute('aria-pressed',String(active));});},trace(p){progress.style.strokeDashoffset=motion.matches?'0':String(roadLength*(1-p));marker.style.display=motion.matches?'none':'';if(!motion.matches)markerAt(roadLength*p);}};
  }
  const storyMap=makeMap($('story-map'),false),atlas=makeMap($('atlas-map'),true);
  let activeChapter=-1,selected=0,zoom=1,view={...base},pan=null,moveFrame=0,markerLength=0,touring=false,tourFrame=0,tourStarted=0,tourCity=-1;
  const chapters=Array.from(document.querySelectorAll('.chapter'));
  const jumps=CHAPTERS.map((chapter,index)=>{const button=document.createElement('button');button.type='button';button.setAttribute('aria-label','Jump to '+chapter.date+': '+chapter.title);button.onclick=()=>jumpChapter(index);$('chapter-jumps').append(button);return button;});
  function jumpChapter(index){
    const chapter=chapters[clamp(index,0,chapters.length-1)],mobile=innerWidth<=820&&innerHeight>500;
    const offset=mobile?$('story-map').closest('aside').getBoundingClientRect().height+parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--head'))+30:innerHeight*.25;
    scrollTo({top:scrollY+chapter.getBoundingClientRect().top-offset,behavior:motion.matches?'instant':'smooth'});
  }
  function activateChapter(index){
    if(index===activeChapter)return;activeChapter=index;
    chapters.forEach((c,i)=>{c.classList.toggle('is-active',i===index);if(i===index)c.setAttribute('aria-current','step');else c.removeAttribute('aria-current');});
    jumps.forEach((b,i)=>{if(i===index)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
    const data=CHAPTERS[index],year=$('active-year');year.textContent=data.date;year.classList.remove('year-change');void year.offsetWidth;year.classList.add('year-change');
    $('chapter-count').textContent=String(index+1).padStart(2,'0')+' / 09';$('active-places').textContent=data.cities.length===CITIES.length?'A network across Eurasia':data.cities.map(id=>CITIES.find(c=>c.id===id).short).join(' · ');
    storyMap.highlight(data.cities);$('next-chapter').firstChild.textContent=index===CHAPTERS.length-1?'Back to the beginning ':'Next chapter ';
  }
  $('next-chapter').onclick=()=>jumpChapter((activeChapter+1)%CHAPTERS.length);
  let scrollPending=false;
  function updateScroll(){
    scrollPending=false;
    const h=innerHeight,aside=$('story-map').closest('aside').getBoundingClientRect(),mobile=innerWidth<=820&&h>500;
    const focus=mobile?Math.min(h*.85,Math.max(h*.55,aside.bottom+(h-aside.bottom)*.5)):h*.49;
    let nearest=0,best=Infinity;
    for(let i=0;i<chapters.length;i++){const r=chapters[i].getBoundingClientRect(),distance=Math.abs(r.top+r.height*.44-focus);if(distance<best){best=distance;nearest=i;}}
    activateChapter(nearest);
    const first=chapters[0].getBoundingClientRect(),last=chapters.at(-1).getBoundingClientRect(),p=clamp((focus-first.top)/(last.bottom-first.top),0,1);
    $('spine-fill').style.transform='scaleY('+p+')';storyMap.trace(p);
    $('reading-fill').style.transform='scaleX('+clamp(scrollY/Math.max(1,document.documentElement.scrollHeight-h),0,1)+')';
  }
  const scheduleScroll=()=>{if(!scrollPending){scrollPending=true;requestAnimationFrame(updateScroll);}};
  addEventListener('scroll',scheduleScroll,{passive:true});addEventListener('resize',scheduleScroll);
  function updateView(){
    const w=base.w/zoom,h=base.h/zoom;view.w=w;view.h=h;view.x=clamp(view.x,base.x,base.x+base.w-w);view.y=clamp(view.y,base.y,base.y+base.h-h);
    atlas.svg.setAttribute('viewBox',[view.x,view.y,w,h].join(' '));$('atlas-map').dataset.zoom=String(zoom);$('atlas-map').classList.toggle('is-zoomed',zoom>1);$('map-zoom-in').disabled=zoom>=3;$('map-zoom-out').disabled=zoom<=1;
  }
  function setZoom(value){const x=view.x+view.w/2,y=view.y+view.h/2;zoom=clamp(value,1,3);view.x=x-base.w/zoom/2;view.y=y-base.h/zoom/2;updateView();}
  $('map-zoom-in').onclick=()=>setZoom(zoom+.5);$('map-zoom-out').onclick=()=>setZoom(zoom-.5);$('map-reset').onclick=()=>{zoom=1;view={...base};updateView();};
  function svgPoint(event){const p=atlas.svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform(atlas.svg.getScreenCTM().inverse());}
  const mapHost=$('atlas-map');
  mapHost.onpointerdown=e=>{if(e.button>0||zoom===1||e.target.closest('.map-city'))return;const p=svgPoint(e);pan={id:e.pointerId,x:p.x,y:p.y,vx:view.x,vy:view.y};mapHost.setPointerCapture(e.pointerId);mapHost.classList.add('is-panning');e.preventDefault();};
  mapHost.onpointermove=e=>{if(!pan||pan.id!==e.pointerId)return;const p=svgPoint(e);view.x+=pan.x-p.x;view.y+=pan.y-p.y;updateView();};
  for(const name of ['pointerup','pointercancel','lostpointercapture'])mapHost.addEventListener(name,()=>{pan=null;mapHost.classList.remove('is-panning');});
  mapHost.onkeydown=e=>{let handled=true;if(e.key==='+'||e.key==='=')setZoom(zoom+.5);else if(e.key==='-')setZoom(zoom-.5);else if(e.key==='0')$('map-reset').click();else if(zoom>1&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){view.x+=e.key==='ArrowRight'?25:e.key==='ArrowLeft'?-25:0;view.y+=e.key==='ArrowDown'?20:e.key==='ArrowUp'?-20:0;updateView();}else handled=false;if(handled){e.preventDefault();e.stopPropagation();}};
  function moveMarker(target){
    cancelAnimationFrame(moveFrame);if(motion.matches){markerLength=target;atlas.markerAt(target);return;}
    const from=markerLength,start=performance.now();
    function tick(now){const t=clamp((now-start)/1100,0,1),ease=t*t*(3-2*t);markerLength=from+(target-from)*ease;atlas.markerAt(markerLength);if(t<1)moveFrame=requestAnimationFrame(tick);}
    moveFrame=requestAnimationFrame(tick);
  }
  function selectCity(index,animate=true){
    selected=(index+CITIES.length)%CITIES.length;const city=CITIES[selected];
    $('city-name').textContent=city.name;$('city-region').textContent=city.region;$('city-detail').textContent=city.detail;$('city-index').textContent=String(selected+1).padStart(2,'0')+' / 09';$('city-coordinates').textContent=city.lat.toFixed(2)+'° N, '+city.lon.toFixed(2)+'° E';atlas.highlight([city.id]);
    if(animate)moveMarker(cityDistances[selected]);
    if(zoom>1){const p=xy(city.lon,city.lat);view.x=p[0]-view.w/2;view.y=p[1]-view.h/2;updateView();}
  }
  $('city-prev').onclick=()=>{stopTour();selectCity(selected-1);};$('city-next').onclick=()=>{stopTour();selectCity(selected+1);};
  function stopTour(){touring=false;cancelAnimationFrame(tourFrame);$('caravan-tour').setAttribute('aria-pressed','false');$('caravan-tour').innerHTML='<span aria-hidden="true">▷</span> Play caravan';}
  $('caravan-tour').onclick=()=>{
    if(touring){stopTour();return;}touring=true;cancelAnimationFrame(moveFrame);tourStarted=performance.now();tourCity=-1;$('caravan-tour').setAttribute('aria-pressed','true');$('caravan-tour').textContent='Ⅱ Pause caravan';
    function tick(now){
      if(!touring)return;const t=clamp((now-tourStarted)/24000,0,1),length=roadLength*t;let city=0;while(city<CITIES.length-1&&length>=cityDistances[city+1])city++;
      if(city!==tourCity){tourCity=city;selectCity(city,false);}
      markerLength=motion.matches?cityDistances[city]:length;atlas.markerAt(markerLength);
      if(t<1)tourFrame=requestAnimationFrame(tick);else{selectCity(CITIES.length-1,false);stopTour();}
    }tourFrame=requestAnimationFrame(tick);
  };
  document.querySelectorAll('.route-tabs button').forEach(button=>button.onclick=()=>{
    const route=button.dataset.route;document.querySelectorAll('.route-tabs button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    mapHost.dataset.route=route;atlas.sea.style.opacity=route==='land'?'.08':'.8';atlas.roadBase.style.opacity=route==='sea'?'.1':'.25';atlas.progress.style.opacity=route==='sea'?'.12':'1';
  });
  document.documentElement.dataset.theme='light';
  try{localStorage.setItem('silk-road-theme','light');}catch{}
  const menu=$('menuBtn'),nav=$('history-nav');
  menu.onclick=()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));nav.classList.toggle('open',open);};
  nav.querySelectorAll('a').forEach(link=>link.onclick=()=>{nav.classList.remove('open');menu.setAttribute('aria-expanded','false');});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){nav.classList.remove('open');menu.setAttribute('aria-expanded','false');}});
  if('IntersectionObserver'in window&&!motion.matches){document.documentElement.classList.add('js-reveal');const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}});},{threshold:.08});document.querySelectorAll('.reveal').forEach(e=>observer.observe(e));}
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopTour();cancelAnimationFrame(moveFrame);}});
  addEventListener('hashchange',()=>{if(/^#\/(chat|games)$/.test(location.hash))stopTour();});
  motion.addEventListener('change',()=>{stopTour();cancelAnimationFrame(moveFrame);storyMap.trace(1);if(motion.matches)document.documentElement.classList.remove('js-reveal');});
  selectCity(0,false);updateView();updateScroll();
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
