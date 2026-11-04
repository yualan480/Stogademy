import {solid,collides} from '../world.js';
import {returnContainer} from './containers.js';
export const pearlLoot=(roll=Math.random())=>roll<.5?[[239,1]]:[];
export function throwPearl(s,p){if(s.selected(p)!==239||!(p.inventory[239]>0)||p.survival.health<=0||p.survival.sleeping)return false;if(s.g.now()-(p.lastPearl??-Infinity)<500)return true;if((s.pearls?.size||0)>=128)return true;
 const speed=21,cp=Math.cos(p.pitch),a={id:crypto.randomUUID(),owner:p.id,x:p.x,y:p.y+1.52,z:p.z,vx:-Math.sin(p.yaw)*cp*speed,vy:Math.sin(p.pitch)*speed+1,vz:-Math.cos(p.yaw)*cp*speed,age:0};
 s.atomic(p,()=>{p.inventory[239]--;});p.lastPearl=s.g.now();s.pearls??=new Map();s.pearls.set(a.id,a);s.g.broadcastNear({type:'pearl-spawn',pearl:a},p);return true;
}
export function safePearlLanding(s,p,point,a){const n=Math.hypot(a.vx,a.vz)||1;for(const retreat of [0,.35,.7])for(const height of [0,.35,-.35,1,-1]){const q={x:point.x-a.vx/n*retreat,y:point.y+height+.02,z:point.z-a.vz/n*retreat};if(collides(q,s.g.get))continue;if([...s.g.players.values()].some(other=>other!==p&&Math.hypot(other.x-q.x,other.z-q.z)<.6&&Math.abs(other.y-q.y)<1.8))continue;return q;}return null;}
export function tickPearls(s,dt){for(const [id,a]of s.pearls||[]){let hit=false,previous={x:a.x,y:a.y,z:a.z};const steps=Math.max(1,Math.ceil(Math.hypot(a.vx,a.vy,a.vz)*dt/.12)),d=dt/steps;
 for(let i=0;i<steps;i++){previous={x:a.x,y:a.y,z:a.z};a.x+=a.vx*d;a.y+=a.vy*d-6*d*d;a.z+=a.vz*d;a.vy-=12*d;if(solid(s.g.get(Math.floor(a.x),Math.floor(a.y),Math.floor(a.z)))){hit=true;break;}}
 a.age+=dt;if(hit){const p=s.g.players.get(a.owner);if(p&&p.survival.health>0){const destination=safePearlLanding(s,p,previous,a);if(destination){s.atomic(p,tx=>{if(p.survival.boat&&s.world.boats[p.survival.boat])s.world.boats[p.survival.boat].rider=null;p.survival.boat=null;p.survival.sleeping=false;p.survival.bedPose=null;Object.assign(p,destination,{vy:0,fallTop:destination.y,input:{},mining:null,eating:null,sleepAt:null});returnContainer(p,tx);delete p.bowDrawAt;});p.pendingChunks.clear();p.sentChunks.clear();p.send({type:'teleport',position:destination});}else p.send({type:'error',message:'No safe space where that ender pearl landed.'});}}
 if(hit||a.age>8||a.y<0){s.pearls.delete(id);s.g.broadcastNear({type:'pearl-remove',id},a);}}
}
