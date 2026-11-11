import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {createServer} from 'node:net';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('Render root entry starts the actual server on the supplied port and serves the site',async()=>{
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const dir=await mkdtemp(join(tmpdir(),'orbit-render-'));let child;
 try{
  child=spawn(process.execPath,['index.js'],{cwd:root,env:{...process.env,PORT:String(port),HOST:'',ORBITCRAFT_DB:join(dir,'world.sqlite'),ORBITCRAFT_DEV:'0'},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server did not start: '+output)),10000);child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code+': '+output));});child.stdout.on('data',()=>{if(output.includes('Orbitcraft listening on 0.0.0.0:')){clearTimeout(timer);resolve();}});});
  const base='http://127.0.0.1:'+port;const health=await fetch(base+'/orbitcraft/health');assert.equal(health.status,200);assert.equal((await health.json()).ok,true);
  assert.equal((await fetch(base+'/')).status,200);assert.equal((await fetch(base+'/games/worlds-hardest-game/index.html')).status,200);assert.equal((await fetch(base+'/orbitcraft/data/world.sqlite')).status,404);
  const pkg=JSON.parse(await readFile(root+'package.json'));assert.match(pkg.scripts.postinstall,/orbitcraft ci --omit=dev/);
 }finally{if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}await rm(dir,{recursive:true,force:true});}
});
