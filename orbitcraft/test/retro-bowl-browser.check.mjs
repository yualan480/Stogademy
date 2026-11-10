import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const mime={js:'application/javascript',css:'text/css',html:'text/html',png:'image/png',webp:'image/webp',ogg:'audio/ogg',svg:'image/svg+xml',txt:'text/plain'};
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://local').pathname;res.setHeader('Content-Type',mime[path.split('.').pop()]||'application/octet-stream');res.end(path==='/chatter/retro-test.html'?'<html><body></body></html>':await readFile(root+path));}catch{res.statusCode=404;res.end();}}).listen(0,'127.0.0.1');
await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[],failed=[],external=[];
 const base=`http://127.0.0.1:${server.address().port}`;
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400&&r.url().includes('/retro-bowl/')&&!/\/(?:optiondata\.dat|savedata[2-5]?\.ini)$/.test(r.url()))failed.push(r.url());});
 page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))external.push(r.url());});
 await page.goto(base+'/games/retro-bowl/index.html');
 await page.waitForTimeout(6000);
 console.log('Runtime errors:',errors,'Failed assets:',failed);
 await page.screenshot({path:'/tmp/retro-bowl-desktop.png'});
 for(const viewport of [{width:1200,height:800},{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(viewport);await page.waitForTimeout(600);
  console.log('Canvas',await page.locator('canvas').evaluate(e=>({w:e.width,h:e.height,rect:e.getBoundingClientRect().toJSON()})));
  assert.ok(await page.locator('canvas').evaluate(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1}));
 }
 await page.setViewportSize({width:960,height:540});await page.waitForTimeout(600);
 const before=await page.locator('canvas').screenshot();
 await page.locator('canvas').click({position:{x:700,y:130},delay:120});await page.waitForTimeout(800);
 await page.screenshot({path:'/tmp/retro-bowl-after-click.png'});
 assert.notDeepEqual(await page.locator('canvas').screenshot(),before,'New Game should respond to input');
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(external,[]);
 await page.goto(base+'/chatter/retro-test.html');
 await page.evaluate(async()=>{const {initUnblockedGames}=await import('/chatter/unblocked-games.js');document.body.innerHTML='<main></main>';initUnblockedGames({menuBtn:()=>'',bindMenu:()=>{},ic:()=>''}).render(document.querySelector('main'));});
 await page.getByRole('button',{name:'Play Retro Bowl',exact:true}).click();
 await page.frameLocator('#ub-game').locator('canvas').waitFor();
 await page.waitForTimeout(6000);assert.equal(await page.locator('#ub-game').getAttribute('src'),'../games/retro-bowl/index.html');
 await page.evaluate(()=>document.fullscreenElement?document.exitFullscreen():undefined);
 await page.getByRole('button',{name:'‹ Gallery',exact:true}).click();assert.equal(await page.locator('#ub-game').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 console.log('PASS Retro Bowl: native runtime and local assets, desktop/portrait/landscape canvas fit, click input, gallery launch and exit, no external requests.');
}finally{await browser.close();server.close();}
