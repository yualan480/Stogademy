/* Stogademy cursor settings: style + colour, saved in this browser (key stg_cursor) and shared by every page.
   The hover cursor keeps the chosen style but swaps the arrow for a pointing finger. */
(function(){'use strict';
var BASE=(function(){try{return new URL('.',document.currentScript.src).href}catch(e){return''}})();
var KEY='stg_cursor',SKEY='stg_shop_cursor',STYLES=[['planet','Planet (default)'],['solid','Solid'],['outline','Outline'],['neon','Neon glow'],['glass','Glass']],
COLORS=['#3b82f6','#7c3aed','#ec4899','#ef4444','#f59e0b','#22c55e','#14b8a6','#ffffff','#111827'];
var ARROW='M5 3V24.5L10.4 19.6L14 28L18.2 26.2L14.7 17.9L21.8 17.9Z',
HAND='M10.6 6.2C10.6 4.5 11.9 3.2 13.5 3.2S16.4 4.5 16.4 6.2V13C16.8 12.7 17.3 12.5 17.9 12.5C19 12.5 19.9 13.2 20.1 14.2C20.5 13.9 21 13.8 21.5 13.8C22.6 13.8 23.5 14.5 23.7 15.5C24 15.3 24.4 15.2 24.9 15.2C26.2 15.2 27.2 16.2 27.2 17.5V22.2C27.2 25.9 24.5 28.8 20.7 28.8H17.8C15.2 28.8 13.4 27.6 12.1 25.8L7 18.8C6.4 17.9 6.6 16.7 7.5 16.1C8.4 15.5 9.5 15.7 10.1 16.5L10.6 17.2Z';
function get(){try{var o=JSON.parse(localStorage.getItem(KEY));if(o&&typeof o==='object')return{style:o.style||'planet',color:/^#[0-9a-f]{6}$/i.test(o.color)?o.color:COLORS[0]}}catch(e){}return{style:'planet',color:COLORS[0]}}
function shade(hex,p){var n=parseInt(hex.slice(1),16),r=n>>16,g=n>>8&255,b=n&255,f=function(c){return Math.max(0,Math.min(255,Math.round(p<0?c*(1+p):c+(255-c)*p)))};return'#'+[f(r),f(g),f(b)].map(function(c){return('0'+c.toString(16)).slice(-2)}).join('')}
function svg(d,st,c){var id='g'+Math.random().toString(36).slice(2,6),defs='',fill=c,stroke='#ffffff',sw=1.6,fx='';
 if(st==='outline'){fill='none';stroke=c;sw=2.2}
 else if(st==='neon'){fill=shade(c,-.82);stroke=shade(c,.35);sw=1.8;fx='<filter id="f" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'}
 else if(st==='glass'){defs='<linearGradient id="'+id+'" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="'+shade(c,.55)+'"/><stop offset=".55" stop-color="'+c+'"/><stop offset="1" stop-color="'+shade(c,-.35)+'"/></linearGradient>';fill='url(#'+id+')';stroke='#ffffffdd'}
 var halo=st==='outline'?'<path d="'+d+'" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="4.6" stroke-linejoin="round"/>':'';
 var gloss=st==='glass'?'<path d="'+d+'" fill="#fff" fill-opacity=".18" clip-path="inset(0 0 55% 0)"/>':'';
 var body='<path d="'+d+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+sw+'" stroke-linejoin="round" stroke-linecap="round"'+(st==='neon'?' filter="url(#f)"':'')+'/>';
 return'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><defs>'+defs+fx+'</defs>'+(st==='solid'||st==='glass'?'<path d="'+d+'" fill="#000" fill-opacity=".28" transform="translate(.8 1.2)"/>':'')+halo+body+gloss+'</svg>'}
function url(s,x,y,fb){return'url("data:image/svg+xml,'+encodeURIComponent(s)+'") '+x+' '+y+','+fb}
/* a cursor bought in the Orbit Shop (saved by chatter/shop-cursors.js) wins over the settings below. Only a data: picture is accepted. */
function shopCur(){try{var o=JSON.parse(localStorage.getItem(SKEY)),ok=/^url\("data:image\/svg\+xml,[^"]*"\) \d+ \d+,(auto|pointer)$/;if(o&&ok.test(o.a)&&ok.test(o.p))return o}catch(e){}return null}
function apply(o){o=o||get();var r=document.documentElement.style,sc=shopCur();
 if(sc){r.setProperty('--cur-arrow',sc.a);r.setProperty('--cur-pointer',sc.p);return}
 if(o.style==='planet'){if(!BASE){r.removeProperty('--cur-arrow');r.removeProperty('--cur-pointer');return}r.setProperty('--cur-arrow','url("'+BASE+'cursor-arrow.png") 4 3,auto');r.setProperty('--cur-pointer',url(svg(HAND,'glass','#3b82f6'),13,3,'pointer'));return}
 r.setProperty('--cur-arrow',url(svg(ARROW,o.style,o.color),5,3,'auto'));r.setProperty('--cur-pointer',url(svg(HAND,o.style,o.color),13,3,'pointer'))}
function set(o){var n=Object.assign(get(),o);try{localStorage.setItem(KEY,JSON.stringify(n))}catch(e){}apply(n);return n}
/* settings controls, reused by Orbit and the main site. Returns an element. */
function panel(){var st=get(),base=/\/(chatter|games)\//.test(location.pathname)?'../':'',w=document.createElement('div');w.className='curset';
 var sel=document.createElement('select');sel.setAttribute('aria-label','Cursor style');
 STYLES.forEach(function(s){var o=document.createElement('option');o.value=s[0];o.textContent=s[1];sel.appendChild(o)});sel.value=st.style;
 var row=document.createElement('div');row.style.cssText='display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:.5rem 0';
 var pv=document.createElement('div');pv.style.cssText='display:flex;gap:10px;align-items:center;margin-top:.4rem;padding:8px 12px;border-radius:10px;background:#8080801f;width:max-content';pv.setAttribute('aria-hidden','true');
 function draw(){var s=st.style==='planet'?null:st.style;pv.innerHTML=s?svg(ARROW,s,st.color)+svg(HAND,s,st.color):'<img src="'+base+'cursor-arrow.png" width="32" height="32" alt="">'+svg(HAND,'glass','#3b82f6');
  row.style.opacity=s?1:.45;Array.prototype.forEach.call(row.querySelectorAll('button'),function(b){b.style.outline=s&&b.dataset.c===st.color?'2px solid currentColor':'none';b.style.outlineOffset='2px'})}
 function pick(c){if(st.style==='planet')st.style=sel.value='solid';st.color=c;cp.value=c;st=set(st);draw()}
 var cp=document.createElement('input');cp.type='color';cp.value=st.color;cp.setAttribute('aria-label','Custom cursor color');cp.style.cssText='width:34px;height:30px;padding:0;border:0;background:none';cp.oninput=function(){pick(cp.value)};
 COLORS.forEach(function(c){var b=document.createElement('button');b.type='button';b.dataset.c=c;b.setAttribute('aria-label','Cursor color '+c);b.style.cssText='width:28px;height:28px;padding:0;border-radius:50%;border:1px solid #8888;background:'+c;b.onclick=function(){pick(c)};row.appendChild(b)});
 row.appendChild(cp);
 sel.onchange=function(){st.style=sel.value;st=set(st);draw()};
 var lab=document.createElement('label');lab.textContent='Cursor style';lab.appendChild(sel);
 var l2=document.createElement('div');l2.className='muted';l2.style.cssText='margin-top:.6rem;font-size:13px';l2.textContent='Cursor color. Over buttons and links you get the same style as a pointing finger.';
 w.appendChild(lab);w.appendChild(l2);w.appendChild(row);w.appendChild(pv);
 if(shopCur()){var l3=document.createElement('div');l3.style.cssText='margin-top:.6rem;font-size:13px;font-weight:600';l3.textContent='A cursor from the Orbit Shop is equipped, so it is used instead of these. Take it off in the Orbit Shop to use these again.';w.insertBefore(l3,lab)}
 draw();return w}
window.StgCursor={get:get,set:set,apply:apply,panel:panel,STYLES:STYLES,COLORS:COLORS};
apply();
addEventListener('storage',function(e){if(e.key===KEY||e.key===SKEY)apply()});
})();
