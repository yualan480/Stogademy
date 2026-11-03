import * as THREE from './vendor/three.module.js';

// Classic reference proportions and original pixel painting. Player identity
// is supplied separately by the authenticated multiplayer server.
export function createPlayerModel(id) {
  const seed=481203;
  const shirt='#079f9d';
  const hair='#2d2117',skin='#ac7f69';
  function paint(base,draw){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=16;
    const c=canvas.getContext('2d');c.fillStyle=base;c.fillRect(0,0,16,16);
    for(let y=0;y<16;y++)for(let x=0;x<16;x++){c.fillStyle=(x*7+y*13+seed)%9<3?'#0000000a':'#ffffff05';c.fillRect(x,y,1,1);}
    draw?.(c);const map=new THREE.CanvasTexture(canvas);map.magFilter=THREE.NearestFilter;map.minFilter=THREE.NearestFilter;map.colorSpace=THREE.SRGBColorSpace;
    return new THREE.MeshLambertMaterial({map});
  }
  const face=paint(skin,c=>{
    c.fillStyle=hair;c.fillRect(0,0,16,4);c.fillRect(0,3,3,4);c.fillRect(13,3,3,3);c.fillRect(5,3,4,2);
    c.fillStyle='#eee9d6';c.fillRect(3,8,4,2);c.fillRect(9,8,4,2);
    c.fillStyle='#514a9b';c.fillRect(5,8,2,2);c.fillRect(9,8,2,2);
    c.fillStyle='#875744';c.fillRect(6,10,4,3);c.fillStyle='#593e2a';c.fillRect(4,12,8,3);c.fillStyle='#a5745c';c.fillRect(6,12,4,1);
  });
  const side=paint(skin,c=>{c.fillStyle=hair;c.fillRect(0,0,16,5);c.fillRect(0,4,4,8);});
  const hairMaterial=paint(hair),skinMaterial=paint(skin);
  const torsoMaterial=paint(shirt,c=>{c.fillStyle=skin;c.fillRect(6,0,4,2);c.fillStyle='#00000020';c.fillRect(3,4,2,10);c.fillRect(11,6,2,8);c.fillRect(0,14,16,2);});
  const armMaterial=paint(skin,c=>{c.fillStyle=shirt;c.fillRect(0,0,16,6);c.fillStyle='#00000010';c.fillRect(0,14,16,2);});
  const trouserMaterial=paint('#403292',c=>{c.fillStyle='#484847';c.fillRect(0,13,16,3);c.fillStyle='#00000018';c.fillRect(2,2,3,11);});
  const group=new THREE.Group(),head=new THREE.Group();head.position.y=1.35;group.add(head);
  const headMesh=new THREE.Mesh(new THREE.BoxGeometry(.45,.45,.45),[side,side,hairMaterial,skinMaterial,hairMaterial,face]);headMesh.position.y=.225;head.add(headMesh);
  const torso=new THREE.Mesh(new THREE.BoxGeometry(.45,.675,.225),torsoMaterial);torso.position.y=1.0125;group.add(torso);
  function limb(width,height,depth,material,x,y){
    const pivot=new THREE.Group();pivot.position.set(x,y,0);const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),material);mesh.position.y=-height/2;pivot.add(mesh);group.add(pivot);return pivot;
  }
  const left=limb(.225,.675,.225,trouserMaterial,-.1125,.675),right=limb(.225,.675,.225,trouserMaterial,.1125,.675);
  const arm=limb(.225,.675,.225,armMaterial,-.3375,1.35),arm2=limb(.225,.675,.225,armMaterial,.3375,1.35);
  return {group,head,left,right,arm,arm2};
}
