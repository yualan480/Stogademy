import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {locatePlayer,playerColor} from '../locator.js';
import {Game} from '../server/game.js';
import {openStore} from '../server/db.js';
const me={x:0,y:20,z:0,yaw:0};
test('locator bearings follow Minecraft yaw for ahead, left, right and behind',()=>{
 assert.equal(locatePlayer(me,{x:0,y:20,z:-10}).position,.5);
 assert.equal(locatePlayer(me,{x:-10,y:20,z:0}).position,0);
 assert.equal(locatePlayer(me,{x:10,y:20,z:0}).position,1);
 assert.equal(locatePlayer({...me,yaw:-Math.PI/2},{x:10,y:20,z:0}).position,.5);
 for(const yaw of [-Math.PI,Math.PI,Math.PI*8]){const p=locatePlayer({...me,yaw},{x:0,y:20,z:10});assert.ok(p.position>=0&&p.position<=1);}
 const behind=locatePlayer(me,{x:1,y:20,z:10});assert.equal(behind.behind,true);assert.equal(behind.turn,'right');
});
test('locator gives height, distance and stable player colors',()=>{
 assert.equal(locatePlayer(me,{x:0,y:25,z:0}).height,'above');
 assert.equal(locatePlayer(me,{x:0,y:15,z:0}).height,'below');
 assert.equal(locatePlayer(me,{x:3,y:20,z:4}).distance,5);
 assert.equal(locatePlayer(me,me).position,.5);
 assert.equal(playerColor('abc'),playerColor('abc'));assert.match(playerColor('abc'),/^#[0-9a-f]{6}$/);
});
test('live server exposes distant living players to the locator without loading their avatars or inventory',t=>{
 const dir=mkdtempSync(join(tmpdir(),'orbit-locator-')),store=openStore(join(dir,'db'));t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 const game=new Game(store),out=[];const a=game.join({id:'alice',name:'Alice Player'},m=>out.push(m)),b=game.join({id:'bob',name:'Bob Player'},()=>{});
 Object.assign(a,{x:0,y:45,z:0});Object.assign(b,{x:350,y:45,z:350});game.tick(.05);const state=out.findLast(m=>m.type==='state');assert.ok(state.locators.some(p=>p.id===b.id));assert.ok(!state.players.some(p=>p.id===b.id));assert.deepEqual(Object.keys(state.locators.find(p=>p.id===b.id)).sort(),['id','name','x','y','z']);
 b.survival.health=0;game.tick(.05);assert.ok(!out.findLast(m=>m.type==='state').locators.some(p=>p.id===b.id));game.leave(b);game.tick(.05);assert.ok(!out.findLast(m=>m.type==='state').locators.some(p=>p.id===b.id));
});
