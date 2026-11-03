import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';
const directory=mkdtempSync(join(tmpdir(),'orbitcraft-cf-'));
await build({entryPoints:[fileURLToPath(new URL('../cloudflare/worker.js',import.meta.url))],outfile:join(directory,'worker.js'),bundle:true,format:'esm',platform:'browser'});
const make=()=>new Miniflare({modules:true,modulesRoot:directory,scriptPath:join(directory,'worker.js'),compatibilityDate:'2025-11-01',durableObjects:{ORBITCRAFT_WORLD:{className:'OrbitcraftWorld',useSQLite:true}},durableObjectsPersist:join(directory,'storage'),serviceBindings:{ASSETS:()=>new Response('assets')},outboundService:async request=>{
 // Only the identity provider is stubbed. All game sockets, physics, and SQLite
 // run in the actual workerd Durable Object runtime, with no guest auth path.
 const token=request.headers.get('authorization')?.replace('Bearer ','');
 if(!['alice-token','bob-token'].includes(token))return new Response('Unauthorized',{status:401});
 const id=token==='alice-token'?'00000000-0000-4000-a000-000000000001':'00000000-0000-4000-a000-000000000002';
 if(new URL(request.url).pathname==='/auth/v1/user')return Response.json({id});
 return Response.json([{username:token==='alice-token'?'CloudAlice':'CloudBob',display_name:'Ignored alias',first_name:'Cloud',last_name:token==='alice-token'?'Alice':'Bob'}]);
}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function connect(mf,token){const response=await mf.dispatchFetch('https://study.test/orbitcraft/socket',{headers:{Upgrade:'websocket',Origin:'https://study.test'}});assert.equal(response.status,101);const ws=response.webSocket,messages=[];ws.accept();ws.addEventListener('message',e=>messages.push(JSON.parse(e.data)));ws.send(JSON.stringify({type:'auth',token}));return {ws,messages,send:m=>ws.send(JSON.stringify(m)),wait:async(type,filter=()=>true)=>{for(let i=0;i<180;i++){const n=messages.findIndex(m=>m.type===type&&filter(m));if(n>=0)return messages.splice(n,1)[0];await sleep(25);}throw new Error('Missing '+type+': '+JSON.stringify(messages.slice(-2)));}};}
let mf=make(),sockets=[];
try{
 const a=await connect(mf,'alice-token'),b=await connect(mf,'bob-token');sockets.push(a.ws,b.ws);const aw=await a.wait('welcome'),bw=await b.wait('welcome');assert.equal(aw.world.pvp,true);
 const yaw=Math.atan2(-(bw.you.x-aw.you.x),-(bw.you.z-aw.you.z)),moving=setInterval(()=>a.send({type:'input',forward:true,yaw,pitch:0}),100);
 try{a.send({type:'input',forward:true,yaw,pitch:0});await a.wait('state',m=>{const p=m.players.find(p=>p.id===aw.you.id),q=m.players.find(p=>p.id===bw.you.id);return p&&q&&Math.hypot(p.x-q.x,p.z-q.z)<2.5;});}finally{clearInterval(moving);}
 a.send({type:'input',yaw,pitch:0,seq:123});const state=await a.wait('state',m=>m.players.some(p=>p.id===aw.you.id&&p.seq===123)),p=state.players.find(p=>p.id===aw.you.id),q=state.players.find(p=>p.id===bw.you.id);
 const aim={type:'input',mine:true,yaw:Math.atan2(-(q.x-p.x),-(q.z-p.z)),pitch:Math.atan2(q.y+.9-p.y-1.62,Math.hypot(q.x-p.x,q.z-p.z))},held=setInterval(()=>a.send(aim),100);
 try{a.send(aim);const event=await b.wait('combat',m=>m.attacker===aw.you.id&&m.target===bw.you.id);assert.equal(event.damage,1);assert.equal(event.killed,false);await a.wait('combat',m=>m.target===bw.you.id);assert.equal((await b.wait('survival',m=>m.state.health===19)).state.health,19);}finally{clearInterval(held);a.send({type:'input',yaw,pitch:0});}
 for(const ws of sockets)ws.close();sockets=[];await sleep(150);await mf.dispose();mf=make();const returning=await connect(mf,'bob-token');sockets.push(returning.ws);assert.equal((await returning.wait('welcome')).survival.health,19);const attacker=await connect(mf,'alice-token');sockets.push(attacker.ws);assert.ok((await attacker.wait('welcome')).survival.exhaustion>=.1);
 console.log('PASS: actual Cloudflare workerd: two verified WebSocket clients approach, aim and attack; both receive PvP hit, victim loses real HP, both players persist through SQLite restart.');
}finally{for(const ws of sockets)ws.close();await sleep(100);await mf.dispose();rmSync(directory,{recursive:true,force:true});}
