import test from 'node:test';
import assert from 'node:assert/strict';
import {matchGrid} from '../crafting-grid.js';
import {blockBoxes,inShape} from '../shapes.js';
import {step,collides,solid} from '../world.js';
const grid=a=>a.map(id=>id?{id,count:1}:null);
test('six planks craft four stairs in either mirrored pattern, only at a table',()=>{
 for(const a of [[10,0,0,10,10,0,10,10,10],[0,0,10,0,10,10,10,10,10]]){
 const r=matchGrid(grid(a),3);assert.equal(r?.out,34);assert.equal(r.count,4);
 a[4]=0;assert.equal(matchGrid(grid(a),3),null);
 }
 assert.notEqual(matchGrid(grid([10,10,10,10]),2)?.out,34);
});
test('six planks and one stick craft three signs, missing materials do not',()=>{
 const a=[10,10,10,10,10,10,0,100,0];assert.equal(matchGrid(grid(a),3)?.out,38);assert.equal(matchGrid(grid(a),3)?.count,3);
 a[7]=0;assert.equal(matchGrid(grid(a),3),null);
 assert.equal(solid(38),false);assert.equal(inShape(38,.5,.8,.5),true);assert.equal(inShape(38,.05,.8,.5),false);
});
test('stairs have two half-height steps, rotated in all four directions',()=>{
 for(let id=34;id<=37;id++){assert.equal(blockBoxes(id).length,2);assert.equal(inShape(id,.25,.25,.25),true);}
 assert.equal(inShape(34,.5,.75,.25),true);assert.equal(inShape(34,.5,.75,.75),false);
 assert.equal(inShape(37,.75,.75,.5),true);assert.equal(inShape(37,.25,.75,.5),false);
});
test('stairs can be walked up at client and server rates without jumping, but walls cannot',()=>{
 for(const dt of [1/60,.05]){
 const get=(x,y,z)=>y===10?3:x===1&&y===11?37:x>=2&&y===11?3:0;
 const p={x:.4,y:11.01,z:.5,yaw:-Math.PI/2,vy:0};
 for(let i=0;i<Math.ceil(1/dt);i++)step(p,{forward:true},dt,get);
 assert.ok(p.x>2,`${dt}: x=${p.x}, y=${p.y}`);assert.ok(p.y>=12);assert.equal(collides(p,get),false);
 const wall=(x,y,z)=>y===10||x>=1&&y===11?3:0,q={x:.4,y:11.01,z:.5,yaw:-Math.PI/2,vy:0};
 for(let i=0;i<Math.ceil(1/dt);i++)step(q,{forward:true},dt,wall);
 assert.ok(q.x<.71);
 }
});

import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Game} from '../server/game.js';
import {openStore} from '../server/db.js';
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'orbit-stairs-')),store=openStore(join(dir,'world.db'));t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});const g=new Game(store),p=g.join({id:'builder',name:'Builder'},()=>{});Object.assign(p,{x:.5,y:45.01,z:.5,yaw:0,pitch:-.8});p.inventory={10:6,100:1};p.hotbar=Array(9).fill(0);p.survival.layout=[];g.edits.set('1,45,0',18);return {g,p,send:m=>g.handle(p,m)};}
test('server crafting consumes the six planks and stick once and returns three signs',t=>{
 const {p,send}=fixture(t);p.station={x:1,y:45,z:0};send({type:'container-open',kind:'table'});
 send({type:'container-click',area:'bag',index:p.survival.layout.indexOf(10)});
 for(const index of [0,1,2,3,4,5])send({type:'container-click',area:'grid',index,right:true});
 send({type:'container-click',area:'bag',index:p.survival.layout.indexOf(100)});send({type:'container-click',area:'grid',index:7});send({type:'container-craft'});
 assert.deepEqual(p.survival.container.cursor,{id:38,count:3});send({type:'container-close'});assert.equal(p.inventory[38],3);assert.equal(p.inventory[10]||0,0);assert.equal(p.inventory[100]||0,0);
});
test('stairs rotate on placement, spend one item and mine back to canonical stairs; signs place and drop',t=>{
 const {g,p,send}=fixture(t);
 for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++){g.edits.set(`${x},44,${z}`,3);for(let y=45;y<=49;y++)g.edits.set(`${x},${y},${z}`,0);}
 p.inventory={34:4,38:3};p.hotbar[0]=34;
 for(let i=0;i<4;i++){
 p.yaw=i*Math.PI/2;p.lastEdit=-Infinity;send({type:'place',block:34});
 const entry=[...g.edits].find(([key,id])=>id===34+i);assert.ok(entry,`rotation ${i} placed`);assert.equal(p.inventory[34],3-i);
 const [x,y,z]=entry[0].split(',').map(Number);g.survival.mine(p,{x,y,z,block:34+i});assert.equal(g.get(x,y,z),0);
 }
 assert.equal([...g.drops.values()].filter(d=>d.block===34).reduce((n,d)=>n+d.count,0),4);
 p.hotbar[0]=38;p.yaw=0;p.lastEdit=-Infinity;send({type:'place',block:38});assert.equal(p.inventory[38],2);const entry=[...g.edits].find(([k,id])=>id===38);assert.ok(entry);const [x,y,z]=entry[0].split(',').map(Number);g.survival.mine(p,{x,y,z,block:38});assert.equal([...g.drops.values()].find(d=>d.block===38)?.count,1);
});
