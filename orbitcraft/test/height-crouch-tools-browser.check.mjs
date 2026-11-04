import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {Game} from '../server/game.js';
import {openStore} from '../server/db.js';
const dir=mkdtempSync(join(tmpdir(),'orbit-height-browser-')),port=18977,base=`http://127.0.0.1:${port}`,db=join(dir,'world.db');
const store=openStore(db),g=new Game(store),p=g.join({id:'dev-HighBuilder',name:'HighBuilder'},()=>{}),blocks=[];
for(let x=-5;x<=5;x++)for(let z=-6;z<=5;z++)blocks.push({x,y:318,z,block:3});store.commit(null,{blocks});Object.assign(p,{x:.5,y:319.01,z:.5,yaw:0,pitch:-.8});p.inventory={120:3,10:10};p.hotbar=[120,120,120,10,0,0,0,0,0];p.survival.layout=p.hotbar;p.survival.layoutCounts=[1,1,1,10];store.savePlayer(p);store.close();
const server=spawn(process.execPath,['server/index.js'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,PORT:String(port),ORBITCRAFT_DEV:'1',ORBITCRAFT_DB:db},stdio:'ignore'});let browser;
try{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/orbitcraft/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{window.sent=[];window.received=[];const W=WebSocket;window.WebSocket=class extends W{constructor(...a){super(...a);this.addEventListener('message',e=>received.push(JSON.parse(e.data)));}send(raw){sent.push(JSON.parse(raw));super.send(raw);}};});await page.goto(base+'/orbitcraft/?manualJoin=1');await page.evaluate(async()=>{const T=await import('/orbitcraft/vendor/three.module.js'),add=T.Scene.prototype.add;T.Scene.prototype.add=function(...objects){const cam=objects.find(o=>o.isPerspectiveCamera);if(cam)window.testCamera=cam;return add.apply(this,objects);};});await page.locator('#dev-name').fill('HighBuilder');await page.locator('#join').click();await page.locator('#gate').waitFor({state:'hidden'});await page.waitForFunction(()=>received.some(m=>m.type==='state'&&m.players.some(p=>p.y>318)));
 assert.deepEqual(await page.evaluate(()=>received.filter(m=>m.type==='survival').at(-1).state.slots.filter(v=>v?.id===120).map(v=>v.count)),[1,1,1]);await page.locator('#world').click();await page.waitForFunction(()=>!!document.pointerLockElement);await page.keyboard.down('ShiftLeft');await page.waitForFunction(()=>received.some(m=>m.type==='state'&&m.players.some(p=>p.crouching)));await page.keyboard.up('ShiftLeft');await page.waitForFunction(()=>received.filter(m=>m.type==='state').at(-1)?.players.some(p=>!p.crouching));
 await page.keyboard.press('4');await page.waitForTimeout(250);await page.mouse.click(550,425,{button:'right'});await page.waitForFunction(()=>received.some(m=>m.type==='block'&&m.y===319&&m.block===10));
 assert.ok(await page.evaluate(()=>sent.some(m=>m.type==='input'&&m.sneak)));assert.deepEqual(errors,[]);await page.screenshot({path:'/tmp/orbitcraft-height319.png'});console.log('PASS: real browser joins at sky height, receives separate tool slots, Left Shift crouch synchronizes on press/release, and right-click places a block at Y319 without JavaScript errors.');
}finally{if(browser)await browser.close();server.kill('SIGTERM');await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));rmSync(dir,{recursive:true,force:true});}
