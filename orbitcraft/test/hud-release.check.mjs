import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {RELEASE} from '../release.js';
const dir=mkdtempSync(join(tmpdir(),'orbit-hud-')),port=18972,base=`http://127.0.0.1:${port}`,artifacts='/workspace/artifacts';mkdirSync(artifacts,{recursive:true});
const child=spawn(process.execPath,['server/index.js'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,PORT:String(port),ORBITCRAFT_DEV:'1',ORBITCRAFT_DB:join(dir,'world.db')},stdio:'ignore'});let browser;
try{
 let ready=false;for(let i=0;i<80;i++){try{if((await fetch(base+'/orbitcraft/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);assert.equal((await(await fetch(base+'/orbitcraft/health')).json()).release,RELEASE);
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
 for(const mode of ['desktop','mobile','embedded']){
  const context=await browser.newContext(mode==='mobile'?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1100,height:760}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));let game;
  if(mode==='embedded'){
   await page.route('**/__hud_embed',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><style>body{margin:0;height:100dvh;display:flex;flex-direction:column}header{height:56px;flex-shrink:0}iframe{flex:1;min-height:0;width:100%;border:0}</style><header>Orbitcraft</header><iframe src="/orbitcraft/" title="Orbitcraft multiplayer sandbox"></iframe>`}));
   await page.goto(base+'/__hud_embed');game=page.frames().find(f=>f.url().includes('/orbitcraft/?manualJoin=1'));assert.ok(game);
  }else{await page.goto(base+'/orbitcraft/?manualJoin=1');game=page;}
  await game.locator('#dev-name').fill('Hud'+mode);await game.locator('#join').click();await game.locator('#gate').waitFor({state:'hidden'});await game.waitForFunction(()=>document.querySelectorAll('#health-meter span').length===10);
  const info=await game.evaluate(()=>{const $=id=>document.getElementById(id),rect=id=>{const r=$(id).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};return {release:document.querySelector('meta[name="orbitcraft-release"]').content,hearts:$('health-meter').children.length,hunger:$('hunger-meter').children.length,slots:$('hotbar').children.length,heart:getComputedStyle($('health-meter').firstChild,'::after').backgroundImage,food:getComputedStyle($('hunger-meter').firstChild,'::after').backgroundImage,visible:getComputedStyle($('survival-hud')).visibility,display:getComputedStyle($('survival-hud')).display,hud:rect('survival-hud'),bar:rect('hotbar'),width:innerWidth,height:innerHeight};});
  assert.equal(info.release,RELEASE);assert.equal(info.hearts,10);assert.equal(info.hunger,10);assert.equal(info.slots,9);assert.ok(info.heart.includes('heart.svg'));assert.ok(info.food.includes('hunger.svg'));assert.equal(info.visible,'visible');assert.notEqual(info.display,'none');assert.equal(info.hud.width,info.bar.width);
  for(const r of [info.hud,info.bar]){assert.ok(r.x>=0&&r.y>=0&&r.right<=info.width+1&&r.bottom<=info.height+1,`${mode}: HUD outside visible viewport`);}
  assert.ok(info.hud.bottom<info.bar.y);for(const asset of ['heart','heart-empty','hunger','hunger-empty'])assert.equal((await context.request.get(base+'/orbitcraft/assets/hud/'+asset+'.svg')).status(),200);
  if(mode==='desktop'){await page.screenshot({path:artifacts+'/orbitcraft-hud-confirmed.png',clip:{x:Math.floor(info.bar.x)-4,y:Math.floor(info.hud.y)-4,width:Math.ceil(info.bar.width)+8,height:Math.ceil(info.bar.bottom-info.hud.y)+8}});}
  assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${mode}: visible pixel hearts, drumsticks and nine gray slots; aligned and inside viewport; release ${RELEASE}.`);
 }
}finally{if(browser)await browser.close();child.kill('SIGTERM');await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));rmSync(dir,{recursive:true,force:true});}
