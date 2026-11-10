import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const mime={js:'application/javascript',css:'text/css',html:'text/html',json:'application/json',svg:'image/svg+xml'};
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://local').pathname;res.setHeader('Content-Type',mime[path.split('.').pop()]||'application/octet-stream');res.end(path==='/chatter/trivia-test.html'?'<html><body></body></html>':await readFile(root+path));}catch{res.statusCode=404;res.end();}}).listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const base=`http://127.0.0.1:${server.address().port}`;
 for(const width of [1200,390]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url());});
  await page.goto(base+'/games/random-trivia/index.html');
  await page.getByRole('button',{name:'Start Trivia!',exact:true}).click();await page.locator('#answer-buttons button').first().waitFor();
  assert.equal(await page.evaluate(()=>new Set(questions.map(q=>q.question)).size),10);
  const first=await page.evaluate(()=>questions.map(q=>q.question));
  for(let i=0;i<10;i++){
   const correct=i%2===0;await page.locator(correct?'#answer-buttons [data-correct]':'#answer-buttons button:not([data-correct])').first().click();
   assert.equal(await page.locator('#answer-buttons button:disabled').count(),4);
   if(i<9)await page.getByRole('button',{name:'Next',exact:true}).click();
  }
  assert.equal(await page.locator('#correct-guess').textContent(),'5');assert.equal(await page.locator('#wrong-guess').textContent(),'5');
  await page.getByRole('button',{name:'Restart Trivia',exact:true}).click();await page.waitForFunction(()=>currentQuestionIndex===0&&correctGuess===0&&!startButton.disabled);
  assert.notDeepEqual(await page.evaluate(()=>questions.map(q=>q.question)),first);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`/tmp/random-trivia-${width}.png`});
  // A missing bank should show a retryable message, rather than a dead Start button.
  await page.reload();await page.route('**/questions.json',r=>r.fulfill({status:503,body:'Unavailable'}));await page.getByRole('button',{name:'Start Trivia!',exact:true}).click();await page.getByText('Could not load the questions. Press Start to try again.',{exact:true}).waitFor();assert.equal(await page.locator('#start-btn').isEnabled(),true);await page.unroute('**/questions.json');await page.locator('#start-btn').click();await page.locator('#answer-buttons button').first().waitFor();
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await page.close();
 }
 const page=await browser.newPage();await page.goto(base+'/chatter/trivia-test.html');await page.evaluate(async()=>{const {initUnblockedGames}=await import('/chatter/unblocked-games.js');document.body.innerHTML='<main></main>';initUnblockedGames({menuBtn:()=>'',bindMenu:()=>{},ic:()=>''}).render(document.querySelector('main'));});await page.getByRole('button',{name:'Play Random Trivia',exact:true}).click();await page.frameLocator('#ub-game').getByRole('button',{name:'Start Trivia!',exact:true}).waitFor();await page.evaluate(()=>document.fullscreenElement?document.exitFullscreen():undefined);await page.getByRole('button',{name:'‹ Gallery',exact:true}).click();
 console.log('PASS Random Trivia: ten unique local questions, answer locking and 5/10 final score, random restart, load failure/retry, phone/desktop fit, no external requests, gallery launch/exit.');
}finally{await browser.close();server.close();}
