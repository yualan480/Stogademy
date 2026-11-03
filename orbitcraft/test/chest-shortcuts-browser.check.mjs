import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {Game} from '../server/game.js';
import {openStore} from '../server/db.js';
const dir=mkdtempSync(join(tmpdir(),'orbit-chest-shortcuts-')),db=join(dir,'world.db'),port=18983,base=`http://127.0.0.1:${port}`;
const store=openStore(db),g=new Game(store),p=g.join({id:'dev-ChestKeys',name:'ChestKeys'},()=>{}),blocks=[];for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++){blocks.push({x,y:44,z,block:3});for(let y=45;y<49;y++)blocks.push({x,y,z,block:0});}blocks.push({x:0,y:45,z:-2,block:23});store.commit(null,{blocks});Object.assign(p,{x:.5,y:45.01,z:.5,yaw:0,pitch:-.4});p.inventory={5:130};p.hotbar=[5,0,0,0,0,0,0,0,0];p.survival.layout=[];store.savePlayer(p);store.close();
const server=spawn(process.execPath,['server/index.js'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,PORT:String(port),ORBITCRAFT_DEV:'1',ORBITCRAFT_DB:db},stdio:'ignore'});let browser;
try{for(let i=0;i<80;i++){try{if((await fetch(base+'/orbitcraft/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/orbitcraft/');await page.locator('#dev-name').fill('ChestKeys');await page.locator('#join').click();await page.locator('#gate').waitFor({state:'hidden'});await page.locator('#world').click();await page.waitForFunction(()=>!!document.pointerLockElement);await page.mouse.click(550,400,{button:'right'});await page.locator('#inventory[data-station="chest"][open]').waitFor();assert.equal(await page.locator('#chest-items button').count(),27);
 await page.locator('#inventory-hotbar button').first().dblclick({modifiers:['Shift']});await page.waitForFunction(()=>[...document.querySelectorAll('#chest-items button')].reduce((sum,b)=>sum+(Number(b.title.match(/Oak log \((\d+)\)/)?.[1])||0),0)===130);
 await page.locator('#chest-items button').first().dblclick({modifiers:['Shift']});await page.waitForFunction(()=>[...document.querySelectorAll('#inventory-grid button,#inventory-hotbar button')].reduce((sum,b)=>sum+(Number(b.title.match(/Oak log \((\d+)\)/)?.[1])||0),0)===130);
 await page.locator('#inventory-hotbar button').first().click();await page.locator('#carried-item:not([hidden])').waitFor();const chest=page.locator('#chest-items button');const start=await chest.first().boundingBox();await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();for(let i=1;i<4;i++){const r=await chest.nth(i).boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);}await page.mouse.up();await page.locator('#carried-item').waitFor({state:'hidden'});await page.waitForFunction(()=>[...document.querySelectorAll('#chest-items button')].slice(0,4).every(b=>b.title==='Oak log (16)'));
 assert.deepEqual(errors,[]);console.log('PASS: real chest opening, 27 slots, Shift-double all-type transfers in both directions, even drag split retains four separate 16-item stacks, no JS errors');
}finally{if(browser)await browser.close();server.kill('SIGTERM');await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));rmSync(dir,{recursive:true,force:true});}
