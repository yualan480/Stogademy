import test from 'node:test';
import assert from 'node:assert/strict';
import {step,collides} from '../world.js';
const bank=(depth,roof=false)=>(x,y,z)=>{
 if(y===11-depth||x>=1&&y>=12-depth&&y<=11||roof&&y===13)return 3;
 if(x<1&&y>=12-depth&&y<=11)return 8;
 return 0;
};
test('players can jump out of one-block-deep water onto the bank at client and server rates',()=>{
 for(const dt of [1/60,.05])for(const start of [-1,.5,.69]){
  const get=bank(1),p={x:start,y:11.01,z:.5,yaw:-Math.PI/2,vy:0};
  for(let i=0;i<Math.ceil(2/dt);i++)step(p,{forward:p.x<1.5,jump:true},dt,get);
  assert.ok(p.x>1.3,`${dt}/${start}: escaped shallow water`);
  assert.ok(p.y>=12,`${dt}/${start}: reached dry bank`);
  assert.equal(collides(p,get),false);
 }
});
test('swimmers can rise from deep water and climb a bank without touching the bottom',()=>{
 for(const dt of [1/60,.05]){
  const get=bank(4),p={x:.5,y:9.5,z:.5,yaw:-Math.PI/2,vy:-2};
  for(let i=0;i<Math.ceil(3/dt);i++)step(p,{forward:p.x<1.5,jump:true},dt,get);
  assert.ok(p.x>1.3,`${dt}: climbed out of deep water`);assert.ok(p.y>=12);assert.equal(collides(p,get),false);
 }
});
test('swimming cannot pass through a solid roof or walk through the bank',()=>{
 for(const dt of [1/60,.05]){
  const get=bank(1,true),p={x:.5,y:11.01,z:.5,yaw:-Math.PI/2,vy:0};
  for(let i=0;i<Math.ceil(2/dt);i++)step(p,{forward:true,jump:true},dt,get);
  assert.ok(p.x<.71);assert.ok(p.y+1.8<13.01);assert.equal(collides(p,get),false);
  const q={x:.5,y:11.01,z:.5,yaw:-Math.PI/2,vy:0};
  for(let i=0;i<Math.ceil(1/dt);i++)step(q,{forward:true},dt,bank(1));
  assert.ok(q.x<.71);assert.ok(q.y<12);
 }
});
