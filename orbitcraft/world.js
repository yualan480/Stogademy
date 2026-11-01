// Shared, deterministic world and collision rules. Never change the generation
// algorithm/seed of an existing database without migrating its world.
export const VERSION = 1, SEED = 481203, SIZE = 128, HEIGHT = 56, CHUNK = 16, SEA = 13;
export const BLOCKS = {
  1: { name: 'Grass', color: '#70a745' }, 2: { name: 'Dirt', color: '#926342' },
  3: { name: 'Stone', color: '#9298a0' }, 4: { name: 'Sand', color: '#e7ce8c' },
  5: { name: 'Oak log', color: '#89613c' }, 6: { name: 'Leaves', color: '#427a3c' },
  7: { name: 'Snow', color: '#e5f1f5' }, 8: { name: 'Water', color: '#479bcd' },
  9: { name: 'Bedrock', color: '#424851' }, 10: { name: 'Oak planks', color: '#c49a5b' }
};
export const SLOTS = [2,3,5,10,4,1,6,7];
export const solid = b => b !== 0 && b !== 8;
export const inside = (x,y,z) => Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) && x >= -SIZE/2 && x < SIZE/2 && z >= -SIZE/2 && z < SIZE/2 && y >= 0 && y < HEIGHT;
export function hash(x,y=0,z=0) { let h = Math.imul(x ^ SEED, 374761393) ^ Math.imul(y,668265263) ^ Math.imul(z,2147483647); h = Math.imul(h ^ h>>>13,1274126177); return ((h ^ h>>>16)>>>0)/4294967295; }
const mix=(a,b,t)=>a+(b-a)*t, smooth=t=>t*t*(3-2*t);
function noise(x,z,scale) { x/=scale;z/=scale;const a=Math.floor(x),b=Math.floor(z),u=smooth(x-a),v=smooth(z-b);return mix(mix(hash(a,0,b),hash(a+1,0,b),u),mix(hash(a,0,b+1),hash(a+1,0,b+1),u),v); }
export function terrain(x,z) {
  const mountain = noise(x+130,z-81,33), moisture = noise(x-200,z+510,25);
  const height = Math.floor(10 + noise(x,z,29)*10 + noise(x+30,z-30,9)*4 + Math.max(0,mountain-.48)*65);
  const biome = height > 31 ? 'Alpine' : moisture < .32 ? 'Desert' : moisture > .51 ? 'Forest' : 'Meadow';
  return { height: Math.min(HEIGHT-7,height), biome };
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
  // Scan all neighboring tree centers so chunk edges are seamless.
  for(let tx=x-2;tx<=x+2;tx++) for(let tz=z-2;tz<=z+2;tz++) {
    if(hash(tx,81,tz)<=.978) continue;
    const h=treeAt(tx,tz);
    if(tx===x && tz===z && y>h && y<=h+4) return 5;
    if(y>=h+3 && y<=h+5 && Math.abs(tx-x)+Math.abs(tz-z)+(y===h+5?1:0)<=3) return 6;
  }
  return 0;
}
export const chunkIndex=(x,y,z)=>y*CHUNK*CHUNK+z*CHUNK+x;
export function overlaps(x,y,z,p) { return x+1>p.x-.3 && x<p.x+.3 && y+1>p.y && y<p.y+1.8 && z+1>p.z-.3 && z<p.z+.3; }
export function collides(p,get) {
  if(p.x< -SIZE/2+.3 || p.x>SIZE/2-.3 || p.z< -SIZE/2+.3 || p.z>SIZE/2-.3 || p.y<1 || p.y>HEIGHT-1.8) return true;
  for(let x=Math.floor(p.x-.3);x<=Math.floor(p.x+.3);x++) for(let y=Math.floor(p.y);y<=Math.floor(p.y+1.799);y++) for(let z=Math.floor(p.z-.3);z<=Math.floor(p.z+.3);z++) if(solid(get(x,y,z))) return true;
  return false;
}
export function step(p,input,dt,get) {
  const water=get(Math.floor(p.x),Math.floor(p.y+.8),Math.floor(p.z))===8;
  const grounded=collides({...p,y:p.y-.065},get);
  let f=Number(!!input.forward)-Number(!!input.back),s=Number(!!input.right)-Number(!!input.left);
  const n=Math.hypot(f,s)||1; f/=n;s/=n;
  const speed=water?2.7:input.sprint?6:4.3, yaw=p.yaw||0;
  p.vy=Math.max(-22,(p.vy||0)-(water?5:22)*dt);
  if(input.jump && (grounded||water)) p.vy=water?4:8.2;
  const dx=(-Math.sin(yaw)*f+Math.cos(yaw)*s)*speed*dt,dz=(-Math.cos(yaw)*f-Math.sin(yaw)*s)*speed*dt;
  for(const [axis,d] of [['x',dx],['z',dz],['y',p.vy*dt]]) {
    const count=Math.max(1,Math.ceil(Math.abs(d)/.15));
    for(let i=0;i<count;i++) { const next={...p,[axis]:p[axis]+d/count}; if(!collides(next,get)) p[axis]=next[axis];else {if(axis==='y')p.vy=0;break;} }
  }
}
export function raycast(p,get,reach=6) {
  const eye={x:p.x,y:p.y+1.62,z:p.z}, cp=Math.cos(p.pitch||0);
  const d={x:-Math.sin(p.yaw)*cp,y:Math.sin(p.pitch||0),z:-Math.cos(p.yaw)*cp};
  let previous=null;
  for(let t=0;t<=reach;t+=.035) {
    const a={x:Math.floor(eye.x+d.x*t),y:Math.floor(eye.y+d.y*t),z:Math.floor(eye.z+d.z*t)};
    const b=get(a.x,a.y,a.z);
    if(solid(b))return {...a,block:b,place:previous};
    previous=a;
  }
  return null;
}
