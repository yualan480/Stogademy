import { ITEMS } from './items.js';
// Shared, deterministic world and collision rules. Never change the generation
// algorithm/seed of an existing database without migrating its world.
export const VERSION = 1, SEED = 481203, SIZE = 1024, HEIGHT = 56, CHUNK = 16, SEA = 13;
export const BLOCKS = {
  1: { name: 'Grass', color: '#70a745' }, 2: { name: 'Dirt', color: '#926342' },
  3: { name: 'Stone', color: '#9298a0' }, 4: { name: 'Sand', color: '#e7ce8c' },
  5: { name: 'Oak log', color: '#89613c' }, 6: { name: 'Leaves', color: '#427a3c' },
  7: { name: 'Snow', color: '#e5f1f5' }, 8: { name: 'Water', color: '#479bcd' },
  9: { name: 'Bedrock', color: '#424851' }, 10: { name: 'Oak planks', color: '#c49a5b' }
};
for(const [id,item] of Object.entries(ITEMS))if(item.block)BLOCKS[id]={name:item.name,color:'#8e8071'};
export const SLOTS = [2,3,5,10,4,1,6,7];
export const solid = b => b !== 0 && b !== 8 && b !== 22 && b !== 25;
export const inside = (x,y,z) => Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) && x >= -SIZE/2 && x < SIZE/2 && z >= -SIZE/2 && z < SIZE/2 && y >= 0 && y < HEIGHT;
export function hash(x,y=0,z=0) { let h = Math.imul(x ^ SEED, 374761393) ^ Math.imul(y,668265263) ^ Math.imul(z,2147483647); h = Math.imul(h ^ h>>>13,1274126177); return ((h ^ h>>>16)>>>0)/4294967295; }
const mix=(a,b,t)=>a+(b-a)*t, smooth=t=>t*t*(3-2*t);
function noise(x,z,scale) { x/=scale;z/=scale;const a=Math.floor(x),b=Math.floor(z),u=smooth(x-a),v=smooth(z-b);return mix(mix(hash(a,0,b),hash(a+1,0,b),u),mix(hash(a,0,b+1),hash(a+1,0,b+1),u),v); }
const terrainMemo=new Map(),treeColumns=new Map();
export function terrain(x,z) {
  const key=x+','+z,cached=terrainMemo.get(key);if(cached)return cached;
  const mountain = noise(x+130,z-81,33), moisture = noise(x-200,z+510,25);
  const height = Math.floor(10 + noise(x,z,29)*10 + noise(x+30,z-30,9)*4 + Math.max(0,mountain-.48)*65);
  const biome = height > 31 ? 'Alpine' : moisture < .32 ? 'Desert' : moisture > .51 ? 'Forest' : 'Meadow';
  const value={height:Math.min(HEIGHT-7,height),biome};if(terrainMemo.size>=32768)terrainMemo.delete(terrainMemo.keys().next().value);terrainMemo.set(key,value);return value;
}
const treeAt=(x,z)=> { const t=terrain(x,z);return t.biome==='Forest' && t.height>SEA+1 && hash(x,81,z)>.978 ? t.height : -100; };
export function baseBlock(x,y,z) {
  if (!inside(x,y,z)) return 0;
  if (y===0) return 9;
  const {height:h,biome}=terrain(x,z);
  if(y<=h) {
    // Carve connected, branching underground tunnels, with occasional entrances.
    const cave = Math.abs(Math.sin(x*.16 + Math.sin(z*.12)*2) + Math.cos(z*.14 + y*.23)) < .15;
    if(y>3 && y<h-3 && cave) return 0;
    if(y===h && h>SEA) return biome==='Alpine'?7:biome==='Desert'||h<=SEA+1?4:1;
    return y>h-4 ? (biome==='Desert'||h<=SEA+1?4:2) : 3;
  }
  if(y<=SEA) return 8;
  // Cache deterministic tree centers per column; this changes no terrain.
  const key=x+','+z;let trees=treeColumns.get(key);
  if(!trees){trees=[];for(let tx=x-2;tx<=x+2;tx++)for(let tz=z-2;tz<=z+2;tz++){if(hash(tx,81,tz)<=.978)continue;const h=treeAt(tx,tz);if(h>0)trees.push({tx,tz,h});}if(treeColumns.size>=32768)treeColumns.delete(treeColumns.keys().next().value);treeColumns.set(key,trees);}
  for(const {tx,tz,h}of trees){
    if(tx===x && tz===z && y>h && y<=h+4) return 5;
    if(y>=h+3 && y<=h+5 && Math.abs(tx-x)+Math.abs(tz-z)+(y===h+5?1:0)<=3) return 6;
  }
  return 0;
}
export const chunkIndex=(x,y,z)=>y*CHUNK*CHUNK+z*CHUNK+x;
export function overlaps(x,y,z,p) { return x+1>p.x-.3 && x<p.x+.3 && y+1>p.y && y<p.y+1.8 && z+1>p.z-.3 && z<p.z+.3; }
export function collides(p,get) {
  if(p.x< -SIZE/2+.3 || p.x>SIZE/2-.3 || p.z< -SIZE/2+.3 || p.z>SIZE/2-.3 || p.y<1 || p.y>HEIGHT-1.8) return true;
  for(let x=Math.floor(p.x-.3);x<=Math.floor(p.x+.3);x++) for(let y=Math.floor(p.y);y<=Math.floor(p.y+1.799);y++) for(let z=Math.floor(p.z-.3);z<=Math.floor(p.z+.3);z++) {const id=get(x,y,z),height=id===20||id===26?.6:id===23?.875:1;if(solid(id)&&p.y<y+height&&p.y+1.799>y)return true;}
  return false;
}
export function step(p,input,dt,get) {
  const water=get(Math.floor(p.x),Math.floor(p.y+.8),Math.floor(p.z))===8;
  const grounded=collides({...p,y:p.y-.065},get);
  let f=Number(!!input.forward)-Number(!!input.back),s=Number(!!input.right)-Number(!!input.left);
  const n=Math.hypot(f,s)||1; f/=n;s/=n;
  const flying=p.survival?.mode==='creative'&&p.survival.flying;
  const speed=flying?8:input.sneak?1.3:water?2.7:input.sprint&&(p.survival?.hunger??20)>6?6:4.3, yaw=p.yaw||0;
  p.vy=flying?(Number(!!input.jump)-Number(!!input.sneak))*6:Math.max(-22,(p.vy||0)-(water?5:22)*dt);
  if(!flying&&input.jump && (grounded||water)) p.vy=water?4:8.2;
  const dx=(-Math.sin(yaw)*f+Math.cos(yaw)*s)*speed*dt,dz=(-Math.cos(yaw)*f-Math.sin(yaw)*s)*speed*dt;
  for(const [axis,d] of [['x',dx],['z',dz],['y',p.vy*dt]]) {
    const count=Math.max(1,Math.ceil(Math.abs(d)/.15));
    for(let i=0;i<count;i++) { const next={...p,[axis]:p[axis]+d/count}; if(input.sneak&&grounded&&!flying&&axis!=='y'&&!collides({...next,y:next.y-.5},get))break; if(!collides(next,get)) p[axis]=next[axis];else {if(axis==='y')p.vy=0;break;} }
  }
}
export function raycast(p,get,reach=6) {
  const eye={x:p.x,y:p.y+1.62,z:p.z}, cp=Math.cos(p.pitch||0);
  const d={x:-Math.sin(p.yaw)*cp,y:Math.sin(p.pitch||0),z:-Math.cos(p.yaw)*cp};
  let previous=null;
  for(let t=0;t<=reach;t+=.035) {
    const a={x:Math.floor(eye.x+d.x*t),y:Math.floor(eye.y+d.y*t),z:Math.floor(eye.z+d.z*t)};
    const b=get(a.x,a.y,a.z);
    if((solid(b)&&(![20,26,23].includes(b)||eye.y+d.y*t<a.y+(b===23?.875:.6)))||b===22||b===25)return {...a,block:b,place:[20,26,23].includes(b)&&previous&&previous.x===a.x&&previous.y===a.y&&previous.z===a.z?{...a,y:a.y+1}:previous};
    previous=a;
  }
  return null;
}

// Hand-mining times in milliseconds. Bedrock has no break duration.
export const MINING_MS = Object.freeze({1:750,2:650,3:2600,4:550,5:1800,6:350,7:450,10:1200,11:2600,12:650,13:3000,14:3500,15:5000,16:3500,17:9000,18:1800,19:3500,20:900,21:650,22:250,23:1800,24:3500,25:200,26:900});
export const PICKUP_DELAY_MS = 750;

// Resources only overlay natural stone; stored edits always take precedence.
export function resourceBlock(x,y,z){const b=baseBlock(x,y,z);if(b!==3)return b;const h=hash(x,y,z);if(y<7&&h>.993)return 17;if(y<12&&h>.98)return 15;if(y<20&&h>.965)return 16;if(y<30&&h>.92)return 14;if(h>.84)return 13;if(h<.025)return 12;return b;}
