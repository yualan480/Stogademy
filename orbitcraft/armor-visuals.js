import * as THREE from './vendor/three.module.js';
import {skinBox} from './players.js';
export function applyEquipment(model,equipment={}){
 const root=model.group,key=JSON.stringify(Object.entries(equipment).filter(([,id])=>id).sort(([a],[b])=>a.localeCompare(b)));if(root.userData.gearKey===key)return;root.userData.gearKey=key;
 const old=root.userData.gear;if(old){const parts=old.userData.parts||[],materials=new Set();for(const part of parts){part.parent?.remove(part);part.geometry.dispose();materials.add(part.material);}for(const material of materials){material.map?.dispose();material.dispose();}root.remove(old);}
 const gear=new THREE.Group();gear.name='equipped-armor';gear.userData.parts=[];root.userData.gear=gear;root.add(gear);
 function attach(parent,slot,dimensions,position,uv,pixels,material){const mesh=new THREE.Mesh(skinBox(...dimensions,...uv,...pixels,32),material);mesh.name='armor-'+slot;mesh.userData.armorSlot=slot;mesh.position.set(...position);parent.add(mesh);gear.userData.parts.push(mesh);return mesh;}
 for(const [slot,id]of Object.entries(equipment)){
  if(!['helmet','chestplate','leggings','boots','shield'].includes(slot))continue;
  if(slot==='shield'){const texture=new THREE.TextureLoader().load(new URL('./assets/reference/shield_front.png',import.meta.url).href);texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.colorSpace=THREE.SRGBColorSpace;const material=new THREE.MeshLambertMaterial({map:texture});const mesh=new THREE.Mesh(new THREE.BoxGeometry(.36,.52,.035),material);mesh.name='armor-shield';mesh.position.set(-.08,-.32,-.16);(model.arm||gear).add(mesh);gear.userData.parts.push(mesh);continue;}
  const name=id>=210&&id<214?'netherite':id>=200&&id<204?'diamond':id>=220?'gold':'iron',layer=slot==='leggings'?'humanoid_leggings':'humanoid';
  const texture=new THREE.TextureLoader().load(new URL(`./assets/armor/${name}-${layer}.png`,import.meta.url).href);texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.colorSpace=THREE.SRGBColorSpace;const material=new THREE.MeshLambertMaterial({map:texture,alphaTest:.1});material.userData.owned=true;
  if(slot==='helmet')attach(model.head,'helmet',[.5625,.5625,.5625],[0,.225,0],[0,0],[8,8,8],material);
  if(slot==='chestplate'){attach(gear,'chestplate',[.5625,.7875,.3375],[0,1.0125,0],[16,16],[8,12,4],material);for(const arm of [model.arm,model.arm2])attach(arm,'chestplate',[.3375,.7875,.3375],[0,-.3375,-.002],[40,16],[4,12,4],material);}
  if(slot==='leggings'){attach(gear,'leggings',[.50625,.73125,.28125],[0,1.0125,0],[16,16],[8,12,4],material);for(const leg of [model.left,model.right])attach(leg,'leggings',[.28125,.73125,.28125],[0,-.3375,0],[0,16],[4,12,4],material);}
  if(slot==='boots')for(const leg of [model.left,model.right])attach(leg,'boots',[.3375,.7875,.3375],[0,-.3375,0],[0,16],[4,12,4],material);
 }
}
