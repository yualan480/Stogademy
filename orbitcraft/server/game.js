import { CHUNK, HEIGHT, SIZE, SLOTS, inside, baseBlock, terrain, chunkIndex, solid, collides, overlaps, step, raycast } from '../world.js';
const key=(x,y,z)=>`${x},${y},${z}`;
export class Game {
  constructor(store) {this.store=store;this.players=new Map();this.edits=new Map(store.changes().map(b=>[key(b.x,b.y,b.z),b.block]));this.chunks=new Map();}
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
    const saved=this.store.loadPlayer(identity.id),p={...this.spawn(),yaw:0,pitch:0,inventory:{2:24,3:8,5:8},mined:0,placed:0,...saved,...identity,vy:0,input:{},send,lastEdit:0,lastChat:0,seq:0};
    if(collides(p,this.get)||[...this.players.values()].some(other=>Math.hypot(p.x-other.x,p.z-other.z)<.75))Object.assign(p,this.spawn());
    this.store.savePlayer(p);this.players.set(p.id,p);return p;
  }
  leave(p) {if(this.players.get(p.id)!==p)return;this.store.savePlayer(p);this.players.delete(p.id);}
  public(p){return {id:p.id,name:p.name,x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch};}
  inventory(p){p.send({type:'inventory',inventory:p.inventory,mined:p.mined,placed:p.placed});}
  broadcast(message){for(const p of this.players.values())p.send(message);}
  tick(dt=.05){for(const p of this.players.values()) {step(p,p.input,dt,this.get);if(!Number.isFinite(p.y)||p.y<1)Object.assign(p,this.spawn());}this.broadcast({type:'state',players:[...this.players.values()].map(p=>({...this.public(p),vy:p.vy,seq:p.seq}))});}
  handle(p,m) {
    if(!m||typeof m!=='object')throw new Error('Invalid message');
    if(m.type==='input') {
      if(!Number.isFinite(m.yaw)||!Number.isFinite(m.pitch))return;
      p.yaw=m.yaw%(Math.PI*2);p.pitch=Math.max(-1.54,Math.min(1.54,m.pitch));p.seq=Number.isSafeInteger(m.seq)?m.seq:0;
      p.input=Object.fromEntries(['forward','back','left','right','jump','sprint'].map(k=>[k,m[k]===true]));p.lastInput=Date.now();return;
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
    if(m.type!=='break'&&m.type!=='place')return;
    if(Date.now()-p.lastEdit<180)return;p.lastEdit=Date.now();
    const hit=raycast(p,this.get);if(!hit)throw new Error('Look at a block within six blocks.');
    let a=hit,type=0,id=hit.block,delta=1;
    if(m.type==='break') {
      if(id===9)throw new Error('Bedrock cannot be broken.');
      if((p.inventory[id]||0)>=9999)throw new Error('Inventory full for that block.');
    }else {
      id=m.block;if(!SLOTS.includes(id)||(p.inventory[id]||0)<1)throw new Error('Collect that block before placing it.');
      a=hit.place;if(!a||!inside(a.x,a.y,a.z)||solid(this.get(a.x,a.y,a.z)))throw new Error('Cannot place here.');
      if([...this.players.values()].some(other=>overlaps(a.x,a.y,a.z,other)))throw new Error('A player is standing there.');
      type=id;delta=-1;
    }
    p.inventory[id]=(p.inventory[id]||0)+delta;p[m.type==='break'?'mined':'placed']++;
    try{this.store.edit(p,a,type);}catch(e){p.inventory[id]-=delta;p[m.type==='break'?'mined':'placed']--;throw e;}
    this.edits.set(key(a.x,a.y,a.z),type);
    const c=this.chunks.get(`${Math.floor(a.x/CHUNK)},${Math.floor(a.z/CHUNK)}`);if(c)c[chunkIndex((a.x%CHUNK+CHUNK)%CHUNK,a.y,(a.z%CHUNK+CHUNK)%CHUNK)]=type;
    this.broadcast({type:'block',x:a.x,y:a.y,z:a.z,block:type});this.inventory(p);
  }
}
