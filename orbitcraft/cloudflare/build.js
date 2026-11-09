import { RELEASE } from '../release.js';
import { cp, mkdir, readdir, rm,copyFile,readFile } from 'node:fs/promises';
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
// Guard the generated package as well as source: the Loop is challenge-only.
const shop=await readFile(resolve(out,'chatter/shop.js'),'utf8');
for(const retired of ['take_orbit_loop','loopBoxHtml','id="olprice"','id="oltake"']){
 if(shop.includes(retired))throw new Error('Packaged Orbit Shop still contains the retired Loop purchase path: '+retired);
}
for(const file of ['games/soccer-random.html','games/soccer-random.js','games/soccer-random/scripts/main.js','games/soccer-random/data.json','games/basket-random.html','games/basket-random.js','games/basket-random/scripts/main.f.js','games/basket-random/data.json','games/rooftop-snipers.html','games/rooftop-snipers.js','games/rooftop-snipers/Build/rooftop-snipers.json','games/rooftop-snipers/TemplateData/UnityLoader.js','games/getaway.html','games/getaway-online.js','games/cartridge-ui.css','games/site-config.js','games/wordle.html','games/wordle.js','games/wordle-engine.js','games/wordle.css','games/wordle-assets/words.json','orbitcraft/containers-reference.css','orbitcraft/armor-visuals.js','orbitcraft/recipe-book.js','orbitcraft/recipe-additions.js','orbitcraft/underground.js','orbitcraft/deep-textures.js','orbitcraft/furnaces.js','orbitcraft/assets/recipes/catalog.json','orbitcraft/assets/containers/inventory.png','orbitcraft/assets/containers/furnace.png','orbitcraft/assets/armor/iron-humanoid.png','orbitcraft/assets/reference/deepslate.png','orbitcraft/assets/reference/furnace_front_on.png','orbitcraft/assets/reference/bow.png','orbitcraft/skins.js','orbitcraft/skins-ui.js','orbitcraft/prediction.js','orbitcraft/players.js','orbitcraft/assets/skins/steve.png','orbitcraft/assets/skins/alex.png','orbitcraft/sign-text.js','orbitcraft/signs-ui.js','orbitcraft/sign-visuals.js','orbitcraft/assets/sign-board.png','orbitcraft/durability-ui.js','orbitcraft/assets/reference/items.png','orbitcraft/assets/reference/blocks.png','orbitcraft/assets/reference/hotbar.png','orbitcraft/assets/reference/manifest.json','orbitcraft/shape-geometry.js','orbitcraft/pearl-visuals.js','orbitcraft/bow-visuals.js','game-fit.js','games/slither.html','games/slither.js','games/slither-engine.js','games/slither.css','games/slither-cover.svg','orbitcraft/mob-models.js','orbitcraft/damage-camera.js','orbitcraft/locator.js','chatter/guides.js','chatter/guides.css','chatter/assets/guides/orbit-siblings.png','chatter/communities.js','orbitcraft/world.js','chatter/intelligence.js','chatter/intelligence.css','chatter/shop.js','chatter/arena.js','chatter/app.js','chatter/index.html','games/orbit-bank.js','games/leaderboard.js','games/index.html','games/admin.html','orbitcraft/index.html','orbitcraft/client.js','orbitcraft/sounds.js','orbitcraft/survival-ui.js','orbitcraft/containers-ui.js','orbitcraft/crafting-grid.js','orbitcraft/items.js','orbitcraft/visuals.js','orbitcraft/mining-visuals.js','orbitcraft/game-shortcuts.js','orbitcraft/keybinds.js','orbitcraft/pause-menu.js','orbitcraft/block-models.js','orbitcraft/chunks.js','orbitcraft/shapes.js','orbitcraft/item-art.js','orbitcraft/entity-effects.js','orbitcraft/experience.js','orbitcraft/experience-visuals.js','orbitcraft/assets/hud/armor.svg','orbitcraft/assets/hud/armor-empty.svg','orbitcraft/assets/fonts/PixelifySans.ttf','orbitcraft/assets/hud/recipe-book.svg','orbitcraft/assets/hud/furnace-flame.svg','orbitcraft/style.css','orbitcraft/release.js','orbitcraft/assets/block-textures.png']){
 const [source,built]=await Promise.all([readFile(resolve(root,file)),readFile(resolve(out,file))]);
 if(!source.equals(built))throw new Error('Packaged site differs from current source: '+file);
}
const gamePage=await readFile(resolve(out,'orbitcraft/index.html'),'utf8');
for(const required of [RELEASE,'id="survival-hud"','id="health-meter"','id="hunger-meter"','id="hotbar"','id="experience-bar"','id="armor-meter"']){
 if(!gamePage.includes(required))throw new Error('Packaged Orbitcraft HUD is missing '+required);
}
for(const name of ['heart','heart-empty','hunger','hunger-empty']){
 const file='orbitcraft/assets/hud/'+name+'.svg';
 const [source,built]=await Promise.all([readFile(resolve(root,file)),readFile(resolve(out,file))]);
 if(!source.equals(built))throw new Error('Packaged HUD sprite is out of date: '+name);
}
console.log('Cloudflare package verified: challenge-only shop and '+RELEASE+' HUD/assets are current.');
