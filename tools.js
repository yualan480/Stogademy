'use strict';
(()=>{
const $=id=>document.getElementById(id),el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const ls={get(k,d){try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6),DAY=864e5,z=n=>String(n).padStart(2,'0');
const ds=d=>d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate()),dayStart=()=>{const d=new Date();d.setHours(0,0,0,0);return d.getTime()};
const shuf=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const opts=a=>a.map(([v,l])=>{const o=el('option','',l);o.value=v;return o});
function tabs(root){const bs=root.querySelectorAll('.tabs2 button');bs.forEach(b=>b.onclick=()=>{bs.forEach(x=>x.classList.toggle('on',x===b));root.querySelectorAll('.pp').forEach(p=>p.hidden=p.id!==b.dataset.p)})}

/* ================= STUDY CENTER / FLASHCARDS ================= */
(()=>{const root=$('study');
const SV=(d,w)=>'<svg viewBox="0 0 24 24" width="'+(w||18)+'" height="'+(w||18)+'" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+d+'"/></svg>';
const P={back:'M19 12H5M11 6l-6 6 6 6',search:'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5',spark:'M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',trash:'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',grip:'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',img:'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01',up:'M12 16V4M7 9l5-5 5 5M4 20h16',plus:'M12 5v14M5 12h14',prev:'M4 5h16v14H4zM8 15l3-3 2 2 3-4',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z',chev:'M6 9l6 6 6-6'};
root.innerHTML='<div id="fcHome"><div class="fc-top"><h2>Flashcards</h2><button class="fc-pri" id="dnew" type="button">'+SV(P.plus,16)+' Create new set</button></div><div class="fields"><label>Set<select id="dsel"></select></label><button id="dedit" type="button">Edit set</button><button id="ddel" type="button">Delete set</button></div><div id="ddesc" class="muted"></div><div id="dstat" class="muted"></div><div class="btns"><button id="sdue" type="button">Review due cards</button><button id="sall" type="button">Study all cards</button><button id="squiz" type="button">Quiz me</button></div><div id="stage" aria-live="polite"></div><h3>Cards in this set</h3><div id="clist"></div><h3>Quiz history</h3><div id="qlog" class="muted"></div></div>'+
'<div id="fcEdit" hidden><div class="fc-ed" id="eed"><div class="fc-main">'+
'<div class="fc-head"><button class="fc-ic" id="eback" type="button" aria-label="Back to my sets">'+SV(P.back,20)+'</button><h2 id="etitle">Create a new flashcard set</h2><div class="fc-hacts"><button id="ecreate" type="button">Create</button><button class="fc-pri" id="eprac" type="button">Create and practice</button></div></div>'+
'<div class="fc-visw"><span class="fc-eye">'+SV(P.eye,18)+'</span><select id="evis" class="fc-vis" aria-label="Who can see this set" title="Saved on this device"><option value="public">Public</option><option value="private">Private</option></select></div>'+
'<label class="fc-f"><span>Title</span><input id="eti" maxlength="100" placeholder="e.g., Chapter 4: Culture and Religion" autocomplete="off"><i id="etic">0/100</i></label>'+
'<label class="fc-f"><textarea id="ede" maxlength="500" placeholder="Add a description..." aria-label="Description"></textarea><i id="edec">0/500</i></label>'+
'<div class="fc-tools"><button id="eimp" type="button" class="fc-pill">'+SV(P.up,18)+' Import</button><input type="file" id="efile" accept=".txt,.csv,.tsv,text/plain,text/csv" hidden><button id="edia" type="button" class="fc-pill">'+SV(P.plus,18)+' Add diagram <b class="fc-beta">BETA</b></button><span class="grow"></span><label class="fc-sw">Suggestions<input type="checkbox" id="esug" checked><span class="fc-trk"></span></label><button class="fc-ic" id="esea" type="button" title="Search cards" aria-label="Search cards">'+SV(P.search,18)+'</button><button class="fc-ic" id="ecln" type="button" title="Tidy up: trim text, remove empty and duplicate cards" aria-label="Tidy up cards">'+SV(P.spark,18)+'</button><button class="fc-ic" id="eprv" type="button" title="Show or hide the preview" aria-label="Show or hide the preview">'+SV(P.prev,18)+'</button></div>'+
'<input id="eq" class="fc-search" type="search" hidden placeholder="Search cards..." aria-label="Search cards"><div id="erows"></div>'+
'<div class="fc-addbox"><button id="eadd" type="button" class="fc-pill">'+SV(P.plus,20)+' Add another card</button></div><p id="emsg" class="muted" role="status" aria-live="polite"></p></div>'+
'<aside class="fc-side" id="eside"><div class="fc-prev"><h3>Card preview</h3><div class="fc-art" aria-hidden="true"></div><div class="fc-pc"><div><small>Front (term)</small><div id="pfront"></div></div><div><small>Back (definition)</small><div id="pback"></div></div></div></div><div class="fc-tips"><h3>Tips for great flashcards</h3><ul><li>Keep terms short and clear.</li><li>Use concise, specific definitions.</li><li>Add images for visual learning (optional).</li><li>Try to keep a consistent format.</li></ul></div></aside></div></div>';
const INT=[0,1,3,7,14],mk=()=>({id:uid(),name:'My first deck',desc:'',vis:'private',cards:[]});
let decks=ls.get('stg_decks',null)||[mk()],cur=ls.get('stg_deck',decks[0].id),q=[],qi=0,again=new Set();
const persist=()=>{try{localStorage.setItem('stg_decks',JSON.stringify(decks));localStorage.setItem('stg_deck',JSON.stringify(cur));return true}catch(e){return false}};
const save=persist,deck=()=>decks.find(d=>d.id===cur)||(cur=decks[0].id,decks[0]),msg=t=>$('stage').replaceChildren(el('p','muted',t));
const cq=c=>c.q||'(image)',ca=c=>c.a||'(image)';
const face=(c,back)=>{const t=back?c.a:c.q,im=back?c.ai:c.qi,f=[];if(im){const i=el('img','fc-cimg');i.src=im;i.alt='';f.push(i)}if(t)f.push(el('span','',t));return f};
function render(){const d=deck(),t=dayStart(),due=d.cards.filter(c=>c.due<=t).length,mast=d.cards.filter(c=>c.box>=3).length;
$('dsel').replaceChildren(...opts(decks.map(x=>[x.id,x.name+' ('+x.cards.length+')'])));$('dsel').value=d.id;
$('ddesc').textContent=d.desc||'';$('ddesc').hidden=!d.desc;
$('dstat').textContent=d.cards.length?d.cards.length+' cards · '+due+' due today · '+mast+' mastered ('+Math.round(mast/d.cards.length*100)+'%)':'This set is empty. Use “Edit set” or “Create new set” to add cards.';
$('clist').replaceChildren(...d.cards.map(c=>{const r=el('div','row'),e=el('button','','Edit'),x=el('button','','Delete');r.append(el('span','grow',cq(c)+'  →  '+ca(c)),el('span','muted','level '+c.box+'/4'));
e.onclick=()=>{const a=prompt('Term',c.q);if(a===null)return;const b=prompt('Definition',c.a);if(b===null)return;if((a.trim()||c.qi)&&(b.trim()||c.ai)){c.q=a.trim();c.a=b.trim();save();render()}};
x.onclick=()=>{d.cards=d.cards.filter(k=>k!==c);save();render()};r.append(e,x);return r}));
const L=ls.get('stg_quizlog',[]);$('qlog').textContent=L.length?L.map(l=>l.deck+': '+l.score+'/'+l.total+' ('+l.when+')').join('  ·  '):'No quizzes taken yet.'}
$('dsel').onchange=e=>{cur=e.target.value;$('stage').replaceChildren();save();render()};
$('ddel').onclick=()=>{if(!confirm('Delete the set “'+deck().name+'” and all its cards?'))return;decks=decks.filter(d=>d.id!==cur);if(!decks.length)decks=[mk()];cur=decks[0].id;save();render()};
function show(){if(qi>=q.length){msg('Session complete — '+q.length+' cards reviewed.');render();return}
const c=q[qi],card=el('button','fcard'),info=el('div','muted',(qi+1)+' / '+q.length+' · click the card to flip'),row=el('div','btns'),no=el('button','','Need review'),yes=el('button','','Known');let f=false;row.hidden=true;row.append(no,yes);card.replaceChildren(...face(c,false));
card.onclick=()=>{f=!f;card.replaceChildren(...face(c,f));card.classList.toggle('back',f);row.hidden=!f};
no.onclick=()=>{c.box=0;c.due=dayStart();if(!again.has(c.id)){again.add(c.id);q.push(c)}qi++;save();show()};
yes.onclick=()=>{c.box=Math.min(c.box+1,4);c.due=dayStart()+INT[c.box]*DAY;qi++;save();show()};
$('stage').replaceChildren(info,card,row)}
function start(all){const t=dayStart();q=shuf(deck().cards.filter(c=>all||c.due<=t));qi=0;again=new Set();q.length?show():msg(all?'Add some cards first.':'Nothing is due right now. Come back later, or study all cards.')}
function quiz(){const cs=deck().cards;if(cs.length<2)return msg('Add at least 2 cards to take a quiz.');q=shuf(cs);qi=0;let sc=0;
(function ask(){if(qi>=q.length){const L=ls.get('stg_quizlog',[]);L.unshift({deck:deck().name,score:sc,total:q.length,when:new Date().toLocaleDateString()});ls.set('stg_quizlog',L.slice(0,8));msg('Quiz done: '+sc+' / '+q.length+' correct.');render();return}
const c=q[qi],A=ca(c),os=shuf([A,...shuf([...new Set(cs.filter(k=>k!==c).map(ca))].filter(a=>a!==A)).slice(0,3)]),box=el('div'),fb=el('p','muted'),nx=el('button','','Next');nx.hidden=true;
os.forEach(o=>{const b=el('button','opt',o);b.onclick=()=>{box.querySelectorAll('.opt').forEach(x=>{x.disabled=true;if(x.textContent===A)x.classList.add('good')});if(o===A){sc++;fb.textContent='Correct!'}else{b.classList.add('bad');fb.textContent='Not quite. The answer is: '+A}nx.hidden=false};box.append(b)});
nx.onclick=()=>{qi++;ask()};$('stage').replaceChildren(el('p','',(qi+1)+'/'+q.length+'  '+cq(c)),box,fb,nx)})()}
$('sdue').onclick=()=>start(false);$('sall').onclick=()=>start(true);$('squiz').onclick=quiz;

/* ---------- the "Create a new flashcard set" editor ---------- */
let E=null,focusI=0,dragI=-1;
const blank=()=>({id:null,q:'',a:'',qi:'',ai:''}),say=t=>{$('emsg').textContent=t||''};
const counts=()=>{$('etic').textContent=$('eti').value.length+'/100';$('edec').textContent=$('ede').value.length+'/500'};
function shrink(file){return new Promise((ok,no)=>{const fr=new FileReader();fr.onerror=no;fr.onload=()=>{const im=new Image();im.onerror=no;im.onload=()=>{const m=360,s=Math.min(1,m/Math.max(im.width,im.height)),cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(im.width*s));cv.height=Math.max(1,Math.round(im.height*s));const g=cv.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,cv.width,cv.height);g.drawImage(im,0,0,cv.width,cv.height);ok(cv.toDataURL('image/jpeg',.72))};im.src=fr.result};fr.readAsDataURL(file)})}
function pickImg(cb){const i=document.createElement('input');i.type='file';i.accept='image/*';i.onchange=()=>{const f=i.files&&i.files[0];if(f)shrink(f).then(cb,()=>say('Could not read that image.'))};i.click()}
function pv(box,t,im){box.replaceChildren();if(im){const i=el('img');i.src=im;i.alt='';box.append(i)}if(t)box.append(el('span','',t));if(!im&&!t)box.append(el('span','fc-bar'))}
function preview(){const c=E&&(E.cards[focusI]||E.cards[0])||blank();pv($('pfront'),c.q,c.qi);pv($('pback'),c.a,c.ai)}
function filter(){const s=$('eq').value.trim().toLowerCase();root.querySelectorAll('#erows .fc-row').forEach((r,i)=>{const c=E.cards[i];r.hidden=!!s&&!(c.q+' '+c.a).toLowerCase().includes(s)})}
function rows(){$('erows').replaceChildren(...E.cards.map(rowEl));filter()}
function rowEl(c,i){const r=el('div','fc-row'),top=el('div','fc-rtop'),tl=el('span','fc-rtools'),g=el('button','fc-ic fc-sm'),dl=el('button','fc-ic fc-sm');
g.type=dl.type='button';g.innerHTML=SV(P.grip,18);g.title='Drag to reorder';g.setAttribute('aria-label','Drag to reorder card '+(i+1));dl.innerHTML=SV(P.trash,18);dl.title='Delete card';dl.setAttribute('aria-label','Delete card '+(i+1));
tl.append(g,dl);top.append(el('b','fc-num',String(i+1)),tl);
const slot=k=>{const b=el('div','fc-slot'),pk=el('button','fc-img'),x=el('button','fc-x','×');pk.type=x.type='button';x.title='Remove image';x.setAttribute('aria-label','Remove image');
const paint=()=>{pk.replaceChildren();pk.classList.toggle('has',!!c[k]);x.hidden=!c[k];if(c[k]){const im=el('img');im.src=c[k];im.alt='';pk.append(im)}else{pk.insertAdjacentHTML('beforeend',SV(P.img,22));pk.append(el('span','','Add image'))}};
pk.onclick=()=>pickImg(f=>{c[k]=f;E.dirty=true;paint();preview()});x.onclick=()=>{c[k]='';E.dirty=true;paint();preview()};paint();b.append(pk,x);return b};
const sug=el('div','fc-sug');sug.hidden=true;let defIn=null,defCnt=null;
const field=(k,lab,ph)=>{const f=el('div','fc-fld'),l=el('span','',lab),i=el('input'),n=el('i','',c[k].length+'/200');i.maxLength=200;i.placeholder=ph;i.value=c[k];i.autocomplete='off';i.setAttribute('aria-label',lab+' for card '+(i+1));
i.oninput=()=>{c[k]=i.value;n.textContent=i.value.length+'/200';E.dirty=true;preview();filter();if(k==='q')suggest()};f.append(l,i,n);if(k==='a'){defIn=i;defCnt=n}return f};
const suggest=()=>{sug.hidden=true;if(!$('esug').checked||c.a||c.ai||!c.q.trim())return;const t=c.q.trim().toLowerCase();let m=null;for(const d of decks){for(const k of d.cards){if(k.a&&k.id!==c.id&&(k.q||'').trim().toLowerCase()===t){m=k;break}}if(m)break}if(!m)return;
const b=el('button','fc-chip','Use “'+(m.a.length>60?m.a.slice(0,57)+'…':m.a)+'”');b.type='button';b.onclick=()=>{c.a=m.a;defIn.value=m.a;defCnt.textContent=m.a.length+'/200';sug.hidden=true;E.dirty=true;preview()};sug.replaceChildren(el('span','muted','Suggested definition from your other sets: '),b);sug.hidden=false};
const body=el('div','fc-rbody'),t=field('q','Term','Enter term...'),df=field('a','Definition','Enter definition...');
body.append(slot('qi'),t,df,slot('ai'));r.append(top,body,sug);
r.addEventListener('focusin',()=>{focusI=i;preview()});
dl.onclick=()=>{E.cards.splice(i,1);if(!E.cards.length)E.cards.push(blank());E.dirty=true;focusI=Math.min(focusI,E.cards.length-1);rows();preview()};
g.onmousedown=g.ontouchstart=()=>{r.draggable=true};g.onmouseup=()=>{r.draggable=false};
r.ondragstart=e=>{dragI=i;r.classList.add('drag');try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(i))}catch(_){}};
r.ondragover=e=>{if(dragI>=0)e.preventDefault()};
r.ondrop=e=>{e.preventDefault();if(dragI<0||dragI===i)return;const m=E.cards.splice(dragI,1)[0];E.cards.splice(i,0,m);dragI=-1;E.dirty=true;focusI=i;rows();preview()};
r.ondragend=()=>{dragI=-1;r.draggable=false;r.classList.remove('drag')};
return r}
function openEd(d){E={id:d?d.id:null,dirty:false,cards:d&&d.cards.length?d.cards.map(c=>({id:c.id,q:c.q||'',a:c.a||'',qi:c.qi||'',ai:c.ai||''})):[blank(),blank()]};focusI=0;
$('etitle').textContent=d?'Edit flashcard set':'Create a new flashcard set';$('ecreate').textContent=d?'Save':'Create';$('eprac').textContent=d?'Save and practice':'Create and practice';
$('evis').value=d?(d.vis||'private'):'public';$('eti').value=d?d.name:'';$('ede').value=d?(d.desc||''):'';$('eq').value='';$('eq').hidden=true;say('');counts();rows();preview();
$('fcHome').hidden=true;$('fcEdit').hidden=false;window.scrollTo({top:0})}
function closeEd(){$('fcEdit').hidden=true;$('fcHome').hidden=false;E=null;render()}
$('dnew').onclick=()=>openEd(null);$('dedit').onclick=()=>openEd(deck());
$('eback').onclick=()=>{if(E&&E.dirty&&!confirm('Discard your changes to this set?'))return;closeEd()};
$('eti').oninput=$('ede').oninput=()=>{E.dirty=true;counts()};$('evis').onchange=()=>{E.dirty=true};
$('eadd').onclick=()=>{E.cards.push(blank());E.dirty=true;focusI=E.cards.length-1;rows();preview();const ins=root.querySelectorAll('#erows .fc-row');const last=ins[ins.length-1];if(last){last.scrollIntoView({block:'nearest',behavior:'smooth'});const i=last.querySelector('input');i&&i.focus()}};
$('edia').onclick=()=>{const c=blank();E.cards.push(c);focusI=E.cards.length-1;E.dirty=true;rows();pickImg(f=>{c.qi=f;rows();preview()});say('Pick a picture for the front of the new card.')};
$('eimp').onclick=()=>$('efile').click();
$('efile').onchange=async()=>{const f=$('efile').files[0];$('efile').value='';if(!f)return;let txt='';try{txt=await f.text()}catch(e){say('Could not read that file.');return}const add=[];
txt.split(/\r?\n/).forEach(l=>{if(!l.trim())return;let p=l.includes('\t')?l.split('\t'):null;if(!p){const m=l.match(/^\s*"?([^",]*)"?\s*,\s*"?(.*?)"?\s*$/);if(m)p=[m[1],m[2]]}if(!p)p=l.split(/\s+[-–—:]\s+/);if(p.length<2)return;const a=p[0].trim().slice(0,200),b=p.slice(1).join(' ').trim().slice(0,200);if(a&&b&&add.length<500)add.push(Object.assign(blank(),{q:a,a:b}))});
if(!add.length){say('No cards found. Put one card on each line as: term, definition (or separate them with a tab).');return}
E.cards=E.cards.filter(c=>c.q.trim()||c.a.trim()||c.qi||c.ai).concat(add);E.dirty=true;focusI=0;rows();preview();say('Imported '+add.length+' card'+(add.length===1?'':'s')+'.')};
$('esea').onclick=()=>{$('eq').hidden=!$('eq').hidden;if(!$('eq').hidden)$('eq').focus();else{$('eq').value='';filter()}};$('eq').oninput=filter;
$('eprv').onclick=()=>{$('eside').classList.toggle('off');$('eed').classList.toggle('noside',$('eside').classList.contains('off'))};
$('ecln').onclick=()=>{const seen=new Set(),before=E.cards.length;let out=[];E.cards.forEach(c=>{c.q=c.q.trim();c.a=c.a.trim();if(!c.q&&!c.a&&!c.qi&&!c.ai)return;const k=c.q.toLowerCase()+'|'+c.a.toLowerCase();if(!c.qi&&!c.ai&&seen.has(k))return;seen.add(k);out.push(c)});while(out.length<2)out.push(blank());E.cards=out;E.dirty=true;focusI=0;rows();preview();const n=before-out.filter(c=>c.q||c.a||c.qi||c.ai).length;say(n>0?'Tidied up: removed '+n+' empty or duplicate card'+(n===1?'':'s')+'.':'Everything already looks tidy.')};
function commit(practice){const name=$('eti').value.trim();if(!name){say('Give your set a title first.');$('eti').focus();return}
const keep=[],rowsEl=root.querySelectorAll('#erows .fc-row');for(let i=0;i<E.cards.length;i++){const c=E.cards[i],f=!!(c.q.trim()||c.qi),b=!!(c.a.trim()||c.ai);if(!f&&!b)continue;if(!f||!b){say('Card '+(i+1)+' needs both a term and a definition.');const r=rowsEl[i];if(r){r.hidden=false;const ins=r.querySelectorAll('input.fc-in,.fc-fld input');(f?ins[1]:ins[0]).focus()}return}keep.push(c)}
if(!keep.length){say('Add at least one card with a term and a definition.');return}
const snap=JSON.stringify(decks),cu=cur;let d=E.id&&decks.find(x=>x.id===E.id);if(!d){d={id:uid(),name:name,desc:'',vis:'public',cards:[]};decks.push(d)}
d.name=name;d.desc=$('ede').value.trim();d.vis=$('evis').value;const old=new Map(d.cards.map(c=>[c.id,c]));
d.cards=keep.map(c=>{const o=c.id&&old.get(c.id);return{id:o?o.id:uid(),q:c.q.trim(),a:c.a.trim(),qi:c.qi||'',ai:c.ai||'',box:o?o.box:0,due:o?o.due:dayStart()}});cur=d.id;
if(!persist()){decks=JSON.parse(snap);cur=cu;say('This browser has run out of storage for the site. Remove some images or cards and try again.');return}
const n=d.cards.length;E.dirty=false;closeEd();$('stage').replaceChildren();if(practice)start(true);else msg('Saved “'+name+'” with '+n+' card'+(n===1?'':'s')+'.')}
$('ecreate').onclick=()=>commit(false);$('eprac').onclick=()=>commit(true);
render()})();

/* ================= NOTES & WRITING ================= */
(()=>{const root=$('notes');
root.innerHTML='<h2>Notes &amp; Writing</h2><div class="nlay"><div class="nside"><input id="nq" type="search" placeholder="Search notes…" aria-label="Search notes"><select id="nf" aria-label="Filter notes"></select><button id="nnew">+ New note</button><div id="nlist"></div></div><div id="ned" hidden><div class="fields"><label>Title<input id="nt"></label><label>Folder<input id="nfo" placeholder="e.g. History"></label><label>Tags (comma separated)<input id="ntg"></label></div><div class="btns" id="ntool"><button data-c="bold"><b>B</b></button><button data-c="italic"><i>I</i></button><button data-c="underline"><u>U</u></button><button data-c="h">Heading</button><button data-c="insertUnorderedList">• List</button><button data-c="insertOrderedList">1. List</button><button data-c="chk">☑ Checkbox</button></div><div id="nbody" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Note body"></div><div id="nstat" class="muted"></div><div class="btns"><button id="nfav">☆ Favorite</button><button id="ndup">Duplicate</button><button id="nexp">Export .html</button><button id="nxt">Export .txt</button><button id="ndel">Delete</button></div></div></div>';
let notes=ls.get('stg_notes',[]),cur=null,tm=0;const save=()=>ls.set('stg_notes',notes),find=()=>notes.find(n=>n.id===cur);
function clean(h){const t=document.createElement('template');t.innerHTML=h;t.content.querySelectorAll('script,style,iframe,object,embed,link,meta,form,base').forEach(n=>n.remove());t.content.querySelectorAll('*').forEach(n=>[...n.attributes].forEach(a=>{if(/^on/i.test(a.name)||/^\s*javascript:/i.test(a.value))n.removeAttribute(a.name)}));return t.innerHTML}
const txt=h=>{const t=document.createElement('template');t.innerHTML=clean(h);return t.content.textContent||''},esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function stats(){const t=$('nbody').innerText.trim(),w=t?t.split(/\s+/).length:0;$('nstat').textContent=w+' words · '+t.length+' characters · about '+(w?Math.max(1,Math.ceil(w/200)):0)+' min read'}
function list(){const q=$('nq').value.toLowerCase(),sel=$('nf'),keep=sel.value||'all',fs=[...new Set(notes.map(n=>n.folder).filter(Boolean))];
sel.replaceChildren(...opts([['all','All notes'],['fav','★ Favorites'],...fs.map(x=>['f:'+x,'📁 '+x])]));sel.value=[...sel.options].some(o=>o.value===keep)?keep:'all';const F=sel.value;
const sh=notes.filter(n=>(F==='all'||(F==='fav'&&n.fav)||F==='f:'+n.folder)&&(!q||(n.title+' '+n.tags+' '+n.folder+' '+txt(n.html)).toLowerCase().includes(q))).sort((a,b)=>b.t-a.t);
$('nlist').replaceChildren(...(sh.length?sh.map(n=>{const b=el('button','nitem'+(n.id===cur?' on':''),(n.fav?'★ ':'')+(n.title||'Untitled'));b.onclick=()=>open(n.id);return b}):[el('p','muted',notes.length?'No matching notes.':'No notes yet. Click “New note”.')]))}
function open(id){cur=id;const n=find();if(!n)return;$('ned').hidden=false;$('nt').value=n.title;$('nfo').value=n.folder;$('ntg').value=n.tags;$('nbody').innerHTML=clean(n.html);$('nfav').textContent=n.fav?'★ Favorited':'☆ Favorite';stats();list()}
function touch(){const n=find();if(!n)return;n.title=$('nt').value;n.folder=$('nfo').value.trim();n.tags=$('ntg').value;n.html=clean($('nbody').innerHTML);n.t=Date.now();save();stats();clearTimeout(tm);tm=setTimeout(list,400)}
['nt','nfo','ntg','nbody'].forEach(i=>$(i).addEventListener('input',touch));
$('nbody').addEventListener('click',e=>{if(e.target.matches('input[type=checkbox]')){e.target.toggleAttribute('checked',e.target.checked);touch()}});
$('ntool').querySelectorAll('button').forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=()=>{const c=b.dataset.c;$('nbody').focus();if(c==='h')document.execCommand('formatBlock',false,'h2');else if(c==='chk')document.execCommand('insertHTML',false,'<input type="checkbox"> ');else document.execCommand(c);touch()}});
$('nnew').onclick=()=>{const n={id:uid(),title:'',html:'',tags:'',folder:'',fav:false,t:Date.now()};notes.push(n);save();open(n.id);$('nt').focus()};
$('nfav').onclick=()=>{const n=find();if(!n)return;n.fav=!n.fav;$('nfav').textContent=n.fav?'★ Favorited':'☆ Favorite';save();list()};
$('ndup').onclick=()=>{const n=find();if(!n)return;const c={...n,id:uid(),title:(n.title||'Untitled')+' (copy)',t:Date.now()};notes.push(c);save();open(c.id)};
$('ndel').onclick=()=>{const n=find();if(!n||!confirm('Delete this note?'))return;notes=notes.filter(k=>k!==n);cur=null;save();$('ned').hidden=true;list()};
function dl(name,type,body){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([body],{type}));a.download=name.replace(/[^\w\- ]+/g,'').trim()||'note';document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
$('nexp').onclick=()=>{const n=find();if(n)dl((n.title||'note')+'.html','text/html','<!doctype html><meta charset="utf-8"><title>'+esc(n.title||'Untitled')+'</title><h1>'+esc(n.title||'Untitled')+'</h1>'+clean(n.html))};
$('nxt').onclick=()=>{const n=find();if(n)dl((n.title||'note')+'.txt','text/plain',(n.title||'Untitled')+'\n\n'+$('nbody').innerText)};
$('nq').oninput=list;$('nf').onchange=list;list()})();

/* ================= PLANNER ================= */
(()=>{const root=$('plan');
root.innerHTML='<h2>Planner</h2><div class="tabs2"><button data-p="p-as" class="on">Assignments</button><button data-p="p-gpa">GPA calculator</button><button data-p="p-gr">Grade calculator</button><button data-p="p-tm">Focus timer</button></div>'+
'<div id="p-as" class="pp"><div class="fields"><label>Assignment<input id="at"></label><label>Course<input id="ac" placeholder="e.g. AP Bio"></label><label>Priority<select id="ap"><option>Medium</option><option>High</option><option>Low</option></select></label><label>Due<input id="ad" type="date"></label><button id="aadd">Add</button></div><div class="fields small"><label>Class<select id="fc"></select></label><label>Show<select id="fs"><option value="open">Open</option><option value="overdue">Overdue</option><option value="done">Completed</option><option value="all">All</option></select></label></div><div id="asum" class="muted"></div><div id="alist"></div></div>'+
'<div id="p-gpa" class="pp" hidden><p class="muted">Choose each course’s letter grade, credits and level. The weighted GPA adds a bonus for Honors (+0.5) and AP (+1.0); schools differ, so treat this as an estimate.</p><div id="grows"></div><div class="btns"><button id="gadd">+ Add course</button><button id="gcalc">Calculate</button></div><pre id="gout"></pre></div>'+
'<div id="p-gr" class="pp" hidden><p class="muted">Enter each category’s weight (%) and your average score (%). If all weights are 0 you get a plain average.</p><div id="crows"></div><div class="btns"><button id="cadd2">+ Add category</button><button id="ccalc">Calculate</button></div><pre id="cout"></pre></div>'+
'<div id="p-tm" class="pp" hidden><div class="fields small"><label>Focus (min)<input id="tf" type="number" min="1" max="120" value="25"></label><label>Break (min)<input id="tb" type="number" min="1" max="60" value="5"></label></div><div id="tdisp" class="big">25:00</div><div id="tmode" class="muted">Focus</div><div class="btns"><button id="tgo">Start</button><button id="trs">Reset</button></div></div>';
tabs(root);
let A=ls.get('stg_assign',[]);const sv=()=>ls.set('stg_assign',A);
function ar(){const t=ds(new Date()),sel=$('fc'),keep=sel.value||'all',od=a=>!a.done&&a.due&&a.due<t;
sel.replaceChildren(...opts([['all','All classes'],...[...new Set(A.map(a=>a.course).filter(Boolean))].map(c=>[c,c])]));sel.value=[...sel.options].some(o=>o.value===keep)?keep:'all';
$('asum').textContent=A.filter(od).length+' overdue · '+A.filter(a=>!a.done&&!od(a)).length+' upcoming · '+A.filter(a=>a.done).length+' completed';
const S=$('fs').value,C=sel.value,PR={High:0,Medium:1,Low:2},k=a=>a.due||'9';
const L=A.filter(a=>(C==='all'||a.course===C)&&(S==='all'||(S==='done'&&a.done)||(S==='open'&&!a.done)||(S==='overdue'&&od(a)))).sort((a,b)=>k(a)<k(b)?-1:k(a)>k(b)?1:PR[a.pri]-PR[b.pri]);
$('alist').replaceChildren(...(L.length?L.map(a=>{const r=el('div','row'+(od(a)?' late':'')),cb=el('input'),e=el('button','','Edit'),x=el('button','','Delete');cb.type='checkbox';cb.checked=!!a.done;cb.setAttribute('aria-label','Mark done: '+a.title);cb.onchange=()=>{a.done=cb.checked;sv();ar()};
e.onclick=()=>{const n=prompt('Assignment',a.title);if(n&&n.trim()){a.title=n.trim();sv();ar()}};x.onclick=()=>{A=A.filter(i=>i!==a);sv();ar()};
r.append(cb,el('span','grow'+(a.done?' done':''),a.title),el('span','muted',[a.course,a.pri,a.due?'due '+a.due:'no date'].filter(Boolean).join(' · ')+(od(a)?' · OVERDUE':'')),e,x);return r}):[el('p','muted','Nothing here.')]))}
$('aadd').onclick=()=>{const t=$('at').value.trim();if(!t)return $('at').focus();A.push({id:uid(),title:t,course:$('ac').value.trim(),pri:$('ap').value,due:$('ad').value,done:false});$('at').value='';sv();ar();$('at').focus()};
$('at').onkeydown=e=>{if(e.key==='Enter')$('aadd').click()};$('fc').onchange=$('fs').onchange=ar;ar();
const G={'A+':4,'A':4,'A-':3.7,'B+':3.3,'B':3,'B-':2.7,'C+':2.3,'C':2,'C-':1.7,'D+':1.3,'D':1,'F':0},BON={Regular:0,Honors:.5,AP:1};
function grow(){const r=el('div','row'),g=el('select'),cr=el('input'),lv=el('select'),x=el('button','','✕');Object.keys(G).forEach(k=>g.append(new Option(k)));Object.keys(BON).forEach(k=>lv.append(new Option(k)));cr.type='number';cr.value=1;cr.min=0;cr.step=.5;cr.style.width='80px';g.setAttribute('aria-label','Grade');cr.setAttribute('aria-label','Credits');lv.setAttribute('aria-label','Level');x.setAttribute('aria-label','Remove course');x.onclick=()=>r.remove();r.append(g,cr,lv,x);$('grows').append(r)}
$('gadd').onclick=grow;for(let i=0;i<4;i++)grow();
$('gcalc').onclick=()=>{let c=0,u=0,w=0;[...$('grows').children].forEach(r=>{const[g,cr,lv]=r.children,p=G[g.value],n=parseFloat(cr.value);if(!(n>0))return;c+=n;u+=p*n;w+=(p+(p>0?BON[lv.value]:0))*n});$('gout').textContent=c?'Unweighted GPA: '+(u/c).toFixed(2)+'\nWeighted GPA:   '+(w/c).toFixed(2)+'\nCredits counted: '+c+'\n(An estimate on a standard 4.0 scale. Your school’s official GPA may differ.)':'Add at least one course with credits above 0.'};
function crow(){const r=el('div','row'),n=el('input'),w=el('input'),s=el('input'),x=el('button','','✕');n.placeholder='Category (Tests)';w.type=s.type='number';w.placeholder='Weight %';s.placeholder='Score %';w.min=s.min=0;n.setAttribute('aria-label','Category');w.setAttribute('aria-label','Weight percent');s.setAttribute('aria-label','Score percent');x.setAttribute('aria-label','Remove category');x.onclick=()=>r.remove();r.append(n,w,s,x);$('crows').append(r)}
$('cadd2').onclick=crow;for(let i=0;i<3;i++)crow();
$('ccalc').onclick=()=>{const R=[...$('crows').children].map(r=>({w:parseFloat(r.children[1].value)||0,s:parseFloat(r.children[2].value)})).filter(r=>!isNaN(r.s));if(!R.length){$('cout').textContent='Enter at least one score.';return}
const W=R.reduce((a,r)=>a+r.w,0);if(!W){$('cout').textContent='Average: '+(R.reduce((a,r)=>a+r.s,0)/R.length).toFixed(2)+'%  (no weights given)';return}
$('cout').textContent='Weighted grade: '+(R.reduce((a,r)=>a+r.w*r.s,0)/W).toFixed(2)+'%'+(W!==100?'\nNote: weights add up to '+W+'%, so they were scaled to 100%.':'')};
let T=null,left=1500,focus=true,endAt=0;const draw=()=>{$('tdisp').textContent=z(Math.floor(left/60))+':'+z(left%60);$('tmode').textContent=focus?'Focus':'Break time!'},mins=id=>Math.max(1,Math.min(120,+$(id).value||1))*60;
function tick(){left=Math.max(0,Math.round((endAt-Date.now())/1000));if(!left){focus=!focus;left=mins(focus?'tf':'tb');endAt=Date.now()+left*1000}draw()}
$('tgo').onclick=()=>{if(T){clearInterval(T);T=null;$('tgo').textContent='Resume'}else{endAt=Date.now()+left*1000;T=setInterval(tick,500);$('tgo').textContent='Pause'}};
$('trs').onclick=()=>{clearInterval(T);T=null;focus=true;left=mins('tf');$('tgo').textContent='Start';draw()};})();
})();
