import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const mime={js:'application/javascript',css:'text/css',html:'text/html',png:'image/png',mp3:'audio/mpeg',svg:'image/svg+xml'};
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://local').pathname;res.setHeader('Content-Type',mime[path.split('.').pop()]||'application/octet-stream');res.end(path==='/chatter/whg-test.html'?'<html><body></body></html>':await readFile(root+path));}catch{res.statusCode=404;res.end();}}).listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const base=`http://127.0.0.1:${server.address().port}`;
 for(const phone of [false,true]){
  const context=await browser.newContext(phone?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'}:{viewport:{width:1200,height:900}});
  const page=await context.newPage(),errors=[],failed=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&r.url().includes('worlds-hardest-game'))failed.push(r.url());});
  await page.goto(base+'/games/worlds-hardest-game/index.html');
  await page.waitForFunction(()=>loadedAssets>=TOTAL_ASSETS,null,{timeout:20000});
  const tap=async(x,y)=>{const point=await page.evaluate(([x,y])=>({x:cwh(x)+os.x,y:cwh(y)+os.y}),[x,y]);if(phone)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y,{delay:100});};
  await tap(400,280);await page.waitForFunction(()=>state==='main_menu');
  await tap(180,350);await page.waitForFunction(()=>state==='game',null,{timeout:15000});
  assert.equal(await page.evaluate(()=>level),1);assert.equal(await page.evaluate(()=>localStorage.getItem('whg_level')),'1');
  const x=await page.evaluate(()=>player.x);
  if(phone){const p=await page.evaluate(()=>({x:cwh(740)+os.x,y:cwh(480)+os.y}));const session=await context.newCDPSession(page);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y}]});await page.waitForTimeout(150);await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await page.keyboard.down('ArrowRight');await page.waitForTimeout(150);await page.keyboard.up('ArrowRight');}
  assert.ok(await page.evaluate(x=>player.x>x,x));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`/tmp/worlds-hardest-${phone?'phone':'desktop'}.png`});assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  await context.close();
 }
 const page=await browser.newPage();await page.goto(base+'/chatter/whg-test.html');await page.evaluate(async()=>{const {initUnblockedGames}=await import('/chatter/unblocked-games.js');document.body.innerHTML='<main></main>';initUnblockedGames({menuBtn:()=>'',bindMenu:()=>{},ic:()=>''}).render(document.querySelector('main'));});await page.getByRole('button',{name:'Play World’s Hardest Game',exact:true}).click();await page.frameLocator('#ub-game').locator('canvas').waitFor();await page.evaluate(()=>document.fullscreenElement?document.exitFullscreen():undefined);await page.getByRole('button',{name:'‹ Gallery',exact:true}).click();
 console.log('PASS World’s Hardest Game: real loader, menus and level 1, desktop keyboard and phone touch movement, saved progress, responsive layout, gallery launch/exit.');
}finally{await browser.close();server.close();}
