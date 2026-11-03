import {SIMULATION_DISTANCE,RENDER_MAX} from '../chunks.js';
import { SIZE, HEIGHT, CHUNK, SEED } from '../world.js';
export function welcome(game,p) {
  p.send({type:'welcome',you:game.public(p),inventory:p.inventory,survival:game.survival.state(p),hotbar:p.hotbar,mined:p.mined,placed:p.placed,world:{size:SIZE,height:HEIGHT,chunk:CHUNK,seed:SEED,pvp:true,simulationDistance:SIMULATION_DISTANCE,maxRenderDistance:RENDER_MAX},history:game.store.history(),drops:game.publicDrops(p)});
  game.broadcast({type:'notice',text:`${p.name} joined the public world.`});
}
export function sender(socket){return data=>{if(socket.readyState===1){if(socket.bufferedAmount>2*1024*1024){socket.close(1013,'Connection too slow');return;}socket.send(JSON.stringify(data));}};}
export function receive(game,p,raw) {
  let message;try{message=JSON.parse(raw);}catch{throw new Error('Invalid JSON');}
  game.handle(p,message);
}
