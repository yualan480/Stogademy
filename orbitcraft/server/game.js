import {isLadder} from '../shapes.js';
import {generateChunk} from '../chunk-generation.js';
import {furnaceFacing,furnaceView} from '../furnaces.js';
import {publicSign} from './signs.js';
import {stepRiding} from './boats.js';
import {isTorch,isPlant,isStair,isSpike} from '../shapes.js';
import {encodeChunk,chunkOf,chunkKey,inRange,renderDistance,SIMULATION_DISTANCE,MAX_CACHED_CHUNKS} from '../chunks.js';
import {placeBed} from './beds.js';
import { stacks } from '../inventory.js';
import { Survival } from './survival.js';
import { isBlock,ITEMS } from '../items.js';
import { CHUNK, HEIGHT,MIN_Y,CHUNK_HEIGHT, SIZE, SLOTS, inside, resourceBlock, terrain, chunkIndex, solid, collides, overlaps, step, raycast, MINING_MS, PICKUP_DELAY_MS } from '../world.js';
const key=(x,y,z)=>`${x},${y},${z}`;
export class Game {
  constructor(store,{now=()=>Date.now(),dimension='overworld'}={}) {this.dimension=dimension;this.now=now;this.drops=new Map(store.drops().map(d=>[d.id,d]));this.dirtyDrops=new Set();this.dropMoves=new Map();this.frames=0;this.store=store;this.players=new Map();this.edits=new Map(store.changes().map(b=>[key(b.x,b.y,b.z),b.block]));this.chunks=new Map();this.chunkEdits=new Map();for(const [k,block]of this.edits){const [x,y,z]=k.split(',').map(Number);this.indexEdit({x,y,z},block);}this.survival=new Survival(this);}
  get=(x,y,z)=>{
    if(!inside(x,y,z))return 0;
    const cx=Math.floor(x/CHUNK),cz=Math.floor(z/CHUNK),c=this.chunks.get(`${cx},${cz}`);
    return c?c[chunkIndex((x%CHUNK+CHUNK)%CHUNK,y,(z%CHUNK+CHUNK)%CHUNK)]:this.edits.get(key(x,y,z))??resourceBlock(x,y,z,this.dimension);
  };
  indexEdit(a,block){const k=chunkKey(Math.floor(a.x/CHUNK),Math.floor(a.z/CHUNK));let edits=this.chunkEdits.get(k);if(!edits)this.chunkEdits.set(k,edits=new Map());edits.set(key(a.x,a.y,a.z),{x:a.x,y:a.y,z:a.z,block});}
  chunk(cx,cz) {
    const k=`${cx},${cz}`;if(this.chunks.has(k)){const data=this.chunks.get(k);this.chunks.delete(k);this.chunks.set(k,data);return data;}
    const c=generateChunk(cx,cz,this.dimension,this.chunkEdits.get(k)?.values());
    this.chunks.set(k,c);this.survival?.water.seedChunk(cx,cz,c);this.survival?.lava?.seedChunk(cx,cz,c);while(this.chunks.size>MAX_CACHED_CHUNKS)this.chunks.delete(this.chunks.keys().next().value);return c;
  }
  spawn() {
    if(this.dimension==='nether'){for(let y=80;y>=30;y--)for(let x=-8;x<=8;x++)for(let z=-8;z<=8;z++){const p={x:x+.5,y:y+.01,z:z+.5};if(solid(this.get(x,y-1,z))&&!collides(p,this.get))return p;}return {x:.5,y:60.01,z:.5};}
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
    const saved=this.store.loadPlayer(identity.id),p={dimension:this.dimension,...this.spawn(),yaw:0,pitch:0,inventory:{2:24,3:8,5:8},mined:0,placed:0,...saved,...identity,vy:0,input:{},send,lastEdit:0,lastChat:0,seq:0,mining:null,mineError:null,pendingChunks:new Map(),sentChunks:new Set(),viewDistance:3,streaming:false};
    if(collides(p,this.get)||[...this.players.values()].some(other=>Math.hypot(p.x-other.x,p.z-other.z)<.75))Object.assign(p,this.spawn());
    p.dimension=this.dimension;this.survival.init(p);this.store.savePlayer(p);this.players.set(p.id,p);return p;
  }
  leave(p) {if(this.players.get(p.id)!==p)return;if(p.survival.boat&&this.survival.world.boats[p.survival.boat])this.survival.world.boats[p.survival.boat].rider=null;p.survival.boat=null;this.store.savePlayer(p);this.players.delete(p.id);if(!this.players.size)this.flushDrops();this.pruneChunks();}
  public(p){return {dimension:this.dimension,id:p.id,name:p.name,x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch,crouching:!!p.crouching,skin:p.survival?.skin||'steve',held:p.hotbar?.[p.selected]&&p.inventory[p.hotbar[p.selected]]>0?p.hotbar[p.selected]:0,offhand:p.survival?.offhand?.id||0,equipment:{...p.survival?.equipment,...(p.survival?.offhand?.id===181?{shield:181}:{})},health:p.survival?.health,mining:!!p.input?.mine,eating:!!p.eating,blocking:!!p.input?.block,bowDrawing:p.bowDrawAt!=null,sleeping:!!p.survival?.sleeping,bedPose:p.survival?.bedPose,boat:p.survival?.boat,hurtAt:p.hurtAt||0};}
  inventory(p){p.send({type:'inventory',inventory:p.inventory,mined:p.mined,placed:p.placed,slots:stacks(p),hotbar:p.hotbar});}
  broadcast(message){for(const p of this.players.values())p.send(message);}
  publicDrop(d){return {id:d.id,block:d.block,count:d.count,x:d.x,y:d.y,z:d.z,created:d.created};}
  publicDrops(p){return [...this.drops.values()].filter(d=>!p||this.visibleTo(p,d)).map(d=>this.publicDrop(d));}
  visibleTo(p,a,extra=0){return inRange(p,a,(p.viewDistance??3)+extra);}
  simulated(a){return [...this.players.values()].some(p=>p.survival?.health>0&&inRange(p,a,SIMULATION_DISTANCE));}
  broadcastNear(message,a){for(const p of this.players.values())if(this.visibleTo(p,a,1))p.send(message);}
  movementBlock(p,x,y,z){return p.streaming&&inside(x,y,z)&&!p.sentChunks.has(chunkKey(Math.floor(x/CHUNK),Math.floor(z/CHUNK)))?9:this.get(x,y,z);}
  pruneChunks(){
    const players=[...this.players.values()],retained=(p,cx,cz)=>{const c=chunkOf(p.x,p.z),r=Math.max(SIMULATION_DISTANCE,p.viewDistance??3)+1;return Math.abs(cx-c.x)<=r&&Math.abs(cz-c.z)<=r;};
    for(const key of this.chunks.keys()){const [x,z]=key.split(',').map(Number);if(!players.some(p=>retained(p,x,z)))this.chunks.delete(key);}
    for(const p of players){for(const key of p.sentChunks){const [x,z]=key.split(',').map(Number);if(!inRange(p,{x:x*CHUNK,z:z*CHUNK},p.viewDistance+1))p.sentChunks.delete(key);}for(const [key,[x,z]]of p.pendingChunks){const c=chunkOf(p.x,p.z);if(Math.abs(x-c.x)>p.viewDistance||Math.abs(z-c.z)>p.viewDistance)p.pendingChunks.delete(key);}}
  }
  flushDrops(){this.store.saveSurvival(this.survival.world);const items=[...this.dirtyDrops].map(id=>this.drops.get(id)).filter(Boolean);this.store.saveDrops(items);this.dirtyDrops.clear();}
  applyBlock(a,type){
    const old=this.get(a.x,a.y,a.z);this.edits.set(key(a.x,a.y,a.z),type);this.indexEdit(a,type);
    const c=this.chunks.get(`${Math.floor(a.x/CHUNK)},${Math.floor(a.z/CHUNK)}`);if(c)c[chunkIndex((a.x%CHUNK+CHUNK)%CHUNK,a.y,(a.z%CHUNK+CHUNK)%CHUNK)]=type;this.survival?.water.changed(a,type,old);this.survival?.lava?.changed(a,type,old);
  }
  mine(p,now){
    if(!p.input.mine||now-(p.lastInput??-Infinity)>350){p.mining=null;p.mineError=null;return;}
    if(this.survival.attack(p)){p.mining=null;return;}
    const hit=raycast(p,this.get);
    if(!hit){p.mining=null;p.mineError=null;return;}
    const duration=hit.block===9?0:this.survival.duration(p,hit.block),target=key(hit.x,hit.y,hit.z);
    if(!duration){
      p.mining=null;if(p.mineError!==target){p.send({type:'error',message:hit.block===53?'Obsidian requires a diamond or netherite pickaxe.':[62,63].includes(hit.block)?'Break the obsidian frame to remove this portal.':'Bedrock cannot be broken.'});p.mineError=target;}return;
    }
    p.mineError=null;
    if(!p.mining||p.mining.key!==target||p.mining.block!==hit.block){p.mining={key:target,x:hit.x,y:hit.y,z:hit.z,block:hit.block,elapsed:0,updated:now,duration};return;}
    const m=p.mining;m.elapsed+=Math.min(100,Math.max(0,now-m.updated));m.updated=now;
    if(m.elapsed<duration)return;
    try{this.survival.mine(p,hit);}catch(error){p.mining=null;p.input.mine=false;p.send({type:'error',message:'Could not save this block. Please try again.'});return;}
    p.mining=null;
  }
  moveDrops(dt,now){
    let pickups=0;const inventories=new Set();
    for(const d of this.drops.values()){
      if(!this.simulated(d))continue;
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
        if(p.survival.health<=0||Math.hypot(p.x-d.x,p.z-d.z)>1.35||d.y<p.y-1||d.y>p.y+2||(p.inventory[d.block]||0)+d.count>9999)continue;
        p.inventory[d.block]=(p.inventory[d.block]||0)+d.count;
        try{stacks(p,{strict:true});}catch{p.inventory[d.block]-=d.count;continue;}
        const oldDurability=p.survival.durability[d.block];if(d.durability!=null)p.survival.durability[d.block]=Math.min(oldDurability??d.durability,d.durability);
        try{this.store.collectDrop(p,d.id);}catch(error){p.inventory[d.block]-=d.count;if(oldDurability===undefined)delete p.survival.durability[d.block];else p.survival.durability[d.block]=oldDurability;continue;}
        this.drops.delete(d.id);this.dirtyDrops.delete(d.id);this.dropMoves.delete(d.id);
        pickups++;this.broadcastNear({type:'pickup',id:d.id,player:p.id,block:d.block,count:d.count},d);inventories.add(p);break;
      }
    }
    for(const p of inventories)this.inventory(p);
    if(++this.frames%2===0&&this.dropMoves.size){for(const p of this.players.values())p.send({type:'drops',drops:[...this.dropMoves.values()].filter(d=>this.visibleTo(p,d))});this.dropMoves.clear();}
  }
  tick(dt=.05){
    dt=Math.min(.1,Math.max(0,dt));const now=this.now();
    for(const p of this.players.values()){if(p.survival.health<=0||p.survival.sleeping)continue;if(!stepRiding(this.survival,p,dt,(x,y,z)=>this.movementBlock(p,x,y,z))){for(let remaining=dt;remaining>0;remaining-=1/120)step(p,p.input,Math.min(remaining,1/120),(x,y,z)=>this.movementBlock(p,x,y,z));}p.inputElapsed=(p.inputElapsed||0)+dt;if(!Number.isFinite(p.y)||p.y<MIN_Y+1)Object.assign(p,this.spawn());this.mine(p,now);}
    this.moveDrops(dt,now);this.survival.tick(dt);
    const state=[...this.players.values()].map(p=>({...this.public(p),vy:p.vy,seq:p.seq,inputElapsed:p.inputElapsed||0,mining:p.mining?{x:p.mining.x,y:p.mining.y,z:p.mining.z,block:p.mining.block,progress:Math.min(.999,p.mining.elapsed/p.mining.duration)}:null}));
    const locators=state.filter(q=>(q.health??20)>0).map(({id,name,x,y,z})=>({id,name,x,y,z}));
    const online=(this.server?.players||this.players).size,roster=[...(this.server?.players||this.players).values()].map(q=>({id:q.id,name:q.name}));
    for(const p of this.players.values()){p.send({type:'state',time:now,online,locators,roster,players:state.filter(q=>q.id===p.id||this.visibleTo(p,q))});if(this.frames%20===0)p.send({type:'drops-view',drops:this.publicDrops(p)});}
    if(this.frames%20===0)this.pruneChunks();
    // One full-height column per tick, nearest first and round-robin between players.
    const active=[...this.players.values()];for(let i=0;i<active.length;i++){
      const index=((this.chunkCursor||0)+i)%active.length,p=active[index],center=chunkOf(p.x,p.z);
      const candidates=[...p.pendingChunks].filter(([, [x,z]])=>Math.abs(x-center.x)<=p.viewDistance&&Math.abs(z-center.z)<=p.viewDistance).sort((a,b)=>(a[1][0]-center.x)**2+(a[1][1]-center.z)**2-((b[1][0]-center.x)**2+(b[1][1]-center.z)**2));
      if(!candidates.length){p.pendingChunks.clear();continue;}const [key,[x,z]]=candidates[0];p.pendingChunks.delete(key);p.sentChunks.add(key);
      p.send({type:'chunk',x,z,furnaces:Object.entries(this.survival.world.furnaces).map(([key,f])=>furnaceView(key,f)).filter(f=>Math.floor(f.x/CHUNK)===x&&Math.floor(f.z/CHUNK)===z),signs:Object.values(this.survival.world.signs||{}).filter(s=>Math.floor(s.x/CHUNK)===x&&Math.floor(s.z/CHUNK)===z).map(publicSign),beds:Object.values(this.survival.world.beds||{}).filter(b=>[b.foot,b.head].some(a=>Math.floor(a.x/CHUNK)===x&&Math.floor(a.z/CHUNK)===z)),data:encodeChunk(this.chunk(x,z))});this.chunkCursor=index+1;break;
    }

  }
  handle(p,m) {
    if(!m||typeof m!=='object')throw new Error('Invalid message');
    if(m.type==='attack'){this.survival.attack(p);return;}
    if(this.survival.handle(p,m))return;
    if(m.type==='input') {
      if(!Number.isFinite(m.yaw)||!Number.isFinite(m.pitch))return;
      p.yaw=m.yaw%(Math.PI*2);p.pitch=Math.max(-1.54,Math.min(1.54,m.pitch));p.seq=Number.isSafeInteger(m.seq)?m.seq:0;
      p.input=Object.fromEntries(['forward','back','left','right','jump','sprint','sneak','mine','block','eat'].map(k=>[k,m[k]===true]));p.lastInput=this.now();p.inputElapsed=0;if(!p.input.eat)p.eating=null;else this.survival.eat(p);if(!p.input.mine){p.mining=null;p.mineError=null;}return;
    }
    if(m.type==='chunks') {
      const cx=Math.floor(p.x/CHUNK),cz=Math.floor(p.z/CHUNK);
      if(!Array.isArray(m.chunks))return;
      p.streaming=true;if(m.distance!==undefined)p.viewDistance=renderDistance(m.distance);this.pruneChunks();
      for(const a of m.chunks.slice(0,81)) {
        if(!Array.isArray(a))continue;const [x,z]=a;
        if(!Number.isInteger(x)||!Number.isInteger(z)||x< -SIZE/CHUNK/2||x>=SIZE/CHUNK/2||z< -SIZE/CHUNK/2||z>=SIZE/CHUNK/2||Math.abs(x-cx)>p.viewDistance||Math.abs(z-cz)>p.viewDistance)continue;
        p.pendingChunks.set(x+','+z,[x,z]);
      }return;
    }
    if(m.type==='chat') {
      if(Date.now()-p.lastChat<800)return;const text=String(m.text||'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,240);if(!text)return;
      p.lastChat=Date.now();this.broadcast(this.store.chat(p,text));return;
    }
    if(m.type==='break')throw new Error('Hold the mine control to break a block.');
    if(m.type!=='place')return;
    if(this.now()-p.lastEdit<180)return;p.lastEdit=this.now();
    const hit=raycast(p,this.get);if(!hit)throw new Error('Look at a block within six blocks.');
    const offhand=m.hand==='offhand',held=p.hotbar?.[p.selected],source=p.survival.offhand;
    let id=offhand?source?.id:m.block;const spend=id;
    if(offhand&&p.inventory[held]>0&&!(ITEMS[held]?.tool||held===180))throw Error('Hold a tool in your right hand to build with the off-hand.');
    if(!isBlock(id)||[8,9,21,22,26,27,28,29,30,52].includes(id)||(offhand?!(source?.count>0):(p.inventory[id]||0)<1))throw Error('Collect that block before placing it.');
    const a=hit.place;
    if(!a||!inside(a.x,a.y,a.z)||solid(this.get(a.x,a.y,a.z))||isTorch(this.get(a.x,a.y,a.z))||this.get(a.x,a.y,a.z)===38||isSpike(this.get(a.x,a.y,a.z)))throw Error('Cannot place here.');
    if(isLadder(id)){if(!solid(hit.block)||a.y!==hit.y)throw Error('Attach ladders to a solid wall.');const dx=a.x-hit.x,dz=a.z-hit.z;id=dz===1?64:dz===-1?65:dx===1?66:67;}
    if(isStair(id))id=34+((Math.round(p.yaw/(Math.PI/2))%4+4)%4);
    if(id===50){if(a.y<hit.y)id=52;else if(a.y<=hit.y)throw Error('Place pointed dripstone on a floor or ceiling.');}
    if(id===38&&!solid(this.get(a.x,a.y-1,a.z)))throw Error('Place the sign on solid ground.');
    if(id===20){placeBed(this.survival,p,a,offhand);return;}
    if(id===25){if(this.get(a.x,a.y,a.z)!==0||!solid(hit.block))throw Error('Attach the torch to a solid surface.');const dx=a.x-hit.x,dz=a.z-hit.z;if(a.y>hit.y)id=25;else if(dx===1)id=27;else if(dx===-1)id=28;else if(dz===1)id=29;else if(dz===-1)id=30;else throw Error('Cannot attach a torch underneath a block.');}if(isPlant(id)&&!solid(this.get(a.x,a.y-1,a.z)))throw Error('Plants need solid ground.');
    if(!isTorch(id)&&!isPlant(id)&&!isLadder(id)&&[...this.players.values()].some(other=>overlaps(a.x,a.y,a.z,other)))throw Error('A player is standing there.');
    this.survival.atomic(p,tx=>{if(offhand){if(!--source.count)p.survival.offhand=null;}else p.inventory[spend]--;p.placed++;if([19,24].includes(id)){const facing=furnaceFacing(p.yaw);this.survival.world.furnaces[key(a.x,a.y,a.z)]={output:{},fuel:0,facing};tx.block({...a,furnace:{facing,lit:false}},id);}else tx.block(a,id);});
  }
}
