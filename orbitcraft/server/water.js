import {inside,CHUNK,HEIGHT,chunkIndex} from '../world.js';
import {isTorch,isPlant} from '../shapes.js';
const key=a=>`${a.x},${a.y},${a.z}`,adjacent=a=>[[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0]].map(([x,y,z])=>({x:a.x+x,y:a.y+y,z:a.z+z}));
const replaceable=id=>id===0||id===22||isTorch(id)||isPlant(id);
export class Water{
 constructor(s){this.s=s;this.pending=new Map();this.elapsed=0;s.world.waterFlows??={};for(const [k,flow]of Object.entries(s.world.waterFlows)){const [x,y,z]=k.split(',').map(Number);if(s.g.get(x,y,z)!==8)delete s.world.waterFlows[k];this.queue({x,y,z});}for(const [k,id]of s.g.edits)if(id===8){const [x,y,z]=k.split(',').map(Number);this.queue({x,y,z});}}
 queue(a){if(inside(a.x,a.y,a.z)&&this.pending.size<32768)this.pending.set(key(a),a);}
 changed(a,id,old){const flows=this.s.world.waterFlows;if(!a.flow)delete flows[key(a)];if(id===8||old===8||adjacent(a).some(p=>this.s.g.get(p.x,p.y,p.z)===8)){this.queue(a);for(const n of adjacent(a))this.queue(n);}}
 seedChunk(cx,cz,data){for(let y=1;y<HEIGHT;y++)for(let z=0;z<CHUNK;z++)for(let x=0;x<CHUNK;x++)if(data[chunkIndex(x,y,z)]===8){const a={x:cx*CHUNK+x,y,z:cz*CHUNK+z};if(this.s.world.waterFlows[key(a)]||adjacent(a).slice(0,5).some(n=>replaceable(this.s.g.get(n.x,n.y,n.z))))this.queue(a);}}
 tick(dt){this.elapsed+=dt;if(this.elapsed<.25)return;this.elapsed=0;const s=this.s,work=[];for(const [k,a]of this.pending){if(s.g.simulated(a)){work.push(a);this.pending.delete(k);if(work.length===64)break;}}if(!work.length)return;
 // A batch sees earlier changes in this same transaction, but is published only after saving.
 const planned=new Map(),get=a=>planned.get(key(a))?.id??s.g.get(a.x,a.y,a.z),flows=s.world.waterFlows;let changes=false,flowCount=Object.keys(flows).length;
 const update=(a,id,flow,tx)=>{if(!inside(a.x,a.y,a.z))return;const k=key(a),old=get(a),previous=flows[k];if(id===8){if(!flow)return;if(previous?.level===flow.level&&previous?.falling===flow.falling&&old===8)return;if(!previous&&flowCount>=32768)return;if(!previous)flowCount++;flows[k]=flow;}else{if(previous)flowCount--;delete flows[k];}planned.set(k,{a,id});tx.block({...a,flow:true},id);changes=true;if(id===8&&old!==8&&old!==0){if(isTorch(old))tx.drop(25,1,a);else if(isPlant(old))tx.drop(old,1,a);else if(old===22){const crop=s.world.crops[k],ripe=crop&&s.world.time-crop.planted>=2400;if(ripe){tx.drop(111,1,a);tx.xp(1,{x:a.x+.5,y:a.y+.5,z:a.z+.5});}tx.drop(113,ripe?2:1,a);delete s.world.crops[k];}}};
 try{s.atomic(null,tx=>{for(const a of work){const k=key(a),id=get(a);if(id!==8&&!replaceable(id)){delete flows[k];continue;}const old=flows[k];if(id===8&&!old){/* Source water persists until collected or blocked. */}else{
 let best=null;const above={...a,y:a.y+1};if(get(above)===8)best={level:1,falling:true};else for(const n of adjacent(a).slice(1,5)){if(get(n)!==8)continue;const f=flows[key(n)],below={...n,y:n.y-1},b=get(below);if(replaceable(b)||b===8&&flows[key(below)]?.falling)continue;const level=(f?.level||0)+1;if(level<=7&&(!best||level<best.level))best={level,falling:false};}
 if(!best){if(id===8||old)update(a,0,null,tx);continue;}if(id!==8||old?.level!==best.level||old?.falling!==best.falling)update(a,8,best,tx);
 }
 if(get(a)!==8)continue;const below={...a,y:a.y-1},b=get(below);if(replaceable(b)){update(below,8,{level:1,falling:true},tx);continue;}if(b===8&&flows[key(below)]?.falling)continue;
 const level=(flows[k]?.level||0)+1;if(level<=7)for(const n of adjacent(a).slice(1,5))if(replaceable(get(n)))update(n,8,{level,falling:false},tx);
 }});}catch(error){for(const a of work)this.queue(a);throw error;}
 // Level-only updates still need another visit so disconnected streams recede.
 if(changes)for(const {a}of planned.values()){this.queue(a);for(const n of adjacent(a))this.queue(n);}
 }
}
