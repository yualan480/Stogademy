import * as THREE from './vendor/three.module.js';
import {validSkin} from './skins.js';
// Modern 64×64 player skin layout, including the outer clothing layer.
function skinBox(w,h,d,u,v,pw,ph,pd){const geometry=new THREE.BoxGeometry(w,h,d),rects=[[u,v+pd,pd,ph],[u+pd+pw,v+pd,pd,ph],[u+pd,v,pw,pd],[u+pd+pw,v,pw,pd],[u+2*pd+pw,v+pd,pw,ph],[u+pd,v+pd,pw,ph]],uv=geometry.attributes.uv;for(let face=0;face<6;face++){const [x,y,a,b]=rects[face];for(let i=0;i<4;i++)uv.setXY(face*4+i,(x+(i%2)*a)/64,1-(y+(i<2?0:b))/64);}return geometry;}
export function createPlayerModel(id,skin='steve'){
 const group=new THREE.Group(),head=new THREE.Group();head.position.y=1.35;group.add(head);const material=new THREE.MeshLambertMaterial({alphaTest:.1,transparent:false}),overlay=new THREE.MeshLambertMaterial({alphaTest:.1,transparent:true});material.userData.owned=overlay.userData.owned=true;
 function part(parent,w,h,d,x,y,z,base,outer,pixels){for(const [layer,coords]of [base,outer].entries()){const mesh=new THREE.Mesh(skinBox(w*(layer?1.045:1),h*(layer?1.025:1),d*(layer?1.045:1),...coords,...pixels),layer?overlay:material);mesh.position.set(x,y,z);parent.add(mesh);}}
 part(head,.45,.45,.45,0,.225,0,[0,0],[32,0],[8,8,8]);part(group,.45,.675,.225,0,1.0125,0,[16,16],[16,32],[8,12,4]);
 function limb(x,y,base,outer){const pivot=new THREE.Group();pivot.position.set(x,y,0);group.add(pivot);part(pivot,.225,.675,.225,0,-.3375,0,base,outer,[4,12,4]);return pivot;}
 const left=limb(-.1125,.675,[0,16],[0,32]),right=limb(.1125,.675,[16,48],[0,48]),arm=limb(-.3375,1.35,[40,16],[40,32]),arm2=limb(.3375,1.35,[32,48],[48,48]);
 let current='',map;function setSkin(value){value=validSkin(value)?value:'steve';if(current===value)return;current=value;group.userData.skin=value;const old=map;map=new THREE.TextureLoader().load(new URL(`./assets/skins/${value}.png`,import.meta.url).href);map.magFilter=map.minFilter=THREE.NearestFilter;map.colorSpace=THREE.SRGBColorSpace;material.map=overlay.map=map;material.needsUpdate=overlay.needsUpdate=true;old?.dispose();}setSkin(skin);
 return {group,head,left,right,arm,arm2,setSkin};
}
