import {collides} from '../world.js';
// A short, authoritative push. Small steps stop at walls instead of tunnelling
// through them or discarding the whole push when only its final step is blocked.
export function applyKnockback(target,source,get,distance=.35,lift=3){
 let dx=target.x-source.x,dz=target.z-source.z,n=Math.hypot(dx,dz);
 if(n<.001){dx=-Math.sin(source.yaw||0);dz=-Math.cos(source.yaw||0);n=1;}
 const count=Math.max(1,Math.ceil(distance/.07));
 for(let i=0;i<count;i++)for(const [axis,delta]of [['x',dx/n*distance/count],['z',dz/n*distance/count]]){const next={...target,[axis]:target[axis]+delta};if(!collides(next,get))target[axis]=next[axis];}
 target.vy=Math.max(target.vy||0,lift);
}
