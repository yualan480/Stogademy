import test from 'node:test';
import assert from 'node:assert/strict';
import {applyKnockback} from '../server/knockback.js';
import {collides} from '../world.js';
import {damageTilt,createDamageTilt} from '../damage-camera.js';
const floor=(x,y,z)=>y===10?3:0;
test('small knockback pushes away from the attacker and gives a short lift',()=>{const p={x:0,y:11.01,z:0,vy:0};applyKnockback(p,{x:0,z:1},floor);assert.ok(Math.abs(p.z+.35)<1e-9);assert.equal(p.vy,3);assert.equal(collides(p,floor),false);});
test('knockback stops at walls and still works for overlapping entities',()=>{const get=(x,y,z)=>y===10||z===-1&&y===11?3:0,p={x:.5,y:11.01,z:.6};applyKnockback(p,{x:.5,z:1},get);assert.ok(p.z>=.3&&p.z<.6);assert.equal(collides(p,get),false);const same={x:.5,y:11.01,z:.5};applyKnockback(same,{x:.5,z:.5,yaw:0},floor);assert.ok(same.z<.5);});
test('damage tilt settles completely after 360ms and respects reduced motion',()=>{assert.deepEqual(damageTilt(-1),{roll:0,pitch:0});assert.ok(Math.abs(damageTilt(150).roll)>.08);assert.ok(Math.abs(damageTilt(150,true).roll)<.02);assert.deepEqual(damageTilt(360),{roll:0,pitch:0});const effect=createDamageTilt();effect.hit(1000);assert.ok(effect.sample(1150).roll<0);effect.hit(2000);assert.ok(effect.sample(2150).roll>0);effect.clear();assert.deepEqual(effect.sample(2150),{roll:0,pitch:0});});
