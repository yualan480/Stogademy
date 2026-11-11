import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const types={html:'text/html',js:'application/javascript',css:'text/css',svg:'image/svg+xml',webmanifest:'application/manifest+json'};
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://local').pathname;res.setHeader('Content-Type',types[path.split('.').pop()]||'text/html');res.end(path==='/chatter/'||path==='/games/'?'<html><body><h1>Orbit session frame</h1></body></html>':await readFile(root+(path==='/'?'index.html':path.slice(1))));}catch{res.statusCode=404;res.end();}}).listen(0,'127.0.0.1');
await new Promise(r=>server.on('listening',r));
const hash='472c5b7ed9a012becc4e8aff30acdef07744e73e30e22fa60fa021d6fe1487a3';
const symbols=['.-','-...','-.-.','-..','.','..-.','--.','....','..','.---','-.-','.-..','--','-.','---','.--.','--.-','.-.','...','-','..-','...-','.--','-..-','-.--','--..','-----','.----','..---','...--','....-','.....','-....','--...','---..','----.'];
let code;for(const a of symbols)for(const b of symbols){const candidate=a+' '+b;if(createHash('sha256').update(candidate).digest('hex')===hash)code=candidate;}
assert.ok(code,'Existing Morse sequence must remain valid');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const base='http://127.0.0.1:'+server.address().port;
 for(const viewport of[{width:1440,height:1000},{width:390,height:844},{width:320,height:568},{width:844,height:390}]){
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/');
  assert.match(await page.title(),/Silk Road/);assert.equal(await page.locator('#f-chat').getAttribute('src'),null);assert.equal(await page.getByRole('heading',{name:'A thousand paths. One connected world.'}).isVisible(),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'Explore Samarkand',exact:true}).click();assert.equal(await page.locator('#city-name').textContent(),'Samarkand');
  await page.getByRole('button',{name:'Next city'}).click();assert.equal(await page.locator('#city-name').textContent(),'Baghdad');
  await page.getByRole('button',{name:'Maritime',exact:true}).click();assert.equal(await page.locator('#route-map').getAttribute('data-route'),'sea');
  if(viewport.width<=560){await page.getByRole('button',{name:'Menu',exact:false}).click();await page.getByRole('navigation').getByRole('link',{name:'Through time'}).click();assert.equal(await page.locator('#menuBtn').getAttribute('aria-expanded'),'false');}
  await page.goto(base+'/#/chat');assert.equal(await page.locator('#home').isVisible(),true);assert.equal(await page.locator('#f-chat').getAttribute('src'),null);
  assert.equal(await page.evaluate(()=>StgUnlock('... --- ...')),false);
  assert.equal(await page.evaluate(code=>StgUnlock(code),code),true);
  await page.frameLocator('#f-chat').getByRole('heading',{name:'Orbit session frame'}).waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('stg_ok')),'1');assert.equal(await page.locator('#home').isVisible(),false);
  await page.getByRole('button',{name:'Return to Silk Road'}).click();assert.equal(await page.locator('#home').isVisible(),true);assert.equal(await page.locator('#f-chat').getAttribute('src'),null);
  await page.goto(base+'/');await page.screenshot({path:'/tmp/silk-road-'+viewport.width+'x'+viewport.height+'.png',fullPage:true});assert.deepEqual(errors,[]);await page.close();
 }
 const callback=await browser.newPage();await callback.goto(base+'/');await callback.evaluate(()=>localStorage.setItem('stg_ok','1'));await callback.goto(base+'/?code=example-callback');await callback.frameLocator('#f-chat').getByRole('heading',{name:'Orbit session frame'}).waitFor();assert.equal(await callback.locator('#f-chat').getAttribute('src'),'chatter/?code=example-callback');assert.equal(await callback.evaluate(()=>location.search),'');await callback.close();
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto(base+'/');await page.evaluate(()=>{window.originalUnlock=StgUnlock;window.keyed=[];window.StgUnlock=s=>{keyed.push(s);return false;};});
 const key=page.locator('#morseKey');await key.scrollIntoViewIfNeeded();const rect=await key.boundingBox();await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.waitForTimeout(60);await page.mouse.up();await page.waitForTimeout(1000);assert.equal(await page.evaluate(()=>keyed[0]),'.');
 await page.mouse.down();await page.waitForTimeout(300);await page.mouse.up();await page.waitForTimeout(1000);assert.equal(await page.evaluate(()=>keyed.at(-1)),'. -');
 console.log('PASS Silk Road: responsive history page, map cities/routes, phone navigation, unchanged Morse unlock, unauthorized entry blocked, Orbit iframe and return, real dot/dash pointer input.');
}finally{await browser.close();server.close();}
