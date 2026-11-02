import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const artifacts=process.env.ARTIFACT_DIR||'/workspace/artifacts';mkdirSync(artifacts,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const errors=[];const contexts=[];const suffix=Date.now().toString(36);
try{
 for(const name of ['BrowserAlice'+suffix,'BrowserBob'+suffix]){
  const context=await browser.newContext({viewport:{width:1365,height:850}});contexts.push(context);const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.received=[];const Original=window.WebSocket;window.WebSocket=class extends Original{constructor(...args){super(...args);this.addEventListener('message',event=>{const m=JSON.parse(event.data);window.received.push(m);if(window.received.length>800)window.received.shift();});}};});
  await page.goto((process.env.ORBITCRAFT_TEST_URL||'http://127.0.0.1:8787')+'/orbitcraft/');await page.locator('#dev-name').fill(name);await page.locator('#join').click();await page.locator('#gate').waitFor({state:'hidden',timeout:20000});
 }
 const [a,b]=contexts.map(c=>c.pages()[0]);
 await a.waitForFunction(()=>document.getElementById('online').textContent==='2 online');await b.waitForFunction(()=>document.getElementById('online').textContent==='2 online');
 await a.locator('#chat-button').click();await a.locator('#chat-input').fill('Hello from a real browser!');await a.locator('#chat-form button').click();await b.getByText('Hello from a real browser!',{exact:false}).last().waitFor();
 await a.locator('#inventory-button').click();await a.locator('#recipe-list').selectOption('planks');await a.locator('#recipe-output').click();await a.waitForFunction(()=>window.received.some(m=>m.type==='inventory'&&m.inventory[10]===4));await a.locator('[data-close="inventory"]').click();
 const initial=await a.evaluate(()=>window.received.find(m=>m.type==='welcome').you);
 await a.bringToFront();await a.locator('#world').click({position:{x:700,y:400}});await a.waitForFunction(()=>document.pointerLockElement?.id==='world');await a.waitForTimeout(150);await a.keyboard.down('w');await a.keyboard.down('Space');
 try{await b.waitForFunction(start=>window.received.some(m=>m.type==='state'&&m.players.some(p=>p.name.startsWith('BrowserAlice')&&Math.hypot(p.x-start.x,p.z-start.z)>.4)),initial,{timeout:12000});}
 finally{await a.keyboard.up('w');await a.keyboard.up('Space');}
 // Place dirt to exercise timed cracks and actual item collection.
 await a.keyboard.press('Digit1');await a.mouse.move(700,400);await a.mouse.move(1328,730,{steps:10});await a.waitForTimeout(150);await a.mouse.down({button:'right'});await a.mouse.up({button:'right'});
 await b.waitForFunction(()=>window.received.some(m=>m.type==='block'&&m.block===2),null,{timeout:6000});
 const placed=await b.evaluate(()=>window.received.find(m=>m.type==='block'&&m.block===2));await a.waitForTimeout(900);
 // Inspect the real rendered scene in the test only; production exposes no debug API.
 await a.evaluate(async()=>{const THREE=await import('/orbitcraft/vendor/three.module.js');const add=THREE.Scene.prototype.add;THREE.Scene.prototype.add=function(...objects){if(this.children.some(o=>o.isCamera))window.testScene=this;return add.apply(this,objects);};});
 let look=await a.evaluate(({id,block})=>{const p=window.received.filter(m=>m.type==='state').at(-1).players.find(p=>p.id===id),dx=block.x+.5-p.x,dz=block.z+.5-p.z,dy=block.y+.5-p.y-1.62;return {dx:(p.yaw-Math.atan2(-dx,-dz))/.0025,dy:(p.pitch-Math.atan2(dy,Math.hypot(dx,dz)))/.0025,distance:Math.hypot(dx,dz)};},{id:initial.id,block:placed});
 if(look.distance<=1.6){
  await a.keyboard.down('s');await a.keyboard.down('Space');try{await a.waitForFunction(({id,block})=>{const p=window.received.filter(m=>m.type==='state').at(-1)?.players.find(p=>p.id===id);return p&&Math.hypot(p.x-block.x-.5,p.z-block.z-.5)>2.25;},{id:initial.id,block:placed},{timeout:6000});}finally{await a.keyboard.up('s');await a.keyboard.up('Space');}
  await a.waitForTimeout(900);
  look=await a.evaluate(({id,block})=>{const p=window.received.filter(m=>m.type==='state').at(-1).players.find(p=>p.id===id),dx=block.x+.5-p.x,dz=block.z+.5-p.z,dy=block.y+.5-p.y-1.62;return {dx:(p.yaw-Math.atan2(-dx,-dz))/.0025,dy:(p.pitch-Math.atan2(dy,Math.hypot(dx,dz)))/.0025,distance:Math.hypot(dx,dz)};},{id:initial.id,block:placed});
 }
 assert.ok(look.distance>1.35,'Mine from outside the pickup radius to observe the floating item.');
 const beforeMining=await a.evaluate(()=>window.received.filter(m=>m.type==='inventory').at(-1).inventory[2]);
 await a.mouse.move(1328+look.dx,730+look.dy,{steps:8});await a.mouse.down({button:'left'});
 try{
  await b.waitForFunction(id=>window.received.some(m=>m.type==='state'&&m.players.some(p=>p.id===id&&p.mining?.progress>.1)),initial.id,{timeout:8000});
  await a.waitForFunction(block=>!!window.testScene?.getObjectByName(`mining:${block.x},${block.y},${block.z}`),placed);
  await a.screenshot({path:artifacts+'/orbitcraft-mining-cracks.png'});
  await b.waitForFunction(block=>window.received.some(m=>m.type==='block'&&m.block===0&&m.x===block.x&&m.y===block.y&&m.z===block.z),placed,{timeout:12000});
 }finally{await a.mouse.up({button:'left'});}
 const drop=await b.evaluate(()=>window.received.find(m=>m.type==='drop')?.drop);assert.ok(drop);assert.equal(drop.block,2);
 await a.waitForFunction(id=>!!window.testScene?.getObjectByName('drop:'+id),drop.id);
 const rotation=await a.evaluate(id=>window.testScene.getObjectByName('drop:'+id).children[0].rotation.y,drop.id);
 await a.waitForFunction(({id,angle})=>window.testScene?.getObjectByName('drop:'+id)?.children[0].rotation.y!==angle,{id:drop.id,angle:rotation},{timeout:10000});
 assert.notEqual(await a.evaluate(id=>window.testScene.getObjectByName('drop:'+id).children[0].rotation.y,drop.id),rotation);
 assert.equal(await a.evaluate(()=>window.received.filter(m=>m.type==='inventory').at(-1).inventory[2]),beforeMining,'Breaking must not grant the block straight to inventory.');
 await a.screenshot({path:artifacts+'/orbitcraft-floating-drop.png'});
 await a.keyboard.down('w');await a.keyboard.down('Space');try{await a.waitForFunction(id=>window.received.some(m=>m.type==='pickup'&&m.id===id),drop.id,{timeout:12000});}finally{await a.keyboard.up('w');await a.keyboard.up('Space');}
 await a.waitForFunction(count=>window.received.some(m=>m.type==='inventory'&&m.inventory[2]===count),beforeMining+drop.count);
 assert.ok(!/^\+\d/.test(await a.locator('#toast').textContent()),'Pickup must not show an item notification.');assert.equal(await a.locator('#mining-progress').count(),0);
 await a.keyboard.press('Escape');await a.waitForFunction(()=>!document.pointerLockElement);await a.screenshot({path:artifacts+'/orbitcraft-desktop.png'});
 await a.locator('#inventory-button').click();await a.screenshot({path:artifacts+'/orbitcraft-inventory.png'});await a.locator('[data-close="inventory"]').click();
 const inventory=await a.evaluate(()=>window.received.filter(m=>m.type==='inventory').at(-1));await a.reload();await a.locator('#dev-name').fill('BrowserAlice'+suffix);await a.locator('#join').click();await a.locator('#gate').waitFor({state:'hidden'});assert.deepEqual(await a.evaluate(()=>window.received.find(m=>m.type==='welcome').inventory),inventory.inventory);
 await Promise.all(contexts.map(context=>context.close()));
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});contexts.push(mobile);const p=await mobile.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto((process.env.ORBITCRAFT_TEST_URL||'http://127.0.0.1:8787')+'/orbitcraft/');await p.locator('#dev-name').fill('MobileCarol'+suffix);await p.locator('#join').click();await p.locator('#gate').waitFor({state:'hidden'});await p.waitForTimeout(1500);assert.equal(await p.locator('#touch-controls').isVisible(),true);await p.screenshot({path:artifacts+'/orbitcraft-mobile.png'});
 assert.deepEqual(errors,[]);console.log('PASS: two connected browsers; shared movement, timed mining/cracks, rotating world drops, proximity pickup, building, chat, crafting, reconnect persistence; mobile controls; no JS errors.');
}finally{await browser.close();}
