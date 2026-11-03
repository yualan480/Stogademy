import {isTorch,isPlant,blockBoxes} from './shapes.js';
import {markHit,tintAndFall,sleepPose} from './entity-effects.js?v=20261103-snow16';
import {wantedChunks,inRange,renderDistance as clampRenderDistance,SIMULATION_DISTANCE} from './chunks.js?v=20261103-snow16';
import {createKeybinds} from './keybinds.js?v=20261103-snow16';
import {createPauseMenu} from './pause-menu.js?v=20261103-snow16';
import {furnitureModel} from './block-models.js?v=20261103-snow16';
import {createShortcuts} from './game-shortcuts.js?v=20261103-snow16';
import { ITEMS,itemName,isBlock } from './items.js';
import { createSurvivalView,applyEquipment } from './survival-ui.js?v=20261103-snow16';
import * as THREE from './vendor/three.module.js';
import { BLOCKS,SLOTS,CHUNK,HEIGHT,SIZE,chunkIndex,inside,resourceBlock,terrain,step,stepBoat,raycast,solid,collides } from './world.js';
import { createResourceEffects,blockGeometry } from './mining-visuals.js?v=20261103-snow16';
import { createPlayerModel } from './players.js?v=20261103-snow16';
import { createTextures, createAtmosphere, createHeldBlock, TILE_COUNT, tileFor, terrainDetail } from './visuals.js?v=20261103-snow16';
import { SUPABASE_URL,SUPABASE_ANON_KEY } from '../chatter/config.js';
const $=id=>document.getElementById(id), canvas=$('world');
const bindings=createKeybinds();
const chunks=new Map(),pending=new Map(),dirty=new Set(),edits=new Map(),avatars=new Map();
let socket,me=null,inventory={},selected=0,seq=0,dev=false,connected=false,lastAction=0,mined=0,placed=0,miningHeld=false,miningFeedback=null,lastMiningSwing=0,perspective=0,ownPlayer=null;
const predictionHistory=new Map(),correction=new THREE.Vector3();
document.documentElement.dataset.theme='dark';
let lastForwardTap=-Infinity,lastJumpTap=-Infinity,sprintLatch=false;
const input={},SESSION='sb-qtmrtxgkisshdtqshjre-auth-token',coarse=matchMedia('(pointer:coarse)').matches;
let viewDistance=coarse?2:3;try{viewDistance=clampRenderDistance(Number(localStorage.getItem('orbitcraft-render-distance-v1')||viewDistance));}catch{}
const distanceSettings=document.createElement('div');distanceSettings.className='distance-settings';distanceSettings.innerHTML='<label for="render-distance">Render Distance: <output id="render-distance-value"></output></label><input id="render-distance" type="range" min="1" max="4" step="1"><p>Simulation distance: 2 chunks. Distant farms, furnaces and creatures pause until a player returns.</p>';bindings.dialog.querySelector('#keybind-list').before(distanceSettings);$('render-distance').value=viewDistance;$('render-distance-value').textContent=viewDistance+' chunks';$('render-distance').oninput=e=>{viewDistance=clampRenderDistance(Number(e.target.value));$('render-distance-value').textContent=viewDistance+' chunks';try{localStorage.setItem('orbitcraft-render-distance-v1',viewDistance);}catch{}pending.clear();requestChunks();};
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});}catch{ $('gate-status').textContent='Orbitcraft needs WebGL. Enable hardware acceleration or try another browser.';throw new Error('WebGL unavailable'); }
let worldPixelRatio=Math.min(devicePixelRatio,1.5),averageFrame=16,resolutionAt=0;
renderer.setPixelRatio(worldPixelRatio);renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();scene.background=new THREE.Color('#acd2df');scene.fog=new THREE.Fog('#b9d4ff',38,79);
const camera=new THREE.PerspectiveCamera(74,innerWidth/innerHeight,.07,130);camera.rotation.order='YXZ';camera.position.set(22,37,42);camera.lookAt(0,15,0);
scene.add(new THREE.HemisphereLight(0xe5f4ff,0x67754c,1.7));const sun=new THREE.DirectionalLight(0xffefcb,1.65);sun.position.set(-44,76,-68);scene.add(sun);
const { texture, icon: blockIcon } = await createTextures();
scene.add(camera);
const atmosphere = createAtmosphere(scene);
const held = createHeldBlock(camera, texture);
const leftHeld=createHeldBlock(camera,texture,{left:true});
const resources=createResourceEffects(scene,texture);
const bedDirections=new Map(),torchPositions=new Map(),torchLights=Array.from({length:coarse?2:4},()=>{const light=new THREE.PointLight(0xffb56c,0,12,1.5);scene.add(light);return light;});let torchLightAt=0;
const firstShield=new THREE.Group();camera.add(firstShield);for(const [w,h,d,color]of [[.31,.43,.06,0x999b9b],[.26,.37,.07,0x987345]]){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshLambertMaterial({color,depthTest:false,fog:false}));m.renderOrder=1002;firstShield.add(m);}
function showHeldItem(model,id,side='right'){if(!model)return;const key=side==='left'?'offhandId':'heldId',meshKey=side==='left'?'offhandMesh':'itemMesh',arm=side==='left'?model.arm:model.arm2;if(model[key]===id)return;model[key]=id;if(model[meshKey]){arm.remove(model[meshKey]);model[meshKey].geometry.dispose();model[meshKey].material.dispose();model[meshKey]=null;}if(!id)return;const mesh=new THREE.Mesh(blockGeometry(id,.23),new THREE.MeshLambertMaterial({map:texture,alphaTest:.5,side:THREE.DoubleSide}));mesh.name=side==='left'?'left-hand-item':'right-hand-item';mesh.position.set(0,-.55,-.15);mesh.rotation.x=-.45;arm.add(mesh);model[meshKey]=mesh;}


const material=new THREE.MeshLambertMaterial({map:texture,vertexColors:true,alphaTest:.5});const waterMaterial=new THREE.MeshLambertMaterial({map:texture,vertexColors:true,transparent:true,opacity:.64,depthWrite:false,side:THREE.DoubleSide});
const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.006,1.006,1.006)),new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.8}));scene.add(outline);outline.visible=false;
const get=(x,y,z)=>{if(!inside(x,y,z))return 0;const k=`${x},${y},${z}`;if(edits.has(k))return edits.get(k);const c=chunks.get(`${Math.floor(x/CHUNK)},${Math.floor(z/CHUNK)}`);return c?c.data[chunkIndex((x%CHUNK+CHUNK)%CHUNK,y,(z%CHUNK+CHUNK)%CHUNK)]:connected?9:resourceBlock(x,y,z);};
const faces=[
 {n:[1,0,0],v:[[1,0,1],[1,0,0],[1,1,0],[1,1,1]],s:.82},
 {n:[-1,0,0],v:[[0,0,0],[0,0,1],[0,1,1],[0,1,0]],s:.72},
 {n:[0,1,0],v:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]],s:1},
 {n:[0,-1,0],v:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]],s:.55},
 {n:[0,0,1],v:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]],s:.88},
 {n:[0,0,-1],v:[[1,0,0],[0,0,0],[0,1,0],[1,1,0]],s:.76}
];
function meshChunk(k){
 const chunk=chunks.get(k);if(!chunk)return;const [cx,cz]=k.split(',').map(Number),torches=[],furniture=[],groups=[{p:[],n:[],uv:[],c:[]},{p:[],n:[],uv:[],c:[]}];
 // Neighbors missing from the streamed set are opaque to avoid exposed world walls.
 const block=(x,y,z)=>{if(y<0)return 9;if(y>=HEIGHT)return 0;if(!inside(x,y,z))return 0;const c=chunks.get(`${Math.floor(x/CHUNK)},${Math.floor(z/CHUNK)}`);return c?c.data[chunkIndex((x%CHUNK+CHUNK)%CHUNK,y,(z%CHUNK+CHUNK)%CHUNK)]:9;};
 for(let y=0;y<HEIGHT;y++)for(let z=0;z<CHUNK;z++)for(let x=0;x<CHUNK;x++){
  const id=chunk.data[chunkIndex(x,y,z)];if(!id)continue;const wx=cx*CHUNK+x,wz=cz*CHUNK+z,g=groups[id===8?1:0];
  if([20,26,23].includes(id)||isTorch(id)){let dx=0,dz=-1;const direction=bedDirections.get(`${wx},${y},${wz}`);if(direction){dx=direction.x;dz=direction.z;}else if(id!==23)for(const [x,z]of [[0,1],[0,-1],[1,0],[-1,0]])if(block(wx+x,y,wz+z)===(id===20?26:20)){dx=id===20?x:-x;dz=id===20?z:-z;break;}furniture.push({id,x:wx,y,z:wz,dx,dz});if(isTorch(id))torches.push({x:wx+.5,y:y+.8,z:wz+.5});continue;}
  if(id===25)torches.push({x:wx+.5,y:y+.65,z:wz+.5});
  if(id===22||isPlant(id)){const detail=id===22?29:id===31?13:id===32?14:15;if(detail!==null){
    const stage=cropStages.get(`${wx},${y},${wz}`)||0,height=id===25?.85:id===22?.3+stage*.2:detail===13?.6:.46,half=id===25?.2:.32,cx=wx+.5,cz=wz+.5;
    const quads=[[[cx-half,y+(id===22||isPlant(id)?0:1),cz-half],[cx+half,y+(id===22||isPlant(id)?0:1),cz+half],[cx+half,y+(id===22||isPlant(id)?0:1)+height,cz+half],[cx-half,y+(id===22||isPlant(id)?0:1)+height,cz-half]],[[cx-half,y+(id===22||isPlant(id)?0:1),cz+half],[cx+half,y+(id===22||isPlant(id)?0:1),cz-half],[cx+half,y+(id===22||isPlant(id)?0:1)+height,cz-half],[cx-half,y+(id===22||isPlant(id)?0:1)+height,cz+half]]];
    for(const [q,verts] of quads.entries())for(const backwards of [false,true])for(const i of backwards?[0,2,1,0,3,2]:[0,1,2,0,2,3]){const sign=backwards?-1:1;g.p.push(...verts[i]);g.n.push(sign*(q ? .707 : -.707),0,sign*.707);const uv=[[0,0],[1,0],[1,1],[0,1]][i];g.uv.push((detail*16+.2+uv[0]*15.6)/(TILE_COUNT*16),(.2+uv[1]*15.6)/16);g.c.push(1,1,1);}
  }}
  if(id===22||isTorch(id)||isPlant(id))continue;
  for(const f of faces){const b=block(wx+f.n[0],y+f.n[1],wz+f.n[2]);if(b&&!isTorch(b)&&!isPlant(b)&&![20,26,23,22].includes(b)&&(id===8||b!==8))continue;
   const uv=[[0,0],[1,0],[1,1],[0,1]],tile=tileFor(id,f.n[1],f.n[2]);
   for(const i of [0,1,2,0,2,3]){const v=f.v[i];g.p.push(wx+v[0],y+v[1],wz+v[2]);g.n.push(...f.n);g.uv.push((tile*16+.2+uv[i][0]*15.6)/(TILE_COUNT*16),(.2+uv[i][1]*15.6)/16);const outside=[wx+f.n[0],y+f.n[1],wz+f.n[2]],tangents=[0,1,2].filter(axis=>!f.n[axis]);
    const offset=(axis,sign)=>{const p=[...outside];p[axis]+=sign;return p;};
    const opaque=p=>{const b=block(...p);return b&&b!==8&&b!==6&&!isTorch(b)&&!isPlant(b);};
    const first=offset(tangents[0],v[tangents[0]]?1:-1),second=offset(tangents[1],v[tangents[1]]?1:-1),corner=[...first];corner[tangents[1]]+=v[tangents[1]]?1:-1;
    const shade=f.s*(1-.14*(Number(!!opaque(first))+Number(!!opaque(second))+Number(!!opaque(corner))));g.c.push(shade,shade,shade);}
  }
 }
 torchPositions.set(k,torches);
 if(chunk.group){scene.remove(chunk.group);chunk.group.traverse(m=>{m.geometry?.dispose();if(m.material&&(m.material.userData.owned||m.material.map!==texture))m.material.dispose();});}
 chunk.group=new THREE.Group();for(const f of furniture){const model=furnitureModel(f.id,texture,{x:f.dx,z:f.dz});model.position.set(f.x,f.y,f.z);chunk.group.add(model);}groups.forEach((g,i)=>{if(!g.p.length)return;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(g.p,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(g.n,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(g.uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(g.c,3));geometry.computeBoundingSphere();chunk.group.add(new THREE.Mesh(geometry,i?waterMaterial:material));});chunk.group.name='chunk:'+k;chunk.group.visible=!me||inRange(me,{x:cx*CHUNK,z:cz*CHUNK},viewDistance);scene.add(chunk.group);
}
function mark(cx,cz){for(const [dx,dz] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]])if(chunks.has(`${cx+dx},${cz+dz}`))dirty.add(`${cx+dx},${cz+dz}`);}
function disposeChunk(c){if(c?.group){scene.remove(c.group);c.group.traverse(m=>{m.geometry?.dispose();if(m.material&&(m.material.userData.owned||m.material.map!==texture))m.material.dispose();});}}
function retainChunk(x,z){return me&&inRange(me,{x:x*CHUNK,z:z*CHUNK},viewDistance+1);}
function requestChunks(){if(!me||!connected)return;const want=[],now=performance.now();
 for(const [x,z]of wantedChunks(me,viewDistance,SIZE)){const k=`${x},${z}`;if(!chunks.has(k)&&(!pending.has(k)||now-pending.get(k)>15000)){want.push([x,z]);pending.set(k,now);}}
 // Sending an empty request still updates the server's render-distance setting.
 send({type:'chunks',distance:viewDistance,chunks:want});
 for(const [k,c]of chunks){const [x,z]=k.split(',').map(Number);if(!retainChunk(x,z)){disposeChunk(c);chunks.delete(k);torchPositions.delete(k);dirty.delete(k);mark(x,z);}else if(c.group)c.group.visible=inRange(me,{x:x*CHUNK,z:z*CHUNK},viewDistance);}
 for(const k of pending.keys()){const [x,z]=k.split(',').map(Number);if(!retainChunk(x,z))pending.delete(k);}
 for(const map of [edits,bedDirections,cropStages])for(const key of map.keys()){const [x,y,z]=key.split(',').map(Number);if(!retainChunk(Math.floor(x/CHUNK),Math.floor(z/CHUNK)))map.delete(key);}
}

function send(m){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(m));}
function toast(text){$('toast').textContent=text;$('toast').classList.add('on');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('on'),3500);}
let chatTimer;function showChat(){clearTimeout(chatTimer);$('chat').classList.add('chat-recent');chatTimer=setTimeout(()=>$('chat').classList.remove('chat-recent'),5000);}
function chat(name,text,notice=false){const p=document.createElement('p');if(notice)p.className='notice';else{const b=document.createElement('b');b.textContent=name+': ';p.append(b);}p.append(document.createTextNode(text));$('messages').append(p);while($('messages').children.length>70)$('messages').firstChild.remove();$('messages').scrollTop=$('messages').scrollHeight;if(!notice)showChat();}
let rosterKey='';function updateRoster(players){const key=JSON.stringify(players.map(p=>[p.id,p.name]));if(key===rosterKey)return;rosterKey=key;const list=$('player-list');list.replaceChildren();for(const p of players){const row=document.createElement('div'),name=document.createElement('span'),signal=document.createElement('span');name.textContent=p.name;signal.textContent='▂▄▆█';signal.className='player-signal';row.append(name,signal);list.append(row);}}

let combatFlashTimer,hitMarkerTimer;
let bagSlots=Array(36).fill(null);
let hotbarSlots=[...SLOTS,0];
const survival=createSurvivalView({scene,send,icon:blockIcon,inventory:()=>inventory,selected:()=>hotbarSlots[selected]});
const cropStages=new Map();
function chooseSlot(index){setEating(false);selected=index;send({type:'select',slot:index});updateInventory();}
$('equip-selected').onclick=()=>send({type:'equip',item:hotbarSlots[selected]});
let previewRenderer,previewActor,previewScene,previewCamera,previewPoint=null,previewFrame=0;
document.addEventListener('pointermove',e=>{previewPoint={x:e.clientX,y:e.clientY};if($('inventory').open&&!previewFrame)previewFrame=requestAnimationFrame(()=>{previewFrame=0;updatePreview();});});
function updatePreview(){
 if(!me||!$('inventory').open)return;
 try{
  if(!previewRenderer){previewRenderer=new THREE.WebGLRenderer({canvas:$('character-preview'),alpha:true,antialias:false});previewRenderer.setSize(160,200,false);previewRenderer.outputColorSpace=THREE.SRGBColorSpace;previewScene=new THREE.Scene();previewScene.add(new THREE.HemisphereLight(0xffffff,0x666666,2));previewCamera=new THREE.PerspectiveCamera(32,.8,.1,10);previewCamera.position.set(0,1,3.8);previewCamera.lookAt(0,.9,0);}
  if(!previewActor){previewActor=createPlayerModel(me.id);previewActor.group.rotation.y=Math.PI+.35;previewScene.add(previewActor.group);}
  const offhand=survival.state.offhand?.id||0;applyEquipment(previewActor,{...survival.state.equipment,...(offhand===181?{shield:181}:{})});showHeldItem(previewActor,inventory[hotbarSlots[selected]]>0?hotbarSlots[selected]:0);showHeldItem(previewActor,offhand===181?0:offhand,'left');
  const rect=$('character-preview').getBoundingClientRect();if(rect.width<=0||rect.height<=0)return;const dx=previewPoint?Math.atan((previewPoint.x-rect.left-rect.width/2)/120):0,dy=previewPoint?Math.atan((previewPoint.y-rect.top-rect.height*.27)/120):0;
  previewActor.group.rotation.y=Math.PI+dx*.25;previewActor.head.rotation.set(-dy*.45,dx*.5,0);
  previewRenderer.render(previewScene,previewCamera);
 }catch{ $('character-preview').setAttribute('aria-label','Player preview unavailable'); }
}
function inventorySlot(id,index,hotbar=false,countOverride,inDialog=false){
 const b=document.createElement('button'),count=countOverride??inventory[id]??0,name=itemName(id);
 b.title=count?`${name} (${count})`:'Empty slot';b.setAttribute('aria-label',b.title);b.classList.toggle('active',hotbar&&index===selected);b.setAttribute('aria-pressed',String(hotbar&&index===selected));
 if(count>0){const swatch=document.createElement('span');swatch.className='swatch';swatch.style.backgroundImage=`url("${blockIcon(id)}")`;b.append(swatch);if(count>1){const amount=document.createElement('span');amount.className='amount';amount.textContent=count;b.append(amount);}}
 if(hotbar){const key=document.createElement('kbd');key.textContent=index+1;b.append(key);b.onclick=()=>chooseSlot(index);}
 if(!hotbar&&count>0)b.onclick=e=>send(e.shiftKey&&ITEMS[id]?.slot?{type:'equip',item:id}:{type:'swap',from:index,to:selected});
 if(inDialog){b.dataset.slotArea='bag';b.dataset.slotIndex=index;b.onclick=e=>{if(e.shiftKey&&ITEMS[id]?.slot&&survival.state.container?.kind==='hand'&&!survival.state.container?.cursor)send({type:'equip',item:id});else survival.containerClick(index,e);};b.oncontextmenu=e=>survival.containerClick(index,e);}
 return b;
}
function updateInventory(){
 for(const name of ['hotbar','inventory-hotbar','inventory-grid'])$(name).replaceChildren();
 hotbarSlots.forEach((id,i)=>{for(const name of ['hotbar','inventory-hotbar'])$(name).append(inventorySlot(id,i,true,bagSlots[i]?.count||0,name==='inventory-hotbar'));});
 for(let i=9;i<36;i++)$('inventory-grid').append(inventorySlot(bagSlots[i]?.id||0,i,false,bagSlots[i]?.count||0,true));
 const id=hotbarSlots[selected];held.select(id,inventory[id]||0);$('selected-name').textContent='';
 updatePreview();survival.recipes();
}
function avatar(p){
 const {group,head,left,right,arm,arm2}=createPlayerModel(p.id);group.name='player:'+p.id;group.userData.hitbox={width:.6,height:1.8};
 const label=document.createElement('canvas');label.width=512;label.height=64;const c=label.getContext('2d');c.fillStyle='#050c40dd';c.fillRect(0,0,512,64);c.font='bold 32px monospace';c.textAlign='center';c.fillStyle='#e9eeff';c.fillText(p.name,256,44,480);const map=new THREE.CanvasTexture(label);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,depthTest:true}));sprite.position.y=2.15;sprite.scale.set(2.5,.32,1);group.add(sprite);scene.add(group);return {group,target:p,left,right,head,arm,arm2,map};
}
function removeAvatar(id){const a=avatars.get(id);if(!a)return;scene.remove(a.group);const geometries=new Set(),materials=new Set(),textures=new Set();a.group.traverse(m=>{if(m.geometry)geometries.add(m.geometry);for(const material of m.material?(Array.isArray(m.material)?m.material:[m.material]):[]){materials.add(material);if(material.map&&material.map!==texture)textures.add(material.map);}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();avatars.delete(id);}

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
   for(const c of chunks.values())if(c.group){scene.remove(c.group);c.group.traverse(m=>{m.geometry?.dispose();if(m.material&&(m.material.userData.owned||m.material.map!==texture))m.material.dispose();});}chunks.clear();bedDirections.clear();torchPositions.clear();dirty.clear();pending.clear();edits.clear();for(const id of avatars.keys())removeAvatar(id);
   resources.clear();predictionHistory.clear();correction.set(0,0,0);if(ownPlayer){scene.remove(ownPlayer.group);ownPlayer.group.traverse(o=>{o.geometry?.dispose();if(o.material)for(const material of Array.isArray(o.material)?o.material:[o.material]){if(material.map&&material.map!==texture)material.map.dispose();material.dispose();}});}ownPlayer=createPlayerModel(m.you.id);ownPlayer.group.name='local-player';scene.add(ownPlayer.group);resources.setDrops(m.drops||[],true);miningFeedback=null;me={...m.you,vy:0};inventory=m.inventory;bagSlots=m.slots||m.survival?.slots||bagSlots;hotbarSlots=m.hotbar||hotbarSlots;mined=m.mined;placed=m.placed;connected=true;survival.update(m.survival||{health:20,hunger:20});document.body.classList.remove('disconnected');document.body.classList.add('playing');$('gate').hidden=true;$('connection').textContent='● Connected';$('messages').replaceChildren();m.history.forEach(c=>chat(c.name,c.text));updateInventory();requestChunks();$('chat').classList.remove('chat-recent');clearTimeout(chatTimer);
  }else if(m.type==='chunk'){
   if(!Number.isInteger(m.x)||!Number.isInteger(m.z)||!retainChunk(m.x,m.z)){pending.delete(`${m.x},${m.z}`);return;}
   for(const bed of m.beds||[]){const direction={x:bed.head.x-bed.foot.x,z:bed.head.z-bed.foot.z};for(const a of [bed.foot,bed.head])bedDirections.set(`${a.x},${a.y},${a.z}`,direction);}
   const k=`${m.x},${m.z}`,binary=atob(m.data),data=Uint8Array.from(binary,c=>c.charCodeAt(0));if(data.length!==CHUNK*CHUNK*HEIGHT)return;
   for(const [key,id] of edits){const [x,y,z]=key.split(',').map(Number);if(Math.floor(x/CHUNK)===m.x&&Math.floor(z/CHUNK)===m.z)data[chunkIndex((x%CHUNK+CHUNK)%CHUNK,y,(z%CHUNK+CHUNK)%CHUNK)]=id;}
   const old=chunks.get(k);chunks.set(k,{data,group:old?.group});pending.delete(k);mark(m.x,m.z);
  }else if(m.type==='state'&&me){
   updateRoster(m.roster||m.players);

   resources.setMining(m.players);miningFeedback=m.players.find(p=>p.id===me.id)?.mining||null;
   const ids=new Set();for(const p of m.players){ids.add(p.id);if(p.id===me.id){const snapshot=predictionHistory.get(p.seq),expected=snapshot?{x:p.x+me.x-snapshot.x,y:p.y+me.y-snapshot.y,z:p.z+me.z-snapshot.z}:p;const distance=Math.hypot(me.x-p.x,me.y-p.y,me.z-p.z);if(distance>3){Object.assign(me,{x:p.x,y:p.y,z:p.z,vy:p.vy});correction.set(0,0,0);predictionHistory.clear();}else{correction.set(expected.x-me.x,expected.y-me.y,expected.z-me.z);if(!input.jump&&Math.abs(expected.y-me.y)>.3)me.vy=p.vy;}}else{let a=avatars.get(p.id);if(!a){a=avatar(p);avatars.set(p.id,a);a.group.position.set(p.x,p.y,p.z);}if((a.target?.health??20)<=0&&(p.health??20)>0){delete a.group.userData.deathAt;delete a.group.userData.damageAt;}a.target=p;a.group.visible=(p.health??20)>0;applyEquipment(a,p.equipment);showHeldItem(a,p.held||0);showHeldItem(a,p.offhand===181?0:p.offhand||0,'left');}}
   for(const id of avatars.keys())if(!ids.has(id))removeAvatar(id);$('online').textContent=`${m.online??m.players.length} online`;
  }else if(m.type==='block'){
   if(!me||!retainChunk(Math.floor(m.x/CHUNK),Math.floor(m.z/CHUNK)))return;
   if(m.bedDirection)bedDirections.set(`${m.x},${m.y},${m.z}`,m.bedDirection);else if(![20,26].includes(m.block))bedDirections.delete(`${m.x},${m.y},${m.z}`);
   if(m.block===0&&m.broken&&me&&Math.hypot(me.x-m.x,me.y-m.y,me.z-m.z)<32)resources.breakBlock(m.x,m.y,m.z,m.broken);
   edits.set(`${m.x},${m.y},${m.z}`,m.block);const c=chunks.get(`${Math.floor(m.x/CHUNK)},${Math.floor(m.z/CHUNK)}`);if(c)c.data[chunkIndex((m.x%CHUNK+CHUNK)%CHUNK,m.y,(m.z%CHUNK+CHUNK)%CHUNK)]=m.block;mark(Math.floor(m.x/CHUNK),Math.floor(m.z/CHUNK));
  }else if(m.type==='drop'){resources.setDrops([m.drop]);
  }else if(m.type==='drops-view'){resources.setDrops(m.drops,true);
  }else if(m.type==='drops'){resources.setDrops(m.drops);
  }else if(m.type==='pickup'){resources.removeDrop(m.id);
  }else if(m.type==='inventory'){inventory=m.inventory;bagSlots=m.slots||m.survival?.slots||bagSlots;hotbarSlots=m.hotbar||hotbarSlots;mined=m.mined;placed=m.placed;updateInventory();}
  else if(m.type==='combat'){markHit(scene,m.target,m.killed);if(m.target===me?.id){if(ownPlayer){ownPlayer.group.userData.damageAt=performance.now();if(m.killed)ownPlayer.group.userData.deathAt=performance.now();}$('damage-flash').classList.add('on');clearTimeout(combatFlashTimer);combatFlashTimer=setTimeout(()=>$('damage-flash').classList.remove('on'),230);}if(m.attacker===me?.id){$('crosshair').classList.add('hit');clearTimeout(hitMarkerTimer);hitMarkerTimer=setTimeout(()=>$('crosshair').classList.remove('hit'),180);}}
  else if(m.type==='survival'){if(m.state.health>0&&survival.state.health<=0&&ownPlayer){delete ownPlayer.group.userData.deathAt;delete ownPlayer.group.userData.damageAt;}const changed=JSON.stringify(bagSlots)!==JSON.stringify(m.state.slots);bagSlots=m.state.slots||bagSlots;hotbarSlots=m.state.hotbar||hotbarSlots;survival.update(m.state);if(changed)updateInventory();if(previewActor){applyEquipment(previewActor,{...m.state.equipment,...(m.state.offhand?.id===181?{shield:181}:{})});updatePreview();}}
  else if(m.type==='survival-world'){survival.world(m);for(const c of m.crops||[]){const key=`${c.x},${c.y},${c.z}`;if(cropStages.get(key)!==c.stage){cropStages.set(key,c.stage);mark(Math.floor(c.x/CHUNK),Math.floor(c.z/CHUNK));}}}
  else if(m.type==='chest-state')survival.chest(m.chest);
  else if(m.type==='projectile')survival.projectile(m);
  else if(m.type==='bed-status'){toast(m.text);}
  else if(m.type==='station'){survival.station(m);openDialog('inventory');}
  else if(m.type==='chat')chat(m.name,m.text);
  else if(m.type==='notice')chat('',m.text,true);
  else if(m.type==='leave')removeAvatar(m.id);
  else if(m.type==='error'){toast(m.message);$('gate-status').textContent=m.message;}
 };
 socket.onerror=()=>{$('gate-status').textContent='Cannot reach the public world. Please retry shortly.';};
 socket.onclose=()=>{const was=connected;connected=false;for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();me=null;inputReset();resources.clear();miningFeedback=null;document.exitPointerLock?.();$('gate').hidden=false;$('join').disabled=false;$('join').textContent=was?'Reconnect to public world →':'Join public world →';$('connection').textContent='Disconnected';document.body.classList.add('disconnected');document.body.classList.remove('playing');$('online').textContent='0 online';$('join').hidden=false;if(was)$('gate-status').textContent='Connection lost. Your saved inventory and world are safe. Reconnect to continue.';};
 }catch(e){$('gate-status').textContent=e.message;$('join').disabled=false;$('login').hidden=dev;$('join').hidden=false;}
}
$('join').onclick=join;$('wake-button').onclick=()=>send({type:'wake'});
async function checkServer(){try{const r=await fetch('./health',{cache:'no-store'});if(!r.ok)throw new Error();const health=await r.json();if(!health.ok)throw new Error();dev=health.dev===true;$('dev-label').hidden=!dev;$('gate-status').textContent=dev?'Local development server · use different names in two browser windows to test multiplayer.':'One shared world · sign in with your Orbit account.';$('join').disabled=false;if(new URLSearchParams(location.search).get('manualJoin')!=='1'){if(dev)$('dev-name').value=new URLSearchParams(location.search).get('devName')||'Builder';await join();}else $('join').hidden=false;}catch{$('gate-status').textContent='The public world is unavailable. Please ask the site owner to start the world server.';$('join').disabled=true;}}
$('join').disabled=true;checkServer();
function inputReset(){$('player-list').hidden=true;setEating(false);for(const k of Object.keys(input))delete input[k];setMining(false);}
function menuOpen(){return !!document.querySelector('dialog[open]')||!$('chat-form').hidden||!$('gate').hidden;}
function controls(){return connected&&!survival.state.sleeping&&!menuOpen()&&(coarse||document.pointerLockElement===canvas);}
let tryingFocus=false;
function focusWorld(){if(!connected||coarse||menuOpen()||survival.state.health<=0||tryingFocus||document.pointerLockElement===canvas)return;tryingFocus=true;canvas.focus();const attempt=n=>{try{Promise.resolve(canvas.requestPointerLock?.()).then(()=>setTimeout(()=>tryingFocus=false,100)).catch(()=>{if(n<5&&!menuOpen()&&connected)setTimeout(()=>attempt(n+1),100);else tryingFocus=false;});}catch{tryingFocus=false;}};attempt(0);}
function closeDialog(id){$(id).close();focusWorld();}
function openDialog(id){inputReset();$(id).showModal();document.exitPointerLock?.();if(id==='inventory')updatePreview();}
createPauseMenu({openDialog,closeDialog,bindings,stats:()=>({mined,placed,...survival.state}),players:()=>[...(me?[me]:[]),...[...avatars.values()].map(a=>a.target)],disconnect(){socket?.close(1000,'Disconnected');location.href='../games/';}});
$('inventory-button').onclick=()=>{survival.hand();openDialog('inventory');};$('help-button').onclick=()=>openDialog('help');document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closeDialog(b.dataset.close));
for(const dialog of document.querySelectorAll('dialog')){dialog.addEventListener('cancel',e=>{e.preventDefault();if(bindings.waiting){bindings.cancel();return;}closeDialog(dialog.id);});dialog.addEventListener('close',focusWorld);}
function openChat(){if(!connected)return;inputReset();clearTimeout(chatTimer);$('chat').classList.add('chat-open');$('chat-form').hidden=false;document.exitPointerLock?.();$('chat-input').focus();}
$('chat-button').onclick=openChat;$('chat-form').onsubmit=e=>{e.preventDefault();send({type:'chat',text:$('chat-input').value});$('chat-input').value='';$('chat-form').hidden=true;$('chat').classList.remove('chat-open');showChat();focusWorld();};
function movementAction(code){const action=bindings.action(code);return ['forward','back','left','right','jump','sneak'].includes(action)?action:null;}
function toggleSprint(){sprintLatch=!sprintLatch;input.sprint=sprintLatch;sendInput();}
const shortcuts=createShortcuts({canvas,renderer,scene,camera,controls,bindings,player:()=>me,state:()=>survival.state,send,fps:()=>Math.round(1000/averageFrame),biome:()=>$('biome').textContent,chunkInfo:()=>({size:SIZE,render:viewDistance,simulation:SIMULATION_DISTANCE,loaded:chunks.size,pending:pending.size}),reload(){for(const c of chunks.values())disposeChunk(c);chunks.clear();torchPositions.clear();dirty.clear();pending.clear();edits.clear();bedDirections.clear();cropStages.clear();requestChunks();}});
function cyclePerspective(){perspective=(perspective+1)%3;$('perspective-button').textContent=['First person','Third person · back','Third person · front'][perspective];}
$('perspective-button').onclick=cyclePerspective;
addEventListener('keydown',e=>{
 if(bindings.capture(e))return;
 if(shortcuts.keydown(e))return;
 const bound=bindings.action(e.code);if(bound==='players'&&connected&&!menuOpen()){e.preventDefault();$('player-list').hidden=false;return;}
 if(bound==='perspective'){e.preventDefault();if(connected&&!e.repeat)cyclePerspective();return;}
 if(e.code==='Escape'){e.preventDefault();if(survival.state.sleeping){send({type:'wake'});return;}if(!$('chat-form').hidden){$('chat-form').hidden=true;$('chat').classList.remove('chat-open');showChat();focusWorld();return;}const open=[...document.querySelectorAll('dialog[open]')].at(-1);if(open)closeDialog(open.id);else if(connected)openDialog('pause-menu');return;}
 if(e.target.matches?.('input,textarea,select')&&document.pointerLockElement!==canvas){if(e.code==='Escape'){$('chat-form').hidden=true;e.target.blur();}return;}
 if(bound==='chat'&&connected&&!menuOpen()){e.preventDefault();openChat();return;}
 if(bound==='use'&&controls()){e.preventDefault();if(ITEMS[hotbarSlots[selected]]?.food)setEating(true);else if(!e.repeat)send({type:'use'});return;}
 if(bound==='inventory'&&connected&&(!menuOpen()||$('inventory').open)){e.preventDefault();if($('inventory').open)closeDialog('inventory');else{survival.hand();openDialog('inventory');}return;}
 if(e.key==='?'){openDialog('help');return;}
 if(bound?.startsWith('hotbar')){e.preventDefault();const to=Number(bound.slice(6))-1;if($('inventory').open){const hovered=document.querySelector('#inventory [data-slot-area]:hover');if(hovered)send({type:'container-hotbar',area:hovered.dataset.slotArea,index:+hovered.dataset.slotIndex,to});}else chooseSlot(to);return;}
 if(bound==='drop'&&connected&&!e.repeat){e.preventDefault();send({type:'drop-held',all:e.ctrlKey});return;}
 if(bound==='offhand'&&connected&&!menuOpen()&&!e.repeat){e.preventDefault();send({type:'swap-offhand'});return;}
 if(bound==='forward'&&controls()&&!e.repeat){const now=performance.now();if(now-lastForwardTap<280)sprintLatch=true;lastForwardTap=now;input.sprint=sprintLatch;}
 if(bound==='jump'&&controls()&&!e.repeat){const now=performance.now();if(now-lastJumpTap<280&&survival.state.mode==='creative')send({type:'flight'});lastJumpTap=now;}

 if(bound==='sprint'&&controls()&&!e.repeat){e.preventDefault();toggleSprint();return;}
 if(bound==='attack'&&controls()){e.preventDefault();setMining(true);return;}if(bound==='place'&&controls()&&!e.repeat){e.preventDefault();useOrPlace();return;}
 const movement=movementAction(e.code);if(movement&&controls()){e.preventDefault();input[movement]=true;}
 });addEventListener('keyup',e=>{if(bindings.action(e.code)==='players')$('player-list').hidden=true;if(shortcuts.keyup(e))return;const movement=movementAction(e.code);if(movement)input[movement]=false;if(bindings.action(e.code)==='attack')setMining(false);if(['use','place'].includes(bindings.action(e.code)))setEating(false);});addEventListener('blur',inputReset);document.addEventListener('visibilitychange',()=>{if(document.hidden)inputReset();});document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement===canvas){tryingFocus=false;if($('toast').textContent.startsWith('Click the world'))$('toast').classList.remove('on');return;}inputReset();if(connected&&survival.state.health>0&&!menuOpen()&&!tryingFocus)openDialog('pause-menu');});
canvas.addEventListener('click',()=>{if(connected&&!coarse&&!menuOpen()){focusWorld();}});
addEventListener('mousemove',e=>{if(!me||document.pointerLockElement!==canvas)return;me.yaw-=e.movementX*.0025;me.pitch=Math.max(-1.54,Math.min(1.54,me.pitch-e.movementY*.0025));});
function sendInput(){if(me&&connected){input.sprint=sprintLatch;predictionHistory.set(++seq,{x:me.x,y:me.y,z:me.z});while(predictionHistory.size>100)predictionHistory.delete(predictionHistory.keys().next().value);send({type:'input',...(controls()?input:{}),mine:miningHeld&&controls(),yaw:me.yaw,pitch:me.pitch,seq});}}
setInterval(sendInput,50);
function setEating(value){input.eat=!!value&&!!ITEMS[hotbarSlots[selected]]?.food&&inventory[hotbarSlots[selected]]>0&&survival.state.hunger<20;if(input.eat){input.mine=false;miningHeld=false;}sendInput();}
function setMining(value){if(value)setEating(false);const first=!!value&&!miningHeld;miningHeld=!!value;if(!miningHeld)miningFeedback=null;sendInput();if(first&&connected&&controls())send({type:'attack'});}
function useOrPlace(){if(survival.nearBoat(me)&&!survival.state.boat&&!input.sneak){action('use');return;}const id=hotbarSlots[selected],hit=me&&raycast(me,get),off=survival.state.offhand;if(!input.sneak&&[18,19,20,23,24,26].includes(hit?.block))action('use');else if((ITEMS[id]?.tool||id===180||!inventory[id])&&off?.count>0&&isBlock(off.id)&&hit?.place){setMining(false);held.swing();sendInput();send({type:'place',hand:'offhand'});}else if(ITEMS[id]?.food)setEating(true);else if(ITEMS[id]?.tool==='hoe'||[113,180,232,233,234].includes(id))action('use');else if(isBlock(id)&&hit?.place)action('place');else if(off?.id===181||id===181&&inventory[id]>0){input.block=true;sendInput();if(coarse)setTimeout(()=>input.block=false,250);}else if(isBlock(id))action('place');else action('use');}
function action(type){if(!connected||!me||Date.now()-lastAction<190)return;lastAction=Date.now();setMining(false);held.swing();sendInput();if(type==='use'||hotbarSlots[selected])send({type,block:hotbarSlots[selected]});}
canvas.addEventListener('mousedown',e=>{if(!controls())return;e.preventDefault();const code='Mouse'+e.button,event={code,target:canvas,repeat:false,preventDefault:()=>e.preventDefault()};if(shortcuts.keydown(event))return;const bound=bindings.action(code),movement=movementAction(code);if(bound==='attack')setMining(true);else if(bound==='place')useOrPlace();else if(bound==='sprint')toggleSprint();else if(bound==='perspective')cyclePerspective();else if(bound==='inventory'){$('inventory-button').click();}else if(bound==='offhand')send({type:'swap-offhand'});else if(bound==='drop')send({type:'drop-held',all:e.ctrlKey});else if(bound==='use'){if(ITEMS[hotbarSlots[selected]]?.food)setEating(true);else send({type:'use'});}else if(bound==='chat')openChat();else if(bound?.startsWith('hotbar'))chooseSlot(Number(bound.slice(6))-1);else if(movement){if(movement==='forward'){const now=performance.now();if(now-lastForwardTap<280)sprintLatch=true;lastForwardTap=now;}if(movement==='jump'){const now=performance.now();if(now-lastJumpTap<280&&survival.state.mode==='creative')send({type:'flight'});lastJumpTap=now;}input[movement]=true;}});
addEventListener('mouseup',e=>{const code='Mouse'+e.button;shortcuts.keyup({code,preventDefault:()=>e.preventDefault()});if(bindings.action(code)==='attack')setMining(false);const movement=movementAction(code);if(movement)input[movement]=false;if(['place','use'].includes(bindings.action(code))){setEating(false);input.block=false;sendInput();}});
canvas.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();});
canvas.addEventListener('pointerup',e=>{if(e.button===2&&!menuOpen()&&connected&&!coarse&&document.pointerLockElement!==canvas)focusWorld();});
$('inventory').addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('contextmenu',e=>{if(controls()){e.preventDefault();e.stopPropagation();}},true);canvas.addEventListener('wheel',e=>{if(!connected)return;e.preventDefault();setMining(false);chooseSlot((selected+(e.deltaY>0?1:8))%9);},{passive:false});
$('touch-mine').onpointerdown=e=>{e.preventDefault();if(!connected||menuOpen())return;$('touch-mine').setPointerCapture(e.pointerId);setMining(true);};
$('touch-mine').onpointerup=$('touch-mine').onpointercancel=()=>setMining(false);
$('touch-place').onclick=null;$('touch-place').onpointerdown=e=>{e.preventDefault();if(!controls())return;$('touch-place').setPointerCapture(e.pointerId);useOrPlace();};$('touch-place').onpointerup=$('touch-place').onpointercancel=()=>setEating(false);
for(const id of ['eat-button','use-button']){$(id).onclick=null;$(id).onpointerdown=e=>{e.preventDefault();if(!connected||menuOpen())return;$(id).setPointerCapture(e.pointerId);if(id==='eat-button'||ITEMS[hotbarSlots[selected]]?.food)setEating(true);else send({type:'use'});};$(id).onpointerup=$(id).onpointercancel=()=>setEating(false);}document.querySelectorAll('[data-key]').forEach(b=>{b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);input[b.dataset.key]=true;};b.onpointerup=b.onpointercancel=()=>input[b.dataset.key]=false;});
let touch=null;canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'){touch={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);}});canvas.addEventListener('pointermove',e=>{if(!touch||touch.id!==e.pointerId||!me)return;me.yaw-=(e.clientX-touch.x)*.006;me.pitch=Math.max(-1.54,Math.min(1.54,me.pitch-(e.clientY-touch.y)*.006));touch.x=e.clientX;touch.y=e.clientY;});canvas.addEventListener('pointerup',()=>touch=null);
let previous=performance.now(),worldRequest=0,hudAt=0;
function animate(now){requestAnimationFrame(animate);const dt=Math.min((now-previous)/1000,.15);previous=now;averageFrame=averageFrame*.95+dt*1000*.05;if(connected&&now-resolutionAt>2500){resolutionAt=now;const next=averageFrame>28?Math.max(.75,worldPixelRatio-.15):averageFrame<18?Math.min(devicePixelRatio,1.5,worldPixelRatio+.1):worldPixelRatio;if(next!==worldPixelRatio){worldPixelRatio=next;renderer.setPixelRatio(next);renderer.setSize(innerWidth,innerHeight);}}
 if(dirty.size){const k=dirty.values().next().value;dirty.delete(k);meshChunk(k);}
 shortcuts.tick();
 if(me&&connected){
  me.survival=survival.state;
  if(now-torchLightAt>250){torchLightAt=now;const nearest=[...torchPositions.values()].flat().filter(t=>Math.hypot(t.x-me.x,t.y-me.y,t.z-me.z)<16).sort((a,b)=>Math.hypot(a.x-me.x,a.y-me.y,a.z-me.z)-Math.hypot(b.x-me.x,b.y-me.y,b.z-me.z));torchLights.forEach((light,i)=>{light.intensity=nearest[i]?2.4:0;if(nearest[i])light.position.set(nearest[i].x,nearest[i].y,nearest[i].z);});}
  if(controls()&&survival.state.health>0&&!survival.state.sleeping){for(let remaining=dt;remaining>0;remaining-=1/60)(survival.state.boat?stepBoat:step)(me,{...input,sprint:input.sprint&&survival.state.hunger>6},Math.min(remaining,1/60),get);}
  const blend=1-Math.exp(-dt*5);for(const axis of ['x','y','z']){const next={...me,[axis]:me[axis]+correction[axis]*blend};if(!collides(next,get))me[axis]=next[axis];else correction[axis]=0;}correction.multiplyScalar(1-blend);
  camera.position.set(me.x,me.y+1.62,me.z);camera.rotation.set(me.pitch,me.yaw,0,'YXZ');
  if(ownPlayer){ownPlayer.group.visible=(perspective!==0||survival.state.sleeping)&&survival.state.health>0;ownPlayer.group.rotation.z=0;ownPlayer.group.position.set(me.x,me.y,me.z);ownPlayer.group.rotation.y=me.yaw;ownPlayer.head.rotation.x=me.pitch;showHeldItem(ownPlayer,inventory[hotbarSlots[selected]]>0?hotbarSlots[selected]:0);showHeldItem(ownPlayer,survival.state.offhand?.id===181?0:survival.state.offhand?.id||0,'left');const stride=controls()&&(input.forward||input.back||input.left||input.right)?Math.sin(now*.009)*.5:0;ownPlayer.left.rotation.x=survival.state.boat?-Math.PI/2:stride;ownPlayer.right.rotation.x=survival.state.boat?-Math.PI/2:-stride;ownPlayer.arm.rotation.x=-stride;ownPlayer.arm2.rotation.x=input.eat&&ITEMS[hotbarSlots[selected]]?.food&&survival.state.hunger<20?-1.7+Math.sin(now*.028)*.08:miningHeld?-.9+Math.sin(now*.022)*.35:stride;applyEquipment(ownPlayer,{...survival.state.equipment,...(survival.state.offhand?.id===181?{shield:181}:{})});}
  if(ownPlayer&&!survival.state.sleeping)tintAndFall(ownPlayer.group,now);
  if(survival.state.sleeping&&survival.state.bedPose){sleepPose(ownPlayer.group,survival.state.bedPose);if(!perspective){const b=survival.state.bedPose;camera.position.set(b.head.x+.5,b.head.y+1,b.head.z+.5);camera.rotation.set(1.2,me.yaw,0);}}
  if(perspective){const eye=new THREE.Vector3(me.x,me.y+1.5,me.z),direction=new THREE.Vector3(-Math.sin(me.yaw)*Math.cos(me.pitch),Math.sin(me.pitch),-Math.cos(me.yaw)*Math.cos(me.pitch)).multiplyScalar(perspective===1?-1:1);let distance=4.2;for(let t=.3;t<=4.2;t+=.08){const point=eye.clone().addScaledVector(direction,t);if(solid(get(Math.floor(point.x),Math.floor(point.y),Math.floor(point.z)))){distance=Math.max(.15,t-.25);break;}}camera.position.copy(eye).addScaledVector(direction,distance);camera.lookAt(eye);}
  if(now-worldRequest>500){worldRequest=now;requestChunks();}
  const hit=raycast(me,get);outline.visible=!!hit;if(hit){if(outline.userData.block!==hit.block){outline.geometry.dispose();const points=[];for(const [x,y,z,a,b,c]of blockBoxes(hit.block)){const box=new THREE.EdgesGeometry(new THREE.BoxGeometry(a-x,b-y,c-z)),v=box.attributes.position;for(let i=0;i<v.count;i++)points.push(v.getX(i)+(a+x)/2,v.getY(i)+(b+y)/2,v.getZ(i)+(c+z)/2);box.dispose();}outline.geometry=new THREE.BufferGeometry();outline.geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));outline.userData.block=hit.block;}outline.scale.set(1,1,1);outline.position.set(hit.x,hit.y,hit.z);}

  if(now-hudAt>180){hudAt=now;$('target').textContent=hit?.block===9?'Unbreakable':'';$('coordinates').textContent=`XYZ ${me.x.toFixed(1)} / ${me.y.toFixed(1)} / ${me.z.toFixed(1)}`;$('biome').textContent=terrain(Math.floor(me.x),Math.floor(me.z)).biome;}
 }else{if(ownPlayer)ownPlayer.group.visible=false;outline.visible=false;camera.position.set(32+Math.sin(now*.00003)*7,37,43);camera.lookAt(0,15,0);}
 for(const a of avatars.values()){const t=a.target,d=Math.hypot(a.group.position.x-t.x,a.group.position.z-t.z);a.group.position.lerp(new THREE.Vector3(t.x,t.y,t.z),Math.min(1,dt*13));a.group.rotation.y=t.yaw;a.left.rotation.x=d>.01?Math.sin(now*.009)*.45:0;a.right.rotation.x=-a.left.rotation.x;a.arm.rotation.x=-a.left.rotation.x*.85;a.arm2.rotation.x=a.left.rotation.x*.85;a.head.rotation.x=Math.max(-.8,Math.min(.8,t.pitch||0));if(t.boat){a.left.rotation.x=-Math.PI/2;a.right.rotation.x=-Math.PI/2;}tintAndFall(a.group,now);if(t.sleeping)sleepPose(a.group,t.bedPose);if(t.eating)a.arm2.rotation.x=-1.7+Math.sin(now*.028)*.08;else if(t.mining)a.arm2.rotation.x=-.9+Math.sin(now*.022)*.35;}
 const underwater=me&&get(Math.floor(me.x),Math.floor(me.y+1.62),Math.floor(me.z))===8;
 document.body.classList.toggle('underwater',!!underwater);
 const daylight=survival.animate(now,dt);sun.intensity=1.65*daylight;scene.children.find(o=>o.isHemisphereLight).intensity=.2+daylight*1.5;scene.fog.color.set(underwater?'#3887a9':'#b9d4ff').multiplyScalar(underwater?1:daylight);for(const child of scene.children)if(child.material?.isShaderMaterial)child.material.uniforms.daylight.value=daylight;scene.fog.near=underwater?1:Math.max(8,(viewDistance-1)*CHUNK);scene.fog.far=underwater?16:viewDistance*CHUNK;
 if(miningHeld&&controls()&&now-lastMiningSwing>220){lastMiningSwing=now;held.swing();}
 leftHeld.select(survival.state.offhand?.id||0,survival.state.offhand?.count||0);leftHeld.update(now,controls()&&!!(input.forward||input.back||input.left||input.right),connected&&perspective===0&&survival.state.health>0&&!menuOpen()&&survival.state.offhand?.id!==181);
 firstShield.visible=connected&&perspective===0&&survival.state.health>0&&survival.state.offhand?.id===181&&!menuOpen();firstShield.scale.setScalar(Math.max(.6,Math.min(1,camera.aspect/1.25)));firstShield.position.lerp(new THREE.Vector3((input.block?-.18:-.4)*Math.min(1,camera.aspect/1.25),input.block?-.24:-.45,input.block?-.5:-.7),Math.min(1,dt*12));firstShield.rotation.y=input.block?0:.4;
 resources.update(Date.now(),dt,camera);
 held.update(now,controls()&&!!(input.forward||input.back||input.left||input.right),connected&&!survival.state.sleeping&&!menuOpen()&&perspective===0&&survival.state.health>0,input.eat&&!!ITEMS[hotbarSlots[selected]]?.food&&inventory[hotbarSlots[selected]]>0&&survival.state.hunger<20);
 atmosphere(now,camera,survival.state.time||6000);
 renderer.render(scene,camera);
}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
addEventListener('pagehide',()=>socket?.close(1000,'Leaving world'));
// Deterministic landscape preview before joining; this is terrain only, never fake players.
for(let cx=-1;cx<=1;cx++)for(let cz=-1;cz<=1;cz++){const data=new Uint8Array(CHUNK*CHUNK*HEIGHT);for(let y=0;y<HEIGHT;y++)for(let z=0;z<CHUNK;z++)for(let x=0;x<CHUNK;x++)data[chunkIndex(x,y,z)]=resourceBlock(cx*CHUNK+x,y,cz*CHUNK+z);const k=`${cx},${cz}`;chunks.set(k,{data});dirty.add(k);}
updateInventory();requestAnimationFrame(animate);
