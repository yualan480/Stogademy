import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Game} from '../server/game.js';
import {openStore} from '../server/db.js';
import {EASY} from '../server/difficulty.js';
function setup(t){const dir=mkdtempSync(join(tmpdir(),'orbit-easy-')),store=openStore(join(dir,'db'));let now=10000;const g=new Game(store,{now:()=>now}),p=g.join({id:'easy-player',name:'Player'},()=>{});g.get=(x,y,z)=>y===44?3:0;Object.assign(p,{x:.5,y:45.01,z:.5,yaw:0});g.survival.world.time=14000;g.survival.spawnAt=Infinity;p.survival.hunger=10;t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return{g,p,tick(n=1,reset=()=>{}){for(let i=0;i<n;i++){now+=250;reset();g.survival.tick(.25);}}};}
test('easy mode halves hostile damage without weakening PvP or environmental damage',t=>{const {g,p}=setup(t);g.survival.hurt(p,6,{hostile:true,x:.5,z:-1});assert.equal(p.survival.health,17);p.lastHurt=-Infinity;p.survival.health=20;g.survival.hurt(p,6,{id:'another-player',x:.5,z:-1});assert.equal(p.survival.health,14);p.lastHurt=-Infinity;p.survival.health=20;g.survival.hurt(p,6);assert.equal(p.survival.health,14);});
test('looking at an Enderman no longer provokes it, but hitting it still does',t=>{const f=setup(t),m=f.g.survival.spawn('enderman',.5,45.01,-1.5);f.tick();assert.ok(!m.angry);assert.ok(f.g.survival.attack(f.p));assert.equal(m.angry,true);});
test('night spawning waits twenty seconds between attempts',t=>{const f=setup(t),s=f.g.survival;let spawned=0;s.spawnAround=()=>spawned++;s.spawnAt=s.world.time;f.tick(40);assert.equal(spawned,0);f.tick(41);assert.equal(spawned,1);assert.equal(EASY.spawnAttempts,2);assert.equal(EASY.hostileCap,20);});
test('nearby zombies attack at most once every two seconds',t=>{const f=setup(t),m=f.g.survival.spawn('zombie',.5,45.01,-.5);f.tick(16,()=>{Object.assign(f.p,{x:.5,y:45.01,z:.5});Object.assign(m,{x:.5,y:45.01,z:-.5});});assert.equal(f.p.survival.health,17);});
test('creepers give players three seconds to retreat before exploding',t=>{const f=setup(t),m=f.g.survival.spawn('creeper',.5,45.01,-.5);let explosions=0;f.g.survival.explode=()=>{explosions++;m.health=0;};const reset=()=>{Object.assign(f.p,{x:.5,y:45.01,z:.5});Object.assign(m,{x:.5,y:45.01,z:-.5});};f.tick(8,reset);assert.equal(explosions,0);f.tick(5,reset);assert.equal(explosions,1);});

test('daylight burning does not count as provoking an Enderman',t=>{const f=setup(t),m=f.g.survival.spawn('enderman',.5,45.01,-1.5);f.g.survival.world.time=6000;f.tick();assert.ok(m.burning&&m.health<20);assert.ok(!m.angry);});
