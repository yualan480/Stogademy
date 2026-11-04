import * as THREE from './vendor/three.module.js';
import {drawItem} from './item-art.js?v=20261104-pearl31';
export function createPearlVisuals(scene){const canvas=document.createElement('canvas');canvas.width=canvas.height=16;drawItem(canvas.getContext('2d'),239,0,{});const texture=new THREE.CanvasTexture(canvas);texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.colorSpace=THREE.SRGBColorSpace;const material=new THREE.SpriteMaterial({map:texture,depthWrite:false}),items=new Map();
 function add(a){let item=items.get(a.id);if(!item){const sprite=new THREE.Sprite(material);sprite.scale.setScalar(.28);sprite.name='pearl:'+a.id;scene.add(sprite);item={sprite};items.set(a.id,item);}item.a={...a};item.at=performance.now();}
 function remove(id){const item=items.get(id);if(item){scene.remove(item.sprite);items.delete(id);}}
 return{add,remove,set(list){const live=new Set(list.map(a=>a.id));for(const a of list)add(a);for(const id of items.keys())if(!live.has(id))remove(id);},animate(now){for(const {sprite,a,at}of items.values()){const t=Math.min(.35,(now-at)/1000);sprite.position.set(a.x+a.vx*t,a.y+a.vy*t-6*t*t,a.z+a.vz*t);}},clear(){for(const id of items.keys())remove(id);}};
}
