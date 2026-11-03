import * as THREE from './vendor/three.module.js';
export function createShortcuts({canvas,renderer,scene,camera,controls,bindings,player,state,send,reload,fps,biome}){
 let f3=false,combo=false,boxes=false;const helpers=new Map();
 const debug=document.createElement('pre');debug.id='debug-screen';debug.hidden=true;document.body.append(debug);
 const clear=()=>{for(const h of helpers.values()){scene.remove(h);h.geometry.dispose();h.material.dispose();}helpers.clear();};
 function keydown(e){
  if(e.target.matches?.('input,textarea,select'))return false;
  if(e.code===bindings.get('debug')){e.preventDefault();if(!e.repeat){f3=true;combo=false;}return true;}
  if(f3&&e.code==='KeyA'){e.preventDefault();combo=true;reload();return true;}
  if(f3&&e.code==='KeyB'){e.preventDefault();combo=true;boxes=!boxes;if(!boxes)clear();return true;}
  if(!['hideHud','screenshot','fullscreen'].some(action=>e.code===bindings.get(action)))return false;e.preventDefault();if(e.repeat)return true;
  if(e.code===bindings.get('hideHud'))document.body.classList.toggle('gui-hidden');
  if(e.code===bindings.get('screenshot')){renderer.render(scene,camera);const a=document.createElement('a');a.download=`Orbitcraft-${new Date().toISOString().replace(/[:.]/g,'-')}.png`;a.href=canvas.toDataURL('image/png');a.click();}
  if(e.code===bindings.get('fullscreen')){const operation=document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();operation?.catch(()=>{});}
  return true;
 }
 function keyup(e){if(e.code===bindings.get('debug')){e.preventDefault();if(f3&&!combo){debug.hidden=!debug.hidden;tick();}f3=false;combo=false;return true;}return false;}
 function tick(){const p=player();if(!debug.hidden&&p)debug.textContent=`Orbitcraft\nXYZ: ${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}\nFPS: ${fps()}\nBiome: ${biome()}\nMode: ${state().mode||'survival'}\nF3+A: reload chunks · F3+B: entity hitboxes`;
  if(!boxes)return;const live=new Set();for(const entity of scene.children){const box=entity.userData.hitbox;if(!box||!entity.visible)continue;live.add(entity.uuid);let h=helpers.get(entity.uuid);if(!h){h=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(box.width,box.height,box.width)),new THREE.LineBasicMaterial({color:0xffffff}));h.name='debug-hitbox';scene.add(h);helpers.set(entity.uuid,h);}h.position.copy(entity.position);h.position.y+=box.height/2;}
  for(const [id,h]of helpers)if(!live.has(id)){scene.remove(h);h.geometry.dispose();h.material.dispose();helpers.delete(id);}
 }
 return {keydown,keyup,tick};
}
