import {chooseSkin} from './skins.js';
import {SIMULATION_DISTANCE,RENDER_MAX} from '../chunks.js';
import { SIZE, HEIGHT, MIN_Y,CHUNK_HEIGHT,CHUNK, SEED } from '../world.js';
export function welcome(game,p) {
  game=p.game||game;
  p.send({type:'welcome',you:game.public(p),inventory:p.inventory,survival:game.survival.state(p),hotbar:p.hotbar,mined:p.mined,placed:p.placed,world:{dimension:game.dimension||'overworld',size:SIZE,height:HEIGHT,minY:MIN_Y,chunkHeight:CHUNK_HEIGHT,chunk:CHUNK,seed:SEED,pvp:true,simulationDistance:SIMULATION_DISTANCE,maxRenderDistance:RENDER_MAX},history:game.store.history(),drops:game.publicDrops(p)});
  game.broadcast({type:'notice',text:`${p.name} joined the public world.`});
}
export function sender(socket){return data=>{if(socket.readyState===1){if(socket.bufferedAmount>2*1024*1024){socket.close(1013,'Connection too slow');return;}socket.send(JSON.stringify(data));}};}
export async function receive(game,p,raw) {
  if(game.world&&JSON.parse(raw).type==='respawn'&&p.dimension==='nether'&&p.survival.health<=0){const target=game.world('overworld');game.transfer(p,'overworld',target.spawn());target.handle(p,{type:'respawn'});return;}
  game=p.game||game;
  let message;try{message=JSON.parse(raw);}catch{throw new Error('Invalid JSON');}
  if(message.type==='skin-choose'){await chooseSkin(game,p,message);return;}
  game.handle(p,message);
}
