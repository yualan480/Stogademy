import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const mime={js:'application/javascript',css:'text/css',html:'text/html',png:'image/png',mp3:'audio/mpeg',wav:'audio/wav',svg:'image/svg+xml'};
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://local').pathname;res.setHeader('Content-Type',mime[path.split('.').pop()]||'application/octet-stream');res.end(path==='/chatter/quiz-test.html'?'<html><body></body></html>':await readFile(root+path));}catch{res.statusCode=404;res.end();}}).listen(0,'127.0.0.1');
await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=`http://127.0.0.1:${server.address().port}`;
 for(const width of [1200,390]){
  await page.setViewportSize({width,height:844});
  await page.goto(base+'/games/pokemon-stats/index.html');
  await page.locator('.js-hp').waitFor();
  await page.getByRole('button',{name:'Show values',exact:true}).click();
  assert.ok(Number(await page.locator('.js-hp-value').textContent())>0);
  await page.locator('#solution').fill('incorrect');await page.getByRole('button',{name:'Guess',exact:true}).click();assert.ok(await page.locator('.input-error').isVisible());
  const answer=await page.locator('h2.solution').textContent();await page.locator('#solution').fill(answer.toLowerCase());await page.getByRole('button',{name:'Guess',exact:true}).click();await page.locator('#reloadModal.show').waitFor();assert.equal(await page.locator('.modal-title').textContent(),'Correct!');
  await page.getByRole('button',{name:'Next Pokémon'}).click();await page.locator('#reloadModal.show').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Clear all',exact:true}).click();await page.getByRole('button',{name:'Reveal answer',exact:true}).click();await page.locator('#reloadModal.show').waitFor();await page.getByRole('button',{name:'Next Pokémon'}).click();await page.locator('#reloadModal.show').waitFor({state:'hidden'});assert.ok(Number(await page.locator('.js-hp-value').textContent())>0);
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) console.log(await page.evaluate(()=>({width:innerWidth,overflow:[...document.querySelectorAll("body *")].filter(e=>e.getBoundingClientRect().right>innerWidth).map(e=>[e.tagName,e.className,e.getBoundingClientRect().right]).slice(0,15)})));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`/tmp/pokemon-stats-${width}.png`});
  await page.goto(base+'/games/pokemon-cry/index.html');
  await page.waitForFunction(()=>document.querySelectorAll('.option[data-species-id]').length===4);
  await page.getByRole('button',{name:'Play the Pokemon cry',exact:true}).click();
  await page.waitForFunction(()=>theCry.readyState>=2 && theCry.currentTime>0);
  const id=await page.evaluate(()=>thePokemon.species_id);
  await page.locator(`.option[data-species-id="${id}"]`).click();await page.locator('.success:not(.hidden)').waitFor();
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) console.log(await page.evaluate(()=>({width:innerWidth,overflow:[...document.querySelectorAll("body *")].filter(e=>e.getBoundingClientRect().right>innerWidth).map(e=>[e.tagName,e.className,e.getBoundingClientRect().right]).slice(0,15)})));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`/tmp/pokemon-cry-${width}.png`});
 }
 assert.deepEqual(errors,[]);
 // Catalog and gallery integration use the same published modules as Orbit.
 await page.goto(base+'/chatter/quiz-test.html');
 await page.evaluate(async()=>{const {initUnblockedGames}=await import('/chatter/unblocked-games.js');document.body.innerHTML='<main></main>';initUnblockedGames({menuBtn:()=>'',bindMenu:()=>{},ic:()=>''}).render(document.querySelector('main'));});
 for(const mode of ['Cry','Stats']){
  await page.getByRole('button',{name:`Play Guess the Pokémon (${mode})`,exact:true}).click();
  await page.frameLocator('#ub-game').locator('h1,h2').first().waitFor();
  assert.ok((await page.locator('#ub-game').getAttribute('src')).startsWith('../games/pokemon-'));
  await page.evaluate(()=>document.fullscreenElement?document.exitFullscreen():undefined);
  await page.getByRole('button',{name:'‹ Gallery',exact:true}).click();
 }
 console.log('PASS Pokémon quizzes: local cry playback and correct answer, stats values/incorrect/case-insensitive correct/reveal/filter fallback, desktop and phone layout, both gallery launch paths.');
}finally{await browser.close();server.close();}
