import { cp, mkdir, readdir, rm,copyFile } from 'node:fs/promises';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const game=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=resolve(game,'..'),out=resolve(game,'.site');
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
const exclude=new Set(['.git','.agents','.aws','.codex','attachments','node_modules','data','server','test','cloudflare','.wrangler','.site','test-results','playwright-report']);
async function copyDirectory(src,dst){
 await mkdir(dst,{recursive:true});
 for(const file of await readdir(src,{withFileTypes:true})){
  if(file.name.startsWith('.')||exclude.has(file.name)||/\.(sql|sqlite|zip)$/.test(file.name)||['package.json','package-lock.json','wrangler.jsonc','README.md'].includes(file.name))continue;
  const from=resolve(src,file.name),to=resolve(dst,file.name);
  if(file.isDirectory())await copyDirectory(from,to);else if(file.isFile())await copyFile(from,to);
 }
}
await copyDirectory(root,out);
await mkdir(resolve(out,'orbitcraft/vendor'),{recursive:true});
for(const file of ['three.module.js','three.core.js'])await copyFile(resolve(game,'node_modules/three/build',file),resolve(out,'orbitcraft/vendor',file));
console.log('Cloudflare assets built in orbitcraft/.site; original static site included.');
