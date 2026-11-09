export { OrbitIntelligence } from './intelligence.js';
import {SIZE,HEIGHT,MIN_Y,CHUNK_HEIGHT,CHUNK} from '../world.js';
import { RELEASE } from '../release.js';
import { Game } from '../server/game.js';
import { authenticate } from '../server/auth.js';
import { welcome,sender,receive } from '../server/protocol.js';
import { cloudStore } from './store.js';
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/orbit-intelligence/socket'||url.pathname==='/orbit-intelligence/health')return env.ORBIT_INTELLIGENCE.get(env.ORBIT_INTELLIGENCE.idFromName('orbit-intelligence-v1')).fetch(request);
  if(url.pathname==='/orbitcraft/socket'||url.pathname==='/orbitcraft/health'){
   const id=env.ORBITCRAFT_WORLD.idFromName('orbitcraft-public-v1');
   return env.ORBITCRAFT_WORLD.get(id).fetch(request);
  }
  return env.ASSETS.fetch(request);
 }
};
export class OrbitcraftWorld {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.store=cloudStore(ctx.storage);this.game=new Game(this.store);this.connections=new Set();this.timer=null;this.lastSave=0;}
 async fetch(request){
  const url=new URL(request.url);
  if(url.pathname==='/orbitcraft/health')return Response.json({ok:true,players:this.game.players.size,world:'public',release:RELEASE,difficulty:'easy',pvp:true,size:SIZE,height:HEIGHT,minY:MIN_Y,chunkHeight:CHUNK_HEIGHT,chunkSize:CHUNK,simulationDistance:2,dev:false});
  if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
  if(request.headers.get('Origin')!==url.origin)return new Response('Origin denied',{status:403});
  if(this.connections.size>=48)return new Response('World full. Try again soon.',{status:503});
  const pair=new WebSocketPair(),[client,socket]=Object.values(pair);socket.accept();this.connections.add(socket);
  const send=sender(socket);let p=null,busy=false,quota=0,windowAt=Date.now();
  const timeout=setTimeout(()=>socket.close(4001,'Authentication timed out'),10000);
  socket.addEventListener('message',async event=>{
   if(typeof event.data!=='string'||event.data.length>12288)return socket.close(4008,'Message too large');
   const now=Date.now();if(now-windowAt>1000){quota=0;windowAt=now;}if(++quota>160)return socket.close(4008,'Rate limit');
   try{
    if(!p){if(busy)return;busy=true;const m=JSON.parse(event.data);if(m.type!=='auth')throw new Error('Authenticate first.');const identity=await authenticate(m.token);if(socket.readyState!==1)return;p=this.game.join(identity,send);p.authToken=m.token;clearTimeout(timeout);welcome(this.game,p);this.start();return;}
    if(Date.now()>p.expiresAt){socket.close(4001,'Session expired; reconnect');return;}
    await receive(this.game,p,event.data);
   }catch(e){send({type:'error',message:e.message});if(!p)socket.close(4001,'Authentication failed');}
  });
  const close=()=>{clearTimeout(timeout);this.connections.delete(socket);if(p){this.game.leave(p);this.game.broadcast({type:'leave',id:p.id});p=null;}if(!this.game.players.size){clearInterval(this.timer);this.timer=null;}};
  socket.addEventListener('close',close);socket.addEventListener('error',()=>{close();try{socket.close(1011,'Connection error');}catch{}});
  return new Response(null,{status:101,webSocket:client});
 }
 start(){if(this.timer)return;this.timer=setInterval(()=>{try{
  const now=Date.now();for(const p of this.game.players.values())if(now-(p.lastInput||0)>350)p.input={};
  this.game.tick();if(now-this.lastSave>2000){for(const p of this.game.players.values())this.store.savePlayer(p);this.game.flushDrops();this.lastSave=now;}
 }catch(e){console.error('Orbitcraft tick failed',e.name);for(const ws of this.connections)ws.close(1011,'World restarting');}},50);}
}
