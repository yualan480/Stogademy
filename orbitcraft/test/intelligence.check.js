import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';
const directory=mkdtempSync(join(tmpdir(),'orbitcraft-cf-'));
await build({entryPoints:[fileURLToPath(new URL('../cloudflare/worker.js',import.meta.url))],outfile:join(directory,'worker.js'),bundle:true,format:'esm',platform:'browser'});
const make=()=>new Miniflare({modules:true,modulesRoot:directory,scriptPath:join(directory,'worker.js'),compatibilityDate:'2025-11-01',durableObjects:{ORBIT_INTELLIGENCE:{className:'OrbitIntelligence',useSQLite:true}},durableObjectsPersist:join(directory,'storage'),serviceBindings:{ASSETS:()=>new Response('assets')},outboundService:async request=>{
 // Only the identity provider is stubbed. All game sockets, physics, and SQLite
 // run in the actual workerd Durable Object runtime, with no guest auth path.
 const token=request.headers.get('authorization')?.replace('Bearer ','');
 if(!['alice-token','bob-token'].includes(token))return new Response('Unauthorized',{status:401});
 const id=token==='alice-token'?'00000000-0000-4000-a000-000000000001':'00000000-0000-4000-a000-000000000002';
 if(new URL(request.url).pathname==='/auth/v1/user')return Response.json({id});
 return Response.json([{username:token==='alice-token'?'CloudAlice':'CloudBob',display_name:'Ignored alias',first_name:'Cloud',last_name:token==='alice-token'?'Alice':'Bob'}]);
}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function connect(mf,token){const response=await mf.dispatchFetch('https://study.test/orbit-intelligence/socket',{headers:{Upgrade:'websocket',Origin:'https://study.test'}});assert.equal(response.status,101);const ws=response.webSocket,messages=[];ws.accept();ws.addEventListener('message',e=>messages.push(JSON.parse(e.data)));ws.send(JSON.stringify({type:'auth',token}));return {ws,messages,send:m=>ws.send(JSON.stringify(m)),wait:async(type,filter=()=>true)=>{for(let i=0;i<180;i++){const n=messages.findIndex(m=>m.type===type&&filter(m));if(n>=0)return messages.splice(n,1)[0];await sleep(25);}throw new Error('Missing '+type+': '+JSON.stringify(messages.slice(-2)));}};}
let mf=make(),sockets=[];
try {
 assert.equal((await mf.dispatchFetch('https://study.test/orbit-intelligence/health')).status,200);
 assert.equal((await mf.dispatchFetch('https://study.test/orbit-intelligence/socket',{headers:{Upgrade:'websocket',Origin:'https://evil.test'}})).status,403);
 const a=await connect(mf,'alice-token'),b=await connect(mf,'bob-token');sockets.push(a.ws,b.ws);
 const identity=await a.wait('identity');await b.wait('identity');await a.wait('snapshot',m=>m.online.length===2);
 a.send({type:'message',text:'A player-reported Compass clue',topic:'clues',name:'Impersonation'});
 assert.equal((await b.wait('snapshot',m=>m.messages.length===1)).messages[0].name,'Ignored alias');
 await sleep(300);a.send({type:'star-create',title:'Sword theory',body:'I think someone has it',kind:'theory',source:'Observation',confidence:'medium',x:.3,y:.4});
 const first=(await b.wait('snapshot',m=>m.stars.length===1)).stars[0];assert.equal(first.author,identity.id);
 b.send({type:'star-delete',id:first.id});assert.match((await b.wait('error')).message,/own contributions/);
 a.send({type:'star-create',title:'Second report',body:'Shield may be active',kind:'report',x:.7,y:.5});
 await a.wait('error');await sleep(300);a.send({type:'star-create',title:'Second report',body:'Shield may be active',kind:'report',x:.7,y:.5});
 const second=(await b.wait('snapshot',m=>m.stars.length===2)).stars.find(s=>s.id!==first.id);
 await sleep(300);a.send({type:'link-create',from:first.id,to:second.id,label:'Possible alliance'});
 await b.wait('snapshot',m=>m.links.length===1);
 b.send({type:'star-move',id:first.id,x:.9,y:.9});assert.match((await b.wait('error')).message,/own stars/);
 for(const ws of sockets)ws.close();sockets=[];await sleep(100);await mf.dispose();mf=make();
 const c=await connect(mf,'alice-token');sockets.push(c.ws);const restored=await c.wait('snapshot');assert.equal(restored.stars.length,2);assert.equal(restored.links.length,1);assert.equal(restored.messages.length,1);
 c.send({type:'star-delete',id:first.id});const removed=await c.wait('snapshot',m=>m.stars.length===1);assert.equal(removed.links.length,0);
 const bad=await connect(mf,'bad-token');sockets.push(bad.ws);await bad.wait('error');
 console.log('PASS intelligence: authenticated real-time chat, verified author, shared theories/connections, owner permissions, rate limiting, cascading removal, persistence across restart, origin and invalid-token rejection.');
} finally {for(const ws of sockets)ws.close();await sleep(100);await mf.dispose();rmSync(directory,{recursive:true,force:true});}
