import test from 'node:test';
import assert from 'node:assert/strict';
import {lookingIntoEyes,endermanTarget} from '../server/enderman.js';
const mob=()=>({x:.5,y:11.01,z:.5,yaw:0}),air=()=>0;
function viewer(m=mob(),id='viewer'){const p={id,x:.5,y:11.01,z:-4.5};return aim(p,{x:m.x,y:m.y+2.535,z:m.z-.255});}
function aim(p,target){return {...p,yaw:Math.atan2(-(target.x-p.x),-(target.z-p.z)),pitch:Math.atan2(target.y-(p.y+1.62),Math.hypot(target.x-p.x,target.z-p.z))};}
test('only looking directly at the front eye strip provokes an Enderman',()=>{const m=mob(),p=viewer(m);assert.equal(lookingIntoEyes(p,m,air),true);assert.equal(lookingIntoEyes(aim(p,{x:m.x,y:m.y+1,z:m.z}),m,air),false);assert.equal(lookingIntoEyes(aim(p,{x:m.x,y:m.y+2.75,z:m.z}),m,air),false);assert.equal(lookingIntoEyes({...p,yaw:p.yaw+.2},m,air),false);assert.equal(lookingIntoEyes(aim({...p,z:5},{x:m.x,y:m.y+2.535,z:m.z-.255}),m,air),false);});
test('walls and range prevent eye contact',()=>{const m=mob(),p=viewer(m);assert.equal(lookingIntoEyes(p,m,(x,y,z)=>z===-2?3:0),false);const far=aim({...p,z:-20},{x:m.x,y:m.y+2.535,z:m.z-.255});assert.equal(lookingIntoEyes(far,m,air),false);});
test('aggression is bound to the player who made eye contact, not a closer bystander',()=>{const m=mob(),watcher=viewer(m),bystander={id:'bystander',x:1,y:11.01,z:1,yaw:0,pitch:0};assert.equal(endermanTarget(m,[bystander,watcher],air),watcher);assert.equal(m.angry,true);assert.equal(endermanTarget(m,[bystander,{...watcher,yaw:0}],air).id,watcher.id);assert.equal(endermanTarget(m,[bystander,{...watcher,z:-30,yaw:0}],air),undefined);assert.equal(m.angry,false);});
test('legacy angry flags and damage animations cannot provoke attacks without eye contact',()=>{const m={...mob(),angry:true,hurt:123},p={id:'body',x:.5,y:11.01,z:-4.5,yaw:Math.PI,pitch:0};assert.equal(endermanTarget(m,[p],air),undefined);assert.equal(m.angry,false);});
