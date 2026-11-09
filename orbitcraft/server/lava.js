import{inside,MIN_Y,HEIGHT,CHUNK,chunkIndex}from'../world.js';
const key=a=>`${a.x},${a.y},${a.z}`,neighbors=a=>[[0,-1,0],[0,1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]].map(([x,y,z])=>({x:a.x+x,y:a.y+y,z:a.z+z}));
export class Lava{
 constructor(s){this.s=s;this.pending=new Map();this.elapsed=0;s.world.lavaFlows??={};for(const[k,id]of s.g.edits)if(id===54||id===8){const[x,y,z]=k.split(',').map(Number);this.queue({x,y,z});}}
 queue(a){if(inside(a.x,a.y,a.z)&&this.pending.size<16384)this.pending.set(key(a),a);}
 changed(a,id,old){if(!a.lavaFlow)delete this.s.world.lavaFlows[key(a)];if([8,54].includes(id)||[8,54].includes(old)||neighbors(a).some(n=>this.s.g.get(n.x,n.y,n.z)===54)){this.queue(a);for(const n of neighbors(a))this.queue(n);}}
 seedChunk(cx,cz,data){for(let y=MIN_Y+1;y<Math.min(HEIGHT,128);y++)for(let z=0;z<CHUNK;z++)for(let x=0;x<CHUNK;x++)if(data[chunkIndex(x,y,z)]===54){const a={x:cx*CHUNK+x,y,z:cz*CHUNK+z};if(this.s.world.lavaFlows[key(a)]||neighbors(a).some(n=>this.s.g.get(n.x,n.y,n.z)===0||this.s.g.get(n.x,n.y,n.z)===8))this.queue(a);}}
 tick(dt){this.elapsed+=dt;if(this.elapsed<.5)return;this.elapsed=0;const s=this.s,work=[];for(const[k,a]of this.pending)if(s.g.simulated(a)){this.pending.delete(k);work.push(a);if(work.length>=32)break;}if(!work.length)return;const changed=[];
 try{s.atomic(null,tx=>{const planned=new Map(),get=a=>planned.get(key(a))??s.g.get(a.x,a.y,a.z),flows=s.world.lavaFlows,put=(a,id,flow)=>{if(!inside(a.x,a.y,a.z))return;planned.set(key(a),id);if(flow)flows[key(a)]=flow;else delete flows[key(a)];tx.block({...a,lavaFlow:true},id);changed.push(a);};
 for(const a of work){if(get(a)!==54)continue;const ns=neighbors(a),old=flows[key(a)];if(ns.some(n=>get(n)===8)){put(a,old?11:53);continue;}if(old){let feed=get(ns[1])===54?1:null;if(feed===null)for(const n of ns.slice(2)){if(get(n)===54){const f=flows[key(n)],below={...n,y:n.y-1};if(get(below)===0)continue;const value=(f?.level||0)+1;if(value<=(s.g.dimension==='nether'?7:3))feed=feed===null?value:Math.min(feed,value);}}if(feed===null){put(a,0);continue;}if(feed!==old.level)put(a,54,{level:feed});}
 const below=ns[0];if(get(below)===0){put(below,54,{level:1,falling:true});continue;}const level=(flows[key(a)]?.level||0)+1;if(level<=(s.g.dimension==='nether'?7:3))for(const n of ns.slice(2))if(get(n)===0)put(n,54,{level});}
 });}catch(e){for(const a of work)this.queue(a);throw e;}for(const a of changed){this.queue(a);for(const n of neighbors(a))this.queue(n);}}
}
