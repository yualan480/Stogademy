import {EASY} from './difficulty.js';
import {chunkOf} from '../chunks.js';
export const MOB_CAPS={hostile:EASY.hostileCap,passive:10,ambient:15,water:5,waterAmbient:20,undergroundWater:5};
export const category=kind=>['zombie','skeleton','creeper','spider','enderman'].includes(kind)?'hostile':kind==='bat'?'ambient':['squid','dolphin'].includes(kind)?'water':['fish','salmon','cod'].includes(kind)?'waterAmbient':kind==='axolotl'?'undergroundWater':'passive';
export const aquatic=kind=>['water','waterAmbient','undergroundWater'].includes(category(kind));
export function underCap(mobs,kind,x,z){const c=chunkOf(x,z),group=category(kind);return mobs.filter(m=>{const a=chunkOf(m.x,m.z);return m.health>0&&category(m.kind)===group&&Math.abs(a.x-c.x)<=8&&Math.abs(a.z-c.z)<=8;}).length<MOB_CAPS[group];}
