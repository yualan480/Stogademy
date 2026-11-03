import * as THREE from './vendor/three.module.js';
import {blockGeometry} from './mining-visuals.js?v=20261103-menus12';
export function furnitureModel(id,texture,direction={x:0,z:-1}){
 const group=new THREE.Group(),wood=new THREE.MeshLambertMaterial({map:texture}),cloth=new THREE.MeshLambertMaterial({color:0xe7e7df}),pillow=new THREE.MeshLambertMaterial({color:0xffffff}),frame=new THREE.MeshLambertMaterial({color:0x5a4026});
 for(const m of [wood,cloth,pillow,frame])m.userData.owned=true;
 function box(w,h,d,x,y,z,material,block){const mesh=new THREE.Mesh(block?blockGeometry(block,1):new THREE.BoxGeometry(1,1,1),material);mesh.scale.set(w,h,d);mesh.position.set(x,y,z);group.add(mesh);return mesh;}
 if(id===23){group.name='chest-model';box(.875,.6,.875,.5,.3,.5,wood,23);box(.89,.025,.89,.5,.6125,.5,frame);box(.875,.25,.875,.5,.75,.5,wood,23);box(.11,.28,.055,.5,.57,.96,new THREE.MeshLambertMaterial({color:0xbcbcb5}));}
 else{group.name=id===26?'bed-head-model':'bed-foot-model';const body=new THREE.Group();box(.98,.15,.98,.5,.27,.5,wood,10);box(.99,.23,.99,.5,.46,.5,cloth);const outer=id===26?.9:.1;for(const x of [.1,.9])box(.15,.3,.15,x,.15,outer,frame);if(id===26)box(.85,.065,.38,.5,.6075,.7,pillow);group.position.set(-.5,0,-.5);body.add(group);body.rotation.y=Math.atan2(direction.x,direction.z);body.position.set(.5,0,.5);const root=new THREE.Group();root.name=id===26?'bed-head-model':'bed-foot-model';root.add(body);return root;}
 return group;
}
