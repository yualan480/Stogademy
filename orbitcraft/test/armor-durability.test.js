import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../server/db.js';
import {Game} from '../server/game.js';
import {ITEMS} from '../items.js';
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'orbit-armor-')),store=openStore(join(dir,'db')),g=new Game(store),p=g.join({id:'armor',name:'Armor'},()=>{});t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});p.survival.equipment={helmet:190,chestplate:191,leggings:192,boots:193};p.survival.durability={};return {store,g,p};}
test('armor durability matches material and equipment slot',()=>{for(const [base,values]of [[190,[165,240,225,195]],[200,[363,528,495,429]],[210,[407,592,555,481]],[220,[77,112,105,91]]])assert.deepEqual([0,1,2,3].map(i=>ITEMS[base+i].durability),values);});
test('damage wears every equipped armor piece and saves its remaining durability',t=>{const {store,g,p}=fixture(t);g.survival.atomic(p,tx=>g.survival.applyDamage(p,8,null,tx));for(const id of [190,191,192,193])assert.equal(p.survival.durability[id],ITEMS[id].durability-2);assert.deepEqual(store.loadPlayer(p.id).survival.durability,p.survival.durability);});
test('armor breaks at zero, unequips, and no longer provides protection on the next hit',t=>{const {g,p}=fixture(t);p.survival.equipment={helmet:190};p.survival.durability[190]=1;g.survival.atomic(p,tx=>g.survival.applyDamage(p,2,null,tx));assert.equal(p.survival.equipment.helmet,undefined);assert.equal(p.survival.durability[190],undefined);const health=p.survival.health;g.survival.atomic(p,tx=>g.survival.applyDamage(p,2,null,tx));assert.equal(p.survival.health,health-2);});
test('failed persistence restores armor durability and equipped pieces',t=>{const {store,g,p}=fixture(t);p.survival.durability[190]=1;const before=structuredClone(p.survival),commit=store.commit;store.commit=()=>{throw Error('failed save');};assert.throws(()=>g.survival.atomic(p,tx=>g.survival.applyDamage(p,8,null,tx)),/failed save/);assert.deepEqual(p.survival,before);store.commit=commit;});

test('breaking equipped armor preserves a spare of the same type in the inventory',t=>{const {g,p}=fixture(t);p.survival.equipment={helmet:190};p.survival.durability[190]=1;p.inventory[190]=1;g.survival.atomic(p,tx=>g.survival.applyDamage(p,2,null,tx));assert.equal(p.survival.equipment.helmet,undefined);assert.equal(p.inventory[190],1);});
