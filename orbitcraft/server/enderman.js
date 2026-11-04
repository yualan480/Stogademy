import {solid} from '../world.js';
import {EASY} from './difficulty.js';
// The rendered eyes sit on the front of the 0.5-block head, not at torso level.
export function lookingIntoEyes(player,mob,get){
 const yaw=mob.yaw||0,nx=-Math.sin(yaw),nz=-Math.cos(yaw);
 const eye={x:mob.x+nx*.255,y:mob.y+2.535,z:mob.z+nz*.255};
 const origin={x:player.x,y:player.y+1.62,z:player.z},cp=Math.cos(player.pitch||0);
 const ray={x:-Math.sin(player.yaw||0)*cp,y:Math.sin(player.pitch||0),z:-Math.cos(player.yaw||0)*cp};
 const facing=ray.x*nx+ray.z*nz;if(facing>=-.001)return false;
 const t=((eye.x-origin.x)*nx+(eye.z-origin.z)*nz)/facing;if(t<=0||t>EASY.detection)return false;
 const dx=origin.x+ray.x*t-eye.x,dz=origin.z+ray.z*t-eye.z;
 if(Math.abs(dx*Math.cos(yaw)-dz*Math.sin(yaw))>.22||Math.abs(origin.y+ray.y*t-eye.y)>.075)return false;
 for(let d=.05;d<t;d+=.1)if(solid(get(Math.floor(origin.x+ray.x*d),Math.floor(origin.y+ray.y*d),Math.floor(origin.z+ray.z*d))))return false;
 return true;
}
export function endermanTarget(mob,players,get){
 let target=players.find(p=>p.id===mob.eyeTarget&&Math.hypot(p.x-mob.x,p.z-mob.z)<EASY.detection);
 if(!target){delete mob.eyeTarget;target=players.find(p=>lookingIntoEyes(p,mob,get));if(target)mob.eyeTarget=target.id;}
 mob.angry=!!target;return target;
}
