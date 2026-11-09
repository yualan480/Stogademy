import * as THREE from './vendor/three.module.js';
let texture;
export function createShieldMesh({firstPerson=false}={}){
 if(!texture){texture=new THREE.TextureLoader().load(new URL('./assets/reference/shield_front.png',import.meta.url).href);texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.colorSpace=THREE.SRGBColorSpace;}
 const geometry=new THREE.BoxGeometry(.65,1.08,.08),uv=geometry.attributes.uv;
 // Thin iron edges, with the full wooden face on either broad side.
 for(let face=0;face<4;face++)for(let i=0;i<4;i++)uv.setXY(face*4+i,i%2?.07:0,i<2?1:0);
 const material=new THREE.MeshLambertMaterial({map:texture,alphaTest:.1,depthTest:!firstPerson,fog:!firstPerson});material.userData.owned=true;material.userData.sharedMap=true;
 const mesh=new THREE.Mesh(geometry,material);mesh.name='held-shield';if(firstPerson)mesh.renderOrder=1002;return mesh;
}
export function poseFirstPersonShield(group,blocking,aspect,dt,side=-1){
 const width=Math.min(1,Math.max(.4,aspect/1.3)),k=1-Math.exp(-dt*14),x=side*(blocking?.38:.75)*width,y=blocking?-.2:-.58,z=blocking?-.96:-1.05;
 group.position.x+=(x-group.position.x)*k;group.position.y+=(y-group.position.y)*k;group.position.z+=(z-group.position.z)*k;
 group.rotation.y=side*(blocking?.02:.08);group.rotation.z=side*.025;group.scale.setScalar(1.35*width);
}
export function posePlayerShield(model,blocking=false){
 const shield=model.group.userData.gear?.userData.shield;if(!shield)return;
 model.arm.rotation.x=blocking?.65:.08;
 shield.rotation.set(-model.arm.rotation.x,blocking?0:-.3,0);
 shield.position.set(blocking?.16:-.04,blocking?-.42:-.55,blocking?-.16:-.18);
}
