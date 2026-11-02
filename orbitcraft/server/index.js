import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { openStore } from './db.js';
import { Game } from './game.js';
import { authenticate } from './auth.js';
import { welcome,sender,receive } from './protocol.js';
if(process.env.HTTPS_PROXY) setGlobalDispatcher(new EnvHttpProxyAgent());
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||8787),dev=process.env.ORBITCRAFT_DEV==='1';
if(dev && host!=='127.0.0.1' && host!=='localhost')throw new Error('Development guest mode must bind to localhost.');
const store=openStore(process.env.ORBITCRAFT_DB||resolve(root,'orbitcraft/data/world.sqlite'));
const game=new Game(store);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.wav':'audio/wav','.mp4':'video/mp4','.webmanifest':'application/manifest+json','.woff2':'font/woff2','.ico':'image/x-icon'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://local');
  if(url.pathname==='/orbitcraft/health'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true,players:game.players.size,world:'public',dev}));}
  let path;try{path=decodeURIComponent(url.pathname);}catch{res.writeHead(400);return res.end();}
  if(path==='/orbitcraft/vendor/three.module.js')path='/orbitcraft/node_modules/three/build/three.module.js';
  else if(path==='/orbitcraft/vendor/three.core.js')path='/orbitcraft/node_modules/three/build/three.core.js';
  else if(path.split('/').some(p=>p.startsWith('.')||['node_modules','server','test','data','cloudflare'].includes(p))){res.writeHead(404);return res.end();}
  let file=resolve(root,'.'+path);
  if(!file.startsWith(root+'/')){res.writeHead(403);return res.end();}
  try{if((await stat(file)).isDirectory())file=resolve(file,'index.html');const body=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(body);}catch{res.writeHead(404);res.end('Not found');}
});
const wss=new WebSocketServer({noServer:true,maxPayload:12288,perMessageDeflate:false});
server.on('upgrade',(req,socket,head)=>{
  const origin=req.headers.origin;
  if(new URL(req.url,'http://local').pathname!=='/orbitcraft/socket'||(origin && new URL(origin).host!==req.headers.host)||wss.clients.size>=48){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
});
wss.on('connection',socket=>{
  const send=sender(socket);let p=null,authenticating=false,quota=0;
  const deadline=setTimeout(()=>socket.close(4001,'Authentication timed out'),10000);
  socket.on('message',async(raw)=>{
    if(++quota>160)return socket.close(4008,'Too many messages');
    try{
      if(!p){
        if(authenticating)return;authenticating=true;
        const m=JSON.parse(raw);if(m.type!=='auth')throw new Error('Authenticate first.');
        const identity=dev && /^dev-[a-zA-Z0-9_-]{1,32}$/.test(m.devId||'')?{id:m.devId,name:m.devId.slice(4),expiresAt:Date.now()+3600000}:await authenticate(m.token);
        if(socket.readyState!==1)return;
        p=game.join(identity,send);p.close=()=>socket.close(4001,'Session expired; reconnect');clearTimeout(deadline);welcome(game,p);return;
      }
      receive(game,p,raw.toString());
    }catch(e){send({type:'error',message:e.message});if(!p)socket.close(4001,'Authentication failed');}
  });
  const reset=setInterval(()=>{quota=0;},1000);
  socket.on('error',()=>{});
  socket.on('close',()=>{clearTimeout(deadline);clearInterval(reset);if(p){game.leave(p);game.broadcast({type:'leave',id:p.id});}});
});
const tick=setInterval(()=>{
  const now=Date.now();
  for(const p of game.players.values()) {if(now-(p.lastInput||0)>350)p.input={};if(now>p.expiresAt)p.close();}
  game.tick();
},50);
const save=setInterval(()=>{for(const p of game.players.values())store.savePlayer(p);game.flushDrops();},2000);
server.listen(port,host,()=>console.log(`Orbitcraft listening on ${host}:${port}${dev?' (local development identities enabled)':''}`));
function stop(){clearInterval(tick);clearInterval(save);game.flushDrops();for(const p of game.players.values())store.savePlayer(p);for(const ws of wss.clients)ws.close(1001,'Server restarting');wss.close();server.close(()=>{store.close();process.exit(0);});setTimeout(()=>process.exit(0),2000).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
