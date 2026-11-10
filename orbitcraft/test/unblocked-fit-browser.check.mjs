import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const catalog=await import('data:text/javascript;base64,'+Buffer.from(await readFile(root+'chatter/unblocked-catalog.js')).toString('base64'));
const mime={js:'application/javascript',css:'text/css',html:'text/html',png:'image/png',jpg:'image/jpeg',webp:'image/webp',json:'application/json',svg:'image/svg+xml',mp3:'audio/mpeg',ogg:'audio/ogg',wasm:'application/wasm',unityweb:'application/octet-stream'};
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://local').pathname;res.setHeader('Content-Type',mime[path.split('.').pop()]||'application/octet-stream');res.end(path==='/gate.js'?'':await readFile(root+path));}catch{res.statusCode=404;res.end();}}).listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const results=[];
try{
 const base=`http://127.0.0.1:${server.address().port}`;
 const canvasGames=['electron-dash','moto-x3m','paper-io','retro-bowl','stickman-hook','worlds-hardest-game','yohoho'];
 async function check(game){
  const page=await browser.newPage({viewport:{width:1920,height:1080}});
  try{
   await page.goto(new URL(game.src.replace('../','/'),base).href,{waitUntil:'domcontentloaded'});
   if(canvasGames.includes(game.id))await page.locator('canvas').first().waitFor({timeout:60000});
   await page.waitForTimeout(game.id==='electron-dash'?8000:1800);
   for(const viewport of [{width:1920,height:1080},{width:1280,height:720},{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(viewport);await page.waitForTimeout(400);
    const result=await page.evaluate(()=>{
     const canvases=[...document.querySelectorAll('canvas')].map(e=>e.getBoundingClientRect()).filter(r=>r.width>10&&r.height>10).sort((a,b)=>b.width*b.height-a.width*a.height),r=canvases[0];
     return {w:innerWidth,h:innerHeight,scroll:document.documentElement.scrollWidth,clipped:['hidden','clip'].includes(getComputedStyle(document.body).overflowX)||['hidden','clip'].includes(getComputedStyle(document.documentElement).overflowX),canvas:r?{x:r.x,y:r.y,w:r.width,h:r.height}:null};
    });
    results.push({game:game.id,...result});
    assert.ok(result.scroll<=result.w+1||result.clipped,game.id+' has a horizontal scrollbar');
    if(canvasGames.includes(game.id)){
     const c=result.canvas;assert.ok(c,game.id+' has no visible canvas');
     assert.ok(c.x>=-2&&c.y>=-2&&c.x+c.w<=result.w+2&&c.y+c.h<=result.h+2,game.id+' is cropped');
     assert.ok(Math.max(c.w/result.w,c.h/result.h)>.98,game.id+' does not use available space');
     assert.ok(Math.abs(c.x+c.w/2-result.w/2)<3&&Math.abs(c.y+c.h/2-result.h/2)<3,game.id+' is not centered');
    }
   }
  }catch(error){results.push({game:game.id,error:error.message});}finally{await page.close();}
 }
 for(let i=0;i<catalog.UNBLOCKED_GAMES.length;i+=3)await Promise.all(catalog.UNBLOCKED_GAMES.slice(i,i+3).map(check));
 console.log(JSON.stringify(results,null,2));
 assert.deepEqual(results.filter(r=>r.error),[]);
 console.log('PASS all catalog games: desktop, laptop, portrait and landscape layout; canvas games fill and center without cropping; DOM games have no horizontal scrollbars.');
}finally{await browser.close();server.close();}
