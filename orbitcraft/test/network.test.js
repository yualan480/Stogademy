import test from 'node:test';import assert from 'node:assert/strict';import { spawn } from 'node:child_process';import { mkdtempSync,rmSync } from 'node:fs';import { tmpdir } from 'node:os';import { join } from 'node:path';import WebSocket from 'ws';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function start(db,port,dev=true){const child=spawn(process.execPath,['server/index.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),ORBITCRAFT_DB:db,ORBITCRAFT_DEV:dev?'1':'0'},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);for(let i=0;i<100;i++){if(output.includes('listening'))return child;if(child.exitCode!==null)throw new Error(output);await sleep(50);}child.kill();throw new Error(output||'Server startup timed out');}
async function stop(child){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}
async function connect(port,id){const ws=new WebSocket(`ws://127.0.0.1:${port}/orbitcraft/socket`),messages=[];ws.on('message',b=>messages.push(JSON.parse(b)));await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});ws.send(JSON.stringify({type:'auth',devId:id}));const wait=async(type,filter=()=>true)=>{for(let i=0;i<160;i++){const n=messages.findIndex(m=>m.type===type&&filter(m));if(n>=0)return messages.splice(n,1)[0];await sleep(25);}throw new Error('Timed out waiting for '+type+': '+JSON.stringify(messages.slice(-3)));};return {ws,wait,send:m=>ws.send(JSON.stringify(m)),messages};}
test('two real WebSocket clients share movement, chat, edits, inventory, disconnect and restart persistence',{timeout:25000},async t=>{
 const dir=mkdtempSync(join(tmpdir(),'orbitcraft-net-')),db=join(dir,'world.sqlite'),port=18789;let server=await start(db,port);const clients=[];t.after(async()=>{clients.forEach(c=>c.ws.terminate());if(server)await stop(server);rmSync(dir,{recursive:true,force:true});});
 const a=await connect(port,'dev-Alice'),b=await connect(port,'dev-Bob');clients.push(a,b);const welcome=await a.wait('welcome');await b.wait('welcome');
 const state=await a.wait('state',m=>m.players.length===2);assert.deepEqual(new Set(state.players.map(p=>p.name)),new Set(['Alice','Bob']));
 a.send({type:'chat',text:'Hello Bob!'});assert.equal((await b.wait('chat')).name,'Alice');
 a.send({type:'input',forward:true,jump:true,yaw:0,pitch:0,seq:1});await sleep(300);a.send({type:'input',yaw:0,pitch:-.9,seq:2});assert.ok(await b.wait('state',m=>m.players.find(p=>p.name==='Alice').z<welcome.you.z-.4));
 a.send({type:'place',block:2});const edit=await b.wait('block');assert.equal(edit.block,2);const inv=await a.wait('inventory');assert.equal(inv.inventory[2],23);
 await sleep(200);const began=Date.now(),mineInput={type:'input',mine:true,yaw:0,pitch:-.9};a.send(mineInput);const holding=setInterval(()=>a.send(mineInput),100);
 let dropped;
 try{await b.wait('state',m=>m.players.some(p=>p.name==='Alice'&&p.mining?.progress>0));const mined=await b.wait('block',m=>m.block===0);assert.ok(Math.abs(mined.x)<64);dropped=(await b.wait('drop')).drop;assert.equal(dropped.block,2);assert.ok(Date.now()-began>=600);const unchanged=await a.wait('inventory',m=>m.mined===1);assert.equal(unchanged.inventory[2],23);}
 finally{clearInterval(holding);a.send({type:'input',yaw:0,pitch:-.9,mine:false});}
 a.ws.close();await b.wait('leave');b.ws.close();await sleep(150);await stop(server);server=null;
 server=await start(db,port);const c=await connect(port,'dev-Alice');clients.push(c);const saved=await c.wait('welcome');assert.equal(saved.placed,1);assert.equal(saved.mined,1);assert.equal(saved.inventory[2],23);assert.ok(saved.drops.some(d=>d.id===dropped.id));assert.equal(saved.history[0].text,'Hello Bob!');
 const walking=setInterval(()=>c.send({type:'input',forward:true,jump:true,yaw:0,pitch:-.9}),100);await sleep(350);clearInterval(walking);c.send({type:'input',yaw:0,pitch:-.9});
 assert.equal((await c.wait('pickup',m=>m.id===dropped.id)).player,'dev-Alice');assert.equal((await c.wait('inventory',m=>m.inventory[2]===24)).inventory[2],24);
 c.send({type:'chunks',chunks:[[Math.floor(edit.x/16),Math.floor(edit.z/16)]]});const chunk=await c.wait('chunk');const bytes=Buffer.from(chunk.data,'base64'),index=edit.y*256+((edit.z%16+16)%16)*16+((edit.x%16+16)%16);assert.equal(bytes[index],0);
 c.ws.close();await sleep(100);await stop(server);server=null;server=await start(db,port);const d=await connect(port,'dev-Alice');clients.push(d);const collected=await d.wait('welcome');assert.equal(collected.inventory[2],24);assert.ok(!collected.drops.some(item=>item.id===dropped.id));
 assert.equal((await fetch(`http://127.0.0.1:${port}/orbitcraft/data/world.sqlite`)).status,404);
});
test('production server rejects unverified development identities',{timeout:15000},async()=>{const dir=mkdtempSync(join(tmpdir(),'orbitcraft-auth-'));const server=await start(join(dir,'world.sqlite'),18790,false);let c;try{c=await connect(18790,'dev-Imposter');const error=await c.wait('error');assert.match(error.message,/Sign in/);}finally{c?.ws.terminate();await stop(server);rmSync(dir,{recursive:true,force:true});}});

test('two connected clients perform authoritative PvP, save death loot and respawn after restart',{timeout:20000},async t=>{
 const {openStore}=await import('../server/db.js'),{Game}=await import('../server/game.js');
 const dir=mkdtempSync(join(tmpdir(),'orbit-pvp-net-')),db=join(dir,'world.sqlite'),port=18791;
 const seed=openStore(db),game=new Game(seed),alice=game.join({id:'dev-PvpAlice',name:'PvpAlice'},()=>{}),bob=game.join({id:'dev-PvpBob',name:'PvpBob'},()=>{}),blocks=[];
 for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++){blocks.push({x,y:44,z,block:3});for(let y=45;y<=48;y++)blocks.push({x,y,z,block:0});}
 seed.commit(null,{blocks});Object.assign(alice,{x:.5,y:45.01,z:.5,yaw:0,pitch:0});Object.assign(bob,{x:.5,y:45.01,z:-1.5,yaw:Math.PI,pitch:0});alice.inventory[122]=1;alice.hotbar=[122,2,3,5,0,0,0,0,0];bob.survival.health=4;seed.savePlayer(alice);seed.savePlayer(bob);seed.saveSurvival(game.survival.world);seed.close();
 let server=await start(db,port);const clients=[];t.after(async()=>{clients.forEach(c=>c.ws.terminate());if(server)await stop(server);rmSync(dir,{recursive:true,force:true});});
 const a=await connect(port,'dev-PvpAlice'),b=await connect(port,'dev-PvpBob');clients.push(a,b);assert.equal((await a.wait('welcome')).world.pvp,true);await b.wait('welcome');
 a.send({type:'attack',target:'dev-PvpBob',damage:9999});await sleep(150);assert.equal((await b.wait('survival')).state.health,4);
 const input={type:'input',yaw:0,pitch:0,mine:true},held=setInterval(()=>a.send(input),100);let hit;
 try{a.send(input);hit=await b.wait('combat',m=>m.attacker==='dev-PvpAlice'&&m.target==='dev-PvpBob');assert.equal(hit.killed,true);assert.equal(hit.damage,4);await a.wait('combat',m=>m.target==='dev-PvpBob');assert.equal((await b.wait('survival',m=>m.state.health===0)).state.health,0);await b.wait('inventory',m=>Object.values(m.inventory).every(n=>n===0));assert.equal((await a.wait('survival',m=>m.state.durability[122]===58)).state.durability[122],58);}finally{clearInterval(held);a.send({type:'input',yaw:0,pitch:0,mine:false});}
 for(const c of clients)c.ws.close();await sleep(150);await stop(server);server=null;
 const persisted=openStore(db);assert.equal(persisted.loadPlayer('dev-PvpBob').survival.health,0);const drops=persisted.drops();assert.equal(drops.length,3);persisted.close();
 server=await start(db,port);const returning=await connect(port,'dev-PvpBob');clients.push(returning);const welcome=await returning.wait('welcome');assert.equal(welcome.survival.health,0);assert.equal(welcome.drops.length,3);returning.send({type:'respawn'});assert.equal((await returning.wait('survival',m=>m.state.health===20)).state.health,20);assert.equal(new Set(welcome.drops.map(d=>d.id)).size,3);
});
