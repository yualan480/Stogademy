import { CHUNK, HEIGHT, SIZE, SLOTS, inside, baseBlock, terrain, chunkIndex, solid, collides, overlaps, step, raycast, MINING_MS, PICKUP_DELAY_MS } from '../world.js';
const key=(x,y,z)=>`${x},${y},${z}`;
export class Game {
  constructor(store,{now=()=>Date.now()}={}) {this.now=now;this.drops=new Map(store.drops().map(d=>[d.id,d]));this.dirtyDrops=new Set();this.dropMoves=new Map();this.frames=0;this.store=store;this.players=new Map();this.edits=new Map(store.changes().map(b=>[key(b.x,b.y,b.z),b.block]));this.chunks=new Map();}
  get=(x,y,z)=>{
    if(!inside(x,y,z))return 0;
    const cx=Math.floor(x/CHUNK),cz=Math.floor(z/CHUNK),c=this.chunks.get(`${cx},${cz}`);
    return c?c[chunkIndex((x%CHUNK+CHUNK)%CHUNK,y,(z%CHUNK+CHUNK)%CHUNK)]:this.edits.get(key(x,y,z))??baseBlock(x,y,z);
  };
  chunk(cx,cz) {
    const k=`${cx},${cz}`;if(this.chunks.has(k))return this.chunks.get(k);
    const c=new Uint8Array(CHUNK*CHUNK*HEIGHT);
    for(let y=0;y<HEIGHT;y++)for(let z=0;z<CHUNK;z++)for(let x=0;x<CHUNK;x++)c[chunkIndex(x,y,z)]=this.edits.get(key(cx*CHUNK+x,y,cz*CHUNK+z))??baseBlock(cx*CHUNK+x,y,cz*CHUNK+z);
    this.chunks.set(k,c);return c;
  }
  spawn() {
    for(let r=0;r<25;r++)for(let x=-r;x<=r;x++)for(let z=-r;z<=r;z++) {
      if([...this.players.values()].some(p=>Math.hypot(p.x-x-.5,p.z-z-.5)<2))continue;
      const h=terrain(x,z).height;if(h<15||!solid(this.get(x,h,z)))continue;
      let open=true;for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)if(Math.abs(terrain(x+dx,z+dz).height-h)>1||solid(this.get(x+dx,h+1,z+dz))||solid(this.get(x+dx,h+2,z+dz)))open=false;
      if(!open)continue;
      const p={x:x+.5,y:h+1.01,z:z+.5};if(!collides(p,this.get))return p;
    }
    throw new Error('No safe spawn');
  }
  join(identity,send) {
    if(this.players.has(identity.id))throw new Error('This account is already playing. Close the other tab first.');
    const saved=this.store.loadPlayer(identity.id),p={...this.spawn(),yaw:0,pitch:0,inventory:{2:24,3:8,5:8},mined:0,placed:0,...saved,...identity,vy:0,input:{},send,lastEdit:0,lastChat:0,seq:0,mining:null,mineError:null};
    if(collides(p,this.get)||[...this.players.values()].some(other=>Math.hypot(p.x-other.x,p.z-other.z)<.75))Object.assign(p,this.spawn());
    this.store.savePlayer(p);this.players.set(p.id,p);return p;
  }
  leave(p) {if(this.players.get(p.id)!==p)return;this.store.savePlayer(p);this.players.delete(p.id);if(!this.players.size)this.flushDrops();}
  public(p){return {id:p.id,name:p.name,x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch};}
  inventory(p){p.send({type:'inventory',inventory:p.inventory,mined:p.mined,placed:p.placed});}
  broadcast(message){for(const p of this.players.values())p.send(message);}
  publicDrop(d){return {id:d.id,block:d.block,count:d.count,x:d.x,y:d.y,z:d.z,created:d.created};}
  publicDrops(){return [...this.drops.values()].map(d=>this.publicDrop(d));}
  flushDrops(){const items=[...this.dirtyDrops].map(id=>this.drops.get(id)).filter(Boolean);this.store.saveDrops(items);this.dirtyDrops.clear();}
  applyBlock(a,type){
    this.edits.set(key(a.x,a.y,a.z),type);
    const c=this.chunks.get(`${Math.floor(a.x/CHUNK)},${Math.floor(a.z/CHUNK)}`);if(c)c[chunkIndex((a.x%CHUNK+CHUNK)%CHUNK,a.y,(a.z%CHUNK+CHUNK)%CHUNK)]=type;
  }
  mine(p,now){
    if(!p.input.mine||now-(p.lastInput??-Infinity)>350){p.mining=null;p.mineError=null;return;}
    const hit=raycast(p,this.get);
    if(!hit){p.mining=null;p.mineError=null;return;}
    const duration=MINING_MS[hit.block],target=key(hit.x,hit.y,hit.z);
    if(!duration||this.drops.size>=2048){
      p.mining=null;if(p.mineError!==target){p.send({type:'error',message:!duration?'Bedrock cannot be broken.':'Collect some dropped items before mining more.'});p.mineError=target;}return;
    }
    p.mineError=null;
    if(!p.mining||p.mining.key!==target||p.mining.block!==hit.block){p.mining={key:target,x:hit.x,y:hit.y,z:hit.z,block:hit.block,elapsed:0,updated:now};return;}
    const m=p.mining;m.elapsed+=Math.min(100,Math.max(0,now-m.updated));m.updated=now;
    if(m.elapsed<duration)return;
    const drop={id:crypto.randomUUID(),block:hit.block,count:1,x:hit.x+.5,y:hit.y+.45,z:hit.z+.5,vy:1.2,grounded:false,created:now,pickupAt:now+PICKUP_DELAY_MS};
    p.mined++;
    try{this.store.breakBlock(p,hit,drop);}catch(error){p.mined--;p.mining=null;p.input.mine=false;p.send({type:'error',message:'Could not save this block. Please try again.'});return;}
    p.mining=null;this.applyBlock(hit,0);this.drops.set(drop.id,drop);
    this.broadcast({type:'block',x:hit.x,y:hit.y,z:hit.z,block:0,broken:hit.block});
    this.broadcast({type:'drop',drop:this.publicDrop(drop)});this.inventory(p);
  }
  moveDrops(dt,now){
    let pickups=0;const inventories=new Set();
    for(const d of this.drops.values()){
      const oldY=d.y,oldV=d.vy;
      if(!d.grounded||!solid(this.get(Math.floor(d.x),Math.floor(d.y-.2),Math.floor(d.z)))){
        d.vy=Math.max(-8,(d.vy||0)-10*dt);const next=d.y+d.vy*dt;
        const edge=Math.floor(next+(d.vy>0?.15:-.15));
        if(solid(this.get(Math.floor(d.x),edge,Math.floor(d.z)))){
          d.y=d.vy>0?Math.min(d.y,edge-.151):edge+1.151;d.grounded=d.vy<=0;d.vy=0;
        }else{d.y=next;d.grounded=false;}
      }
      if(d.y!==oldY||d.vy!==oldV){this.dirtyDrops.add(d.id);this.dropMoves.set(d.id,this.publicDrop(d));}
      if(now<d.pickupAt||pickups>=32)continue;
      for(const p of this.players.values()){
        if(Math.hypot(p.x-d.x,p.z-d.z)>1.35||d.y<p.y-1||d.y>p.y+2||(p.inventory[d.block]||0)+d.count>9999)continue;
        p.inventory[d.block]=(p.inventory[d.block]||0)+d.count;
        try{this.store.collectDrop(p,d.id);}catch(error){p.inventory[d.block]-=d.count;continue;}
        this.drops.delete(d.id);this.dirtyDrops.delete(d.id);this.dropMoves.delete(d.id);
        pickups++;this.broadcast({type:'pickup',id:d.id,player:p.id,block:d.block,count:d.count});inventories.add(p);break;
      }
    }
    for(const p of inventories)this.inventory(p);
    if(++this.frames%2===0&&this.dropMoves.size){this.broadcast({type:'drops',drops:[...this.dropMoves.values()]});this.dropMoves.clear();}
  }
  tick(dt=.05){
    dt=Math.min(.1,Math.max(0,dt));const now=this.now();
    for(const p of this.players.values()){step(p,p.input,dt,this.get);if(!Number.isFinite(p.y)||p.y<1)Object.assign(p,this.spawn());this.mine(p,now);}
    this.moveDrops(dt,now);
    this.broadcast({type:'state',players:[...this.players.values()].map(p=>({...this.public(p),vy:p.vy,seq:p.seq,mining:p.mining?{x:p.mining.x,y:p.mining.y,z:p.mining.z,block:p.mining.block,progress:Math.min(.999,p.mining.elapsed/MINING_MS[p.mining.block])}:null}))});
  }
  handle(p,m) {
    if(!m||typeof m!=='object')throw new Error('Invalid message');
    if(m.type==='input') {
      if(!Number.isFinite(m.yaw)||!Number.isFinite(m.pitch))return;
      p.yaw=m.yaw%(Math.PI*2);p.pitch=Math.max(-1.54,Math.min(1.54,m.pitch));p.seq=Number.isSafeInteger(m.seq)?m.seq:0;
      p.input=Object.fromEntries(['forward','back','left','right','jump','sprint','mine'].map(k=>[k,m[k]===true]));p.lastInput=this.now();if(!p.input.mine){p.mining=null;p.mineError=null;}return;
    }
    if(m.type==='chunks') {
      const cx=Math.floor(p.x/CHUNK),cz=Math.floor(p.z/CHUNK);
      if(!Array.isArray(m.chunks))return;
      for(const a of m.chunks.slice(0,25)) {
        if(!Array.isArray(a))continue;const [x,z]=a;
        if(!Number.isInteger(x)||!Number.isInteger(z)||x< -SIZE/CHUNK/2||x>=SIZE/CHUNK/2||z< -SIZE/CHUNK/2||z>=SIZE/CHUNK/2||Math.abs(x-cx)>2||Math.abs(z-cz)>2)continue;
        p.send({type:'chunk',x,z,data:btoa(String.fromCharCode(...this.chunk(x,z)))});
      }return;
    }
    if(m.type==='chat') {
      if(Date.now()-p.lastChat<800)return;const text=String(m.text||'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,240);if(!text)return;
      p.lastChat=Date.now();this.broadcast(this.store.chat(p,text));return;
    }
    if(m.type==='craft') {
      if((p.inventory[5]||0)<1||(p.inventory[10]||0)>9995)throw new Error('Collect an oak log first; leave room for planks.');
      p.inventory[5]--;p.inventory[10]=(p.inventory[10]||0)+4;
      try{this.store.savePlayer(p);}catch(e){p.inventory[5]++;p.inventory[10]-=4;throw e;}
      this.inventory(p);return;
    }
    if(m.type==='break')throw new Error('Hold the mine control to break a block.');
    if(m.type!=='place')return;
    if(this.now()-p.lastEdit<180)return;p.lastEdit=this.now();
    const hit=raycast(p,this.get);if(!hit)throw new Error('Look at a block within six blocks.');
    const id=m.block;
    if(!SLOTS.includes(id)||(p.inventory[id]||0)<1)throw new Error('Collect that block before placing it.');
    const a=hit.place;
    if(!a||!inside(a.x,a.y,a.z)||solid(this.get(a.x,a.y,a.z)))throw new Error('Cannot place here.');
    if([...this.players.values()].some(other=>overlaps(a.x,a.y,a.z,other)))throw new Error('A player is standing there.');
    p.inventory[id]--;p.placed++;
    try{this.store.edit(p,a,id);}catch(e){p.inventory[id]++;p.placed--;throw e;}
    this.applyBlock(a,id);this.broadcast({type:'block',x:a.x,y:a.y,z:a.z,block:id});this.inventory(p);
  }
}
