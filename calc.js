'use strict';
const MathEngine=(()=>{
let deg=true,ans=0,lastV=0;const V={};
const fact=n=>{if(n<0||n!==Math.floor(n)||n>170)throw Error('Domain error');let r=1;for(let i=2;i<=n;i++)r*=i;return r};
const rad=v=>deg?v*Math.PI/180:v,back=v=>deg?v*180/Math.PI:v;
const F={sin:v=>Math.sin(rad(v)),cos:v=>Math.cos(rad(v)),tan:v=>Math.tan(rad(v)),asin:v=>back(Math.asin(v)),acos:v=>back(Math.acos(v)),atan:v=>back(Math.atan(v)),sinh:Math.sinh,cosh:Math.cosh,tanh:Math.tanh,ln:Math.log,log:Math.log10,sqrt:Math.sqrt,abs:Math.abs,exp:Math.exp,floor:Math.floor,ceil:Math.ceil,round:Math.round,fact,ncr:(n,r)=>fact(n)/(fact(r)*fact(n-r)),npr:(n,r)=>fact(n)/fact(n-r),max:Math.max,min:Math.min,mod:(a,b)=>a-b*Math.floor(a/b)};
const C={pi:Math.PI,e:Math.E},known=k=>k in F||k in C||k==='x'||k==='ans'||/^[a-df-wyz]$/.test(k);
function split(id){const o=[];while(id){let k=id.length;while(k>0&&!known(id.slice(0,k)))k--;if(!k)throw Error('Unknown: '+id);o.push(id.slice(0,k));id=id.slice(k)}return o}
function compile(src){
const s=src.toLowerCase().replace(/π/g,'pi').replace(/√/g,'sqrt').replace(/[×·]/g,'*').replace(/÷/g,'/').replace(/−/g,'-');
const T=[],re=/\s*(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+|[a-z]+|[-+*/^(),!%])/y;let p=0,m;
while(s.slice(p).trim()){re.lastIndex=p;m=re.exec(s);if(!m)throw Error('Syntax error');/^[a-z]/.test(m[1])?T.push(...split(m[1])):T.push(m[1]);p=re.lastIndex}
let i=0;const pk=()=>T[i],nx=()=>T[i++],isN=t=>t&&/^[\d.]/.test(t),isI=t=>t&&/^[a-z]/.test(t);
function expr(){let a=term();while(pk()==='+'||pk()==='-'){const o=nx(),b=term(),l=a;a=o==='+'?v=>l(v)+b(v):v=>l(v)-b(v)}return a}
function term(){let a=un();for(;;){const t=pk();let o;if(t==='*'||t==='/')o=nx();else if(isN(t)||isI(t)||t==='(')o='*';else break;const b=un(),l=a;a=o==='*'?v=>l(v)*b(v):v=>l(v)/b(v)}return a}
function un(){if(pk()==='-'){nx();const a=un();return v=>-a(v)}if(pk()==='+'){nx();return un()}return pw()}
function pw(){let a=post();if(pk()==='^'){nx();const b=un(),l=a;a=v=>Math.pow(l(v),b(v))}return a}
function post(){let a=prim();while(pk()==='!'||pk()==='%'){const o=nx(),l=a;a=o==='!'?v=>fact(l(v)):v=>l(v)/100}return a}
function prim(){const t=nx();if(t===undefined)throw Error('Syntax error');
if(isN(t)){const n=parseFloat(t);if(isNaN(n))throw Error('Syntax error');return()=>n}
if(t==='('){const a=expr();if(nx()!==')')throw Error('Missing )');return a}
if(isI(t)){if(t in F){if(nx()!=='(')throw Error('Syntax error');const A=[];if(pk()!==')'){do{A.push(expr())}while(pk()===','&&nx())}if(nx()!==')')throw Error('Missing )');const f=F[t];return v=>f(...A.map(g=>g(v)))}
if(t==='x')return v=>v;if(t==='ans')return()=>ans;if(/^[a-df-wyz]$/.test(t))return()=>V[t]||0;const c=C[t];return()=>c}
throw Error('Syntax error')}
const f=expr();if(i<T.length)throw Error('Syntax error');return f}
const fmt=n=>Number.isInteger(n)&&Math.abs(n)<1e15?String(n):String(Number(n.toPrecision(12)));
function evaluate(src){const r=compile(src)(0);if(typeof r!=='number'||isNaN(r))throw Error('Domain error');if(!isFinite(r))throw Error('Divide by 0 / overflow');ans=lastV=r;return fmt(r)}
function frac(v){if(Number.isInteger(v))return String(v);const sg=v<0?-1:1;let x=Math.abs(v),a=Math.floor(x),h1=1,h0=a,k1=0,k0=1,f=x-a;
for(let n=0;n<30&&f>1e-12&&k0<=10000;n++){const r=1/f;a=Math.floor(r);f=r-a;[h1,h0]=[h0,a*h0+h1];[k1,k0]=[k0,a*k0+k1]}
return Math.abs(h0/k0-x)<1e-9*Math.max(1,x)&&k0<=10000?`${sg*h0}/${k0}`:'No exact fraction (approx. '+fmt(v)+')'}
function solve(src,lo,hi){const P=src.split('='),a=compile(P[0]),b=compile(P[1]||'0'),h=x=>a(x)-b(x),N=4000,R=[];let x0=lo,y0=h(x0);
for(let i=1;i<=N;i++){const x1=lo+(hi-lo)*i/N,y1=h(x1);if(isFinite(y0)&&isFinite(y1)&&(y0===0||y0*y1<0)){let l=x0,r=x1;for(let k=0;k<60;k++){const mid=(l+r)/2;(h(l)*h(mid)<=0)?r=mid:l=mid}const root=(l+r)/2;if(Math.abs(h(root))<1e-6*Math.max(1,Math.abs(y0),Math.abs(y1))+1e-9&&!R.some(q=>Math.abs(q-root)<1e-7))R.push(root)}x0=x1;y0=y1}return R}
const num=l=>l.split(/[\s,]+/).filter(Boolean).map(Number);
function stats(l){const d=num(l);if(!d.length||d.some(isNaN))throw Error('Enter numbers separated by spaces or commas');const n=d.length,s=[...d].sort((a,b)=>a-b),sum=d.reduce((a,b)=>a+b,0),mean=sum/n,ss=d.reduce((a,b)=>a+(b-mean)**2,0),q=p=>{const i=(n-1)*p,f=Math.floor(i);return s[f]+(s[Math.min(f+1,n-1)]-s[f])*(i-f)};
return{n,sum,mean,median:q(.5),min:s[0],Q1:q(.25),Q3:q(.75),max:s[n-1],'sample SD':n>1?Math.sqrt(ss/(n-1)):NaN,'population SD':Math.sqrt(ss/n)}}
function regress(xs,ys){const X=num(xs),Y=num(ys),n=X.length;if(n<2||n!==Y.length)throw Error('Lists must be the same length (2+)');const mx=X.reduce((a,b)=>a+b)/n,my=Y.reduce((a,b)=>a+b)/n;let sxy=0,sxx=0,syy=0;X.forEach((x,i)=>{sxy+=(x-mx)*(Y[i]-my);sxx+=(x-mx)**2;syy+=(Y[i]-my)**2});if(!sxx||!syy)throw Error('No variation in data');const a=sxy/sxx;return{'y = ax + b':`a = ${fmt(a)}, b = ${fmt(my-a*mx)}`,r:fmt(sxy/Math.sqrt(sxx*syy))}}
function M(t){const r=t.trim().split('\n').map(l=>num(l));if(!r.length||r.some(q=>q.length!==r[0].length||q.some(isNaN)))throw Error('Matrix must be rectangular numbers');return r}
const sq=A=>{if(A.length!==A[0].length)throw Error('Matrix must be square')};
function det(A){sq(A);A=A.map(r=>[...r]);const n=A.length;let d=1;for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(A[r][c])>Math.abs(A[p][c]))p=r;if(Math.abs(A[p][c])<1e-12)return 0;if(p!==c){[A[p],A[c]]=[A[c],A[p]];d=-d}d*=A[c][c];for(let r=c+1;r<n;r++){const f=A[r][c]/A[c][c];for(let k=c;k<n;k++)A[r][k]-=f*A[c][k]}}return d}
function inv(A){sq(A);const n=A.length;if(Math.abs(det(A))<1e-12)throw Error('Matrix is singular (no inverse)');const B=A.map((r,i)=>[...r,...r.map((_,j)=>+(i===j))]);for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(B[r][c])>Math.abs(B[p][c]))p=r;[B[p],B[c]]=[B[c],B[p]];const d=B[c][c];B[c]=B[c].map(v=>v/d);for(let r=0;r<n;r++)if(r!==c){const f=B[r][c];B[r]=B[r].map((v,k)=>v-f*B[c][k])}}return B.map(r=>r.slice(n))}
const mul=(A,B)=>{if(A[0].length!==B.length)throw Error('Columns of A must equal rows of B');return A.map(r=>B[0].map((_,j)=>r.reduce((s,v,k)=>s+v*B[k][j],0)))};
const add=(A,B)=>{if(A.length!==B.length||A[0].length!==B[0].length)throw Error('Matrices must be the same size');return A.map((r,i)=>r.map((v,j)=>v+B[i][j]))};
const T=A=>A[0].map((_,j)=>A.map(r=>r[j])),show=A=>A.map(r=>r.map(v=>fmt(Math.round(v*1e10)/1e10)).join('  ')).join('\n');
return{compile,evaluate,frac,solve,stats,regress,M,det,inv,mul,add,T,show,fmt,store:(n,v)=>{V[n.toLowerCase()]=v},setDeg:v=>deg=v,isDeg:()=>deg,last:()=>lastV}})();
if(typeof module!=='undefined')module.exports=MathEngine;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>{
const $=id=>document.getElementById(id),E=MathEngine,ex=$('expr');
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b));document.querySelectorAll('.pane').forEach(p=>p.hidden=p.id!==b.dataset.t);if(b.dataset.t==='t-graph')draw()});
const SPEC=['y=|top|statplot|||#y','window|top|tblset|||#win','zoom|top|format|||#zoom','trace|top|calc|||#trace','graph|top|table|||#graph',
'2nd|b||||#2nd','mode||quit|#home||#mode','del||ins|#na||#del','alpha|g|A-lock|||#alpha','X,T,θ,n||link|#na||=x','stat||list|#na||#stat',
'math||test|#na|A|#math','apps||angle|#na|B|#na','prgm||draw|#na|C|#na','vars||distr|#na||#na','clear|||||#clear',
'x⁻¹||matrix|#mat|D|=^-1','sin||sin⁻¹|=asin(|E|=sin(','cos||cos⁻¹|=acos(|F|=cos(','tan||tan⁻¹|=atan(|G|=tan(','^||π|=π|H|=^',
'x²||√|=sqrt(|I|=^2',',||EE|=e|J|=,','(||{|#na|K|=(',')||}|#na|L|=)','÷||e|=e|M|=/',
'log||10ˣ|=10^(|N|=log(','7|n|u|#na|O|=7','8|n|v|#na|P|=8','9|n|w|#na|Q|=9','×||[|#na|R|=*',
'ln||eˣ|=exp(|S|=ln(','4|n|L4|#na|T|=4','5|n|L5|#na|U|=5','6|n|L6|#na|V|=6','−||]|#na|W|=-',
'sto→||rcl|#na|X|#sto','1|n|L1|#na|Y|=1','2|n|L2|#na|Z|=2','3|n|L3|#na||=3','+||mem|#na||=+',
'on||off|#na||#on','0|n|catalog|#na||=0','.|n|i|#na||=.','(−)||ans|=ans||=-','enter||entry|#entry||#enter'];
let sec=false,alp=false,ents=[],hi=0;const H=$('hist'),sbr=$('sbar');
const sbar=t=>{sbr.textContent=t||('NORMAL FLOAT AUTO REAL '+(E.isDeg()?'DEGREE':'RADIAN')+' MP'+(sec?'  [2nd]':'')+(alp?'  [ALPHA]':''))};
function flash(t){sbar(t);setTimeout(()=>sbar(),1400)}
function ins(t){ex.focus();const s=ex.selectionStart??ex.value.length;ex.setRangeText(t,s,ex.selectionEnd??s,'end')}
function push(l,r,err){const a=document.createElement('div'),b=document.createElement('div');a.className='li';a.textContent=l;b.className='lr'+(err?' le':'');b.textContent=r;H.append(a,b);H.scrollTop=H.scrollHeight;while(H.children.length>60)H.firstChild.remove()}
async function run(){const src=ex.value.trim();if(!src)return;if(window.StgUnlock&&await window.StgUnlock(src)){ex.value='';return}
ents.push(src);hi=ents.length;
try{const p=src.split(/→|->/);if(p.length===2&&/^\s*[a-df-wyz]\s*$/i.test(p[1])){const r=E.evaluate(p[0]);E.store(p[1].trim(),E.last());push(src,r)}else push(src,E.evaluate(src))}catch(e){push(src,e.message,1)}
ex.value=''}
const tab=id=>document.querySelector('.tabs button[data-t="'+id+'"]').click();
const MENU=['abs(','round(','floor(','ceil(','fact(','ncr(','npr(','mod(','max(','min(','▸Frac (last answer)'];
function cmd(c){switch(c){
case'na':return flash('Not available');
case'2nd':sec=!sec;alp=false;return sbar();case'alpha':alp=!alp;sec=false;return sbar();
case'enter':return run();case'entry':ex.value=ents[ents.length-1]||'';return ex.focus();
case'clear':ex.value='';return ex.focus();case'del':ex.value=ex.value.slice(0,-1);return ex.focus();
case'mode':E.setDeg(!E.isDeg());return sbar();case'home':location.hash='#/';return;
case'y':tab('t-graph');return $('y1').focus();case'win':tab('t-graph');return $('xmin').focus();
case'zoom':tab('t-graph');return $('zstd').click();case'trace':tab('t-graph');return $('cv').scrollIntoView({block:'nearest'});
case'graph':tab('t-graph');return $('plot').click();case'stat':return tab('t-stats');case'mat':return tab('t-mat');
case'sto':return ins('→');case'on':H.replaceChildren();ex.value='';return ex.focus();
case'math':{const m=$('mmenu');m.hidden=!m.hidden;return}}}
function key(s){const [lb,cl,l2,a2,al,a1]=s.split('|');
if(lb==='2nd'||lb==='alpha')return cmd(a1.slice(1));
let a=a1;if(alp){alp=false;sbar();if(/^[A-Z]$/.test(al))return ins(al.toLowerCase());return flash('Not available')}
if(sec){sec=false;sbar();a=a2||'#na'}
a[0]==='='?ins(a.slice(1)):cmd(a.slice(1))}
const KB=$('keys');SPEC.forEach(s=>{const [lb,cl,l2,a2,al]=s.split('|'),d=document.createElement('div'),b=document.createElement('button');d.className='k '+cl;if(l2){const x=document.createElement('span');x.className='l2';x.textContent=l2;d.append(x)}if(al){const x=document.createElement('span');x.className='la';x.textContent=al;d.append(x)}
b.textContent=lb;b.setAttribute('aria-label',lb+(l2?' (2nd: '+l2+')':''));b.onclick=()=>key(s);d.append(b);KB.append(d)});
const dp=document.createElement('div');dp.className='dpad';[['u','▲'],['d','▼'],['l','◀'],['r','▶']].forEach(([c,t])=>{const b=document.createElement('button');b.className=c;b.textContent=t;b.setAttribute('aria-label','Arrow '+c);b.onclick=()=>{ex.focus();const p=ex.selectionStart;if(c==='l')ex.setSelectionRange(Math.max(0,p-1),Math.max(0,p-1));else if(c==='r')ex.setSelectionRange(p+1,p+1);else{hi=Math.min(ents.length,Math.max(0,hi+(c==='u'?-1:1)));ex.value=ents[hi]||''}};dp.append(b)});KB.insertBefore(dp,KB.children[8]);
MENU.forEach(t=>{const b=document.createElement('button');b.textContent=t;b.onclick=()=>{$('mmenu').hidden=true;if(t[0]==='▸'){try{push('Frac('+E.fmt(E.last())+')',E.frac(E.last()))}catch(e){push('Frac',e.message,1)}}else ins(t)};$('mmenu').append(b)});
ex.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();run()}else if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();hi=Math.min(ents.length,Math.max(0,hi+(e.key==='ArrowUp'?-1:1)));ex.value=ents[hi]||''}else if(e.key==='Escape')$('mmenu').hidden=true});
sbar();
const cv=$('cv'),g=cv.getContext('2d'),ids=['xmin','xmax','ymin','ymax'],COL=['#2563eb','#dc2626','#16a34a'];let W=[-10,10,-6,6];
const setB=()=>ids.forEach((id,i)=>$(id).value=+W[i].toPrecision(6));
const rd=()=>{const w=ids.map(id=>parseFloat($(id).value));if(w.every(isFinite)&&w[0]<w[1]&&w[2]<w[3])W=w};
function fns(){return[1,2,3].map(n=>{const s=$('y'+n).value.trim();if(!s)return null;try{return E.compile(s)}catch(e){$('gmsg').textContent='Y'+n+': '+e.message;return null}})}
function draw(){const w=cv.width,h=cv.height,X=x=>(x-W[0])/(W[1]-W[0])*w,Y=y=>h-(y-W[2])/(W[3]-W[2])*h,st=getComputedStyle(document.body);$('gmsg').textContent='';
g.fillStyle=st.getPropertyValue('--card');g.fillRect(0,0,w,h);g.lineWidth=1;
const step=r=>{const p=10**Math.floor(Math.log10(r/6)),q=r/6/p;return p*(q<2?1:q<5?2:5)};
const gx=step(W[1]-W[0]),gy=step(W[3]-W[2]);g.strokeStyle=st.getPropertyValue('--line');g.beginPath();
for(let x=Math.ceil(W[0]/gx)*gx;x<=W[1];x+=gx){g.moveTo(X(x),0);g.lineTo(X(x),h)}for(let y=Math.ceil(W[2]/gy)*gy;y<=W[3];y+=gy){g.moveTo(0,Y(y));g.lineTo(w,Y(y))}g.stroke();
g.strokeStyle=st.getPropertyValue('--fg');g.beginPath();g.moveTo(X(0),0);g.lineTo(X(0),h);g.moveTo(0,Y(0));g.lineTo(w,Y(0));g.stroke();
fns().forEach((f,n)=>{if(!f)return;g.strokeStyle=COL[n];g.lineWidth=2;g.beginPath();let pen=false,py=0;for(let px=0;px<=w;px++){let y;try{y=f(W[0]+px/w*(W[1]-W[0]))}catch(e){y=NaN}const yy=Y(y);if(!isFinite(y)||Math.abs(yy)>1e5||(pen&&Math.abs(yy-py)>h*1.5)){pen=false;continue}pen?g.lineTo(px,yy):g.moveTo(px,yy);pen=true;py=yy}g.stroke()})}
function wx(e){const r=cv.getBoundingClientRect();return[(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height]}
let drag=null;cv.onpointerdown=e=>{drag=[e.clientX,e.clientY,[...W]];cv.setPointerCapture(e.pointerId)};cv.onpointerup=()=>drag=null;
cv.onpointermove=e=>{const[fx]=wx(e);if(drag){const r=cv.getBoundingClientRect(),dx=(e.clientX-drag[0])/r.width*(drag[2][1]-drag[2][0]),dy=(e.clientY-drag[1])/r.height*(drag[2][3]-drag[2][2]);W=[drag[2][0]-dx,drag[2][1]-dx,drag[2][2]+dy,drag[2][3]+dy];setB();draw()}
const x=W[0]+fx*(W[1]-W[0]);$('trace').textContent='x = '+E.fmt(+x.toPrecision(6))+fns().map((f,n)=>{if(!f)return'';try{return'   Y'+(n+1)+' = '+E.fmt(+f(x).toPrecision(6))}catch(e){return''}}).join('')};
cv.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0?.8:1.25)},{passive:false});
function zoom(k){rd();const cx=(W[0]+W[1])/2,cy=(W[2]+W[3])/2,hx=(W[1]-W[0])/2*k,hy=(W[3]-W[2])/2*k;W=[cx-hx,cx+hx,cy-hy,cy+hy];setB();draw()}
$('zin').onclick=()=>zoom(.5);$('zout').onclick=()=>zoom(2);$('zstd').onclick=()=>{W=[-10,10,-6,6];setB();draw()};$('zsq').onclick=()=>{rd();const m=(W[2]+W[3])/2,hy=(W[1]-W[0])/2*cv.height/cv.width;W[2]=m-hy;W[3]=m+hy;setB();draw()};
$('plot').onclick=()=>{rd();draw()};ids.forEach(id=>$(id).onchange=()=>{rd();draw()});
$('solve').onclick=()=>{rd();try{const r=E.solve($('eq').value,W[0],W[1]);$('sout').textContent=r.length?'x ≈ '+r.map(v=>E.fmt(+v.toPrecision(8))).join(',  ')+'  (numeric approximation in the current x-range)':'No solutions found in the current x-range'}catch(e){$('sout').textContent=e.message}};
$('sgo').onclick=()=>{try{const o=E.stats($('sx').value),L=Object.entries(o).map(([k,v])=>k+': '+E.fmt(+v.toPrecision(10)));if($('sy').value.trim()){const r=E.regress($('sx').value,$('sy').value);for(const k in r)L.push('Linear regression '+k+': '+r[k])}$('stout').textContent=L.join('\n')}catch(e){$('stout').textContent=e.message}};
const mop={det:A=>'det(A) = '+E.fmt(+E.det(A).toPrecision(10)),inv:A=>E.show(E.inv(A)),T:A=>E.show(E.T(A)),add:(A,B)=>E.show(E.add(A,B)),mul:(A,B)=>E.show(E.mul(A,B))};
document.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{try{$('mout').textContent=mop[b.dataset.m](E.M($('ma').value),b.dataset.m==='add'||b.dataset.m==='mul'?E.M($('mb').value):0)}catch(e){$('mout').textContent=e.message}});
setB()});
