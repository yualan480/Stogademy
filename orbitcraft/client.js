import {isLadder} from './shapes.js';
import {createShieldMesh,poseFirstPersonShield,posePlayerShield} from './shield-visuals.js';
import {changedSections,mergeSections,faceShades} from './mesh-work.js';
import {createRecipeBook} from './recipe-book.js?v=20261109-shields46';
import {PoseHistory,RemoteMotion,reconciliationError,correctionStep} from './prediction.js?v=20261109-shields46';
import {createSkinChooser} from './skins-ui.js?v=20261109-shields46';
import {createSignEditor} from './signs-ui.js?v=20261109-shields46';
import {addSignText} from './sign-visuals.js?v=20261109-shields46';
import {createPearlVisuals} from './pearl-visuals.js?v=20261104-pearl31';
import {createDrawnBow,createArrowVisuals} from './bow-visuals.js?v=20261109-shields46';
import {createDamageTilt} from './damage-camera.js?v=20261104-mobs25';
import {createLocatorBar,playerColor} from './locator.js?v=20261104-locator22';
import {createSounds} from './sounds.js?v=20261104-audio20';
import {xpProgress} from './experience.js';
import {createXPVisuals} from './experience-visuals.js?v=20261104-audio20';
import {isTorch,isPlant,isStair,isSpike,blockBoxes} from './shapes.js';
import {markHit,tintAndFall,sleepPose} from './entity-effects.js?v=20261104-audio20';
import {wantedChunks,inRange,renderDistance as clampRenderDistance,SIMULATION_DISTANCE} from './chunks.js?v=20261104-audio20';
import {createKeybinds} from './keybinds.js?v=20261109-shields46';
import {createPauseMenu} from './pause-menu.js?v=20261104-audio20';
import {furnitureModel} from './block-models.js?v=20261109-shields46';
import {createShortcuts} from './game-shortcuts.js?v=20261104-audio20';
import { ITEMS,itemName,isBlock } from './items.js';
import { createSurvivalView,applyEquipment } from './survival-ui.js?v=20261109-shields46';
import * as THREE from './vendor/three.module.js';
import { BLOCKS,SLOTS,CHUNK,HEIGHT,MIN_Y,CHUNK_HEIGHT,SIZE,chunkIndex,inside,resourceBlock,terrain,step,stepBoat,eyeHeight,raycast,solid,collides } from './world.js?v=20261109-shields46';
import { createResourceEffects,blockGeometry } from './mining-visuals.js?v=20261109-shields46';
import { createPlayerModel } from './players.js?v=20261109-shields46';
import { createTextures, createAtmosphere, createHeldBlock, itemSpriteGeometry, TILE_COUNT, tileFor, terrainDetail } from './visuals.js?v=20261109-shields46';
import { SUPABASE_URL,SUPABASE_ANON_KEY } from '../chatter/config.js';
const $=id=>document.getElementById(id), canvas=$('world');
const bindings=createKeybinds();const sounds=createSounds();
const chunks=new Map(),pending=new Map(),dirty=new Set(),edits=new Map(),avatars=new Map();
let dimension='overworld';
let socket,me=null,inventory={},selected=0,seq=0,dev=false,connected=false,lastAction=0,forceReconcile=false,mined=0,placed=0,miningHeld=false,miningFeedback=null,lastMiningSwing=0,perspective=0,ownPlayer=null;
const predictionHistory=new Map(),correction=new THREE.Vector3(),damageCamera=createDamageTilt(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
document.documentElement.dataset.theme='dark';
let lastForwardTap=-Infinity,lastJumpTap=-Infinity,sprintLatch=false;
const input={},SESSION='sb-qtmrtxgkisshdtqshjre-auth-token',coarse=matchMedia('(pointer:coarse)').matches;
let viewDistance=coarse?2:3;try{viewDistance=clampRenderDistance(Number(localStorage.getItem('orbitcraft-render-distance-v1')||viewDistance));}catch{}
const distanceSettings=document.createElement('div');distanceSettings.className='distance-settings';distanceSettings.innerHTML='<label for="render-distance">Render Distance: <output id="render-distance-value"></output></label><input id="render-distance" type="range" min="1" max="4" step="1"><p>World difficulty: Easy.</p><p>Simulation distance: 2 chunks. Distant farms, furnaces and creatures pause until a player returns.</p>';bindings.dialog.querySelector('#keybind-list').before(distanceSettings);$('render-distance').value=viewDistance;$('render-distance-value').textContent=viewDistance+' chunks';$('render-distance').oninput=e=>{viewDistance=clampRenderDistance(Number(e.target.value));$('render-distance-value').textContent=viewDistance+' chunks';try{localStorage.setItem('orbitcraft-render-distance-v1',viewDistance);}catch{}pending.clear();requestChunks();};
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
const resources=createResourceEffects(scene,texture);const xpEffects=createXPVisuals(scene);const drawnBow=createDrawnBow(),arrowVisuals=createArrowVisuals(scene),pearlVisuals=createPearlVisuals(scene);camera.add(drawnBow.group);let bowHeld=false,bowDrawAt=0;
const movementHistory=new PoseHistory();
const furnaceStates=new Map();
const signTexts=new Map();
const bedDirections=new Map(),torchPositions=new Map(),torchLights=Array.from({length:coarse?2:4},()=>{const light=new THREE.PointLight(0xffb56c,0,12,1.5);light.name='world-point-light';scene.add(light);return light;});let torchLightAt=0;
const firstShield=new THREE.Group();firstShield.name='first-person-shield';firstShield.position.set(-.75,-.58,-1.05);camera.add(firstShield);firstShield.add(createShieldMesh({firstPerson:true}));
const rightShield=new THREE.Group();rightShield.name='first-person-right-shield';rightShield.position.set(.75,-.58,-1.05);camera.add(rightShield);rightShield.add(createShieldMesh({firstPerson:true}));
function showHeldItem(model,id,side='right'){if(!model)return;const key=side==='left'?'offhandId':'heldId',meshKey=side==='left'?'offhandMesh':'itemMesh',arm=side==='left'?model.arm:model.arm2;if(model[key]===id)return;model[key]=id;if(model[meshKey]){arm.remove(model[meshKey]);model[meshKey].geometry.dispose();model[meshKey].material.dispose();model[meshKey]=null;}if(!id)return;const mesh=id===181?createShieldMesh():new THREE.Mesh((id>=100?itemSpriteGeometry(id,texture,ITEMS[id]?.tool?.55:.38):blockGeometry(id,.23)),new THREE.MeshLambertMaterial({map:texture,alphaTest:.5,side:THREE.DoubleSide}));mesh.name=side==='left'?'left-hand-item':'right-hand-item';mesh.position.set(0,-.48,-.12);mesh.rotation.set(id===181?0:id>=100?-.1:-.45,id===181?(side==='left'?-.3:.3):id>=100?Math.PI/2:0,id===181?0:id>=100?-.7:0);if(id===181)mesh.position.set(0,-.55,-.18);arm.add(mesh);model[meshKey]=mesh;}


const lavaMaterial=new THREE.MeshLambertMaterial({map:texture,vertexColors:true,emissive:0xff682b,emissiveMap:texture,emissiveIntensity:.8}),portalMaterial=new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:.87,side:THREE.DoubleSide,depthWrite:false}),glowMaterial=new THREE.MeshBasicMaterial({map:texture,vertexColors:true});
const material=new THREE.MeshLambertMaterial({map:texture,vertexColors:true,alphaTest:.5});const waterMaterial=new THREE.MeshLambertMaterial({map:texture,vertexColors:true,transparent:true,opacity:.64,depthWrite:false,side:THREE.DoubleSide});
waterMaterial.onBeforeCompile=shader=>{shader.uniforms.flowTime={value:0};waterMaterial.userData.flowShader=shader;shader.fragmentShader='uniform float flowTime;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#ifdef USE_MAP\n diffuseColor *= texture2D(map, vec2(vMapUv.x, fract(vMapUv.y + flowTime * .16)));\n #endif');};
const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.006,1.006,1.006)),new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.8}));scene.add(outline);outline.visible=false;
const get=(x,y,z)=>{if(!inside(x,y,z))return 0;const k=`${x},${y},${z}`;if(edits.has(k))return edits.get(k);const c=chunks.get(`${Math.floor(x/CHUNK)},${Math.floor(z/CHUNK)}`);return c?c.data[chunkIndex((x%CHUNK+CHUNK)%CHUNK,y,(z%CHUNK+CHUNK)%CHUNK)]:connected?9:resourceBlock(x,y,z);};
const FACE_UV=[[0,0],[1,0],[1,1],[0,1]];
const faces=[
 {n:[1,0,0],v:[[1,0,1],[1,0,0],[1,1,0],[1,1,1]],s:.82},
 {n:[-1,0,0],v:[[0,0,0],[0,0,1],[0,1,1],[0,1,0]],s:.72},
 {n:[0,1,0],v:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]],s:1},
 {n:[0,-1,0],v:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]],s:.55},
 {n:[0,0,1],v:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]],s:.88},
 {n:[0,0,-1],v:[[1,0,0],[0,0,0],[0,1,0],[1,1,0]],s:.76}
];
function disposeRenderPart(part){part.traverse(m=>{m.geometry?.dispose();if(m.material&&(m.material.userData.owned||m.material.map!==texture)){if(m.material.userData.signText)m.material.map?.dispose();m.material.dispose();}});part.parent?.remove(part);}
function* meshChunk(k,requested=null){
 const chunk=chunks.get(k);if(!chunk)return;const [cx,cz]=k.split(',').map(Number);
 const block=(x,y,z)=>{if(y<MIN_Y)return 9;if(y>=HEIGHT)return 0;if(!inside(x,y,z))return 0;const c=chunks.get(`${Math.floor(x/CHUNK)},${Math.floor(z/CHUNK)}`);return c?c.data[chunkIndex((x%CHUNK+CHUNK)%CHUNK,y,(z%CHUNK+CHUNK)%CHUNK)]:9;};
 const opaque=(x,y,z)=>{const b=block(x,y,z);return b&&b!==8&&b!==54&&b!==62&&b!==63&&b!==6&&b!==50&&b!==52&&!isTorch(b)&&!isPlant(b)&&!isLadder(b);};
 let highest=chunk.data.length-1;while(highest>=0&&!chunk.data[highest])highest--;const meshHeight=Math.min(HEIGHT,Math.floor(highest/(CHUNK*CHUNK))+MIN_Y+1),centerY=me?.y??terrain(cx*CHUNK+8,cz*CHUNK+8).height;
 if(!chunk.group){chunk.group=new THREE.Group();chunk.group.name='chunk:'+k;scene.add(chunk.group);}chunk.group.visible=!me||inRange(me,{x:cx*CHUNK,z:cz*CHUNK},viewDistance);
 const sectionIds=Array.from({length:Math.ceil((meshHeight-MIN_Y)/16)},(_,i)=>i+MIN_Y/16).sort((a,b)=>Math.abs((a+.5)*16-centerY)-Math.abs((b+.5)*16-centerY));
 for(const old of [...chunk.group.children])if(old.userData.section!=null&&!sectionIds.includes(old.userData.section))disposeRenderPart(old);
 for(const section of sectionIds){if(requested&&!requested.has(section))continue;const lights=[],furniture=[],groups=Array.from({length:5},()=>({p:[],n:[],uv:[],c:[]}));let sliceAt=performance.now();
 for(let y=section*16;y<Math.min(section*16+16,meshHeight);y++){for(let z=0;z<CHUNK;z++)for(let x=0;x<CHUNK;x++){
  if((x+z*CHUNK)%64===0&&performance.now()-sliceAt>2){yield;sliceAt=performance.now();}
  const id=chunk.data[chunkIndex(x,y,z)];if(!id)continue;const wx=cx*CHUNK+x,wz=cz*CHUNK+z,g=groups[id===8?1:id===54?2:[62,63].includes(id)?3:id===57?4:0];
  if(id===57||[62,63].includes(id)||id===54&&wx%4===0&&wz%4===0&&block(wx,y+1,wz)!==54)lights.push({x:wx+.5,y:y+.6,z:wz+.5});
  if([20,26,23,38].includes(id)||isTorch(id)||isStair(id)||isSpike(id)||isLadder(id)){let dx=0,dz=-1;const direction=bedDirections.get(`${wx},${y},${wz}`);if(direction){dx=direction.x;dz=direction.z;}else if(id!==23)for(const [x,z]of [[0,1],[0,-1],[1,0],[-1,0]])if(block(wx+x,y,wz+z)===(id===20?26:20)){dx=id===20?x:-x;dz=id===20?z:-z;break;}furniture.push({id,x:wx,y,z:wz,dx,dz});if(isTorch(id))lights.push({x:wx+.5,y:y+.8,z:wz+.5});continue;}
  if(id===25)lights.push({x:wx+.5,y:y+.65,z:wz+.5});
  if(id===22||isPlant(id)){const detail=id===22?29:id===31?13:id===32?14:15;if(detail!==null){
    const stage=cropStages.get(`${wx},${y},${wz}`)||0,height=id===25?.85:id===22?.3+stage*.2:detail===13?.6:.46,half=id===25?.2:.32,cx=wx+.5,cz=wz+.5;
    const quads=[[[cx-half,y+(id===22||isPlant(id)?0:1),cz-half],[cx+half,y+(id===22||isPlant(id)?0:1),cz+half],[cx+half,y+(id===22||isPlant(id)?0:1)+height,cz+half],[cx-half,y+(id===22||isPlant(id)?0:1)+height,cz-half]],[[cx-half,y+(id===22||isPlant(id)?0:1),cz+half],[cx+half,y+(id===22||isPlant(id)?0:1),cz-half],[cx+half,y+(id===22||isPlant(id)?0:1)+height,cz-half],[cx-half,y+(id===22||isPlant(id)?0:1)+height,cz+half]]];
    for(const [q,verts] of quads.entries())for(const backwards of [false,true])for(const i of backwards?[0,2,1,0,3,2]:[0,1,2,0,2,3]){const sign=backwards?-1:1;g.p.push(...verts[i]);g.n.push(sign*(q ? .707 : -.707),0,sign*.707);const uv=[[0,0],[1,0],[1,1],[0,1]][i];g.uv.push((detail*16+.2+uv[0]*15.6)/(TILE_COUNT*16),(.2+uv[1]*15.6)/16);g.c.push(1,1,1);}
  }}
  if(id===22||isTorch(id)||isPlant(id))continue;
  for(const f of faces){const b=block(wx+f.n[0],y+f.n[1],wz+f.n[2]);if(b&&!isTorch(b)&&!isPlant(b)&&![20,26,23,22,34,35,36,37,38,50,52,62,63,64,65,66,67].includes(b)&&([8,54].includes(id)||![8,54].includes(b)))continue;
   const uv=FACE_UV,shades=faceShades(f.n,f.v,f.s,wx,y,wz,opaque),tile=tileFor(id,f.n[1],f.n[2],f.n[0],furnaceStates.get(`${wx},${y},${wz}`));
   for(const i of [0,1,2,0,2,3]){const v=f.v[i];g.p.push(wx+(id===63?.44+v[0]*.12:v[0]),y+v[1],wz+(id===62?.44+v[2]*.12:v[2]));g.n.push(...f.n);g.uv.push((tile*16+.2+uv[i][0]*15.6)/(TILE_COUNT*16),(.2+uv[i][1]*15.6)/16);const shade=shades[i];g.c.push(shade,shade,shade);}
  }
 }
 if(performance.now()-sliceAt>2){yield;sliceAt=performance.now();}}
 if(chunks.get(k)!==chunk)return;
 const part=new THREE.Group();part.name='section:'+section;part.userData.section=section;part.userData.lights=lights;
 for(const f of furniture){const model=furnitureModel(f.id,texture,{x:f.dx,z:f.dz});if(f.id===38)addSignText(model,signTexts.get(`${f.x},${f.y},${f.z}`)?.lines);model.position.set(f.x,f.y,f.z);part.add(model);}
 groups.forEach((g,i)=>{if(!g.p.length)return;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(g.p,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(g.n,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(g.uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(g.c,3));geometry.computeBoundingSphere();part.add(new THREE.Mesh(geometry,[material,waterMaterial,lavaMaterial,portalMaterial,glowMaterial][i]));});
 const previous=chunk.group.children.find(old=>old.userData.section===section);if(previous)disposeRenderPart(previous);chunk.group.add(part);torchPositions.set(k,chunk.group.children.flatMap(part=>part.userData.lights||[]));yield {sectionReady:true,section};
 }
}

const dirtySections=new Map();
function mark(cx,cz,y=null){for(const [dx,dz]of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]){const key=`${cx+dx},${cz+dz}`;if(chunks.has(key)){dirty.add(key);dirtySections.set(key,mergeSections(dirtySections.get(key),y===null?null:changedSections(y)));}}}
function disposeChunk(c){if(c?.group){scene.remove(c.group);c.group.traverse(m=>{m.geometry?.dispose();if(m.material&&(m.material.userData.owned||m.material.map!==texture)){if(m.material.userData.signText)m.material.map?.dispose();m.material.dispose();}});}}
function retainChunk(x,z){return me&&inRange(me,{x:x*CHUNK,z:z*CHUNK},viewDistance+1);}
function requestChunks(){if(!me||!connected)return;const want=[],now=performance.now();
 for(const [x,z]of wantedChunks(me,viewDistance,SIZE)){const k=`${x},${z}`;if(!chunks.has(k)&&(!pending.has(k)||now-pending.get(k)>15000)){want.push([x,z]);pending.set(k,now);}}
 // Sending an empty request still updates the server's render-distance setting.
 send({type:'chunks',distance:viewDistance,chunks:want});
 for(const [k,c]of chunks){const [x,z]=k.split(',').map(Number);if(!retainChunk(x,z)){disposeChunk(c);chunks.delete(k);torchPositions.delete(k);dirty.delete(k);dirtySections.delete(k);mark(x,z);}else if(c.group)c.group.visible=inRange(me,{x:x*CHUNK,z:z*CHUNK},viewDistance);}
 for(const k of pending.keys()){const [x,z]=k.split(',').map(Number);if(!retainChunk(x,z))pending.delete(k);}
 for(const map of [edits,bedDirections,cropStages,signTexts,furnaceStates])for(const key of map.keys()){const [x,y,z]=key.split(',').map(Number);if(!retainChunk(Math.floor(x/CHUNK),Math.floor(z/CHUNK)))map.delete(key);}
}

function send(m){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(m));}
function toast(text){$('toast').textContent=text;$('toast').classList.add('on');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('on'),3500);}
let chatTimer;function showChat(){clearTimeout(chatTimer);$('chat').classList.add('chat-recent');chatTimer=setTimeout(()=>$('chat').classList.remove('chat-recent'),5000);}
function chat(name,text,notice=false){const p=document.createElement('p');if(notice)p.className='notice';else{const b=document.createElement('b');b.textContent=name+': ';p.append(b);}p.append(document.createTextNode(text));$('messages').append(p);while($('messages').children.length>70)$('messages').firstChild.remove();$('messages').scrollTop=$('messages').scrollHeight;if(!notice)showChat();}
let rosterKey='';function updateRoster(players){const key=JSON.stringify(players.map(p=>[p.id,p.name]));if(key===rosterKey)return;rosterKey=key;const list=$('player-list');list.replaceChildren();for(const p of players){const row=document.createElement('div'),name=document.createElement('span'),signal=document.createElement('span');name.textContent=p.name;if(p.id!==me?.id){const dot=document.createElement('i');dot.className='locator-roster-dot';dot.style.backgroundColor=playerColor(p.id);name.prepend(dot);}signal.textContent='▂▄▆█';signal.className='player-signal';row.append(name,signal);list.append(row);}}

let combatFlashTimer,hitMarkerTimer;
let bagSlots=Array(36).fill(null);
let hotbarSlots=[...SLOTS,0];
let locatorTargets=[];const locator=createLocatorBar($('player-locator'));
const survival=createSurvivalView({scene,send,icon:blockIcon,inventory:()=>inventory,selected:()=>hotbarSlots[selected]});
const cropStages=new Map();
function chooseSlot(index){cancelBow();if(index!==selected)sounds.play('click');setEating(false);selected=index;send({type:'select',slot:index});updateInventory();}
$('equip-selected').onclick=()=>send({type:'equip',item:hotbarSlots[selected]});
let previewRenderer,previewActor,previewScene,previewCamera,previewPoint=null,previewFrame=0;
document.addEventListener('pointermove',e=>{previewPoint={x:e.clientX,y:e.clientY};if($('inventory').open&&!previewFrame)previewFrame=requestAnimationFrame(()=>{previewFrame=0;updatePreview();});});
function updatePreview(){
 if(!me||!$('inventory').open)return;
 try{
  if(!previewRenderer){previewRenderer=new THREE.WebGLRenderer({canvas:$('character-preview'),alpha:true,antialias:false});previewRenderer.setSize(160,200,false);previewRenderer.outputColorSpace=THREE.SRGBColorSpace;previewScene=new THREE.Scene();previewScene.add(new THREE.HemisphereLight(0xffffff,0x666666,2));previewCamera=new THREE.PerspectiveCamera(32,.8,.1,10);previewCamera.position.set(0,1,3.8);previewCamera.lookAt(0,.9,0);}
  if(!previewActor){previewActor=createPlayerModel(me.id,survival.state.skin);previewActor.group.rotation.y=Math.PI+.35;previewScene.add(previewActor.group);}
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
 if(hotbar){b.dataset.hotbarIndex=index;if(count>0&&ITEMS[id]?.durability){const ratio=Math.max(0,Math.min(1,(survival.state.durability?.[id]??ITEMS[id].durability)/ITEMS[id].durability)),bar=document.createElement('i');bar.className='durability-strip';bar.style.setProperty('--durability',ratio*100+'%');bar.style.setProperty('--durability-color',`hsl(${ratio*120} 90% 45%)`);b.append(bar);}const key=document.createElement('kbd');key.textContent=index+1;b.append(key);b.onclick=()=>chooseSlot(index);}
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
 const {group,head,left,right,arm,arm2,setSkin}=createPlayerModel(p.id,p.skin);group.name='player:'+p.id;group.userData.hitbox={width:.6,height:1.8};
 const label=document.createElement('canvas');label.width=512;label.height=64;const c=label.getContext('2d');c.fillStyle='#050c40dd';c.fillRect(0,0,512,64);c.font='bold 32px monospace';c.textAlign='center';c.fillStyle='#e9eeff';c.fillText(p.name,256,44,480);const map=new THREE.CanvasTexture(label);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,depthTest:true}));sprite.position.y=2.15;sprite.scale.set(2.5,.32,1);group.add(sprite);scene.add(group);return {group,target:p,left,right,head,arm,arm2,map,setSkin};
}
function removeAvatar(id){const a=avatars.get(id);if(!a)return;scene.remove(a.group);const geometries=new Set(),materials=new Set(),textures=new Set();a.group.traverse(m=>{if(m.geometry)geometries.add(m.geometry);for(const material of m.material?(Array.isArray(m.material)?m.material:[m.material]):[]){materials.add(material);if(material.map&&material.map!==texture)textures.add(material.map);}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();avatars.delete(id);}

let reconnectTimer=null,reconnectAttempts=0,hasJoined=false,intentionalExit=false,reconnectBlocked=false;
function scheduleReconnect(){if(intentionalExit||reconnectBlocked||connected)return;clearTimeout(reconnectTimer);const seconds=Math.min(15,2**Math.min(reconnectAttempts++,4));$('gate-status').textContent=navigator.onLine?`Connection lost. Reconnecting in ${seconds}s… Your world and inventory are saved.`:'Offline. Reconnecting when your network returns…';reconnectTimer=setTimeout(()=>{if(!navigator.onLine){scheduleReconnect();return;}join({automatic:true});},seconds*1000);}
function leaveWorld(reason){intentionalExit=true;clearTimeout(reconnectTimer);socket?.close(1000,reason);location.href='../games/';}
addEventListener('online',()=>{if(hasJoined&&!connected&&!intentionalExit&&!reconnectBlocked){clearTimeout(reconnectTimer);join({automatic:true});}});
addEventListener('pagehide',()=>{intentionalExit=true;clearTimeout(reconnectTimer);});
async function getAuth(){
 let session;try{session=JSON.parse(localStorage.getItem(SESSION)||'null');}catch{}
 if(!session?.access_token)throw new Error('Sign in to your Orbit account to join.');
 if(session.expires_at*1000<Date.now()+60000 && session.refresh_token){const response=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});if(!response.ok)throw new Error('Your Orbit session expired. Sign in again.');session=await response.json();localStorage.setItem(SESSION,JSON.stringify(session));}
 return {type:'auth',token:session.access_token};
}
async function join({automatic=false}={}){
 if(automatic&&intentionalExit)return;if(!automatic){intentionalExit=false;reconnectBlocked=false;}clearTimeout(reconnectTimer);
 if(socket?.readyState===WebSocket.OPEN||socket?.readyState===WebSocket.CONNECTING)return;
 $('join').disabled=true;$('gate-status').textContent='Verifying your Orbit account…';
 try{
 const auth=dev?{type:'auth',devId:'dev-'+($('dev-name').value.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,20)||'Builder')}:await getAuth();
 socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/orbitcraft/socket`);
 socket.onopen=()=>socket.send(JSON.stringify(auth));
 socket.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}
  if(m.type==='welcome'){
   dimension=m.world.dimension||m.you.dimension||'overworld';document.body.dataset.dimension=dimension;meshTasks.clear();dirtySections.clear();inputReset();for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
   for(const c of chunks.values())if(c.group){scene.remove(c.group);c.group.traverse(m=>{m.geometry?.dispose();if(m.material&&(m.material.userData.owned||m.material.map!==texture)){if(m.material.userData.signText)m.material.map?.dispose();m.material.dispose();}});}chunks.clear();bedDirections.clear();signTexts.clear();furnaceStates.clear();torchPositions.clear();dirty.clear();pending.clear();edits.clear();for(const id of avatars.keys())removeAvatar(id);
   resources.clear();xpEffects.clear();arrowVisuals.clear();pearlVisuals.clear();damageCamera.clear();locator.clear();locatorTargets=[];predictionHistory.clear();movementHistory.clear();correction.set(0,0,0);if(ownPlayer){scene.remove(ownPlayer.group);ownPlayer.group.traverse(o=>{o.geometry?.dispose();if(o.material)for(const material of Array.isArray(o.material)?o.material:[o.material]){if(material.map&&material.map!==texture)material.map.dispose();material.dispose();}});}ownPlayer=createPlayerModel(m.you.id,m.you.skin);ownPlayer.group.name='local-player';scene.add(ownPlayer.group);resources.setDrops(m.drops||[],true);miningFeedback=null;me={...m.you,vy:0};inventory=m.inventory;bagSlots=m.slots||m.survival?.slots||bagSlots;hotbarSlots=m.hotbar||hotbarSlots;mined=m.mined;placed=m.placed;connected=true;forceReconcile=false;hasJoined=true;reconnectAttempts=0;clearTimeout(reconnectTimer);survival.update(m.survival||{health:20,hunger:20});document.body.classList.toggle('dead',(m.survival?.health??20)<=0);document.body.classList.remove('disconnected');document.body.classList.add('playing');$('gate').hidden=true;$('connection').textContent='● Connected';$('messages').replaceChildren();m.history.forEach(c=>chat(c.name,c.text));updateInventory();requestChunks();$('chat').classList.remove('chat-recent');clearTimeout(chatTimer);if(!m.survival?.skinChosen&&(!dev||!new URLSearchParams(location.search).has('manualJoin')||new URLSearchParams(location.search).has('skinOnboarding')))skinChooser.open();
  }else if(m.type==='chunk'){
   if(!Number.isInteger(m.x)||!Number.isInteger(m.z)||!retainChunk(m.x,m.z)){pending.delete(`${m.x},${m.z}`);return;}
   for(const furnace of m.furnaces||[])furnaceStates.set(`${furnace.x},${furnace.y},${furnace.z}`,furnace);
   for(const sign of m.signs||[])signTexts.set(`${sign.x},${sign.y},${sign.z}`,sign);
   for(const bed of m.beds||[]){const direction={x:bed.head.x-bed.foot.x,z:bed.head.z-bed.foot.z};for(const a of [bed.foot,bed.head])bedDirections.set(`${a.x},${a.y},${a.z}`,direction);}
   const k=`${m.x},${m.z}`,binary=atob(m.data),data=Uint8Array.from(binary,c=>c.charCodeAt(0));if(data.length!==CHUNK*CHUNK*CHUNK_HEIGHT)return;
   for(const [key,id] of edits){const [x,y,z]=key.split(',').map(Number);if(Math.floor(x/CHUNK)===m.x&&Math.floor(z/CHUNK)===m.z)data[chunkIndex((x%CHUNK+CHUNK)%CHUNK,y,(z%CHUNK+CHUNK)%CHUNK)]=id;}
   const old=chunks.get(k);chunks.set(k,{data,group:old?.group});pending.delete(k);mark(m.x,m.z);
  }else if(m.type==='state'&&me){
   updateRoster(m.roster||m.players); locatorTargets=m.locators||m.players;

   resources.setMining(m.players);miningFeedback=m.players.find(p=>p.id===me.id)?.mining||null;
   const ids=new Set();for(const p of m.players){ids.add(p.id);if(p.id===me.id){const snapshot=predictionHistory.get(p.seq),error=reconciliationError(p,snapshot,movementHistory,performance.now()),expected=error?{x:me.x+error.x,y:me.y+error.y,z:me.z+error.z}:me;if(p.hurtAt&&p.hurtAt!==me.hurtAt){me.hurtAt=p.hurtAt;me.vy=p.vy;correction.set(p.x-me.x,p.y-me.y,p.z-me.z);predictionHistory.clear();movementHistory.clear();}else if(forceReconcile||error&&Math.hypot(error.x,error.y,error.z)>12){forceReconcile=false;Object.assign(me,{x:p.x,y:p.y,z:p.z,vy:p.vy});correction.set(0,0,0);predictionHistory.clear();movementHistory.clear();}else{correction.set(expected.x-me.x,expected.y-me.y,expected.z-me.z);if(!input.jump&&Math.abs(expected.y-me.y)>.3)me.vy=p.vy;}}else{let a=avatars.get(p.id);if(!a){a=avatar(p);avatars.set(p.id,a);a.group.position.set(p.x,p.y,p.z);}if((a.target?.health??20)<=0&&(p.health??20)>0){delete a.group.userData.deathAt;delete a.group.userData.damageAt;}a.setSkin?.(p.skin);a.target=p;(a.motion??=new RemoteMotion()).push(performance.now(),p);a.group.visible=(p.health??20)>0;applyEquipment(a,p.equipment);showHeldItem(a,p.held||0);showHeldItem(a,p.offhand===181?0:p.offhand||0,'left');}}
   for(const id of avatars.keys())if(!ids.has(id))removeAvatar(id);$('online').textContent=`${m.online??m.players.length} online`;
  }else if(m.type==='block'){
   if(!me||!retainChunk(Math.floor(m.x/CHUNK),Math.floor(m.z/CHUNK)))return;
   if(!m.flow){const old=get(m.x,m.y,m.z),distance=Math.hypot(me.x-m.x,me.y-m.y,me.z-m.z);if(m.block===8||old===8)sounds.play('splash',{distance});else sounds.play(m.block===0?'break':'place',{block:m.broken||m.block||old,distance});}
   if(m.furnace)furnaceStates.set(`${m.x},${m.y},${m.z}`,{x:m.x,y:m.y,z:m.z,...m.furnace});else if(![19,24].includes(m.block))furnaceStates.delete(`${m.x},${m.y},${m.z}`);
   if(m.block!==38)signTexts.delete(`${m.x},${m.y},${m.z}`);
   if(m.bedDirection)bedDirections.set(`${m.x},${m.y},${m.z}`,m.bedDirection);else if(![20,26].includes(m.block))bedDirections.delete(`${m.x},${m.y},${m.z}`);
   if(m.block===0&&m.broken&&me&&Math.hypot(me.x-m.x,me.y-m.y,me.z-m.z)<32)resources.breakBlock(m.x,m.y,m.z,m.broken);
   edits.set(`${m.x},${m.y},${m.z}`,m.block);const c=chunks.get(`${Math.floor(m.x/CHUNK)},${Math.floor(m.z/CHUNK)}`);if(c)c.data[chunkIndex((m.x%CHUNK+CHUNK)%CHUNK,m.y,(m.z%CHUNK+CHUNK)%CHUNK)]=m.block;mark(Math.floor(m.x/CHUNK),Math.floor(m.z/CHUNK),m.y);
  }else if(m.type==='drop'){resources.setDrops([m.drop]);
  }else if(m.type==='drops-view'){resources.setDrops(m.drops,true);
  }else if(m.type==='drops'){resources.setDrops(m.drops);
  }else if(m.type==='pickup'){if(m.player===me?.id)sounds.play('pickup');resources.removeDrop(m.id);
  }else if(m.type==='inventory'){inventory=m.inventory;bagSlots=m.slots||m.survival?.slots||bagSlots;hotbarSlots=m.hotbar||hotbarSlots;mined=m.mined;placed=m.placed;updateInventory();}
  else if(m.type==='combat'){if(m.target===me?.id)sounds.play(m.killed?'death':'hurt');else if(m.attacker===me?.id)sounds.play('hit');else{const target=avatars.get(m.target)?.target;if(target)sounds.play('hit',{distance:Math.hypot(me.x-target.x,me.y-target.y,me.z-target.z)});}markHit(scene,m.target,m.killed);if(m.target===me?.id){if(ownPlayer){ownPlayer.group.userData.damageAt=performance.now();if(m.killed)ownPlayer.group.userData.deathAt=performance.now();}$('damage-flash').classList.add('on');clearTimeout(combatFlashTimer);combatFlashTimer=setTimeout(()=>$('damage-flash').classList.remove('on'),230);}if(m.attacker===me?.id){$('crosshair').classList.add('hit');clearTimeout(hitMarkerTimer);hitMarkerTimer=setTimeout(()=>$('crosshair').classList.remove('hit'),180);}}
  else if(m.type==='survival'){const wasAlive=survival.state.health>0,wasSleeping=!!survival.state.sleeping;if(m.state.health<survival.state.health){sounds.play(m.state.health<=0?'death':'hurt');damageCamera.hit(performance.now());}if((m.state.xp||0)>(survival.state.xp||0))sounds.play(xpProgress(m.state.xp).level>xpProgress(survival.state.xp).level?'level':'xp');if(m.state.hunger>survival.state.hunger&&input.eat)sounds.play('burp');if(m.state.health>0&&survival.state.health<=0&&ownPlayer){delete ownPlayer.group.userData.deathAt;delete ownPlayer.group.userData.damageAt;}const changed=JSON.stringify(bagSlots)!==JSON.stringify(m.state.slots);bagSlots=m.state.slots||bagSlots;hotbarSlots=m.state.hotbar||hotbarSlots;survival.update(m.state);syncSleepControls(wasSleeping);document.body.classList.toggle('dead',m.state.health<=0);if(wasAlive&&m.state.health<=0){inputReset();for(const d of document.querySelectorAll('dialog[open]'))d.close();$('chat-form').hidden=true;$('chat').classList.remove('chat-open','chat-recent');document.exitPointerLock?.();$('respawn').disabled=$('death-title').disabled=true;setTimeout(()=>{if(survival.state.health<=0){$('respawn').disabled=$('death-title').disabled=false;$('respawn').focus();}},1000);}else if(!wasAlive&&m.state.health>0){forceReconcile=true;focusWorld();}if(changed)updateInventory();if(previewActor){previewActor.setSkin?.(m.state.skin);applyEquipment(previewActor,{...m.state.equipment,...(m.state.offhand?.id===181?{shield:181}:{})});updatePreview();}}
  else if(m.type==='teleport'&&me){Object.assign(me,m.position,{vy:0});correction.set(0,0,0);predictionHistory.clear();movementHistory.clear();pending.clear();inputReset();for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();requestChunks();focusWorld();}
  else if(m.type==='pearl-spawn'){pearlVisuals.add(m.pearl);sounds.play('swing');}
  else if(m.type==='pearl-remove'){pearlVisuals.remove(m.id);}
  else if(m.type==='arrow-spawn'){arrowVisuals.add(m.arrow);sounds.play('swing');}
  else if(m.type==='arrow-remove'){arrowVisuals.remove(m.id);}
  else if(m.type==='survival-world'){for(const f of m.furnaces||[]){const key=`${f.x},${f.y},${f.z}`,old=furnaceStates.get(key);if(!old||old.lit!==f.lit||old.facing.x!==f.facing.x||old.facing.z!==f.facing.z){furnaceStates.set(key,f);mark(Math.floor(f.x/CHUNK),Math.floor(f.z/CHUNK),f.y);}}pearlVisuals.set(m.pearls||[]);arrowVisuals.set(m.arrows||[]);if(controls())sounds.mobs(m.mobs||[],me);xpEffects.set(m.xpOrbs||[]);survival.world(m);for(const c of m.crops||[]){const key=`${c.x},${c.y},${c.z}`;if(cropStages.get(key)!==c.stage){cropStages.set(key,c.stage);mark(Math.floor(c.x/CHUNK),Math.floor(c.z/CHUNK),c.y);}}}
  else if(m.type==='chest-state')survival.chest(m.chest);
  else if(m.type==='projectile')survival.projectile(m);
  else if(m.type==='bed-status'){toast(m.text);}
  else if(m.type==='sign-open')signEditor.open(m.sign);
  else if(m.type==='sign-saved')signEditor.saved();
  else if(m.type==='sign-update'){const s=m.sign;signTexts.set(`${s.x},${s.y},${s.z}`,s);const c=chunks.get(`${Math.floor(s.x/CHUNK)},${Math.floor(s.z/CHUNK)}`);c?.group?.traverse(model=>{if(model.name==='oak-sign-model'&&model.position.x===s.x&&model.position.y===s.y&&model.position.z===s.z)addSignText(model,s.lines);});}
  else if(m.type==='station'){survival.station(m);openDialog('inventory');}
  else if(m.type==='chat')chat(m.name,m.text);
  else if(m.type==='notice')chat('',m.text,true);
  else if(m.type==='leave')removeAvatar(m.id);
  else if(m.type==='skin-saved'){skinChooser.saved(m);}
  else if(m.type==='error'){skinChooser.error(m.message);signEditor.error();if(/sign in|session expired|invalid orbit|finish creating|banned|device.*linked/i.test(m.message||''))reconnectBlocked=true;toast(m.message);$('gate-status').textContent=m.message;}
 };
 socket.onerror=()=>{$('gate-status').textContent='Cannot reach the public world. Please retry shortly.';};
 socket.onclose=()=>{const was=connected;connected=false;for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();me=null;inputReset();resources.clear();xpEffects.clear();arrowVisuals.clear();pearlVisuals.clear();damageCamera.clear();locator.clear();locatorTargets=[];miningFeedback=null;document.exitPointerLock?.();$('gate').hidden=false;$('join').disabled=false;$('join').textContent=was?'Reconnect to public world →':'Join public world →';$('connection').textContent='Disconnected';document.body.classList.add('disconnected');document.body.classList.remove('playing','sleeping');$('online').textContent='0 online';$('join').hidden=false;if(was)$('gate-status').textContent='Connection lost. Your saved inventory and world are safe. Reconnect to continue.';if(hasJoined&&!intentionalExit&&!reconnectBlocked)scheduleReconnect();};
 }catch(e){$('gate-status').textContent=e.message;$('join').disabled=false;$('login').hidden=dev;$('join').hidden=false;if(hasJoined&&!intentionalExit){if(/sign in|session expired/i.test(e.message||''))reconnectBlocked=true;else scheduleReconnect();}}
}
$('join').onclick=join;$('wake-button').onclick=()=>send({type:'wake'});$('death-title').onclick=()=>leaveWorld('Title screen');
async function checkServer(){try{const r=await fetch('./health',{cache:'no-store'});if(!r.ok)throw new Error();const health=await r.json();if(!health.ok)throw new Error();dev=health.dev===true;$('dev-label').hidden=!dev;$('gate-status').textContent=dev?'Local development server · use different names in two browser windows to test multiplayer.':'One shared world · sign in with your Orbit account.';$('join').disabled=false;if(new URLSearchParams(location.search).get('manualJoin')!=='1'){if(dev)$('dev-name').value=new URLSearchParams(location.search).get('devName')||'Builder';await join();}else $('join').hidden=false;}catch{$('gate-status').textContent='The public world is unavailable. Please ask the site owner to start the world server.';$('join').disabled=true;}}
$('join').disabled=true;checkServer();
function inputReset(){cancelBow();$('player-list').hidden=true;setEating(false);for(const k of Object.keys(input))delete input[k];setMining(false);}
createRecipeBook({icon:blockIcon,openDialog,closeDialog});
const signEditor=createSignEditor({send,openDialog,closeDialog});
const skinChooser=createSkinChooser({send,openDialog,closeDialog,state:()=>survival.state});const skinButton=document.createElement('button');skinButton.id='skin-options-button';skinButton.textContent='Change Skin';skinButton.onclick=()=>skinChooser.open();bindings.dialog.querySelector('#keybind-list').before(skinButton);
function menuOpen(){return !!survival.state.sleeping||!!document.querySelector('dialog[open]')||!$('chat-form').hidden||!$('gate').hidden;}
function controls(){return connected&&survival.state.health>0&&!survival.state.sleeping&&!menuOpen()&&(coarse||document.pointerLockElement===canvas);}
let tryingFocus=false;
function focusWorld(){if(!connected||coarse||menuOpen()||survival.state.health<=0||tryingFocus||document.pointerLockElement===canvas)return;tryingFocus=true;canvas.focus();const attempt=n=>{if(!connected||menuOpen()||survival.state.health<=0){tryingFocus=false;return;}try{Promise.resolve(canvas.requestPointerLock?.()).then(()=>setTimeout(()=>tryingFocus=false,100)).catch(()=>{if(n<5&&!menuOpen()&&connected)setTimeout(()=>attempt(n+1),100);else tryingFocus=false;});}catch{tryingFocus=false;}};attempt(0);}
function syncSleepControls(wasSleeping){
 if(!wasSleeping&&survival.state.sleeping){
  inputReset();tryingFocus=false;
  for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
  $('chat-form').hidden=true;$('chat').classList.remove('chat-open');
  document.exitPointerLock?.();$('wake-button').focus({preventScroll:true});
 }else if(wasSleeping&&!survival.state.sleeping&&survival.state.health>0)focusWorld();
}
function closeDialog(id){sounds.play('close');$(id).close();focusWorld();}
function openDialog(id){sounds.play('open');inputReset();$(id).showModal();document.exitPointerLock?.();if(id==='inventory'){$(id).focus();updatePreview();}}
createPauseMenu({openDialog,closeDialog,bindings,stats:()=>({mined,placed,...survival.state}),players:()=>[...(me?[me]:[]),...[...avatars.values()].map(a=>a.target)],disconnect(){leaveWorld('Disconnected');}});
$('inventory-button').onclick=()=>{survival.hand();openDialog('inventory');};$('help-button').onclick=()=>openDialog('help');document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closeDialog(b.dataset.close));
for(const dialog of document.querySelectorAll('dialog')){dialog.addEventListener('cancel',e=>{e.preventDefault();if(bindings.waiting){bindings.cancel();return;}closeDialog(dialog.id);});dialog.addEventListener('close',focusWorld);}
function openChat(){if(!connected)return;inputReset();clearTimeout(chatTimer);$('chat').classList.add('chat-open');$('chat-form').hidden=false;document.exitPointerLock?.();$('chat-input').focus();}
$('chat-button').onclick=openChat;$('chat-form').onsubmit=e=>{e.preventDefault();send({type:'chat',text:$('chat-input').value});$('chat-input').value='';$('chat-form').hidden=true;$('chat').classList.remove('chat-open');showChat();focusWorld();};
function movementAction(code){const action=bindings.action(code);return ['forward','back','left','right','jump','sneak'].includes(action)?action:null;}
function toggleSprint(){sprintLatch=!sprintLatch;input.sprint=sprintLatch;sendInput();}
const shortcuts=createShortcuts({canvas,renderer,scene,camera,controls,bindings,player:()=>me,state:()=>survival.state,send,fps:()=>Math.round(1000/averageFrame),biome:()=>$('biome').textContent,chunkInfo:()=>({size:SIZE,render:viewDistance,simulation:SIMULATION_DISTANCE,loaded:chunks.size,pending:pending.size}),reload(){for(const c of chunks.values())disposeChunk(c);chunks.clear();torchPositions.clear();dirty.clear();pending.clear();edits.clear();bedDirections.clear();signTexts.clear();furnaceStates.clear();cropStages.clear();requestChunks();}});
function cyclePerspective(){perspective=(perspective+1)%3;$('perspective-button').textContent=['First person','Third person · back','Third person · front'][perspective];}
$('perspective-button').onclick=cyclePerspective;
addEventListener('keydown',e=>{
 if(bindings.capture(e))return;
 if(shortcuts.keydown(e))return;
 const bound=bindings.action(e.code);if(connected&&survival.state.health<=0){const buttons=[$('respawn'),$('death-title')].filter(b=>!b.disabled);if(e.code==='Tab'){e.preventDefault();if(buttons.length)buttons[(buttons.indexOf(document.activeElement)+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();}if(e.code==='Enter'){e.preventDefault();const b=buttons.includes(document.activeElement)?document.activeElement:buttons[0];b?.click();}return;}if(bound==='players'&&connected&&!menuOpen()){e.preventDefault();$('player-list').hidden=false;return;}
 if(bound==='perspective'){e.preventDefault();if(connected&&!e.repeat)cyclePerspective();return;}
 if(e.code==='Escape'){e.preventDefault();if(survival.state.sleeping){send({type:'wake'});return;}if(!$('chat-form').hidden){$('chat-form').hidden=true;$('chat').classList.remove('chat-open');showChat();focusWorld();return;}const open=[...document.querySelectorAll('dialog[open]')].at(-1);if(open)closeDialog(open.id);else if(connected)openDialog('pause-menu');return;}
 if(e.target.matches?.('input,textarea,select')&&document.pointerLockElement!==canvas){if(e.code==='Escape'){$('chat-form').hidden=true;e.target.blur();}return;}
 if(bound==='chat'&&connected&&!menuOpen()){e.preventDefault();openChat();return;}
 if(bound==='use'&&controls()){e.preventDefault();if(hotbarSlots[selected]===235){beginBow();return;}if(ITEMS[hotbarSlots[selected]]?.food)setEating(true);else if(!e.repeat)send({type:'use'});return;}
 if(bound==='inventory'&&connected&&(!menuOpen()||$('inventory').open)){e.preventDefault();if($('inventory').open)closeDialog('inventory');else{survival.hand();openDialog('inventory');}return;}
 if(e.key==='?'){openDialog('help');return;}
 if(bound?.startsWith('hotbar')){e.preventDefault();const to=Number(bound.slice(6))-1;if($('inventory').open){const hovered=document.querySelector('#inventory [data-slot-area]:hover');if(hovered)send({type:'container-hotbar',area:hovered.dataset.slotArea,index:+hovered.dataset.slotIndex,to});}else chooseSlot(to);return;}
 if(bound==='drop'&&connected&&!e.repeat){e.preventDefault();send({type:'drop-held',all:e.ctrlKey});return;}
 if(bound==='offhand'&&connected&&!e.repeat){if($('inventory').open){e.preventDefault();const hovered=document.querySelector('#inventory [data-slot-area]:hover');if(hovered)send({type:'container-offhand',area:hovered.dataset.slotArea,index:+hovered.dataset.slotIndex});return;}if(!menuOpen()){e.preventDefault();cancelBow();send({type:'swap-offhand'});return;}}
 if(bound==='forward'&&controls()&&!e.repeat){const now=performance.now();if(now-lastForwardTap<280)sprintLatch=true;lastForwardTap=now;input.sprint=sprintLatch;}
 if(bound==='jump'&&controls()&&!e.repeat){const now=performance.now();if(now-lastJumpTap<280&&survival.state.mode==='creative')send({type:'flight'});lastJumpTap=now;}

 if(bound==='sprint'&&controls()&&!e.repeat){e.preventDefault();toggleSprint();return;}
 if(bound==='attack'&&controls()){e.preventDefault();setMining(true);return;}if(bound==='place'&&controls()&&!e.repeat){e.preventDefault();useOrPlace();return;}
 const movement=movementAction(e.code);if(movement&&controls()){e.preventDefault();input[movement]=true;}
 });addEventListener('keyup',e=>{if(bindings.action(e.code)==='players')$('player-list').hidden=true;if(shortcuts.keyup(e))return;const movement=movementAction(e.code);if(movement)input[movement]=false;if(bindings.action(e.code)==='attack')setMining(false);if(['use','place'].includes(bindings.action(e.code))){releaseBow();setEating(false);}});addEventListener('blur',inputReset);document.addEventListener('visibilitychange',()=>{if(document.hidden)inputReset();});document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement===canvas){tryingFocus=false;if($('toast').textContent.startsWith('Click the world'))$('toast').classList.remove('on');return;}inputReset();if(connected&&survival.state.health>0&&!menuOpen()&&!tryingFocus)openDialog('pause-menu');});
canvas.addEventListener('click',()=>{if(connected&&!coarse&&!menuOpen()){focusWorld();}});
addEventListener('mousemove',e=>{if(!me||document.pointerLockElement!==canvas)return;const sensitivity=bindings.mouseSensitivity();me.yaw-=e.movementX*sensitivity;me.pitch=Math.max(-1.54,Math.min(1.54,me.pitch-e.movementY*sensitivity));});
function sendInput(){if(me&&connected){input.sprint=sprintLatch;movementHistory.record(performance.now(),me);predictionHistory.set(++seq,{x:me.x,y:me.y,z:me.z,time:performance.now()});while(predictionHistory.size>100)predictionHistory.delete(predictionHistory.keys().next().value);send({type:'input',...(controls()?input:{}),mine:miningHeld&&controls(),yaw:me.yaw,pitch:me.pitch,seq});}}
setInterval(sendInput,50);
function setEating(value){input.eat=!!value&&!!ITEMS[hotbarSlots[selected]]?.food&&inventory[hotbarSlots[selected]]>0&&survival.state.hunger<20;if(input.eat){input.mine=false;miningHeld=false;}sendInput();}
function setMining(value){if(value){cancelBow();setEating(false);}const first=!!value&&!miningHeld;miningHeld=!!value;if(!miningHeld)miningFeedback=null;sendInput();if(first&&connected&&controls()){sounds.play('swing');send({type:'attack'});}}
function beginBow(){if(bowHeld||!controls()||hotbarSlots[selected]!==235||!inventory[235]||!((inventory[236]||0)>0||survival.state.offhand?.id===236&&survival.state.offhand.count>0))return;setMining(false);setEating(false);bowHeld=true;bowDrawAt=performance.now();sendInput();send({type:'bow-draw'});}
function releaseBow(){if(!bowHeld)return;bowHeld=false;sendInput();send({type:'bow-release'});}
function cancelBow(){if(!bowHeld)return;bowHeld=false;send({type:'bow-cancel'});}
function useOrPlace(){if(!input.sneak&&me&&[18,19,20,23,24,26,38].includes(raycast(me,get)?.block)){action('use');return;}if(hotbarSlots[selected]===239){action('use');return;}if(hotbarSlots[selected]===235){beginBow();return;}if(survival.nearBoat(me)&&!survival.state.boat&&!input.sneak){action('use');return;}const id=hotbarSlots[selected],hit=me&&raycast(me,get),off=survival.state.offhand;if(!input.sneak&&[18,19,20,23,24,26].includes(hit?.block))action('use');else if((ITEMS[id]?.tool||id===180||!inventory[id])&&off?.count>0&&isBlock(off.id)&&hit?.place){setMining(false);leftHeld.swing();sendInput();send({type:'place',hand:'offhand'});}else if(ITEMS[id]?.food)setEating(true);else if(ITEMS[id]?.tool==='hoe'||[113,180,232,233,234,243,244].includes(id))action('use');else if(isBlock(id)&&hit?.place)action('place');else if(off?.id===181||id===181&&inventory[id]>0){input.block=true;sendInput();if(coarse)setTimeout(()=>input.block=false,250);}else if(isBlock(id))action('place');else action('use');}
function action(type){if(!connected||!me||Date.now()-lastAction<190)return;lastAction=Date.now();setMining(false);held.swing();sendInput();if(type==='use'||hotbarSlots[selected])send({type,block:hotbarSlots[selected]});}
canvas.addEventListener('mousedown',e=>{if(!controls())return;e.preventDefault();const code='Mouse'+e.button,event={code,target:canvas,repeat:false,preventDefault:()=>e.preventDefault()};if(shortcuts.keydown(event))return;const bound=bindings.action(code),movement=movementAction(code);if(bound==='attack')setMining(true);else if(bound==='place')useOrPlace();else if(bound==='sprint')toggleSprint();else if(bound==='perspective')cyclePerspective();else if(bound==='inventory'){$('inventory-button').click();}else if(bound==='offhand')send({type:'swap-offhand'});else if(bound==='drop')send({type:'drop-held',all:e.ctrlKey});else if(bound==='use'){if(hotbarSlots[selected]===235)beginBow();else if(ITEMS[hotbarSlots[selected]]?.food)setEating(true);else send({type:'use'});}else if(bound==='chat')openChat();else if(bound?.startsWith('hotbar'))chooseSlot(Number(bound.slice(6))-1);else if(movement){if(movement==='forward'){const now=performance.now();if(now-lastForwardTap<280)sprintLatch=true;lastForwardTap=now;}if(movement==='jump'){const now=performance.now();if(now-lastJumpTap<280&&survival.state.mode==='creative')send({type:'flight'});lastJumpTap=now;}input[movement]=true;}});
addEventListener('mouseup',e=>{const code='Mouse'+e.button;shortcuts.keyup({code,preventDefault:()=>e.preventDefault()});if(bindings.action(code)==='attack')setMining(false);const movement=movementAction(code);if(movement)input[movement]=false;if(['place','use'].includes(bindings.action(code))){releaseBow();setEating(false);input.block=false;sendInput();}});
canvas.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();});
canvas.addEventListener('pointerup',e=>{if(e.button===2&&!menuOpen()&&connected&&!coarse&&document.pointerLockElement!==canvas)focusWorld();});
$('inventory').addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('contextmenu',e=>{if(controls()){e.preventDefault();e.stopPropagation();}},true);canvas.addEventListener('wheel',e=>{if(!connected)return;e.preventDefault();setMining(false);chooseSlot((selected+(e.deltaY>0?1:8))%9);},{passive:false});
$('touch-mine').onpointerdown=e=>{e.preventDefault();if(!connected||menuOpen())return;$('touch-mine').setPointerCapture(e.pointerId);setMining(true);};
$('touch-mine').onpointerup=$('touch-mine').onpointercancel=()=>setMining(false);
$('touch-place').onclick=null;$('touch-place').onpointerdown=e=>{e.preventDefault();if(!controls())return;$('touch-place').setPointerCapture(e.pointerId);useOrPlace();};$('touch-place').onpointerup=()=>{releaseBow();setEating(false);};$('touch-place').onpointercancel=()=>{cancelBow();setEating(false);};
for(const id of ['eat-button','use-button']){$(id).onclick=null;$(id).onpointerdown=e=>{e.preventDefault();if(!connected||menuOpen())return;$(id).setPointerCapture(e.pointerId);if(id==='use-button'&&hotbarSlots[selected]===235)beginBow();else if(id==='eat-button'||ITEMS[hotbarSlots[selected]]?.food)setEating(true);else send({type:'use'});};$(id).onpointerup=()=>{releaseBow();setEating(false);};$(id).onpointercancel=()=>{cancelBow();setEating(false);};}document.querySelectorAll('[data-key]').forEach(b=>{b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);input[b.dataset.key]=true;};b.onpointerup=b.onpointercancel=()=>input[b.dataset.key]=false;});
let touch=null;canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'){touch={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);}});canvas.addEventListener('pointermove',e=>{if(!touch||touch.id!==e.pointerId||!me)return;me.yaw-=(e.clientX-touch.x)*.006;me.pitch=Math.max(-1.54,Math.min(1.54,me.pitch-(e.clientY-touch.y)*.006));touch.x=e.clientX;touch.y=e.clientY;});canvas.addEventListener('pointerup',()=>touch=null);
let previous=performance.now(),worldRequest=0,hudAt=0,meshTasks=new Map();
function animate(now){requestAnimationFrame(animate);const dt=Math.min((now-previous)/1000,.15);previous=now;averageFrame=averageFrame*.95+dt*1000*.05;if(connected&&now-resolutionAt>2500){resolutionAt=now;const next=averageFrame>28?Math.max(.75,worldPixelRatio-.15):averageFrame<18?Math.min(devicePixelRatio,1.5,worldPixelRatio+.1):worldPixelRatio;if(next!==worldPixelRatio){worldPixelRatio=next;renderer.setPixelRatio(next);renderer.setSize(innerWidth,innerHeight);}}

 shortcuts.tick();
 if(me&&connected){
  held.setSkin(survival.state.skin);leftHeld.setSkin(survival.state.skin);me.survival=survival.state;locator.update(me,locatorTargets,now);
  if(now-torchLightAt>250){torchLightAt=now;const nearest=[...[...torchPositions.values()].flat(),...[...furnaceStates.values()].filter(f=>f.lit).map(f=>({x:f.x+.5+f.facing.x*.65,y:f.y+.6,z:f.z+.5+f.facing.z*.65}))].filter(t=>Math.hypot(t.x-me.x,t.y-me.y,t.z-me.z)<16).sort((a,b)=>Math.hypot(a.x-me.x,a.y-me.y,a.z-me.z)-Math.hypot(b.x-me.x,b.y-me.y,b.z-me.z));torchLights.forEach((light,i)=>{light.intensity=nearest[i]?2.4:0;if(nearest[i])light.position.set(nearest[i].x,nearest[i].y,nearest[i].z);});}
  if(controls()&&survival.state.health>0&&!survival.state.sleeping){for(let remaining=dt;remaining>0;remaining-=1/120)(survival.state.boat?stepBoat:step)(me,{...input,sprint:input.sprint&&survival.state.hunger>6},Math.min(remaining,1/120),get);}
  const adjustment=correctionStep(correction,dt);for(const axis of ['x','y','z']){const next={...me,[axis]:me[axis]+adjustment[axis]};if(!collides(next,get)){me[axis]=next[axis];correction[axis]-=adjustment[axis];}else correction[axis]=0;}
  movementHistory.record(performance.now(),me);
  camera.position.set(me.x,me.y+eyeHeight(me),me.z);camera.rotation.set(me.pitch,me.yaw,0,'YXZ');
  if(ownPlayer){ownPlayer.setSkin?.(survival.state.skin);ownPlayer.group.visible=(perspective!==0||survival.state.sleeping)&&survival.state.health>0;ownPlayer.group.rotation.z=0;ownPlayer.group.scale.y=me.crouching&&!survival.state.sleeping?.83:1;ownPlayer.group.position.set(me.x,me.y,me.z);ownPlayer.group.rotation.y=me.yaw;ownPlayer.head.rotation.x=me.pitch;showHeldItem(ownPlayer,inventory[hotbarSlots[selected]]>0?hotbarSlots[selected]:0);showHeldItem(ownPlayer,survival.state.offhand?.id===181?0:survival.state.offhand?.id||0,'left');const stride=controls()&&(input.forward||input.back||input.left||input.right)?Math.sin(now*.009)*.5:0;ownPlayer.left.rotation.x=survival.state.boat?-Math.PI/2:stride;ownPlayer.right.rotation.x=survival.state.boat?-Math.PI/2:-stride;ownPlayer.arm.rotation.x=-stride;ownPlayer.arm2.rotation.x=input.eat&&ITEMS[hotbarSlots[selected]]?.food&&survival.state.hunger<20?-1.7+Math.sin(now*.028)*.08:miningHeld?-.9+Math.sin(now*.022)*.35:stride;applyEquipment(ownPlayer,{...survival.state.equipment,...(survival.state.offhand?.id===181?{shield:181}:{})});}
  if(ownPlayer)posePlayerShield(ownPlayer,input.block);
  if(ownPlayer&&!survival.state.sleeping)tintAndFall(ownPlayer.group,now);
  if(survival.state.sleeping&&survival.state.bedPose){sleepPose(ownPlayer.group,survival.state.bedPose);if(!perspective){const b=survival.state.bedPose;camera.position.set(b.head.x+.5,b.head.y+1,b.head.z+.5);camera.rotation.set(1.2,me.yaw,0);}}
  if(perspective){const eye=new THREE.Vector3(me.x,me.y+1.5,me.z),direction=new THREE.Vector3(-Math.sin(me.yaw)*Math.cos(me.pitch),Math.sin(me.pitch),-Math.cos(me.yaw)*Math.cos(me.pitch)).multiplyScalar(perspective===1?-1:1);let distance=4.2;for(let t=.3;t<=4.2;t+=.08){const point=eye.clone().addScaledVector(direction,t);if(solid(get(Math.floor(point.x),Math.floor(point.y),Math.floor(point.z)))){distance=Math.max(.15,t-.25);break;}}camera.position.copy(eye).addScaledVector(direction,distance);camera.lookAt(eye);}
  if(survival.state.health>0&&!survival.state.sleeping){const tilt=damageCamera.sample(now);camera.rotation.z+=tilt.roll;camera.rotation.x+=tilt.pitch;}
  if(now-worldRequest>500){worldRequest=now;requestChunks();}
  const hit=raycast(me,get);outline.visible=!!hit;if(hit){if(outline.userData.block!==hit.block){outline.geometry.dispose();const points=[];for(const [x,y,z,a,b,c]of blockBoxes(hit.block)){const box=new THREE.EdgesGeometry(new THREE.BoxGeometry(a-x,b-y,c-z)),v=box.attributes.position;for(let i=0;i<v.count;i++)points.push(v.getX(i)+(a+x)/2,v.getY(i)+(b+y)/2,v.getZ(i)+(c+z)/2);box.dispose();}outline.geometry=new THREE.BufferGeometry();outline.geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));outline.userData.block=hit.block;}outline.scale.set(1,1,1);outline.position.set(hit.x,hit.y,hit.z);}

  if(now-hudAt>180){hudAt=now;$('target').textContent=hit?.block===9?'Unbreakable':'';$('coordinates').textContent=`XYZ ${me.x.toFixed(1)} / ${me.y.toFixed(1)} / ${me.z.toFixed(1)}`;$('biome').textContent=dimension==='nether'?'Nether Wastes':terrain(Math.floor(me.x),Math.floor(me.z)).biome;}
 }else{if(ownPlayer)ownPlayer.group.visible=false;outline.visible=false;camera.position.set(32+Math.sin(now*.00003)*7,37,43);camera.lookAt(0,15,0);}
 for(const a of avatars.values()){const t=a.target,pose=a.motion?.sample(now)||t,d=Math.hypot(a.group.position.x-pose.x,a.group.position.z-pose.z);a.group.position.set(pose.x,pose.y,pose.z);a.group.rotation.y=pose.yaw;a.group.scale.y=t.crouching&&!t.sleeping?.83:1;a.left.rotation.x=d>.01?Math.sin(now*.009)*.45:0;a.right.rotation.x=-a.left.rotation.x;a.arm.rotation.x=-a.left.rotation.x*.85;a.arm2.rotation.x=a.left.rotation.x*.85;a.head.rotation.x=Math.max(-.8,Math.min(.8,pose.pitch||0));posePlayerShield(a,t.blocking);if(t.boat){a.left.rotation.x=-Math.PI/2;a.right.rotation.x=-Math.PI/2;}tintAndFall(a.group,now);if(t.sleeping)sleepPose(a.group,t.bedPose);if(t.bowDrawing){a.arm.rotation.x=-1.3;a.arm2.rotation.x=-1.4;}else if(t.eating)a.arm2.rotation.x=-1.7+Math.sin(now*.028)*.08;else if(t.mining)a.arm2.rotation.x=-.9+Math.sin(now*.022)*.35;}
 const underwater=me&&get(Math.floor(me.x),Math.floor(me.y+eyeHeight(me)),Math.floor(me.z))===8;
 document.body.classList.toggle('underwater',!!underwater);
 pearlVisuals.animate(now);arrowVisuals.animate(now);const daylight=survival.animate(now,dt),nether=dimension==='nether',underground=!!me&&me.y<terrain(Math.floor(me.x),Math.floor(me.z)).height-4;sun.intensity=nether?0:underground?0:1.65*daylight;scene.children.find(o=>o.isHemisphereLight).intensity=nether?1.05:underground?.3:.2+daylight*1.5;scene.background.set(nether?'#2b0b08':'#acd2df');scene.fog.color.set(nether?'#461b12':underwater?'#3887a9':underground?'#171820':'#b9d4ff').multiplyScalar(nether||underwater||underground?1:daylight);for(const child of scene.children)if(child.material?.isShaderMaterial)child.material.uniforms.daylight.value=daylight;scene.fog.near=nether?4:underwater?1:Math.max(8,(viewDistance-1)*CHUNK);scene.fog.far=nether?Math.min(48,viewDistance*CHUNK):underwater?16:viewDistance*CHUNK;
 if(miningHeld&&controls()&&now-lastMiningSwing>320){lastMiningSwing=now;held.swing();if(miningFeedback)sounds.play('mine',{block:miningFeedback.block});}
 leftHeld.select(survival.state.offhand?.id||0,survival.state.offhand?.count||0);leftHeld.update(now,controls()&&!!(input.forward||input.back||input.left||input.right),connected&&perspective===0&&survival.state.health>0&&!menuOpen()&&survival.state.offhand?.id!==181);
 const leftShieldOn=survival.state.offhand?.id===181||survival.state.equipment?.shield===181;firstShield.visible=connected&&perspective===0&&survival.state.health>0&&leftShieldOn&&!menuOpen();poseFirstPersonShield(firstShield,input.block,camera.aspect,dt);
 rightShield.visible=connected&&perspective===0&&survival.state.health>0&&hotbarSlots[selected]===181&&inventory[181]>0&&!menuOpen();poseFirstPersonShield(rightShield,input.block,camera.aspect,dt,1);
 sounds.frame({player:me,active:connected&&controls()&&survival.state.health>0&&!survival.state.sleeping,furnace:!!survival.state.furnace?.job,eating:input.eat&&!!ITEMS[hotbarSlots[selected]]?.food&&(inventory[hotbarSlots[selected]]||0)>0&&survival.state.hunger<20,get,grounded:!!me&&collides({...me,y:me.y-.065},get),now});
 resources.update(Date.now(),dt,camera);xpEffects.animate(now,dt);
 drawnBow.group.visible=connected&&inventory[235]>0&&hotbarSlots[selected]===235&&!survival.state.sleeping&&!menuOpen()&&perspective===0&&survival.state.health>0;drawnBow.update(bowHeld?Math.min(1,(now-bowDrawAt)/1000):0,!!((inventory[236]||0)>0||survival.state.offhand?.id===236));
 held.update(now,controls()&&!!(input.forward||input.back||input.left||input.right),connected&&!survival.state.sleeping&&!menuOpen()&&perspective===0&&survival.state.health>0&&hotbarSlots[selected]!==235&&hotbarSlots[selected]!==181,input.eat&&!!ITEMS[hotbarSlots[selected]]?.food&&inventory[hotbarSlots[selected]]>0&&survival.state.hunger<20);
 atmosphere(now,camera,survival.state.time||6000,dimension);
 if(waterMaterial.userData.flowShader)waterMaterial.userData.flowShader.uniforms.flowTime.value=now/1000;renderer.render(scene,camera);
 // Spread chunk construction across spare frame time after responsive movement/rendering.
 for(const key of dirty){if(chunks.has(key)){const requested=dirtySections.get(key)??null,previous=meshTasks.get(key),remaining=mergeSections(previous?.remaining,requested)??new Set(Array.from({length:CHUNK_HEIGHT/16},(_,i)=>i+MIN_Y/16));meshTasks.set(key,{key,remaining,job:meshChunk(key,remaining),published:previous?.published||0});}}dirty.clear();dirtySections.clear();
 for(const key of meshTasks.keys())if(!chunks.has(key))meshTasks.delete(key);
 const nextTask=[...meshTasks.values()].sort((a,b)=>{if(a.published!==b.published)return a.published-b.published;if(!me)return 0;const [ax,az]=a.key.split(',').map(Number),[bx,bz]=b.key.split(',').map(Number);return ((ax+.5)*CHUNK-me.x)**2+((az+.5)*CHUNK-me.z)**2-((bx+.5)*CHUNK-me.x)**2-((bz+.5)*CHUNK-me.z)**2;})[0];
 if(nextTask){const result=nextTask.job.next();if(result.done)meshTasks.delete(nextTask.key);else if(result.value?.sectionReady){nextTask.published++;nextTask.remaining.delete(result.value.section);}}
}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
addEventListener('pagehide',()=>socket?.close(1000,'Leaving world'));
// Terrain streams after joining; avoid generating nine unused columns on the UI thread.

updateInventory();requestAnimationFrame(animate);
