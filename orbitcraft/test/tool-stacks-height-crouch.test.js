import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Game} from '../server/game.js';
import {openStore} from '../server/db.js';
import {stackLimit} from '../items.js';
import {stacks} from '../inventory.js';
import {HEIGHT,inside,chunkIndex,step,collides,eyeHeight} from '../world.js';
import {DEFAULT_BINDS} from '../keybinds.js';
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'orbit-tools-')),path=join(dir,'world.db'),store=openStore(path);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});const g=new Game(store),p=g.join({id:'builder',name:'Builder'},()=>{});Object.assign(p,{x:.5,y:45.01,z:.5,yaw:0,pitch:-.8});p.inventory={120:3,10:64};p.hotbar=Array(9).fill(0);p.survival.layout=[];g.edits.set('1,45,0',23);return {g,p,store,path,send:m=>g.handle(p,m)};}
test('durable tools split legacy stacks into single slots; ordinary items keep stacks of 64',()=>{
 for(const id of [120,132,160,180,181,190,235])assert.equal(stackLimit(id),1);
 const p={inventory:{120:3,10:64},hotbar:[120],survival:{layout:[120],layoutCounts:[3]}};
 const s=stacks(p);assert.deepEqual(s.filter(v=>v?.id===120).map(v=>v.count),[1,1,1]);assert.equal(s.find(v=>v?.id===10).count,64);assert.equal(p.inventory[120],3);
});
test('clicks cannot merge tools, shift transfer uses separate chest slots, offhand takes one',t=>{
 const {g,p,send}=fixture(t);send({type:'container-open',kind:'hand'});const list=stacks(p),indices=list.flatMap((s,i)=>s?.id===120?[i]:[]);
 send({type:'container-click',area:'bag',index:indices[0]});send({type:'container-click',area:'bag',index:indices[1]});assert.deepEqual(p.survival.container.cursor,{id:120,count:1});assert.equal(stacks(p)[indices[1]].count,1);send({type:'container-close'});
 p.station={x:1,y:45,z:0};send({type:'container-open',kind:'chest'});
 for(let i=0;i<3;i++)send({type:'quick-move',area:'bag',index:stacks(p).findIndex(v=>v?.id===120)});
 assert.deepEqual(g.survival.state(p).chestSlots.filter(v=>v?.id===120).map(v=>v.count),[1,1,1]);assert.equal(g.survival.world.chests['1,45,0'][120],3);
 send({type:'quick-move',area:'chest',index:0,id:120,all:true});send({type:'container-close'});send({type:'offhand',item:120});assert.equal(p.survival.offhand.count,1);assert.equal(p.inventory[120],2);
});
test('tool drag distribution and full inventory cannot create oversized tool stacks',t=>{
 const {p,g,send}=fixture(t);send({type:'container-open',kind:'hand'});p.survival.container.cursor={id:120,count:3};send({type:'container-drag',slots:[0,1,2,3].map(index=>({area:'grid',index}))});assert.deepEqual(p.survival.container.grid.map(s=>s?.count||0),[1,1,1,0]);
 send({type:'container-close'});p.inventory={120:36};p.survival.layout=[];stacks(p);assert.throws(()=>g.survival.atomic(p,()=>p.inventory[120]++),/slots are full/);assert.equal(p.inventory[120],36);
});
test('blocks at Y319 are buildable, streamed and persisted; Y320 is rejected',t=>{
 const {g,p,path,store,send}=fixture(t);assert.equal(HEIGHT,320);assert.ok(inside(0,319,0));assert.equal(inside(0,320,0),false);
 Object.assign(p,{y:319.01,pitch:-.8});p.inventory={10:2};p.hotbar[0]=10;for(let z=-4;z<=1;z++)g.applyBlock({x:0,y:318,z},3);send({type:'place',block:10});assert.equal(p.inventory[10],1);const high=[...g.edits].find(([k,id])=>k.split(',')[1]==='319'&&id===10);assert.ok(high);const [x,y,z]=high[0].split(',').map(Number);assert.equal(g.chunk(Math.floor(x/16),Math.floor(z/16))[chunkIndex((x%16+16)%16,y,(z%16+16)%16)],10);
 g.leave(p);const next=new Game(openStore(path));try{assert.equal(next.get(x,319,z),10);}finally{next.store.close();}
 Object.assign(p,{y:320.01});p.lastEdit=-Infinity;assert.throws(()=>send({type:'place',block:10}),/Cannot place here/);assert.equal(p.inventory[10],1);assert.ok(collides({x:x+.5,y:320.01,z:z+.5},g.get)===false,'players can stand on the top block');
});
test('Left Shift crouches while held, slows movement, lowers eyes and protects ledges',()=>{
 assert.equal(DEFAULT_BINDS.sneak,'ShiftLeft');for(const dt of [1/60,.05]){const get=(x,y,z)=>y===10&&x===0?3:0,p={x:.5,y:11.01,z:.5,yaw:-Math.PI/2,vy:0};step(p,{sneak:true,forward:true},dt,get);assert.equal(p.crouching,true);assert.equal(eyeHeight(p),1.27);assert.ok(p.x-.5<=1.3*dt+.0001);for(let i=0;i<2/dt;i++)step(p,{sneak:true,forward:true},dt,get);assert.ok(p.x<1.3);assert.ok(p.y>=11);step(p,{},dt,get);assert.equal(p.crouching,false);assert.equal(eyeHeight(p),1.62);}
});
test('crouch stays down under a low ceiling until there is room to stand',()=>{
 const get=(x,y,z)=>y===9?3:y===10&&x===0?37:y===12&&z===0?3:0,p={x:.19,y:10.5,z:.5,yaw:0,vy:0,crouching:true};assert.equal(collides(p,get),false);assert.equal(collides({...p,crouching:false},get),true);step(p,{},.05,get);assert.equal(p.crouching,true);p.z=2;step(p,{},.05,get);assert.equal(p.crouching,false);
});
