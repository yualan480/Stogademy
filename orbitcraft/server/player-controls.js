import {SIZE,HEIGHT,solid} from '../world.js';
import {stacks,swapSlots,setLayout} from '../inventory.js';
function dropPoint(s,p){const at={x:Math.max(-SIZE/2,Math.min(SIZE/2-1,Math.floor(p.x-Math.sin(p.yaw)*2.2))),y:Math.min(HEIGHT-1,p.y+1),z:Math.max(-SIZE/2,Math.min(SIZE/2-1,Math.floor(p.z-Math.cos(p.yaw)*2.2)))};return solid(s.g.get(at.x,Math.floor(at.y),at.z))?{x:Math.floor(p.x),y:p.y,z:Math.floor(p.z)}:at;}
export function playerControl(s,p,m){
 if(m.type==='flight'){if(p.survival.mode==='creative')s.atomic(p,()=>{p.survival.flying=!p.survival.flying;p.vy=0;p.fallTop=p.y;});return true;}
 if(m.type==='drop-held'){s.atomic(p,tx=>{const c=p.survival.container;if(c?.cursor){const n=m.all?c.cursor.count:1;tx.drop(c.cursor.id,n,dropPoint(s,p));c.cursor.count-=n;if(!c.cursor.count)c.cursor=null;return;}const slots=stacks(p),stack=slots[p.selected];if(!stack)return;const n=m.all?stack.count:1;p.inventory[stack.id]-=n;slots[p.selected]=stack.count===n?null:{...stack,count:stack.count-n};setLayout(p,slots);tx.drop(stack.id,n,dropPoint(s,p));});return true;}
 if(m.type==='swap-offhand'){s.atomic(p,()=>{const slots=stacks(p),held=slots[p.selected],off=p.survival.offhand;if(held)p.inventory[held.id]-=held.count;if(off)p.inventory[off.id]=(p.inventory[off.id]||0)+off.count;slots[p.selected]=off||null;p.survival.offhand=held||null;setLayout(p,slots);});return true;}
 if(m.type==='hotbar-swap'){if(Number.isInteger(m.from)&&m.from>=0&&m.from<36&&Number.isInteger(m.to)&&m.to>=0&&m.to<9)s.atomic(p,()=>swapSlots(p,m.from,m.to));return true;}
 return false;
}
