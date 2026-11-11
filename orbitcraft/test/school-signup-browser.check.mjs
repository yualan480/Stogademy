import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {schoolSignupDetails} from '../../chatter/school-signup.js';
const source=await readFile(new URL('../../chatter/app.js',import.meta.url),'utf8');
const view=source.slice(source.indexOf("function authView(mode = 'login')"),source.indexOf('function recoveryView()'));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try {
 for(const width of [320,390,1440]) {
  const page=await browser.newPage({viewport:{width,height:844}});
  await page.route('https://orbit.test/**',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('https://orbit.test/');
  await page.evaluate(({view,details})=>{
   window.root=document.getElementById('root');window.$=s=>document.querySelector(s);window.logo='Orbit';window.HCAPTCHA_SITE_KEY='';window.boundEmail=()=>'';window.authNotice='';window.loadMaint=async()=>{};window.authMaintNote=()=>{};window.deviceId=()=> 'device';window.CONFIG={};window.requireEmailConfirmation=async()=>{};window.schoolSignupDetails=eval('('+details+')');window.sb={rpc:async()=>({data:null}),auth:{signUp:async args=>{window.submitted=args;return {data:{session:null}};}}};
   eval(view+';authView("signup");');
  },{view,details:schoolSignupDetails.toString()});
  await page.locator('#em').fill('30yua@tesdk12.net');await page.locator('#signup-first').fill('Alan');await page.locator('#signup-last').fill('Yu');await page.locator('#pw').fill('testing-password');await page.locator('#go').click();
  await page.waitForFunction(()=>window.submitted);assert.equal(await page.evaluate(()=>submitted.options.data.full_name),'Alan Yu');assert.match(await page.locator('#er').textContent(),/confirmation link/);assert.match(await page.locator('#af').textContent(),/self-reported/);await page.close();
 }
 console.log('PASS school-email signup form sends names and displays confirmation instructions at three widths.');
}finally{await browser.close();}
