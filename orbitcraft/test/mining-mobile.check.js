import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const artifacts=process.env.ARTIFACT_DIR||'/workspace/artifacts';mkdirSync(artifacts,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.received=[];const WS=WebSocket;window.WebSocket=class extends WS{constructor(...args){super(...args);this.addEventListener('message',e=>window.received.push(JSON.parse(e.data)));}};});
 await page.goto('http://127.0.0.1:8787/orbitcraft/');assert.equal(await page.locator('#touch-controls').isVisible(),false);
 await page.locator('#dev-name').fill('Touch'+Date.now().toString(36));await page.locator('#join').click();await page.locator('#gate').waitFor({state:'hidden'});assert.equal(await page.locator('#touch-controls').isVisible(),true);
 const cdp=await context.newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:195,y:380}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:195,y:520}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const box=await page.locator('#touch-mine').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
 try{await page.waitForFunction(()=>window.received.some(m=>m.type==='state'&&m.players.some(p=>p.mining?.progress>0)),null,{timeout:12000});await page.waitForFunction(()=>window.received.some(m=>m.type==='drop'),null,{timeout:12000});}
 finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 await page.waitForFunction(()=>window.received.filter(m=>m.type==='state').at(-1).players.every(p=>!p.mining));assert.deepEqual(errors,[]);
 await page.screenshot({path:artifacts+'/orbitcraft-mining-mobile.png'});
 console.log('PASS: unobstructed mobile join, real touch hold-to-mine, item drop and release-to-cancel, no browser errors.');
}finally{await browser.close();}
