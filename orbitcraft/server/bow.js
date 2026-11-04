import {solid} from '../world.js';
import {applyKnockback} from './knockback.js';
export const ARROW_GRAVITY=9;
const ready=(s,p)=>s.selected(p)===235&&(p.inventory[235]||0)>0&&p.survival.health>0&&!p.survival.sleeping&&!p.survival.container;
const ammo=p=>(p.inventory[236]||0)>0||p.survival.offhand?.id===236&&p.survival.offhand.count>0;
export function bowState(s,p){return p.bowDrawAt==null?null:{drawing:true,charge:Math.min(1,Math.max(0,(s.g.now()-p.bowDrawAt)/1000))};}
export function handleBow(s,p,m){if(!['bow-draw','bow-release','bow-cancel'].includes(m.type))return false;
 if(m.type==='bow-cancel'){delete p.bowDrawAt;s.send(p);return true;}
 if(m.type==='bow-draw'){if(!ready(s,p)||!ammo(p)){delete p.bowDrawAt;s.send(p);return true;}p.bowDrawAt??=s.g.now();s.send(p);return true;}
 const start=p.bowDrawAt;delete p.bowDrawAt;if(start==null||!ready(s,p)||!ammo(p)||s.g.now()-start<150){s.send(p);return true;}
 const charge=Math.min(1,(s.g.now()-start)/1000),speed=16+20*charge,cp=Math.cos(p.pitch),id=crypto.randomUUID();
 const arrow={id,owner:p.id,x:p.x,y:p.y+1.52,z:p.z,vx:-Math.sin(p.yaw)*cp*speed,vy:Math.sin(p.pitch)*speed,vz:-Math.cos(p.yaw)*cp*speed,age:0,damage:1+Math.floor(charge*5)};
 if((s.arrows?.size||0)>=256){s.send(p);return true;}
 s.atomic(p,()=>{if(p.inventory[236]>0)p.inventory[236]--;else if(!--p.survival.offhand.count)p.survival.offhand=null;s.wear(p,235);});s.arrows??=new Map();if(s.arrows.size<256){s.arrows.set(id,arrow);s.g.broadcastNear({type:'arrow-spawn',arrow},p);}s.send(p);return true;
}
const inside=(a,b,r,h)=>Math.abs(a.x-b.x)<=r&&Math.abs(a.z-b.z)<=r&&a.y>=b.y&&a.y<=b.y+h;
export function tickBows(s,dt){
 for(const p of s.g.players.values())if(p.bowDrawAt!=null&&(!ready(s,p)||!ammo(p)||s.g.now()-(p.lastInput??0)>750))delete p.bowDrawAt;
 for(const [id,a]of s.arrows||[]){let hit=false;const count=Math.max(1,Math.ceil(Math.hypot(a.vx,a.vy,a.vz)*dt/.15)),step=dt/count;
  for(let i=0;i<count&&!hit;i++){a.x+=a.vx*step;a.y+=a.vy*step-ARROW_GRAVITY*step*step/2;a.z+=a.vz*step;a.vy-=ARROW_GRAVITY*step;
   if(solid(s.g.get(Math.floor(a.x),Math.floor(a.y),Math.floor(a.z)))){hit=true;break;}
   for(const p of s.g.players.values()){if(p.id===a.owner||p.survival.health<=0||!inside(a,p,.32,1.8))continue;const before=p.survival.health;s.hurt(p,a.damage,{x:p.x-a.vx,z:p.z-a.vz});s.g.broadcastNear({type:'combat',attacker:a.owner,target:p.id,damage:before-p.survival.health,killed:p.survival.health<=0},p);hit=true;break;}
   if(hit)break;for(const m of s.world.mobs){if(m.health<=0||!inside(a,m,m.kind==='spider'?.7:.45,m.kind==='enderman'?2.9:m.kind==='spider'?.8:1.8))continue;
    s.atomic(null,tx=>{m.health-=a.damage;m.hurt=s.world.time;applyKnockback(m,{x:m.x-a.vx,z:m.z-a.vz},s.g.get,.45);if(m.health<=0){for(const [item,n]of s.mobLoot(m))tx.drop(item,n,{x:Math.floor(m.x),y:m.y,z:Math.floor(m.z)});tx.xp(m.hostile?5:2,{x:m.x,y:m.y+.5,z:m.z});}});s.g.broadcastNear({type:'combat',attacker:a.owner,target:m.id,damage:a.damage,killed:m.health<=0},m);hit=true;break;}
  }
  a.age+=dt;if(hit||a.age>5||a.y<0){s.arrows.delete(id);s.g.broadcastNear({type:'arrow-remove',id},a);}
 }
}
