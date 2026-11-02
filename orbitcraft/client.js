import * as THREE from './vendor/three.module.js';
import { BLOCKS,SLOTS,CHUNK,HEIGHT,SIZE,chunkIndex,inside,baseBlock,terrain,step,raycast } from './world.js';
import { createTextures, createAtmosphere, createHeldBlock, TILE_COUNT, tileFor } from './visuals.js';
import { SUPABASE_URL,SUPABASE_ANON_KEY } from '../chatter/config.js';
const $=id=>document.getElementById(id), canvas=$('world');
const chunks=new Map(),pending=new Set(),dirty=new Set(),edits=new Map(),avatars=new Map();
let socket,me=null,inventory={},selected=0,seq=0,dev=false,connected=false,lastNetwork=0,lastAction=0,mined=0,placed=0;
document.documentElement.dataset.theme='dark';
const input={},SESSION='sb-qtmrtxgkisshdtqshjre-auth-token',coarse=matchMedia('(pointer:coarse)').matches;
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});}catch{ $('gate-status').textContent='Orbitcraft needs WebGL. Enable hardware acceleration or try another browser.';throw new Error('WebGL unavailable'); }
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();scene.background=new THREE.Color('#acd2df');scene.fog=new THREE.Fog('#bdd8df',38,79);
const camera=new THREE.PerspectiveCamera(74,innerWidth/innerHeight,.07,130);camera.rotation.order='YXZ';camera.position.set(22,37,42);camera.lookAt(0,15,0);
scene.add(new THREE.HemisphereLight(0xe5f4ff,0x67754c,1.7));const sun=new THREE.DirectionalLight(0xffefcb,1.65);sun.position.set(-44,76,-68);scene.add(sun);
const { texture, icon: blockIcon } = createTextures();
scene.add(camera);
const atmosphere = createAtmosphere(scene);
const held = createHeldBlock(camera, texture);
const material=new THREE.MeshLambertMaterial({map:texture,vertexColors:true,alphaTest:.5});const waterMaterial=new THREE.MeshLambertMaterial({map:texture,vertexColors:true,transparent:true,opacity:.64,depthWrite:false,side:THREE.DoubleSide});
const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.006,1.006,1.006)),new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.8}));scene.add(outline);outline.visible=false;
const get=(x,y,z)=>{if(!inside(x,y,z))return 0;const k=`${x},${y},${z}`;if(edits.has(k))return edits.get(k);const c=chunks.get(`${Math.floor(x/CHUNK)},${Math.floor(z/CHUNK)}`);return c?c.data[chunkIndex((x%CHUNK+CHUNK)%CHUNK,y,(z%CHUNK+CHUNK)%CHUNK)]:baseBlock(x,y,z);};
const faces=[
 {n:[1,0,0],v:[[1,0,1],[1,0,0],[1,1,0],[1,1,1]],s:.82},
 {n:[-1,0,0],v:[[0,0,0],[0,0,1],[0,1,1],[0,1,0]],s:.72},
 {n:[0,1,0],v:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]],s:1},
 {n:[0,-1,0],v:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]],s:.55},
 {n:[0,0,1],v:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]],s:.88},
 {n:[0,0,-1],v:[[1,0,0],[0,0,0],[0,1,0],[1,1,0]],s:.76}
];
function meshChunk(k){
 const chunk=chunks.get(k);if(!chunk)return;const [cx,cz]=k.split(',').map(Number),groups=[{p:[],n:[],uv:[],c:[]},{p:[],n:[],uv:[],c:[]}];
 // Neighbors missing from the streamed set are opaque to avoid exposed world walls.
 const block=(x,y,z)=>{if(y<0)return 9;if(y>=HEIGHT)return 0;if(!inside(x,y,z))return 0;const c=chunks.get(`${Math.floor(x/CHUNK)},${Math.floor(z/CHUNK)}`);return c?c.data[chunkIndex((x%CHUNK+CHUNK)%CHUNK,y,(z%CHUNK+CHUNK)%CHUNK)]:9;};
 for(let y=0;y<HEIGHT;y++)for(let z=0;z<CHUNK;z++)for(let x=0;x<CHUNK;x++){
  const id=chunk.data[chunkIndex(x,y,z)];if(!id)continue;const wx=cx*CHUNK+x,wz=cz*CHUNK+z,g=groups[id===8?1:0];
  for(const f of faces){const b=block(wx+f.n[0],y+f.n[1],wz+f.n[2]);if(b && (id===8||b!==8))continue;
   const uv=[[0,0],[1,0],[1,1],[0,1]],tile=tileFor(id,f.n[1]);
   for(const i of [0,1,2,0,2,3]){const v=f.v[i];g.p.push(wx+v[0],y+v[1],wz+v[2]);g.n.push(...f.n);g.uv.push((tile*16+.2+uv[i][0]*15.6)/(TILE_COUNT*16),(.2+uv[i][1]*15.6)/16);const outside=[wx+f.n[0],y+f.n[1],wz+f.n[2]],tangents=[0,1,2].filter(axis=>!f.n[axis]);
    const offset=(axis,sign)=>{const p=[...outside];p[axis]+=sign;return p;};
    const opaque=p=>{const b=block(...p);return b&&b!==8&&b!==6;};
    const first=offset(tangents[0],v[tangents[0]]?1:-1),second=offset(tangents[1],v[tangents[1]]?1:-1),corner=[...first];corner[tangents[1]]+=v[tangents[1]]?1:-1;
    const shade=f.s*(1-.14*(Number(!!opaque(first))+Number(!!opaque(second))+Number(!!opaque(corner))));g.c.push(shade,shade,shade);}
  }
 }
 if(chunk.group){scene.remove(chunk.group);for(const m of chunk.group.children)m.geometry.dispose();}
 chunk.group=new THREE.Group();groups.forEach((g,i)=>{if(!g.p.length)return;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(g.p,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(g.n,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(g.uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(g.c,3));geometry.computeBoundingSphere();chunk.group.add(new THREE.Mesh(geometry,i?waterMaterial:material));});scene.add(chunk.group);
}
function mark(cx,cz){for(const [dx,dz] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]])if(chunks.has(`${cx+dx},${cz+dz}`))dirty.add(`${cx+dx},${cz+dz}`);}
function requestChunks(){if(!me||!connected)return;const cx=Math.floor(me.x/CHUNK),cz=Math.floor(me.z/CHUNK),want=[];
 for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){const x=cx+dx,z=cz+dz,k=`${x},${z}`;if(x< -4||x>=4||z< -4||z>=4)continue;if(!chunks.has(k)&&!pending.has(k)){want.push([x,z]);pending.add(k);}}
 want.sort((a,b)=>Math.hypot(a[0]-cx,a[1]-cz)-Math.hypot(b[0]-cx,b[1]-cz));if(want.length)send({type:'chunks',chunks:want});
 for(const [k,c] of chunks){const [x,z]=k.split(',').map(Number);if(Math.abs(x-cx)>3||Math.abs(z-cz)>3){if(c.group){scene.remove(c.group);c.group.children.forEach(m=>m.geometry.dispose());}chunks.delete(k);dirty.delete(k);}}
}
function send(m){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(m));}
function toast(text){$('toast').textContent=text;$('toast').classList.add('on');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('on'),3500);}
function chat(name,text,notice=false){const p=document.createElement('p');if(notice)p.className='notice';else{const b=document.createElement('b');b.textContent=name+': ';p.append(b);}p.append(document.createTextNode(text));$('messages').append(p);while($('messages').children.length>70)$('messages').firstChild.remove();$('messages').scrollTop=$('messages').scrollHeight;}
function updateInventory(){
 $('hotbar').replaceChildren();$('inventory-grid').replaceChildren();
 SLOTS.forEach((id,i)=>{for(const container of [$('hotbar'),$('inventory-grid')]){const b=document.createElement('button');b.title=BLOCKS[id].name;b.classList.toggle('active',i===selected);b.setAttribute('aria-label',`${BLOCKS[id].name}: ${inventory[id]||0}`);b.setAttribute('aria-pressed',String(i===selected));const key=document.createElement('kbd');key.textContent=i+1;const swatch=document.createElement('span');swatch.className='swatch';swatch.style.setProperty('--block',BLOCKS[id].color);swatch.style.backgroundImage=`url("${blockIcon(id)}")`;const amount=document.createElement('span');amount.className='amount';amount.textContent=inventory[id]||0;b.append(key,swatch,amount);if(container.id==='inventory-grid')b.append(document.createTextNode(BLOCKS[id].name));b.onclick=()=>{selected=i;updateInventory();};container.append(b);}});
 held.select(SLOTS[selected],inventory[SLOTS[selected]]||0);$('selected-name').textContent=BLOCKS[SLOTS[selected]].name;$('progress').textContent=`${mined} blocks mined · ${placed} blocks placed`;$('craft-button').disabled=!connected||!(inventory[5]>0);
}
function avatar(p){
 const group=new THREE.Group(),color=new THREE.Color().setHSL([...p.id].reduce((n,c)=>n+c.charCodeAt(0),0)%100/100,.4,.48);
 const part=(w,h,d,c,y)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshLambertMaterial({color:c}));m.position.y=y;group.add(m);return m;};
 part(.5,.65,.28,color,.96);part(.44,.44,.44,0xe1b38c,1.54);part(.46,.09,.46,0x503a2c,1.75);for(const x of [-.1,.1]){const eye=part(.055,.055,.02,0x172322,1.59);eye.position.set(x,1.59,-.226);}const left=part(.2,.62,.24,0x39495c,.33);left.position.x=-.14;const right=part(.2,.62,.24,0x39495c,.33);right.position.x=.14;const arm=part(.17,.63,.23,color,.96);arm.position.x=-.35;const arm2=part(.17,.63,.23,color,.96);arm2.position.x=.35;
 const label=document.createElement('canvas');label.width=512;label.height=64;const c=label.getContext('2d');c.fillStyle='#050c40dd';c.fillRect(0,0,512,64);c.font='bold 32px monospace';c.textAlign='center';c.fillStyle='#e9eeff';c.fillText(p.name,256,44,480);const map=new THREE.CanvasTexture(label);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,depthTest:true}));sprite.position.y=2.15;sprite.scale.set(2.5,.32,1);group.add(sprite);scene.add(group);return {group,target:p,left,right,map};
}
function removeAvatar(id){const a=avatars.get(id);if(!a)return;scene.remove(a.group);a.group.children.forEach(m=>{m.geometry?.dispose();m.material?.dispose();});a.map.dispose();avatars.delete(id);}
async function getAuth(){
 let session;try{session=JSON.parse(localStorage.getItem(SESSION)||'null');}catch{}
 if(!session?.access_token)throw new Error('Sign in to your Orbit account to join.');
 if(session.expires_at*1000<Date.now()+60000 && session.refresh_token){const response=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});if(!response.ok)throw new Error('Your Orbit session expired. Sign in again.');session=await response.json();localStorage.setItem(SESSION,JSON.stringify(session));}
 return {type:'auth',token:session.access_token};
}
async function join(){
 if(socket?.readyState===WebSocket.OPEN||socket?.readyState===WebSocket.CONNECTING)return;
 $('join').disabled=true;$('gate-status').textContent='Verifying your Orbit account…';
 try{
 const auth=dev?{type:'auth',devId:'dev-'+($('dev-name').value.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,20)||'Builder')}:await getAuth();
 socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/orbitcraft/socket`);
 socket.onopen=()=>socket.send(JSON.stringify(auth));
 socket.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}
  if(m.type==='welcome'){
   for(const c of chunks.values())if(c.group){scene.remove(c.group);c.group.children.forEach(m=>m.geometry.dispose());}chunks.clear();dirty.clear();pending.clear();edits.clear();for(const id of avatars.keys())removeAvatar(id);
   me={...m.you,vy:0};inventory=m.inventory;mined=m.mined;placed=m.placed;connected=true;document.body.classList.remove('disconnected');$('gate').hidden=true;$('connection').textContent='● Connected';$('messages').replaceChildren();m.history.forEach(c=>chat(c.name,c.text));updateInventory();requestChunks();toast(coarse?'Drag the world to look. Use the controls to move.':'Click the world to look around. Press ? for controls.');
  }else if(m.type==='chunk'){
   const k=`${m.x},${m.z}`,binary=atob(m.data),data=Uint8Array.from(binary,c=>c.charCodeAt(0));if(data.length!==CHUNK*CHUNK*HEIGHT)return;
   for(const [key,id] of edits){const [x,y,z]=key.split(',').map(Number);if(Math.floor(x/CHUNK)===m.x&&Math.floor(z/CHUNK)===m.z)data[chunkIndex((x%CHUNK+CHUNK)%CHUNK,y,(z%CHUNK+CHUNK)%CHUNK)]=id;}
   const old=chunks.get(k);chunks.set(k,{data,group:old?.group});pending.delete(k);mark(m.x,m.z);
  }else if(m.type==='state'&&me){
   const ids=new Set();for(const p of m.players){ids.add(p.id);if(p.id===me.id){const distance=Math.hypot(me.x-p.x,me.y-p.y,me.z-p.z);if(distance>1.4){Object.assign(me,{x:p.x,y:p.y,z:p.z,vy:p.vy});}else{me.x+=(p.x-me.x)*.2;me.z+=(p.z-me.z)*.2;if(!input.jump&&Math.abs(me.y-p.y)>.15){me.y+=(p.y-me.y)*.3;me.vy=p.vy;}}}else{let a=avatars.get(p.id);if(!a){a=avatar(p);avatars.set(p.id,a);a.group.position.set(p.x,p.y,p.z);}a.target=p;}}
   for(const id of avatars.keys())if(!ids.has(id))removeAvatar(id);$('online').textContent=`${m.players.length} online`;
  }else if(m.type==='block'){
   edits.set(`${m.x},${m.y},${m.z}`,m.block);const c=chunks.get(`${Math.floor(m.x/CHUNK)},${Math.floor(m.z/CHUNK)}`);if(c)c.data[chunkIndex((m.x%CHUNK+CHUNK)%CHUNK,m.y,(m.z%CHUNK+CHUNK)%CHUNK)]=m.block;mark(Math.floor(m.x/CHUNK),Math.floor(m.z/CHUNK));
  }else if(m.type==='inventory'){inventory=m.inventory;mined=m.mined;placed=m.placed;updateInventory();}
  else if(m.type==='chat')chat(m.name,m.text);
  else if(m.type==='notice')chat('',m.text,true);
  else if(m.type==='leave')removeAvatar(m.id);
  else if(m.type==='error'){toast(m.message);$('gate-status').textContent=m.message;}
 };
 socket.onerror=()=>{$('gate-status').textContent='Cannot reach the public world. Please retry shortly.';};
 socket.onclose=()=>{const was=connected;connected=false;me=null;inputReset();document.exitPointerLock?.();$('gate').hidden=false;$('join').disabled=false;$('join').textContent=was?'Reconnect to public world →':'Join public world →';$('connection').textContent='Disconnected';document.body.classList.add('disconnected');$('online').textContent='0 online';if(was)$('gate-status').textContent='Connection lost. Your saved inventory and world are safe. Reconnect to continue.';};
 }catch(e){$('gate-status').textContent=e.message;$('join').disabled=false;$('login').hidden=dev;}
}
$('join').onclick=join;
async function checkServer(){try{const r=await fetch('./health',{cache:'no-store'});if(!r.ok)throw new Error();const health=await r.json();if(!health.ok)throw new Error();dev=health.dev===true;$('dev-label').hidden=!dev;$('gate-status').textContent=dev?'Local development server · use different names in two browser windows to test multiplayer.':'One shared world · sign in with your Orbit account.';$('join').disabled=false;if(new URLSearchParams(location.search).get('autojoin')==='1')await join();}catch{$('gate-status').textContent='The public world is unavailable. Please ask the site owner to start the world server.';$('join').disabled=true;}}
$('join').disabled=true;checkServer();
function inputReset(){for(const k of Object.keys(input))delete input[k];}
function menuOpen(){return $('inventory').open||$('help').open||!$('chat-form').hidden||!$('gate').hidden;}
function controls(){return connected&&!menuOpen()&&(coarse||document.pointerLockElement===canvas);}
function openDialog(id){inputReset();document.exitPointerLock?.();$(id).showModal();}
$('inventory-button').onclick=()=>openDialog('inventory');$('help-button').onclick=()=>openDialog('help');document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());$('craft-button').onclick=()=>send({type:'craft'});
function openChat(){if(!connected)return;inputReset();document.exitPointerLock?.();$('chat-form').hidden=false;$('chat-input').focus();}
$('chat-button').onclick=openChat;$('chat-form').onsubmit=e=>{e.preventDefault();send({type:'chat',text:$('chat-input').value});$('chat-input').value='';$('chat-form').hidden=true;};
const keys={KeyW:'forward',ArrowUp:'forward',KeyS:'back',ArrowDown:'back',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',Space:'jump',ShiftLeft:'sprint',ShiftRight:'sprint'};
addEventListener('keydown',e=>{
 if(e.code==='Escape'){document.exitPointerLock?.();inputReset();}
 if(e.target.matches('input,textarea')&&document.pointerLockElement!==canvas){if(e.code==='Escape'){$('chat-form').hidden=true;e.target.blur();}return;}
 if(e.code==='Enter'&&connected){e.preventDefault();openChat();return;}
 if(e.code==='KeyE'&&connected){e.preventDefault();if($('inventory').open)$('inventory').close();else openDialog('inventory');return;}
 if(e.key==='?'){openDialog('help');return;}
 if(/^Digit[1-8]$/.test(e.code)){selected=Number(e.code.slice(-1))-1;updateInventory();}
 if(keys[e.code]&&controls()){e.preventDefault();input[keys[e.code]]=true;}
});addEventListener('keyup',e=>{if(keys[e.code])input[keys[e.code]]=false;});addEventListener('blur',inputReset);document.addEventListener('visibilitychange',()=>{if(document.hidden)inputReset();});document.addEventListener('pointerlockchange',inputReset);
canvas.addEventListener('click',()=>{if(connected&&!coarse&&!menuOpen()){canvas.focus();canvas.requestPointerLock?.();}});
addEventListener('mousemove',e=>{if(!me||document.pointerLockElement!==canvas)return;me.yaw-=e.movementX*.0025;me.pitch=Math.max(-1.54,Math.min(1.54,me.pitch-e.movementY*.0025));});
function action(type){if(!connected||!me||Date.now()-lastAction<190)return;lastAction=Date.now();held.swing();send({type:'input',...input,yaw:me.yaw,pitch:me.pitch,seq:++seq});send({type,block:SLOTS[selected]});}
canvas.addEventListener('mousedown',e=>{if(!controls())return;e.preventDefault();action(e.button===2?'place':'break');});canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('wheel',e=>{if(!connected)return;e.preventDefault();selected=(selected+(e.deltaY>0?1:7))%8;updateInventory();},{passive:false});
$('touch-mine').onclick=()=>action('break');$('touch-place').onclick=()=>action('place');document.querySelectorAll('[data-key]').forEach(b=>{b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);input[b.dataset.key]=true;};b.onpointerup=b.onpointercancel=()=>input[b.dataset.key]=false;});
let touch=null;canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'){touch={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);}});canvas.addEventListener('pointermove',e=>{if(!touch||touch.id!==e.pointerId||!me)return;me.yaw-=(e.clientX-touch.x)*.006;me.pitch=Math.max(-1.54,Math.min(1.54,me.pitch-(e.clientY-touch.y)*.006));touch.x=e.clientX;touch.y=e.clientY;});canvas.addEventListener('pointerup',()=>touch=null);
let previous=performance.now(),worldRequest=0,hudAt=0;
function animate(now){requestAnimationFrame(animate);const dt=Math.min((now-previous)/1000,.05);previous=now;
 if(dirty.size){const k=dirty.values().next().value;dirty.delete(k);meshChunk(k);}
 if(me&&connected){
  if(controls())step(me,input,dt,get);
  camera.position.set(me.x,me.y+1.62,me.z);camera.rotation.set(me.pitch,me.yaw,0,'YXZ');
  if(now-lastNetwork>50){lastNetwork=now;send({type:'input',...(controls()?input:{}),yaw:me.yaw,pitch:me.pitch,seq:++seq});}
  if(now-worldRequest>500){worldRequest=now;requestChunks();}
  const hit=raycast(me,get);outline.visible=!!hit;if(hit)outline.position.set(hit.x+.5,hit.y+.5,hit.z+.5);
  if(now-hudAt>180){hudAt=now;$('target').textContent=hit?`${BLOCKS[hit.block].name} · ${hit.block===9?'Unbreakable':'Mine / place'}`:'';$('coordinates').textContent=`XYZ ${me.x.toFixed(1)} / ${me.y.toFixed(1)} / ${me.z.toFixed(1)}`;$('biome').textContent=terrain(Math.floor(me.x),Math.floor(me.z)).biome;}
 }else{outline.visible=false;camera.position.set(32+Math.sin(now*.00003)*7,37,43);camera.lookAt(0,15,0);}
 for(const a of avatars.values()){const t=a.target,d=Math.hypot(a.group.position.x-t.x,a.group.position.z-t.z);a.group.position.lerp(new THREE.Vector3(t.x,t.y,t.z),Math.min(1,dt*13));a.group.rotation.y=t.yaw;a.left.rotation.x=d>.01?Math.sin(now*.009)*.45:0;a.right.rotation.x=-a.left.rotation.x;}
 const underwater=me&&get(Math.floor(me.x),Math.floor(me.y+1.62),Math.floor(me.z))===8;
 document.body.classList.toggle('underwater',!!underwater);
 scene.fog.color.set(underwater?'#3887a9':'#bdd8df');scene.fog.near=underwater?1:38;scene.fog.far=underwater?16:79;
 held.update(now,controls()&&!!(input.forward||input.back||input.left||input.right),connected&&!menuOpen());
 atmosphere(now,camera);
 renderer.render(scene,camera);
}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
addEventListener('pagehide',()=>socket?.close(1000,'Leaving world'));
// Deterministic landscape preview before joining; this is terrain only, never fake players.
for(let cx=-1;cx<=1;cx++)for(let cz=-1;cz<=1;cz++){const data=new Uint8Array(CHUNK*CHUNK*HEIGHT);for(let y=0;y<HEIGHT;y++)for(let z=0;z<CHUNK;z++)for(let x=0;x<CHUNK;x++)data[chunkIndex(x,y,z)]=baseBlock(cx*CHUNK+x,y,cz*CHUNK+z);const k=`${cx},${cz}`;chunks.set(k,{data});dirty.add(k);}
updateInventory();requestAnimationFrame(animate);
