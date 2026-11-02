import * as THREE from './vendor/three.module.js';
import { TILE_COUNT,tileFor } from './visuals.js';

function blockGeometry(id,size){
  const geometry=new THREE.BoxGeometry(size,size,size),uv=geometry.attributes.uv;
  for(let face=0;face<6;face++){
    const tile=tileFor(id,face===2?1:face===3?-1:0);
    for(let v=0;v<4;v++)uv.setXY(face*4+v,(tile*16+.2+(v%2)*15.6)/(TILE_COUNT*16),(.2+(v<2?1:0)*15.6)/16);
  }
  return geometry;
}
function crackTexture(stage){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
  const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
  // Original branching pixel cracks, progressively spreading from the center.
  for(let branch=0;branch<Math.min(8,2+stage);branch++){
    const angle=branch*Math.PI/4+.2;let x=16,y=16;
    const steps=3+stage;
    for(let i=0;i<steps;i++){
      const jitter=((branch*19+i*7)%5)-2;
      const nx=Math.round(x+Math.cos(angle)*2+(Math.abs(Math.cos(angle))<.6?jitter:0));
      const ny=Math.round(y+Math.sin(angle)*2+(Math.abs(Math.sin(angle))<.6?jitter:0));
      const width=stage>6&&i<6?2:1;
      c.fillStyle='#100e0bd9';
      c.fillRect(Math.min(x,nx),y,Math.abs(nx-x)+width,width);
      c.fillRect(nx,Math.min(y,ny),width,Math.abs(ny-y)+width);
      if(stage>3&&i%4===1)c.fillRect(nx-2,ny,3,1);
      x=nx;y=ny;
    }
  }
  const texture=new THREE.CanvasTexture(canvas);texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;return texture;
}
export function createResourceEffects(scene,texture){
  const overlays=new Map(),drops=new Map(),particles=[],geometryCache=new Map();
  const cube=new THREE.BoxGeometry(1.008,1.008,1.008);
  const cracks=Array.from({length:10},(_,stage)=>new THREE.MeshBasicMaterial({map:crackTexture(stage),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
  const itemMaterial=new THREE.MeshLambertMaterial({map:texture,alphaTest:.5});
  function geometry(id,small=false){const key=id+':'+small;if(!geometryCache.has(key))geometryCache.set(key,blockGeometry(id,small?.055:.24));return geometryCache.get(key);}
  function removeDrop(id){const d=drops.get(id);if(d){scene.remove(d.root);drops.delete(id);}}
  return {
    setMining(players){
      const active=new Map();
      for(const p of players){const m=p.mining;if(!m||m.progress<=0)continue;const key=`${m.x},${m.y},${m.z}`;if(!active.has(key)||active.get(key).progress<m.progress)active.set(key,m);}
      for(const [key,m] of active){let mesh=overlays.get(key);if(!mesh){mesh=new THREE.Mesh(cube,cracks[0]);mesh.name='mining:'+key;mesh.renderOrder=2;mesh.position.set(m.x+.5,m.y+.5,m.z+.5);overlays.set(key,mesh);scene.add(mesh);}mesh.material=cracks[Math.min(9,Math.floor(m.progress*10))];}
      for(const [key,mesh] of overlays)if(!active.has(key)){scene.remove(mesh);overlays.delete(key);}
    },
    setDrops(items,full=false){
      if(full){const ids=new Set(items.map(d=>d.id));for(const id of drops.keys())if(!ids.has(id))removeDrop(id);}
      for(const d of items){let item=drops.get(d.id);if(!item){const root=new THREE.Group(),mesh=new THREE.Mesh(geometry(d.block),itemMaterial);root.name='drop:'+d.id;root.position.set(d.x,d.y,d.z);root.add(mesh);item={root,mesh,target:d,phase:(d.created%10000)/1000};drops.set(d.id,item);scene.add(root);}item.target=d;}
    },
    removeDrop,
    breakBlock(x,y,z,id){
      for(let i=0;i<10;i++){
        if(particles.length>=64){scene.remove(particles[0].mesh);particles.shift();}
        const mesh=new THREE.Mesh(geometry(id,true),itemMaterial);mesh.position.set(x+.15+Math.random()*.7,y+.15+Math.random()*.7,z+.15+Math.random()*.7);scene.add(mesh);
        particles.push({mesh,v:new THREE.Vector3((Math.random()-.5)*2,Math.random()*2+.3,(Math.random()-.5)*2),age:0});
      }
    },
    clear(){for(const mesh of overlays.values())scene.remove(mesh);overlays.clear();for(const id of drops.keys())removeDrop(id);for(const p of particles)scene.remove(p.mesh);particles.length=0;},
    update(now,dt,camera){
      for(const item of drops.values()){
        const d=item.target;item.root.position.lerp(new THREE.Vector3(d.x,d.y,d.z),Math.min(1,dt*16));
        item.mesh.position.y=.1+Math.sin(now*.002+item.phase)*.07;item.mesh.rotation.y=now*.00045+item.phase;
        item.root.visible=item.root.position.distanceToSquared(camera.position)<42*42;
      }
      for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.age+=dt;if(p.age>.8){scene.remove(p.mesh);particles.splice(i,1);continue;}p.v.y-=6*dt;p.mesh.position.addScaledVector(p.v,dt);p.mesh.rotation.x+=dt*2;p.mesh.rotation.y+=dt;p.mesh.scale.setScalar(1-p.age/.8);}
    }
  };
}
