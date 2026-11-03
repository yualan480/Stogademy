import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {openStore} from '../server/db.js';
import {Game} from '../server/game.js';
const dir=mkdtempSync(join(tmpdir(),'orbit-pvp-browser-')),db=join(dir,'world.db'),port=18974,base=`http://127.0.0.1:${port}`;
const store=openStore(db),g=new Game(store),a=g.join({id:'dev-PvpAttacker',name:'PvpAttacker'},()=>{}),b=g.join({id:'dev-PvpVictim',name:'PvpVictim'},()=>{}),blocks=[];
for(let x=-5;x<=5;x++)for(let z=-5;z<=5;z++){blocks.push({x,y:44,z,block:3});for(let y=45;y<=48;y++)blocks.push({x,y,z,block:0});}
store.commit(null,{blocks});Object.assign(a,{x:.5,y:45.01,z:.5,yaw:0,pitch:0});Object.assign(b,{x:.5,y:45.01,z:-1.5,yaw:Math.PI,pitch:0});a.inventory[122]=1;a.hotbar=[122,2,3,5,0,0,0,0,0];b.survival.health=8;store.savePlayer(a);store.savePlayer(b);store.saveSurvival(g.survival.world);store.close();
const server=spawn(process.execPath,['server/index.js'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,PORT:String(port),ORBITCRAFT_DEV:'1',ORBITCRAFT_DB:db},stdio:'ignore'});let browser;
try{
 let ready=false;for(let i=0;i<80;i++){try{if((await fetch(base+'/orbitcraft/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
 const pages=[],errors=[];
 for(const name of ['PvpAttacker','PvpVictim']){
  const context=await browser.newContext({viewport:{width:1100,height:760}}),page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.received=[];const Original=WebSocket;window.WebSocket=class extends Original{constructor(...args){super(...args);this.addEventListener('message',e=>window.received.push(JSON.parse(e.data)));}};});
  await page.goto(base+'/orbitcraft/?manualJoin=1');await page.locator('#dev-name').fill(name);await page.locator('#join').click();await page.locator('#gate').waitFor({state:'hidden'});
 }
 const [attacker,victim]=pages;await attacker.bringToFront();await attacker.locator('#world').click({position:{x:550,y:380}});await attacker.waitForFunction(()=>document.pointerLockElement?.id==='world');await attacker.mouse.down();
 try{
  await victim.waitForFunction(()=>window.received.some(m=>m.type==='combat'&&m.target==='dev-PvpVictim'&&m.damage===4));
  await victim.waitForFunction(()=>window.received.some(m=>m.type==='combat'&&m.killed));await victim.locator('#death-screen').waitFor({state:'visible'});
  assert.ok(await attacker.evaluate(()=>window.received.some(m=>m.type==='combat'&&m.attacker==='dev-PvpAttacker')));
 }finally{await attacker.mouse.up();}
 mkdirSync('/workspace/artifacts',{recursive:true});await victim.screenshot({path:'/workspace/artifacts/orbitcraft-pvp-death.png'});
 await victim.bringToFront();await victim.locator('#respawn').click();await victim.locator('#death-screen').waitFor({state:'hidden'});await victim.waitForFunction(()=>document.getElementById('health-meter').getAttribute('aria-label')==='Health 20 of 20');
 assert.deepEqual(errors,[]);console.log('PASS: two actual browsers: hold-left attack damages another player, both receive combat events, victim sees death/loot flow, respawn restores real 20-HP HUD, no JS errors.');
}finally{if(browser)await browser.close();server.kill('SIGTERM');await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));rmSync(dir,{recursive:true,force:true});}
