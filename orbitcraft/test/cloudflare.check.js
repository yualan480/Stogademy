import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';
const directory=mkdtempSync(join(tmpdir(),'orbitcraft-cf-'));
await build({entryPoints:['cloudflare/worker.js'],outfile:join(directory,'worker.js'),bundle:true,format:'esm',platform:'browser'});
const make=()=>new Miniflare({modules:true,modulesRoot:directory,scriptPath:join(directory,'worker.js'),compatibilityDate:'2025-11-01',durableObjects:{ORBITCRAFT_WORLD:{className:'OrbitcraftWorld',useSQLite:true}},durableObjectsPersist:join(directory,'storage'),serviceBindings:{ASSETS:()=>new Response('assets')},outboundService:async request=>{
 // Only the identity provider is stubbed. All game sockets, physics, and SQLite
 // run in the actual workerd Durable Object runtime, with no guest auth path.
 const token=request.headers.get('authorization')?.replace('Bearer ','');
 if(!['alice-token','bob-token'].includes(token))return new Response('Unauthorized',{status:401});
 const id=token==='alice-token'?'00000000-0000-4000-a000-000000000001':'00000000-0000-4000-a000-000000000002';
 if(new URL(request.url).pathname==='/auth/v1/user')return Response.json({id});
 return Response.json([{username:token==='alice-token'?'CloudAlice':'CloudBob',display_name:'Ignored display name'}]);
}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function connect(mf,token){const response=await mf.dispatchFetch('https://study.test/orbitcraft/socket',{headers:{Upgrade:'websocket',Origin:'https://study.test'}});assert.equal(response.status,101);const ws=response.webSocket,messages=[];ws.accept();ws.addEventListener('message',e=>messages.push(JSON.parse(e.data)));ws.send(JSON.stringify({type:'auth',token}));return {ws,messages,send:m=>ws.send(JSON.stringify(m)),wait:async(type,filter=()=>true)=>{for(let i=0;i<180;i++){const n=messages.findIndex(m=>m.type===type&&filter(m));if(n>=0)return messages.splice(n,1)[0];await sleep(25);}throw new Error('Missing '+type+': '+JSON.stringify(messages.slice(-2)));}};}
let mf=make(),sockets=[];
try{
 assert.equal((await mf.dispatchFetch('https://study.test/orbitcraft/health')).status,200);
 const a=await connect(mf,'alice-token'),b=await connect(mf,'bob-token');sockets.push(a.ws,b.ws);await a.wait('welcome');await b.wait('welcome');await a.wait('state',m=>m.players.length===2);
 a.send({type:'chat',text:'Cloudflare multiplayer works'});assert.equal((await b.wait('chat')).name,'CloudAlice');
 a.send({type:'input',yaw:0,pitch:-.9});a.send({type:'place',block:2});const edit=await b.wait('block');assert.equal(edit.block,2);const inv=await a.wait('inventory');assert.equal(inv.inventory[2],23);
 for(const ws of sockets)ws.close();sockets=[];await sleep(150);await mf.dispose();mf=make();const c=await connect(mf,'alice-token');sockets.push(c.ws);const saved=await c.wait('welcome');assert.equal(saved.inventory[2],23);assert.equal(saved.placed,1);assert.equal(saved.history[0].text,'Cloudflare multiplayer works');
 c.send({type:'chunks',chunks:[[Math.floor(edit.x/16),Math.floor(edit.z/16)]]});const chunk=await c.wait('chunk');const index=edit.y*256+((edit.z%16+16)%16)*16+((edit.x%16+16)%16);assert.equal(Buffer.from(chunk.data,'base64')[index],2);
 assert.equal((await mf.dispatchFetch('https://study.test/orbitcraft/socket',{headers:{Upgrade:'websocket',Origin:'https://evil.test'}})).status,403);
 console.log('PASS: actual Cloudflare workerd runtime: real WebSockets, verified identity mapping, shared block edits, inventory, chat, SQLite persistence after Durable Object restart, origin rejection.');
}finally{for(const ws of sockets)ws.close();await sleep(100);await mf.dispose();rmSync(directory,{recursive:true,force:true});}
