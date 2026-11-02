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
  await page.goto('http://127.0.0.1:8787/orbitcraft/');await page.locator('#dev-name').fill(name);await page.locator('#join').click();await page.locator('#gate').waitFor({state:'hidden',timeout:20000});
 }
 const [a,b]=contexts.map(c=>c.pages()[0]);
 await a.waitForFunction(()=>document.getElementById('online').textContent==='2 online');await b.waitForFunction(()=>document.getElementById('online').textContent==='2 online');
 await a.locator('#chat-button').click();await a.locator('#chat-input').fill('Hello from a real browser!');await a.locator('#chat-form button').click();await b.getByText('Hello from a real browser!',{exact:false}).last().waitFor();
 await a.locator('#inventory-button').click();await a.locator('#craft-button').click();await a.waitForFunction(()=>window.received.some(m=>m.type==='inventory'&&m.inventory[10]===4));await a.locator('[data-close="inventory"]').click();
 const initial=await a.evaluate(()=>window.received.find(m=>m.type==='welcome').you);
 await a.bringToFront();await a.locator('#world').click({position:{x:700,y:400}});await a.waitForFunction(()=>document.pointerLockElement?.id==='world');await a.waitForTimeout(150);await a.keyboard.down('w');await a.keyboard.down('Space');
 try{await b.waitForFunction(start=>window.received.some(m=>m.type==='state'&&m.players.some(p=>p.name.startsWith('BrowserAlice')&&Math.hypot(p.x-start.x,p.z-start.z)>.4)),initial,{timeout:12000});}
 finally{await a.keyboard.up('w');await a.keyboard.up('Space');}
 // Look down, place a block, and verify the OTHER browser receives the edit.
 await a.mouse.move(700,400);await a.mouse.move(1328,730,{steps:10});await a.waitForTimeout(150);await a.mouse.down({button:'right'});await a.mouse.up({button:'right'});
 await b.waitForFunction(()=>window.received.some(m=>m.type==='block'&&m.block===2),null,{timeout:6000});
 await a.mouse.move(1956,400,{steps:12});await a.waitForTimeout(500);await a.keyboard.press('Escape');await a.waitForFunction(()=>!document.pointerLockElement);await a.screenshot({path:artifacts+'/orbitcraft-desktop.png'});
 await a.locator('#inventory-button').click();await a.screenshot({path:artifacts+'/orbitcraft-inventory.png'});await a.locator('[data-close="inventory"]').click();
 const inventory=await a.evaluate(()=>window.received.filter(m=>m.type==='inventory').at(-1));await a.reload();await a.locator('#dev-name').fill('BrowserAlice'+suffix);await a.locator('#join').click();await a.locator('#gate').waitFor({state:'hidden'});assert.deepEqual(await a.evaluate(()=>window.received.find(m=>m.type==='welcome').inventory),inventory.inventory);
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});contexts.push(mobile);const p=await mobile.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:8787/orbitcraft/');await p.locator('#dev-name').fill('MobileCarol'+suffix);await p.locator('#join').click();await p.locator('#gate').waitFor({state:'hidden'});await p.waitForTimeout(1500);assert.equal(await p.locator('#touch-controls').isVisible(),true);await p.screenshot({path:artifacts+'/orbitcraft-mobile.png'});
 assert.deepEqual(errors,[]);console.log('PASS: two connected browsers; shared movement, block placement, chat, crafting, reconnect persistence; mobile controls; no JS errors.');
}finally{await browser.close();}
