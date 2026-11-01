import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../server/db.js';
import { Game } from '../server/game.js';
import { baseBlock, terrain, HEIGHT, CHUNK, chunkIndex, raycast,collides,step } from '../world.js';
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'orbitcraft-'));const path=join(dir,'world.sqlite');let store=openStore(path);const game=new Game(store);t.after(()=>{try{store.close();}catch{}rmSync(dir,{recursive:true,force:true});});return {game,store,path,reopen(){store.close();store=openStore(path);return new Game(store);}};}
function player(g,id='one'){return g.join({id,name:id},()=>{});}
function aim(p,x,y,z){const dx=x-p.x,dy=y-(p.y+1.62),dz=z-p.z;p.yaw=Math.atan2(-dx,-dz);p.pitch=Math.atan2(dy,Math.hypot(dx,dz));p.lastEdit=0;}
test('generated world has all biomes, trees, water, caves and deterministic chunk boundaries',t=>{
 const {game:g}=fixture(t),biomes=new Set();let trees=0,water=0,caves=0;
 for(let x=-64;x<64;x+=2)for(let z=-64;z<64;z+=2){const h=terrain(x,z);biomes.add(h.biome);if(h.height<13)water++;for(let y=1;y<HEIGHT;y++){const b=baseBlock(x,y,z);if(b===5)trees++;if(y<h.height-3&&y>3&&b===0)caves++;}}
 assert.equal(biomes.size,4);assert.ok(trees&&water&&caves);
 for(const [cx,cz] of [[-1,0],[0,0],[1,1]]){const chunk=g.chunk(cx,cz);for(let y=0;y<HEIGHT;y+=3)for(let z=0;z<CHUNK;z+=5)for(let x=0;x<CHUNK;x+=5)assert.equal(chunk[chunkIndex(x,y,z)],baseBlock(cx*CHUNK+x,y,cz*CHUNK+z));}
});
test('authoritative movement collides and bounds the world',t=>{const {game:g}=fixture(t);const p=player(g);const start={...p};for(let i=0;i<15;i++)step(p,{forward:true,jump:true},.05,g.get);assert.ok(Math.hypot(p.x-start.x,p.z-start.z)>1);assert.equal(collides(p,g.get),false);g.handle(p,{type:'input',x:100000,yaw:NaN,pitch:0});assert.ok(p.x<64);p.x=63.6;p.y=52;p.z=0;for(let i=0;i<20;i++)step(p,{right:true},.05,g.get);assert.ok(p.x<=63.7);});
test('mining and building atomically persist inventory, stats and world edits after restart',t=>{
 const f=fixture(t),g=f.game,p=player(g);const a={x:Math.floor(p.x),y:Math.floor(p.y)-1,z:Math.floor(p.z)};aim(p,a.x+.5,a.y+.5,a.z+.5);const hit=raycast(p,g.get);assert.ok(hit);const old=p.inventory[hit.block]||0;g.handle(p,{type:'break'});assert.equal(g.get(hit.x,hit.y,hit.z),0);assert.equal(p.inventory[hit.block],old+1);assert.equal(p.mined,1);
 aim(p,p.x,terrain(Math.floor(p.x),Math.floor(p.z)-3).height+.7,p.z-3);const build=raycast(p,g.get);assert.ok(build?.place);const before=p.inventory[2];g.handle(p,{type:'place',block:2});assert.equal(g.get(build.place.x,build.place.y,build.place.z),2);assert.equal(p.inventory[2],before-1);
 const next=f.reopen(),again=player(next);assert.equal(next.get(hit.x,hit.y,hit.z),0);assert.equal(next.get(build.place.x,build.place.y,build.place.z),2);assert.equal(again.inventory[2],before-1);assert.equal(again.mined,1);assert.equal(again.placed,1);
});
test('server rejects inventory spoofing, placement without resources, duplicate sessions and bedrock mining',t=>{
 const {game:g}=fixture(t),p=player(g);assert.throws(()=>player(g),/already playing/);
 aim(p,p.x,p.y-1,p.z-3);p.inventory[2]=0;assert.throws(()=>g.handle(p,{type:'place',block:2}),/Collect/);assert.equal(p.placed,0);
 p.lastEdit=0;g.handle(p,{type:'inventory',inventory:{2:9999}});assert.equal(p.inventory[2],0);
 for(let y=1;y<=4;y++)g.edits.set(`10,${y},10`,0);p.x=10.5;p.z=10.5;p.y=1.01;aim(p,10.5,.5,10.5);assert.throws(()=>g.handle(p,{type:'break'}),/Bedrock/);
});
test('resource crafting saves and chat uses server identity',t=>{const {game:g,store}=fixture(t),p=player(g);const old=p.inventory[5];g.handle(p,{type:'craft'});assert.equal(p.inventory[5],old-1);assert.equal(p.inventory[10],4);assert.equal(store.loadPlayer(p.id).inventory[10],4);g.handle(p,{type:'chat',text:'Hello world',name:'Imposter'});assert.equal(store.history()[0].name,'one');assert.equal(store.history()[0].text,'Hello world');});
test('block placement cannot trap another connected player',t=>{const {game:g}=fixture(t),p=player(g),other=player(g,'two');aim(p,p.x,p.y-1,p.z-3);const hit=raycast(p,g.get);assert.ok(hit?.place);Object.assign(other,{x:hit.place.x+.5,y:hit.place.y,z:hit.place.z+.5});assert.throws(()=>g.handle(p,{type:'place',block:2}),/player/);assert.equal(p.placed,0);});
