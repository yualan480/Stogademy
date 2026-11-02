// Verify the actual packaged shop with a controlled data-provider fixture.
// No Supabase writes or external requests are made by this check.
import {chromium} from '../../orbitcraft/node_modules/@playwright/test/index.mjs';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../orbitcraft/.site/',import.meta.url));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!=='http://orbit-packaged.test')return route.abort();if(url.pathname==='/harness')return route.fulfill({contentType:'text/html',body:'<!doctype html><main id="main"></main><span class="av" data-uid="owner"></span>'});const file=resolve(root,'.'+url.pathname);if(!file.startsWith(root))return route.abort();try{return route.fulfill({body:await readFile(file),contentType:extname(file)==='.js'?'text/javascript':'application/octet-stream'});}catch{return route.fulfill({status:404,body:''});}});
 await page.goto('http://orbit-packaged.test/harness');
 const result=await page.evaluate(async()=>{
  const {initShop}=await import('/chatter/shop.js?v=12');
  const S={me:{id:'viewer',display_name:'Viewer',avatar_color:'#123456'},view:'shop',orbits:1000000,profiles:new Map([['owner',{id:'owner',display_name:'30yua'}]])},calls=[];
  const rows={shop_items:[{id:'normal_ring',kind:'frame',name:'Normal Ring',price:50,rarity:'common',featured:true,art:{shape:'ring',c1:'#123456',c2:'#abcdef'},blurb:'A normal shop item'}],shop_inventory:[],shop_requests:[],orbit_loop:[{id:1,holder:'owner',price:90000,takes:1}]};
  const sb={from(table){const q={select(){return q},eq(){return q},order(){return q},limit(){return q},maybeSingle(){return Promise.resolve({data:rows[table]?.[0]||null})},then(done,fail){return Promise.resolve({data:rows[table]||[],error:null}).then(done,fail)}};return q;},async rpc(fn,args){calls.push({fn,args});return {data:fn==='buy_shop_item'?999950:0,error:null};},channel(){return {on(){return this},subscribe(){return this}};}};
  let shop;const c={S,sb,$:id=>document.getElementById(id),I:{},esc:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),ic:()=>'',menuBtn:()=>'',toast:()=>{},modal(title,body,actions){window.fixtureModal={title,body,actions};},setOrbits:n=>S.orbits=n,loadOrbits:async()=>{},renderSide:()=>{},renderMain:()=>shop.render(document.getElementById('main')),navTo:()=>{}};
  shop=initShop(c);await shop.load(true);c.renderMain();window.fixtureShop={shop,c,calls};
  return {html:document.getElementById('main').innerHTML,holderHalo:!!document.querySelector('.av[data-uid="owner"][data-loop] .oloop'),canBuyNormal:!!document.querySelector('[data-buy="normal_ring"]'),calls};
 });
 assert.ok(!result.html.includes('olbox'));assert.ok(!result.html.includes('olprice'));assert.ok(!result.html.includes('oltake'));assert.ok(!result.html.includes('Buy the Loop'));assert.ok(result.holderHalo);assert.ok(result.canBuyNormal);
 await page.locator('[data-buy="normal_ring"]').click();await page.evaluate(()=>window.fixtureModal.actions.find(a=>a.label==='Buy').fn());
 const calls=await page.evaluate(()=>window.fixtureShop.calls);assert.ok(calls.some(c=>c.fn==='buy_shop_item'&&c.args.p_item==='normal_ring'));assert.ok(!calls.some(c=>c.fn==='take_orbit_loop'));assert.deepEqual(errors,[]);
 console.log('PASS: packaged shop has no Loop listing or purchase controls; normal purchases still work; holder halo remains; no retired Loop RPC or browser errors.');
}finally{await browser.close();}
