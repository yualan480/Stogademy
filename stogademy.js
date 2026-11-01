'use strict';
// ---- Settings you can change ----
// SHA-256 of the unlock code (default code is set below). To change it, replace this hash with the SHA-256 of your new code.
const CODE_HASH='afe2b11fd4b1968a88cdd65fc26135a548a77db445e2cc080edd23c8131666c7';
// Pages shown after the code is entered. Names are intentionally neutral; rename them however you like.
const EXTRAS=[{name:'Orbit',desc:'Games and chat',ic:'●',view:'chat',src:'chatter/'}];
const TOOLS=[{id:'calc',name:'Calculator',desc:'Graphing, scientific, and advanced math tools.',ic:'🧮',route:'#/calc'},
{id:'study',name:'Study Center',desc:'Flashcards, quizzes, and study guides.',ic:'🗂️',route:'#/study'},{id:'notes',name:'Notes & Writing',desc:'Take notes, write essays, and manage citations.',ic:'📝',route:'#/notes'},
{id:'science',route:'#/science',name:'Science Tools',desc:'Chemistry, physics, and biology resources.',ic:'🧪'},{id:'ap',route:'#/ap',name:'AP & Exam Prep',desc:'AP reviews, practice tests, and timed quizzes.',ic:'🎓'},
{id:'plan',name:'Planner',desc:'Assignments, calendar, and GPA calculator.',ic:'📅',route:'#/plan'},{id:'code',route:'#/code',name:'Coding Lab',desc:'Code editor, projects, and coding challenges.',ic:'💻'},{id:'settings',name:'Settings',desc:'Account and preferences',ic:'⚙️',route:'#/settings',hide:1},
{id:'lib',route:'#/lib',name:'Resource Library',desc:'Educational references, bookmarks, and more.',ic:'📚'}];
const $=id=>document.getElementById(id);
const ls={get(k,d){try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
let favs=ls.get('stg_fav',[]),recent=ls.get('stg_recent',[]);
function el(t,c,x){const e=document.createElement(t);if(c)e.className=c;if(x)e.textContent=x;return e}
const IC={home:'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',calc:'M6 3h12v18H6zM9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01',study:'M12 6c-2-1.5-5-2-8-2v14c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2zM12 6v14',notes:'M4 20l1-4L16 5l3 3L8 19zM14 7l3 3',science:'M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3M8 14h8',ap:'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5',plan:'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',code:'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',lib:'M3 6h6l2 2h10v11H3z',chat:'M4 5h16v11H9l-5 4z',games:'M7 8h10a4 4 0 014 4v2a3 3 0 01-5 2l-1-1H9l-1 1a3 3 0 01-5-2v-2a4 4 0 014-4zM8 10v4M6 12h4M16 11h.01M18 13h.01',star:'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',clock:'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',gear:'M12 9a3 3 0 100 6 3 3 0 000-6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',arrow:'M5 12h14M13 6l6 6-6 6',chev:'M9 6l6 6-6 6',grid:'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',bolt:'M13 2L4 14h7l-1 8 9-12h-7z',search:'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5',sun:'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',bell:'M6 16v-5a6 6 0 0112 0v5l2 2H4zM10 21h4',target:'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8z'};
function ico(n){const NS='http://www.w3.org/2000/svg',v=document.createElementNS(NS,'svg'),p=document.createElementNS(NS,'path');v.setAttribute('viewBox','0 0 24 24');v.setAttribute('class','i');v.setAttribute('aria-hidden','true');p.setAttribute('d',IC[n]||IC.grid);v.append(p);return v}
let times=ls.get('stg_times',{}),goals=ls.get('stg_goals',[['Study for AP Calculus',0],['Finish biology notes',0],['Complete coding project',0],['Read 20 pages',0],['Workout',0]]);
function ago(t){const m=Math.round((Date.now()-t)/6e4);if(m<1)return'just now';if(m<60)return m+' min ago';const h=Math.round(m/60);if(h<24)return h+(h>1?' hours':' hour')+' ago';const d=Math.round(h/24);return d+(d>1?' days':' day')+' ago'}
function tile(n){const s=el('span','tile');s.append(ico(n));return s}
function card(t){const ok=!!t.route,c=el(ok?'a':'div','card c-'+t.id+(ok?'':' off'));if(ok)c.href=t.route;c.append(tile(t.id),el('b','',t.name),el('small','',t.desc));
if(!ok)c.append(el('span','badge','Coming soon'));else{const g=el('span','go');g.append(ico('arrow'));const s=el('button','star',favs.includes(t.id)?'★':'☆');s.setAttribute('aria-label','Favorite '+t.name);s.onclick=e=>{e.preventDefault();favs=favs.includes(t.id)?favs.filter(f=>f!==t.id):[...favs,t.id];ls.set('stg_fav',favs);render()};c.append(g,s)}return c}
function row(t,sub,when){const a=el('a','qrow c-'+t.id),m=el('span','mt');a.href=t.route;m.append(el('b','',t.name),el('small','',sub));a.append(tile(t.id),m);if(when)a.append(el('time','',when));else a.append(ico('chev'));return a}
function navA(h,n,t,on){const a=el('a',on?'on':'');a.href=h;a.append(ico(n),el('span','',t));return a}
function navB(n,t,f){const b=el('button','nb');b.append(ico(n),el('span','',t));b.onclick=f;return b}
function goalsRender(){const d=goals.filter(g=>g[1]).length,s=el('span','',d+'/'+goals.length);s.append(el('small','','goals completed'));$('ring').style.setProperty('--p',goals.length?d/goals.length*100:0);$('ring').replaceChildren(s);
$('goals').replaceChildren(...goals.map(g=>{const l=el('label'),c=el('input'),li=el('li');c.type='checkbox';c.checked=!!g[1];c.onchange=()=>{g[1]=c.checked?1:0;ls.set('stg_goals',goals);goalsRender()};l.append(c,g[0]);li.append(l);return li}))}
function render(){const q=$('search').value.trim().toLowerCase(),list=TOOLS.filter(t=>!t.hide&&(!q||(t.name+' '+t.desc).toLowerCase().includes(q))),ok=ls.get('stg_ok')===1,h=location.hash||'#/',built=TOOLS.filter(t=>t.route&&!t.hide),T=id=>times[id]||0;
$('tools').replaceChildren(...list.map(card));$('none').hidden=list.length>0;
const order=[...new Set([...favs,...[...built].sort((a,b)=>T(b.id)-T(a.id)).map(t=>t.id)])].map(id=>built.find(t=>t.id===id)).filter(Boolean);
$('quick').replaceChildren(...order.map(t=>row(t,T(t.id)?'Last used '+ago(T(t.id)):'Not used yet')));
const act=built.filter(t=>T(t.id)).sort((a,b)=>T(b.id)-T(a.id));
$('act').replaceChildren(...(act.length?act.map(t=>row(t,'Opened in '+t.name,ago(T(t.id)))):[el('p','empty','Nothing yet. Open a tool and it shows up here.')]));
const set=navA('#/settings','gear','Settings',h==='#/settings');const qt=el('div','quote','Small steps every day lead to big results.');qt.append(el('small','','— Stogademy'));
const go=id=>()=>{location.hash='#/';setTimeout(()=>$(id).scrollIntoView({behavior:'smooth'}),60)};
$('nav').replaceChildren(navA('#/','home','Home',h==='#/'),...TOOLS.filter(t=>!t.hide).map(t=>{if(t.route)return navA(t.route,t.id,t.name,h===t.route);const s=el('span','off');s.title='Coming soon';s.append(ico(t.id),el('span','',t.name));return s}),...(false?[el('hr'),...EXTRAS.map(x=>navA('#/'+x.view,x.view,x.name,h==='#/'+x.view))]:[]),el('div','gap'),el('hr'),navB('star','Favorites',go('quick')),navB('clock','Recent activity',go('act')),set,qt);
const ex=$('extras');ex.replaceChildren();if(false){ex.append(el('h3','','More'));const g=el('div','cards');EXTRAS.forEach(x=>{const a=el('a','card c-'+x.view);a.href='#/'+x.view;a.append(tile(x.view),el('b','',x.name),el('small','',x.desc));g.append(a)});ex.append(g)}
goalsRender()}
function route(){const h=location.hash,c=h==='#/calc',X=EXTRAS.find(x=>h==='#/'+x.view);
if(X&&ls.get('stg_ok')!==1){location.hash='#/';return}
const S=TOOLS.find(t=>t.route&&t.route===h);$('home').hidden=!!S||!!X;TOOLS.forEach(t=>{const s=t.route&&$(t.id);if(s)s.hidden=t!==S});$('main').hidden=!!X;document.body.classList.toggle('in-orbit',!!X);
EXTRAS.forEach(x=>{const f=$('f-'+x.view);f.hidden=x!==X;if(x===X&&!f.getAttribute('src')){let u=x.src;try{const w=JSON.parse(sessionStorage.getItem('stg_fwd')||'null');if(w&&w.v===x.view)u+=w.u;sessionStorage.removeItem('stg_fwd')}catch(e){}f.src=u}});$('nav').classList.remove('open');if(S){recent=[S.id,...recent.filter(r=>r!==S.id)].slice(0,4);ls.set('stg_recent',recent);times[S.id]=Date.now();ls.set('stg_times',times)}render()}
async function sha(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
// Called by the calculator whenever ENTER is pressed. Returns true (and unlocks) only for the secret code.
// Not signed in yet: it goes to the same sign-in as the top-right button (auth.js) and Orbit opens when they come back. Already signed in: straight to Orbit.
// Second way in: the same unlock typed as Morse code (SHA-256 of the normalised Morse for the secret number). Letters are separated by a space;
// the usual look-alike dot/dash characters are accepted too.
const MORSE_HASH='472c5b7ed9a012becc4e8aff30acdef07744e73e30e22fa60fa021d6fe1487a3';
const morseNorm=s=>s.replace(/[\u00b7\u2022\u2219]/g,'.').replace(/[\u2212\u2013\u2014\u2012_]/g,'-').replace(/\s+/g,' ').trim();
window.StgUnlock=async src=>{if(!(crypto&&crypto.subtle))return false;const m=morseNorm(src);const byNumber=/^[\d.]{3,12}$/.test(src)&&await sha(src)===CODE_HASH,byMorse=/^[.-]{1,8}( [.-]{1,8})+$/.test(m)&&await sha(m)===MORSE_HASH;if(!byNumber&&!byMorse)return false;ls.set('stg_ok',1);if(window.StgSignIn&&window.StgSignIn())return true;location.hash='#/chat';route();return true};
$('search').oninput=()=>{if(location.hash!=='#/'&&location.hash!=='')location.hash='#/';$('hsearch').value=$('search').value;render()};$('hsearch').oninput=e=>{$('search').value=e.target.value;render()};
addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(location.hash&&location.hash!=='#/')location.hash='#/';setTimeout(()=>{$('hsearch').focus();$('tools').scrollIntoView({behavior:'smooth'})},60)}});
$('gin').onkeydown=e=>{const v=e.target.value.trim();if(e.key==='Enter'&&v){goals.push([v,0]);ls.set('stg_goals',goals);e.target.value='';goalsRender()}};
document.querySelectorAll('[data-i]').forEach(e=>e.append(ico(e.dataset.i)));
$('menuBtn').onclick=()=>$('nav').classList.toggle('open');
{const sd=ls.get('stg_dark',null);document.body.classList.toggle('dark',sd===null?true:!!sd)}
addEventListener('hashchange',route);route();

$('orbx').onclick=()=>{ls.set('stg_ok',0);location.hash='#/';route()};
addEventListener('hashchange',()=>{$('orbx').hidden=!EXTRAS.some(x=>location.hash==='#/'+x.view)});
