import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const dir=mkdtempSync(join(tmpdir(),'orbit-stairs-')),port=18979,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server/index.js'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,PORT:String(port),ORBITCRAFT_DEV:'1',ORBITCRAFT_DB:join(dir,'world.db')},stdio:'ignore'});let browser;
try{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/orbitcraft/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});const page=await browser.newPage({viewport:{width:800,height:500}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/orbitcraft/?manualJoin=1');
 const result=await page.evaluate(async()=>{
 const T=await import('/orbitcraft/vendor/three.module.js'),{createTextures}=await import('/orbitcraft/visuals.js'),{furnitureModel}=await import('/orbitcraft/block-models.js'),{blockGeometry}=await import('/orbitcraft/mining-visuals.js');
 const tex=await createTextures();document.body.replaceChildren();document.body.style.cssText='margin:0;background:#acd2df;display:flex;align-items:center;justify-content:center';
 const scene=new T.Scene();scene.background=new T.Color('#acd2df');scene.add(new T.HemisphereLight(0xffffff,0x777777,2));const camera=new T.PerspectiveCamera(40,800/400,.1,30);camera.position.set(3.6,3.2,5);camera.lookAt(1,.4,.5);const renderer=new T.WebGLRenderer({antialias:false});renderer.setSize(800,400);document.body.append(renderer.domElement);
 const counts=[];for(const [i,id]of [34,38].entries()){const m=furnitureModel(id,tex.texture);m.position.x=i*2;scene.add(m);counts.push(m.children.length);const icon=document.createElement('img');icon.src=tex.icon(id);icon.style.cssText='position:absolute;bottom:20px;width:72px;height:72px;image-rendering:pixelated;left:'+ (270+i*140)+'px';document.body.append(icon);const g=blockGeometry(id,1);if(!g.attributes.position.count)throw Error('Missing held shape');g.dispose();}renderer.render(scene,camera);return {counts,icons:[tex.icon(34),tex.icon(38)]};
 });assert.deepEqual(result.counts,[2,2]);assert.notEqual(result.icons[0],result.icons[1]);assert.deepEqual(errors,[]);await page.screenshot({path:'/tmp/orbitcraft-stairs-signs.png'});console.log('PASS: browser renders stepped oak stairs, oak sign board and post, distinct inventory icons and shaped held geometry without JavaScript errors.');
}finally{if(browser)await browser.close();server.kill('SIGTERM');await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));rmSync(dir,{recursive:true,force:true});}
