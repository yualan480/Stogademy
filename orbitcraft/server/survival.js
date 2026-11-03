import {spawnHabitats} from './ecology.js';
import {useBed,finishSleep} from './bed-use.js';
import {useBoat} from './boats.js';
import {underCap,category,aquatic} from './mob-caps.js';
import {isTorch,isPlant,torchAxis} from '../shapes.js';
import {tickEating} from './eating.js';
import {bedPair,removeBed} from './beds.js';
import {containerShortcut} from './container-shortcuts.js';
import {playerControl} from './player-controls.js';
import {containerMessage,returnContainer,startFurnace,chestStacks} from './containers.js';
import {stacks,swapSlots} from '../inventory.js';
import { ITEMS,RECIPES,SMELTING,FUEL,defaultHotbar,isBlock,PUNCH_DAMAGE } from '../items.js';
import { inside,solid,collides,step,raycast,terrain,hash,resourceBlock,MINING_MS } from '../world.js';
const xyz=a=>`${a.x},${a.y},${a.z}`;
const fromKey=key=>{const [x,y,z]=key.split(',').map(Number);return {x,y,z};};
const clone=a=>JSON.parse(JSON.stringify(a));
export class Survival{
 constructor(game){this.g=game;this.world=game.store.loadSurvival?.()||{time:6000,mobs:[],crops:{},furnaces:{}};this.world.mobs??=[];this.world.crops??={};this.world.furnaces??={};this.world.chests??={};this.world.boats??={};this.world.beds??={};this.world.spawn??=this.g.spawn();this.acc=0;this.spawnAt=0;this.g.store.saveSurvival(this.world);}
 init(p){p.survival={health:20,hunger:20,saturation:5,exhaustion:0,durability:{},equipment:{},regen:0,starve:0,...p.survival};p.hotbar=Array.isArray(p.hotbar)&&p.hotbar.length===9?p.hotbar:[...defaultHotbar];p.selected=0;p.survival.sleeping=false;p.survival.bedPose=null;p.survival.boat=null;p.fallTop=p.y;returnContainer(p);}
 state(p){return {...p.survival,hotbar:p.hotbar,slots:stacks(p),selected:p.selected,time:this.world.time,chestSlots:p.station&&this.g.get(p.station.x,p.station.y,p.station.z)===23?chestStacks(this,xyz(p.station)):null,chest:p.station&&this.g.get(p.station.x,p.station.y,p.station.z)===23?this.world.chests[xyz(p.station)]||{}:null,furnace:p.station&&Math.hypot(p.station.x-p.x,p.station.z-p.z)<6?this.world.furnaces[xyz(p.station)]||{output:{}}:null,fishing:p.fishing?{bite:p.fishing.bite,end:p.fishing.end}:null};}
 send(p){p.send({type:'survival',state:this.state(p)});}
 eat(p){tickEating(this,p);}
 selected(p){return p.hotbar[p.selected]||0;}
 tool(p){const id=this.selected(p);return p.inventory[id]>0?ITEMS[id]:null;}
 nearby(p,id,range=4){for(let x=Math.floor(p.x)-range;x<=p.x+range;x++)for(let y=Math.floor(p.y)-2;y<=p.y+2;y++)for(let z=Math.floor(p.z)-range;z<=p.z+range;z++)if(this.g.get(x,y,z)===id&&Math.hypot(x+.5-p.x,y+.5-p.y,z+.5-p.z)<=range)return {x,y,z};return null;}
 night(){const t=this.world.time%24000;return t>=13500&&t<23700;}
 dark(x,y,z){if(this.night())return true;for(let h=Math.floor(y)+2;h<56;h++)if(solid(this.g.get(Math.floor(x),h,Math.floor(z))))return true;return false;}
 atomic(p,fn,{also=[]}={}){
  const participants=[...new Set([p,...also].filter(Boolean))],fields=['inventory','survival','hotbar','mined','placed','lastHurt','hurtAt','lastAttack','input','mining','fishing','eating','x','y','z','vy','fallTop','sleepAt'];
  const before=new Map(participants.map(player=>[player,clone(Object.fromEntries(fields.map(k=>[k,player[k]])))])),worldBefore=clone(this.world),blocks=[],drops=[];
  try{
   fn({block:(a,id)=>blocks.push({...a,block:id}),drop:(id,count,a)=>{if(count>0)drops.push({id:crypto.randomUUID(),block:id,count,x:a.x+.5,y:a.y+.5,z:a.z+.5,durability:ITEMS[id]?.durability?(p?.survival.durability[id]??ITEMS[id].durability):undefined,created:this.g.now(),pickupAt:this.g.now()+750,vy:1,grounded:false});}});
   const size=bag=>Object.values(bag).reduce((sum,n)=>sum+Math.ceil(n/64),0);
   for(const player of participants)stacks(player,{strict:size(player.inventory)>size(before.get(player).inventory)});
   this.g.store.commit(p,{blocks,drops,survival:this.world,players:participants.filter(other=>other!==p)});
  }catch(e){this.world=worldBefore;for(const player of participants){const saved=before.get(player);for(const field of fields){if(field in saved)player[field]=saved[field];else delete player[field];}}throw e;}
  for(const a of blocks){this.g.applyBlock(a,a.block);this.g.broadcastNear({type:'block',...a},a);}
  for(const d of drops){this.g.drops.set(d.id,d);this.g.broadcastNear({type:'drop',drop:this.g.publicDrop(d)},d);}
  for(const player of participants){this.g.inventory(player);this.send(player);}
 }

 wear(p,id,amount=1){const item=ITEMS[id];if(!item?.durability||!(p.inventory[id]||Object.values(p.survival.equipment).includes(id)||p.survival.offhand?.id===id))return;p.survival.durability[id]=(p.survival.durability[id]??item.durability)-amount;if(p.survival.durability[id]<=0){if(p.inventory[id]>0)p.inventory[id]--;if(p.survival.offhand?.id===id)p.survival.offhand=null;delete p.survival.durability[id];for(const slot in p.survival.equipment)if(p.survival.equipment[slot]===id)delete p.survival.equipment[slot];}}
 duration(p,id){const tool=this.tool(p),kind=[3,11,13,14,15,16,17,19].includes(id)?'pickaxe':[5,10,18].includes(id)?'axe':[1,2,4,7,12,21].includes(id)?'shovel':null;return (MINING_MS[id]||1000)/(tool?.tool===kind?tool.speed:1);}
 harvest(p,hit){const tool=this.tool(p),id=hit.block,required=({3:0,11:0,13:0,14:1,16:2,15:2,17:3,19:0})[id];if(required!==undefined&&(tool?.tool!=='pickaxe'||tool.tier<required))return [];
 if(id===22){const crop=this.world.crops[xyz(hit)],ripe=crop&&this.world.time-crop.planted>=2400;return ripe?[[111,1],[113,2]]:[[113,1]];}
 if(id===6)return hash(hit.x,Math.floor(this.world.time),hit.z)>.8?[[117,1]]:[];if(id===31)return hash(hit.x,Math.floor(this.world.time),hit.z)>.7?[[31,1],[113,1]]:[[31,1]];if(isTorch(id))return [[25,1]];
 return [[({3:11,13:101,14:102,15:106,16:104,21:2})[id]||id,1]];}
 mine(p,hit){if([20,26].includes(hit.block)){this.atomic(p,tx=>{removeBed(this,hit,tx);this.wear(p,this.selected(p));p.survival.exhaustion+=.15;p.mined++;});return;}const result=this.harvest(p,hit);this.atomic(p,tx=>{tx.block({...hit,broken:hit.block},0);if(isTorch(this.g.get(hit.x,hit.y+1,hit.z))){tx.block({...hit,y:hit.y+1},0);tx.drop(25,1,{...hit,y:hit.y+1});}for(const [id,count]of result)tx.drop(id,count,hit);for(const [dx,dy,dz]of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]){const a={x:hit.x+dx,y:hit.y+dy,z:hit.z+dz},id=this.g.get(a.x,a.y,a.z),[sx,sz]=torchAxis(id);if(isTorch(id)&&a.x+sx===hit.x&&a.z+sz===hit.z){tx.block(a,0);tx.drop(25,1,a);}}const furnace=this.world.furnaces[xyz(hit)];if(furnace){for(const [id,count]of Object.entries(furnace.output||{}))tx.drop(+id,count,hit);if(furnace.job)tx.drop(furnace.job.out,1,hit);for(const stack of [furnace.input,furnace.fuelStack])if(stack)tx.drop(stack.id,stack.count,hit);delete this.world.furnaces[xyz(hit)];}const chest=this.world.chests[xyz(hit)];if(chest){for(const [id,n]of Object.entries(chest))tx.drop(+id,n,hit);delete this.world.chests[xyz(hit)];}delete this.world.crops[xyz(hit)];this.wear(p,this.selected(p));p.survival.exhaustion+=.15;p.mined++;});}
 craft(p,m){const recipe=RECIPES.find(r=>r.id===(m.recipe||'planks'));if(!recipe)throw Error('Unknown recipe.');if(recipe.station==='table'&&!this.nearby(p,18))throw Error('Stand near a placed crafting table.');if(ITEMS[recipe.out]?.durability&&p.inventory[recipe.out]>0)throw Error('You already have this tool or armor.');for(const [id,n] of Object.entries(recipe.ingredients))if((p.inventory[id]||0)<n)throw Error('You need more ingredients.');if((p.inventory[recipe.out]||0)+recipe.count>9999)throw Error('Inventory stack is full.');this.atomic(p,()=>{for(const [id,n]of Object.entries(recipe.ingredients))p.inventory[id]-=n;p.inventory[recipe.out]=(p.inventory[recipe.out]||0)+recipe.count;if(ITEMS[recipe.out]?.durability)p.survival.durability[recipe.out]=ITEMS[recipe.out].durability;const empty=p.hotbar.findIndex(id=>!id||!p.inventory[id]);if(empty>=0&&!p.hotbar.includes(recipe.out))p.hotbar[empty]=recipe.out;});}
 handle(p,m){if(m.type==='wake'){p.survival.sleeping=false;p.survival.bedPose=null;this.send(p);return true;}if(m.type==='select'){if(Number.isInteger(m.slot)&&m.slot>=0&&m.slot<9){if(m.slot!==p.selected)p.eating=null;p.selected=m.slot;p.mining=null;}return true;}
 if(m.type==='respawn'){if(p.survival.health>0)return true;const bed=p.survival.respawn;let point=bed&&this.g.get(bed.bx,bed.by,bed.bz)===20&&(!bed.bedToken||(this.world.beds?.[`${bed.bx},${bed.by},${bed.bz}`]?.token||this.world.bedTokens?.[`${bed.bx},${bed.by},${bed.bz}`])===bed.bedToken)?{x:bed.x,y:bed.y,z:bed.z}:null;if(!point||collides(point,this.g.get)){point=this.world.spawn;if(collides(point,this.g.get))point=this.g.spawn();}Object.assign(p,point,{vy:0});p.survival.health=20;p.survival.hunger=20;p.survival.saturation=5;p.input={};p.fallTop=p.y;this.g.store.savePlayer(p);this.send(p);return true;}
 if(p.survival.health<=0)return m.type!=='chat'&&m.type!=='chunks';
 if(playerControl(this,p,m))return true;
 if(containerShortcut(this,p,m))return true;
 if(containerMessage(this,p,m))return true;
 if(m.type==='swap'){this.atomic(p,()=>swapSlots(p,m.from,m.to));return true;}
 if(m.type==='chest'){this.chest(p,m);return true;}
 if(m.type==='offhand'){this.atomic(p,()=>{const old=p.survival.offhand;if(old){p.inventory[old.id]=(p.inventory[old.id]||0)+old.count;p.survival.offhand=null;}if(m.item&&p.inventory[m.item]>0){const count=Math.min(64,p.inventory[m.item]);p.inventory[m.item]-=count;p.survival.offhand={id:m.item,count};}});return true;}
 if(m.type==='assign'){if(Number.isInteger(m.slot)&&m.slot>=0&&m.slot<9&&p.inventory[m.item]>0)this.atomic(p,()=>{const from=stacks(p).findIndex(s=>s?.id===m.item);swapSlots(p,from,m.slot);});return true;}
 if(m.type==='equip'){const id=m.item,item=ITEMS[id];if(item?.slot){this.atomic(p,()=>{const slot=item.slot;if(slot==='shield'){if(p.survival.offhand?.id===181){p.inventory[181]=(p.inventory[181]||0)+p.survival.offhand.count;p.survival.offhand=null;}else if(p.inventory[181]>0){const old=p.survival.offhand;if(old)p.inventory[old.id]=(p.inventory[old.id]||0)+old.count;p.inventory[181]--;p.survival.offhand={id:181,count:1};}return;}if(p.survival.equipment[slot]===id){delete p.survival.equipment[slot];p.inventory[id]=(p.inventory[id]||0)+1;}else if(p.inventory[id]>0){const old=p.survival.equipment[slot];if(old)p.inventory[old]=(p.inventory[old]||0)+1;p.inventory[id]--;p.survival.equipment[slot]=id;}});}return true;}
 if(m.type==='craft'){this.craft(p,m);return true;}
 if(m.type==='eat'){p.input.eat=true;p.lastInput=this.g.now();this.eat(p);return true;}
 if(m.type==='use'){this.use(p);return true;}
 if(m.type==='smelt'){this.smelt(p,m);return true;}if(m.type==='collect-furnace'){const a=(this.nearby(p,19)||this.nearby(p,24)),f=a&&this.world.furnaces[xyz(a)];if(f)this.atomic(p,()=>{for(const [id,count]of Object.entries(f.output||{}))p.inventory[id]=(p.inventory[id]||0)+count;f.output={};});return true;}
 return false;}
 use(p){const id=this.selected(p),item=ITEMS[id];let hit=raycast(p,this.g.get);if(hit?.block===26)hit={...bedPair(this,hit).foot,block:20};if(item?.food&&![18,19,20,23,24].includes(hit?.block)){this.handle(p,{type:'eat'});return;}
 if(id===180&&p.inventory[id]>0){if(p.fishing){if(this.g.now()>=p.fishing.bite&&this.g.now()<=p.fishing.end)this.atomic(p,()=>{p.inventory[114]=(p.inventory[114]||0)+1;this.wear(p,180);});p.fishing=null;this.send(p);return;}const water=this.waterRay(p);if(!water)throw Error('Aim at nearby water to cast.');p.fishing={...water,bite:this.g.now()+4000+hash(Math.floor(p.x),Math.floor(this.world.time),Math.floor(p.z))*4000};p.fishing.end=p.fishing.bite+3000;this.send(p);return;}
 if(hit?.block===20){useBed(this,p,hit);return;}
 if(useBoat(this,p,hit))return;
 if([233,234].includes(id)&&p.inventory[id]>0){const at=id===233?this.waterRay(p):hit?.place;if(!at)throw Error('Aim at water to fill a bucket, or a free block to empty it.');if(id===234&&(!inside(at.x,at.y,at.z)||this.g.get(at.x,at.y,at.z)!==0||[...this.g.players.values()].some(q=>Math.floor(q.x)===at.x&&Math.floor(q.y)===at.y&&Math.floor(q.z)===at.z)))throw Error('Cannot pour water here.');this.atomic(p,tx=>{p.inventory[id]--;p.inventory[id===233?234:233]=(p.inventory[id===233?234:233]||0)+1;const n=p.hotbar.indexOf(id);if(n>=0&&p.inventory[id]===0){p.hotbar[n]=id===233?234:233;p.survival.layout??=[...p.hotbar];p.survival.layout[n]=p.hotbar[n];}tx.block(at,id===233?0:8);});return;}
 if([18,19,23,24].includes(hit?.block)){p.station=hit;p.send({type:'station',station:hit.block===18?'table':hit.block===23?'chest':'furnace',at:hit,furnace:this.world.furnaces[xyz(hit)]||null,chest:this.world.chests[xyz(hit)]||{}});return;}
 if(item?.tool==='hoe'&&hit&&[1,2].includes(hit.block)&&this.g.get(hit.x,hit.y+1,hit.z)===0){this.atomic(p,tx=>{tx.block(hit,21);this.wear(p,id);});return;}
 if(id===113&&p.inventory[id]>0&&hit?.block===21&&this.g.get(hit.x,hit.y+1,hit.z)===0){const a={x:hit.x,y:hit.y+1,z:hit.z};if(Object.keys(this.world.crops).length>=512)throw Error('Too many crops in the public world.');this.atomic(p,tx=>{p.inventory[id]--;tx.block(a,22);this.world.crops[xyz(a)]={...a,planted:this.world.time};});return;}
 }
 waterRay(p){const cp=Math.cos(p.pitch),dx=-Math.sin(p.yaw)*cp,dy=Math.sin(p.pitch),dz=-Math.cos(p.yaw)*cp;for(let t=.1;t<6;t+=.1){const a={x:Math.floor(p.x+dx*t),y:Math.floor(p.y+1.62+dy*t),z:Math.floor(p.z+dz*t)},b=this.g.get(a.x,a.y,a.z);if(b===8)return a;if(solid(b))return null;}return null;}
 chest(p,m){const a=this.nearby(p,23);if(!a)throw Error('Stand near a chest.');const k=xyz(a),id=m.item;if(!Number.isInteger(id)||id<=0)return;this.atomic(p,()=>{const chest=this.world.chests[k]||{};if(m.take){const n=Math.min(64,chest[id]||0);chest[id]=(chest[id]||0)-n;p.inventory[id]=(p.inventory[id]||0)+n;}else{const n=Math.min(64,p.inventory[id]||0),capacity=Object.values(chest).reduce((sum,n)=>sum+Math.ceil(n/64),0),before=Math.ceil((chest[id]||0)/64),after=Math.ceil(((chest[id]||0)+n)/64);if(capacity-before+after>27)throw Error('This chest is full.');p.inventory[id]=(p.inventory[id]||0)-n;chest[id]=(chest[id]||0)+n;}this.world.chests[k]=chest;});for(const q of this.g.players.values())if(q.station&&xyz(q.station)===k)q.send({type:'chest-state',chest:this.world.chests[k]});p.send({type:'chest-state',chest:this.world.chests[k]});}
 smelt(p,m){const a=(this.nearby(p,19)||this.nearby(p,24));if(!a)throw Error('Stand near a furnace.');const raw=m.item,fuel=m.fuel,k=xyz(a),f=this.world.furnaces[k]||{output:{},fuel:0};if(!SMELTING[raw]||!p.inventory[raw]||(f.fuel<1&&(!FUEL[fuel]||!p.inventory[fuel]||(raw===fuel&&p.inventory[raw]<2))))throw Error('Choose raw material and fuel you own, or use stored fuel.');if(this.g.get(a.x,a.y,a.z)===24&&[109,114].includes(raw))throw Error('Blast furnaces smelt ores, not food.');if(f.job)throw Error('The furnace is already working.');this.atomic(p,()=>{p.inventory[raw]--;if(f.fuel<1){p.inventory[fuel]--;f.fuel+=FUEL[fuel];}if(f.fuel<1){p.inventory[raw]++;}else{f.fuel--;f.job={out:SMELTING[raw],done:this.world.time+(this.g.get(a.x,a.y,a.z)===24?100:200)};}this.world.furnaces[k]=f;});}
 // One authoritative melee ray selects the first living player or mob.
 meleeTarget(p){
  const reach=3,origin={x:p.x,y:p.y+1.62,z:p.z},cp=Math.cos(p.pitch),direction={x:-Math.sin(p.yaw)*cp,y:Math.sin(p.pitch),z:-Math.cos(p.yaw)*cp};
  let wall=reach;
  for(let t=0;t<=reach;t+=.02)if(solid(this.g.get(Math.floor(origin.x+direction.x*t),Math.floor(origin.y+direction.y*t),Math.floor(origin.z+direction.z*t)))){wall=t;break;}
  const entry=(body,radius,height)=>{let near=0,far=wall;for(const axis of ['x','y','z']){const low=body[axis]-(axis==='y'?0:radius),high=body[axis]+(axis==='y'?height:radius),v=direction[axis];if(Math.abs(v)<1e-9){if(origin[axis]<low||origin[axis]>high)return null;}else{let t1=(low-origin[axis])/v,t2=(high-origin[axis])/v;if(t1>t2)[t1,t2]=[t2,t1];near=Math.max(near,t1);far=Math.min(far,t2);if(near>far)return null;}}return near>=0&&near<wall?near:null;};
  let nearest=null;
  for(const q of this.g.players.values()){if(q===p||q.survival.health<=0)continue;const distance=entry(q,.3,1.8);if(distance!==null&&(!nearest||distance<nearest.distance))nearest={player:q,distance};}
  for(const mob of this.world.mobs){if(mob.health<=0)continue;const distance=entry(mob,mob.kind==='spider'?.7:.45,mob.kind==='spider'?.8:mob.kind==='enderman'?2.9:1.8);if(distance!==null&&(!nearest||distance<nearest.distance))nearest={mob,distance};}
  return nearest;
 }
 attack(p){
  if(p.survival.health<=0||p.survival.sleeping)return false;
  const target=this.meleeTarget(p);if(!target)return false;
  const now=this.g.now();if(now-(p.lastAttack??-Infinity)<650)return true;
  const id=this.selected(p),damage=this.tool(p)?.damage??PUNCH_DAMAGE;
  if(target.player){
   const victim=target.player;if(now-(victim.lastHurt??-Infinity)<700)return true;
   let dealt=0;
   this.atomic(victim,tx=>{const before=victim.survival.health;p.lastAttack=now;p.survival.exhaustion+=.1;this.wear(p,id);this.applyDamage(victim,damage,p,tx);dealt=before-victim.survival.health;},{also:[p]});
   this.g.broadcast({type:'combat',attacker:p.id,target:victim.id,damage:dealt,killed:victim.survival.health<=0});
  }else{
   this.atomic(p,tx=>{const mob=target.mob;p.lastAttack=now;mob.health-=damage;p.survival.exhaustion+=.1;this.wear(p,id);mob.hurt=this.world.time;const dx=mob.x-p.x,dz=mob.z-p.z,n=Math.hypot(dx,dz)||1,q={...mob,x:mob.x+dx/n*.5,z:mob.z+dz/n*.5};if(!collides(q,this.g.get)){mob.x=q.x;mob.z=q.z;}mob.vy=3;if(mob.health<=0)for(const [item,n]of this.mobLoot(mob))tx.drop(item,n,{x:Math.floor(mob.x),y:mob.y,z:Math.floor(mob.z)});});
   this.g.broadcast({type:'combat',attacker:p.id,target:target.mob.id,damage,killed:target.mob.health<=0});
  }
  return true;
 }
 // Retain the existing helper for callers; it now resolves PvP and mobs alike.
 hitMob(p){return this.attack(p);}

 mobLoot(m){if(['fish','cod','salmon','dolphin'].includes(m.kind))return [[114,1]];if(['bat','squid','axolotl'].includes(m.kind))return [];return m.kind==='sheep'?[[109,1],[116,3]]:!m.hostile?[[109,2]]:m.kind==='skeleton'?[[119,2]]:m.kind==='spider'?[[231,2]]:m.kind==='creeper'?[[230,2]]:[[118,2]];}
 applyDamage(p,damage,source,tx){
  p.lastHurt=this.g.now();p.hurtAt=this.g.now();if(source){const dx=p.x-source.x,dz=p.z-source.z,n=Math.hypot(dx,dz)||1;const q={...p,x:p.x+dx/n*.35,z:p.z+dz/n*.35};if(!collides(q,this.g.get)){p.x=q.x;p.z=q.z;}p.vy=3;}const gear=p.survival.equipment;let defense=0;
  for(const [slot,id]of Object.entries(gear))if(slot!=='shield'){defense+=ITEMS[id]?.defense||0;this.wear(p,id);}
  if(p.input.block&&this.g.now()-(p.lastInput??-Infinity)<=350&&(p.survival.offhand?.id===181||this.selected(p)===181&&p.inventory[181]>0)&&source){const yaw=Math.atan2(-(source.x-p.x),-(source.z-p.z));if(Math.cos(yaw-p.yaw)>.15){damage*=.15;this.wear(p,181,2);}}
  p.survival.sleeping=false;p.survival.bedPose=null;p.fishing=null;p.survival.health=Math.max(0,p.survival.health-damage*(1-Math.min(20,defense)*.04));
  if(p.survival.health<=0)this.dropPlayer(p,tx);
 }
 hurt(p,damage,source){if(p.survival.health<=0||this.g.now()-(p.lastHurt??-Infinity)<700)return;this.atomic(p,tx=>this.applyDamage(p,damage,source,tx));}
 dropPlayer(p,tx){returnContainer(p);for(const [id,count]of Object.entries(p.inventory))if(count>0)tx.drop(+id,count,{x:Math.floor(p.x),y:p.y,z:Math.floor(p.z)});for(const id of Object.values(p.survival.equipment))tx.drop(id,1,{x:Math.floor(p.x),y:p.y,z:Math.floor(p.z)});if(p.survival.offhand)tx.drop(p.survival.offhand.id,p.survival.offhand.count,{x:Math.floor(p.x),y:p.y,z:Math.floor(p.z)});if(p.survival.boat&&this.world.boats[p.survival.boat])this.world.boats[p.survival.boat].rider=null;p.survival.boat=null;p.survival.offhand=null;p.inventory={};p.survival.equipment={};p.survival.durability={};p.survival.sleeping=false;p.survival.health=0;p.input={};p.mining=null;p.eating=null;}
 die(p){this.atomic(p,tx=>this.dropPlayer(p,tx));}

 spawn(kind,x,y,z){if(this.world.mobs.length>=2048||!underCap(this.world.mobs,kind,x,z)||!inside(Math.floor(x),Math.floor(y),Math.floor(z)))return null;const m={id:crypto.randomUUID(),kind,x,y,z,yaw:0,vy:0,health:kind==='spider'?16:kind==='chicken'?4:kind==='pig'||kind==='sheep'?10:20,hostile:['zombie','skeleton','creeper','spider','enderman'].includes(kind),next:0};if(collides(m,this.g.get))return null;this.world.mobs.push(m);return m;}
 lit(x,y,z){for(const [key,id]of this.g.edits){if(!isTorch(id))continue;const a=key.split(',').map(Number);if(Math.hypot(a[0]-x,a[1]-y,a[2]-z)<7)return true;}return false;}
 spawnAround(){const players=[...this.g.players.values()].filter(p=>p.survival.health>0);if(!players.length)return;const p=players[Math.floor(this.world.time/100)%players.length];for(let i=0;i<6;i++){const angle=hash(i,Math.floor(this.world.time),37)*Math.PI*2,r=12+hash(i,Math.floor(this.world.time),85)*16,x=Math.floor(p.x+Math.cos(angle)*r),z=Math.floor(p.z+Math.sin(angle)*r);if(!inside(x,1,z)||!this.g.simulated({x,z}))continue;let y=terrain(x,z).height+1;if(i%3===0)for(let h=5;h<y-4;h++)if(solid(this.g.get(x,h-1,z))&&!this.g.get(x,h,z)&&!this.g.get(x,h+1,z)){y=h;break;}while(y<54&&solid(this.g.get(x,y,z)))y++;if(!solid(this.g.get(x,y-1,z))||this.g.get(x,y,z)===8)continue;const hostile=this.night();if(hostile&&this.lit(x,y,z))continue;if(players.some(q=>Math.hypot(q.x-x,q.z-z)<10))continue;const kinds=hostile?['zombie','skeleton','creeper','spider','enderman']:['cow','pig','sheep','chicken'];this.spawn(kinds[Math.floor(hash(x,Math.floor(this.world.time),z)*kinds.length)],x+.5,y+.01,z+.5);}spawnHabitats(this,p);}
 sight(a,b){const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,d=Math.hypot(dx,dy,dz);for(let t=.5;t<d;t+=.3)if(solid(this.g.get(Math.floor(a.x+dx*t/d),Math.floor(a.y+.9+dy*t/d),Math.floor(a.z+dz*t/d))))return false;return true;}
 explode(m){this.atomic(null,tx=>{const players=[...this.g.players.values()],beds=new Set();for(let x=Math.floor(m.x)-2;x<=m.x+2;x++)for(let y=Math.floor(m.y)-1;y<=m.y+2;y++)for(let z=Math.floor(m.z)-2;z<=m.z+2;z++){const id=this.g.get(x,y,z);if(id&&id!==9&&id!==8&&id!==17&&Math.hypot(x+.5-m.x,y+.5-m.y,z+.5-m.z)<2.2&&!this.world.furnaces[`${x},${y},${z}`]){if(id===20||id===26){if(beds.has(`${x},${y},${z}`))continue;const bed=bedPair(this,{x,y,z,block:id});for(const a of [bed.foot,bed.head])if(a)beds.add(`${a.x},${a.y},${a.z}`);removeBed(this,{x,y,z,block:id},tx);continue;}tx.block({x,y,z},0);if(this.world.chests[`${x},${y},${z}`]){for(const [item,n]of Object.entries(this.world.chests[`${x},${y},${z}`]))tx.drop(+item,n,{x,y,z});delete this.world.chests[`${x},${y},${z}`];}if(id!==22)tx.drop(isTorch(id)?25:id,1,{x,y,z});delete this.world.crops[`${x},${y},${z}`];}}m.health=0;});for(const p of this.g.players.values()){const d=Math.hypot(m.x-p.x,m.y-p.y,m.z-p.z);if(d<4)this.hurt(p,(1-d/4)*14,m);}}
 shiftClocks(ticks,unloadedOnly=false){for(const crop of Object.values(this.world.crops))if(!unloadedOnly||!this.g.simulated(crop))crop.planted+=ticks;for(const [key,f]of Object.entries(this.world.furnaces)){const [x,y,z]=key.split(',').map(Number);if(f.job&&(!unloadedOnly||!this.g.simulated({x,z})))f.job.done+=ticks;}}
 tick(dt){if(!this.g.players.size)return;this.shiftClocks(dt*20,true);this.world.time+=dt*20;this.acc+=dt;
 finishSleep(this);
 for(const p of this.g.players.values()){tickEating(this,p);const s=p.survival;if(s.health<=0){p.input={};continue;}if(this.g.now()-(p.lastInput||0)>350)p.input.block=false;if(s.hunger<=6)p.input.sprint=false;
 const moving=p.input.forward||p.input.back||p.input.left||p.input.right;s.exhaustion+=dt*(moving?(p.input.sprint?.22:.08):.012);if(s.exhaustion>=4){s.exhaustion-=4;if(s.saturation>0)s.saturation=Math.max(0,s.saturation-1);else s.hunger=Math.max(0,s.hunger-1);}
 s.regen=(s.regen||0)+dt;if(s.regen>=4){s.regen=0;if(s.hunger>=16&&s.health<20){s.health=Math.min(20,s.health+1);s.exhaustion+=1;}if(s.hunger===0)this.hurt(p,1);}
 if(s.boat||s.sleeping){p.fallTop=p.y;continue;}if(s.mode==='creative'&&s.flying){p.fallTop=p.y;continue;}
 if(p.vy<0)p.fallTop=Math.max(p.fallTop||p.y,p.y);else if(!p.vy){const fall=(p.fallTop||p.y)-p.y;if(fall>3&&this.g.get(Math.floor(p.x),Math.floor(p.y),Math.floor(p.z))!==8)this.hurt(p,Math.floor(fall-3));p.fallTop=p.y;}else p.fallTop=p.y;
 if(p.fishing&&(this.g.now()>p.fishing.end||Math.hypot(p.x-p.fishing.x,p.z-p.fishing.z)>7)){p.fishing=null;this.send(p);}}
 if(this.acc<.25)return;const elapsed=this.acc;this.acc=0;this.world.mobs=this.world.mobs.filter(m=>m.health>0);if(this.world.time-this.spawnAt>160){this.spawnAt=this.world.time;this.spawnAround();}
 for(const m of this.world.mobs){if(!this.g.simulated(m))continue;if(!this.night()&&m.hostile){m.burning=true;m.health-=elapsed*2;m.hurt=this.world.time;if(m.health<=0){this.g.broadcastNear({type:'combat',attacker:null,target:m.id,damage:elapsed*2,killed:true},m);this.atomic(null,tx=>{for(const [id,n]of this.mobLoot(m))tx.drop(id,n,{x:Math.floor(m.x),y:m.y,z:Math.floor(m.z)});});continue;}}else m.burning=false;if(aquatic(m.kind)||m.kind==='bat'){m.yaw+=elapsed*.3;const q={...m,x:m.x+Math.sin(m.yaw)*elapsed*.4,z:m.z+Math.cos(m.yaw)*elapsed*.4};if(!collides(q,this.g.get)&&(m.kind==='bat'||this.g.get(Math.floor(q.x),Math.floor(q.y),Math.floor(q.z))===8)){m.x=q.x;m.z=q.z;}continue;}const nearby=[...this.g.players.values()].filter(p=>p.survival.health>0&&!p.survival.sleeping).sort((a,b)=>Math.hypot(m.x-a.x,m.z-a.z)-Math.hypot(m.x-b.x,m.z-b.z)),p=nearby[0],distance=p?Math.hypot(m.x-p.x,m.z-p.z):100;const staring=p&&Math.cos(p.yaw-Math.atan2(-(m.x-p.x),-(m.z-p.z)))>.99&&distance<18;if(m.kind==='enderman'&&(staring||m.hurt))m.angry=true;const chasing=m.hostile&&distance<24&&(m.kind!=='enderman'||m.angry);if(m.kind==='enderman'&&m.angry&&this.world.time>(m.teleport||0)){m.teleport=this.world.time+160;for(const dx of [3,-3]){const q={...m,x:p.x+dx,z:p.z+2,y:p.y};if(!collides(q,this.g.get)){m.x=q.x;m.y=q.y;m.z=q.z;break;}}}
 if(chasing)m.yaw=Math.atan2(-(p.x-m.x),-(p.z-m.z));else if(this.world.time>m.next){m.yaw=hash(Math.floor(m.x),Math.floor(this.world.time),Math.floor(m.z))*Math.PI*2;m.next=this.world.time+60;}
 const old={x:m.x,z:m.z};step(m,{forward:chasing||this.world.time%m.next<30,jump:false},Math.min(.1,elapsed),this.g.get);if(Math.hypot(old.x-m.x,old.z-m.z)<.02&&chasing){step(m,{forward:true,jump:true},.1,this.g.get);if(m.kind==='spider'){const next={...m,y:m.y+.15};if(!collides(next,this.g.get))m.y=next.y;}}
 if(chasing&&p&&this.sight(m,p)){if(m.kind==='creeper'){if(distance<2.8){m.fuse=(m.fuse||0)+elapsed;if(m.fuse>1.6)this.explode(m);}else m.fuse=0;}else if(m.kind==='skeleton'&&distance<13){if(this.world.time>(m.attack||0)){m.attack=this.world.time+50;this.hurt(p,3,m);this.g.broadcast({type:'projectile',from:{x:m.x,y:m.y+1.3,z:m.z},to:{x:p.x,y:p.y+1,z:p.z}});}}else if(distance<1.6&&Math.abs(m.y-p.y)<2&&this.world.time>(m.attack||0)){m.attack=this.world.time+20;this.hurt(p,m.kind==='spider'?2:m.kind==='enderman'?7:3,m);}}
 }
 for(const [k,crop]of Object.entries(this.world.crops)){if(!this.g.simulated(crop))continue;if(this.g.get(crop.x,crop.y,crop.z)!==22||this.g.get(crop.x,crop.y-1,crop.z)!==21){if(this.g.get(crop.x,crop.y,crop.z)===22)this.atomic(null,tx=>{tx.block(crop,0);tx.drop(113,1,crop);delete this.world.crops[k];});else delete this.world.crops[k];continue;}if(this.world.time-crop.planted<2400){let wet=false;for(let dx=-2;dx<=2&&!wet;dx++)for(let dz=-2;dz<=2;dz++)if(this.g.get(crop.x+dx,crop.y-1,crop.z+dz)===8)wet=true;if(wet)crop.planted-=elapsed*20;}}
 for(const [key,f]of Object.entries(this.world.furnaces))if(this.g.simulated(fromKey(key))&&f.job&&this.world.time>=f.job.done){const id=f.job.out;f.output[id]=(f.output[id]||0)+1;delete f.job;}
 for(const key of Object.keys(this.world.furnaces))startFurnace(this,key);
 for(const p of this.g.players.values())p.send({type:'survival-world',time:this.world.time,boats:Object.values(this.world.boats).filter(b=>this.g.visibleTo(p,b)),mobs:this.world.mobs.filter(m=>this.g.visibleTo(p,m)).map(({id,kind,x,y,z,yaw,health,hostile,fuse,hurt,burning})=>({id,kind,x,y,z,yaw,health,hostile,fuse,hurt,burning})),crops:Object.values(this.world.crops).filter(c=>this.g.visibleTo(p,c)).map(c=>({...c,stage:Math.min(3,Math.floor((this.world.time-c.planted)/600))}))});for(const p of this.g.players.values())this.send(p);
 }
}
