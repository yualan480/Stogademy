import * as THREE from './vendor/three.module.js';
import { BLOCKS } from './world.js';
import { ITEMS } from './items.js';
const itemIds=Object.keys(ITEMS).map(Number).filter(id=>id>=100);
const itemTiles=new Map(itemIds.map((id,i)=>[id,35+i]));

export const TEXTURE_TILES = Object.freeze([
  'grass_top','dirt','stone','sand','oak_bark','oak_leaves','snow',
  'water','bedrock','oak_planks','grass_side','oak_end','snowy_grass_side',
  'grass_plant','poppy','poppy_variant','cobblestone','gravel','coal_ore','iron_ore','diamond_ore',
  'gold_ore','ancient_debris','crafting_top','crafting_side','furnace_top','furnace_side','bed','farmland','wheat','chest_top','chest_side','furnace_wall','crafting_tools','torch',...itemIds.map(id=>'item_'+id)
]);
export const TILE_COUNT = TEXTURE_TILES.length;
const random = (x, y, seed) => {
  let n = Math.imul(x + seed * 71, 374761393) ^ Math.imul(y + seed * 13, 668265263);
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967295;
};
export function tileFor(id, normalY, normalZ=0) {
  if(id>=100)return itemTiles.get(id)??1;
  if(id===25)return 34;
  if(id===18)return normalY>0?23:normalY<0?9:normalZ>0?24:33;
  if(id===19||id===24)return normalY>0?25:normalY<0?2:normalZ>0?26:32;
  if(id===23)return normalY>0?30:31;if(id===24)return normalY>0?25:26;
  if(id>=11)return ({11:16,12:17,13:18,14:19,15:20,16:21,17:22,18:normalY>0?23:24,19:normalY>0?25:26,20:27,21:normalY>0?28:1,22:29})[id]??1;
  if (id === 1) return normalY > 0 ? 0 : normalY < 0 ? 1 : 10;
  if (id === 5 && normalY !== 0) return 11;
  if (id === 7) return 6;
  return id - 1;
}

export function terrainDetail(x,z) {
  const value=random(x,z,203);
  return value>.985?14:value>.82?13:null;
}

export async function createTextures() {
  const atlas = document.createElement('canvas');
  atlas.width = TILE_COUNT * 16;
  atlas.height = 16;
  const context = atlas.getContext('2d');
  context.imageSmoothingEnabled=false;
  let referenceLoaded=false;
  try {
    const source=await new Promise((resolve,reject)=>{
      const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Texture sheet unavailable'));
      image.src=new URL('./assets/block-textures.png?v=chart4',import.meta.url).href;
    });
    if(source.naturalWidth<112||source.naturalHeight<48)throw new Error('Texture sheet is too small');
    const cellWidth=source.naturalWidth/7,cellHeight=source.naturalHeight/3;
    const cutouts=new Set([5,13,14,15]);
    for(let tile=0;tile<21;tile++){
      if(!cutouts.has(tile)){context.fillStyle='#88887f';context.fillRect(tile*16,0,16,16);}
      // Small insets discard the sheet's edge artifacts. The render atlas uses
      // sharp 16-pixel tiles and the existing shared UV mapping everywhere.
      const inset=Math.min(cellWidth,cellHeight)*.03;
      context.drawImage(source,(tile%7)*cellWidth+inset,Math.floor(tile/7)*cellHeight+inset,cellWidth-inset*2,cellHeight-inset*2,tile*16,0,16,16);
      if(cutouts.has(tile)){
        const pixels=context.getImageData(tile*16,0,16,16);
        for(let i=3;i<pixels.data.length;i+=4)pixels.data[i]=pixels.data[i]<128?0:255;
        context.putImageData(pixels,tile*16,0);
      }
    }
    referenceLoaded=true;
  } catch {
    console.warn('Reference block textures could not load; using the built-in fallback.');
    context.clearRect(0,0,atlas.width,atlas.height);
  }
  if(!referenceLoaded){
  for (let tile = 0; tile < 21; tile++) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const grain = random(x, y, tile + 1), patch = random(x >> 2, y >> 2, tile + 3);
      let color = BLOCKS[Math.min(tile + 1, 10)].color;
      let shade = .77 + grain * .32 + patch * .15, alpha = 1;
      if (tile === 0) {
        color = patch > .6 ? '#6b9741' : '#608b36';
        if (grain > .88) shade *= 1.14;
      } else if (tile === 1) {
        color = grain > .94 ? '#b6a08a' : '#86603f';
      } else if (tile === 2) {
        color = '#8a8c88';
        if ((x + Math.floor(random(0, y >> 2, 41) * 5)) % 7 === 0 && grain > .35) shade *= .64;
      } else if (tile === 3) {
        color = '#dac58e'; shade = .89 + grain * .18;
      } else if (tile === 4) {
        color = '#796044';
        shade = .62 + random(x >> 1, y >> 3, 7) * .5 + grain * .15;
        if ((x + (y >> 3)) % 5 === 0) shade *= .68;
      } else if (tile === 5) {
        color = patch > .5 ? '#4d7933' : '#3c662c';
        alpha = grain > .84 && random(x >> 1, y >> 1, 26) > .44 ? 0 : 1;
      } else if (tile === 6) {
        color = '#e5edf0'; shade = .91 + grain * .1;
      } else if (tile === 7) {
        color = '#589bb5'; shade = .87 + grain * .09 + (y % 5 === 0 ? .12 : 0);
      } else if (tile === 8) {
        color = '#424746'; shade = .5 + grain * .65;
      } else if (tile === 9) {
        color = '#bc955e';
        shade = y % 4 === 0 ? .55 : .87 + grain * .2;
        if ((x + (Math.floor(y / 4) % 2) * 8) % 16 === 0) shade *= .65;
      } else if (tile === 10 || tile === 12) {
        const cap = tile === 10 ? 3 + Math.floor(random(x >> 1, 0, 11) * 3) : 5;
        color = y < cap ? (tile === 10 ? '#668f3b' : '#e6edf0') : '#86603f';
        if (y === cap) shade *= .6;
      } else if (tile === 11) {
        const distance = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        color = distance > 6 ? '#735438' : '#b4925e';
        shade = distance > 6 ? .75 + grain * .2 : (Math.floor(distance) % 3 === 0 ? .67 : .92) + grain * .12;
      }
      if(tile===13){
        color='#668d3e';alpha=0;
        for(const [tipX,tipY] of [[3,6],[8,2],[13,5]])if(y>=tipY&&Math.abs(x-(tipX+(8-tipX)*(y-tipY)/(15-tipY)))<1.2)alpha=1;
      }else if(tile===14||tile===15){
        alpha=0;color='#608743';
        if((x===7||x===8)&&y>=5)alpha=1;
        if(y>=10&&y<=12&&x>=4&&x<=10){alpha=1;color='#507d37';}
        if(Math.abs(x-8)+Math.abs(y-4)<=4){alpha=1;color=tile===14?'#d93430':'#c52a29';}
        if(Math.abs(x-8)<=1&&Math.abs(y-4)<=1)color='#e9c36a';
      }
      const c = new THREE.Color(color).multiplyScalar(shade);
      context.fillStyle = '#' + c.getHexString();
      context.globalAlpha = alpha;
      context.fillRect(tile * 16 + x, y, 1, 1);
    }
  }
  }
  context.globalAlpha = 1;
  // Additional original pixel textures and silhouettes for survival equipment.
  for(let tile=21;tile<32;tile++){
   const colors=['#777875','#593e31','#ac824d','#9a713e','#777875','#696c70','#ae3939','#65432b','#b5a94f','#a2743f','#9c703b'];
   context.fillStyle=colors[tile-21];context.fillRect(tile*16,0,16,16);
   for(let y=0;y<16;y++)for(let x=0;x<16;x++){context.fillStyle=(x*11+y*7)%5<2?'#0002':'#fff1';context.fillRect(tile*16+x,y,1,1);}
   const rect=(x,y,w,h,color)=>{context.fillStyle=color;context.fillRect(tile*16+x,y,w,h);};
   if(tile===21)for(const [x,y]of [[3,4],[11,2],[7,11],[13,13]])rect(x,y,2,2,'#e7c451');
   if(tile===22)for(let y=1;y<16;y+=4)rect(1,y,14,2,'#af8d72');
   if(tile===23){for(let i=2;i<16;i+=5){rect(i,2,1,12,'#4f3824');rect(2,i,12,1,'#4f3824');}}
   if(tile===24){rect(2,1,12,2,'#4d3524');rect(3,7,2,8,'#64452d');rect(10,7,2,8,'#64452d');}
   if(tile===26){rect(3,3,10,4,'#24262a');rect(3,10,10,4,'#24262a');rect(5,12,6,2,'#cf7836');}
   if(tile===27){rect(0,0,16,5,'#eee9d8');rect(0,14,16,2,'#886241');}
   if(tile===28)for(let y=1;y<16;y+=4)rect(0,y,16,2,'#39291e');
   if(tile===30||tile===31){rect(0,0,16,1,'#48301d');rect(0,15,16,1,'#48301d');rect(0,0,1,16,'#48301d');rect(15,0,1,16,'#48301d');if(tile===31){rect(0,5,16,1,'#48301d');rect(7,4,3,6,'#c0bbb0');rect(8,6,1,2,'#77756e');}}
   if(tile===29){context.clearRect(tile*16,0,16,16);for(const x of [3,7,12]){rect(x,4,1,12,'#739345');rect(x-1,2,3,6,'#c4ac48');}}
  }
  // Original 16px station faces: inset crafting grid, tool panels, and stone firebox.
  for(const tile of [23,24,25,26,32,33,34]){
   const rect=(x,y,w,h,color)=>{context.fillStyle=color;context.fillRect(tile*16+x,y,w,h);};
   if(tile===34){context.clearRect(tile*16,0,16,16);rect(6,5,4,11,'#51351d');rect(7,5,2,11,'#a47a42');rect(7,7,1,9,'#dfb673');rect(5,2,6,4,'#dd6823');rect(6,0,4,5,'#f6a52d');rect(7,1,2,3,'#fff5b0');continue;}
   const stone=[25,26,32].includes(tile);for(let y=0;y<16;y++)for(let x=0;x<16;x++){const n=Math.floor(random(x,y,tile)*5);rect(x,y,1,1,(stone?['#747574','#858783','#999b96','#646663','#a3a49d']:['#9b6e43','#b78851','#a87a46','#bf9259','#80552f'])[n]);}
   if(tile===23){rect(0,0,16,2,'#563922');rect(0,14,16,2,'#49301e');rect(0,0,2,16,'#624026');rect(14,0,2,16,'#49301e');rect(3,3,10,10,'#4c3322');for(let y=0;y<3;y++)for(let x=0;x<3;x++){rect(4+x*3,4+y*3,2,2,'#b48050');rect(4+x*3,4+y*3,2,1,'#c59463');}}
   if(tile===24||tile===33){rect(0,0,16,3,'#654126');rect(1,3,2,12,'#d0a064');rect(13,3,2,12,'#684226');for(const y of [6,10,14])rect(3,y,10,1,'#82552f');rect(0,15,16,1,'#4d311e');if(tile===24){rect(5,6,1,8,'#513d2a');rect(4,5,3,3,'#bcb5a4');rect(5,5,1,2,'#e5d8b6');rect(10,6,1,8,'#513d2a');rect(9,5,3,2,'#b8b3a6');rect(9,6,1,3,'#aaa592');}else{rect(5,5,2,8,'#59402a');rect(4,4,5,3,'#aaa38f');rect(11,8,1,6,'#58402a');rect(10,7,3,2,'#bbb6a4');}}
   if(stone){rect(0,0,16,1,'#4f514d');rect(0,15,16,1,'#53544f');rect(0,0,1,16,'#5d5f59');rect(15,0,1,16,'#565852');if(tile!==26){for(const [x,y,w]of [[2,3,5],[9,5,5],[3,11,8],[9,13,4]]){rect(x,y,w,1,'#afb0a9');rect(x,y+1,w,1,'#686b64');}}else{rect(2,2,12,6,'#5c5e58');rect(3,3,10,4,'#242722');rect(4,4,8,2,'#10120f');rect(2,9,12,6,'#5c5d57');rect(3,10,10,5,'#252721');rect(4,11,8,4,'#11130f');rect(2,8,12,1,'#b0b2a9');}}
  }
  for(const id of itemIds){const tile=itemTiles.get(id),item=ITEMS[id],x0=tile*16;context.clearRect(x0,0,16,16);const rect=(x,y,w,h,color)=>{context.fillStyle=color;context.fillRect(x0+x,y,w,h);};const tier=id>=170&&id<175?'#4b424b':id>=160&&id<165?'#45d4cb':id>=150&&id<155?'#ebc948':id>=140&&id<145?'#c9cdd0':id>=130&&id<135?'#8a9292':'#a77945';
   if(item.tool){for(let i=0;i<10;i++)rect(3+i,13-i,2,2,'#7a512d');if(item.tool==='pickaxe') {rect(5,1,10,3,tier);rect(12,3,3,4,tier);}else if(item.tool==='axe'){rect(8,1,6,6,tier);rect(6,2,2,3,tier);}else if(item.tool==='sword'){for(let i=0;i<9;i++)rect(5+i,10-i,3,3,tier);rect(4,10,6,2,'#61533f');}else if(item.tool==='shovel')rect(10,1,4,5,tier);else{rect(6,1,9,2,tier);rect(6,1,2,4,tier);}}
   else if(item.slot){const color=id>=210&&id<214?'#554650':id>=200&&id<204?'#52cfc7':id>=220?'#e6be45':'#c3cbd0';if(item.slot==='shield'){rect(3,1,10,11,'#999a9b');rect(5,3,6,10,'#936e44');rect(6,13,4,2,'#999a9b');}else if(item.slot==='helmet'){rect(2,3,12,8,color);rect(5,7,6,5,'#0000');context.clearRect(x0+5,8,6,4);}else if(item.slot==='boots'){rect(2,5,4,8,color);rect(10,5,4,8,color);}else if(item.slot==='leggings'){rect(3,2,10,5,color);rect(3,7,4,8,color);rect(9,7,4,8,color);}else{rect(2,3,12,4,color);rect(4,6,8,9,color);context.clearRect(x0+6,2,4,3);}}
   else if(item.food){const color=[110,112,115].includes(id)?'#b77a3a':id===117?'#c7372c':'#ce8b77';rect(3,5,10,8,'#52362b');rect(4,4,9,8,color);rect(5,5,3,2,'#ffe4a0');}
   else if(id===100){for(let i=0;i<10;i++){rect(3+i,12-i,2,2,'#664222');rect(3+i,12-i,1,1,'#bc8c4c');}}
   else if(id===232){rect(1,6,14,6,'#553820');rect(3,7,10,4,'#a9763b');rect(4,7,8,2,'#4b321d');rect(1,5,2,5,'#bd8b4d');rect(13,5,2,5,'#91622e');rect(3,11,10,2,'#714820');rect(5,13,6,1,'#49311d');}
   else if(id===180){for(let i=0;i<12;i++)rect(2+i,14-i,1,2,'#a57d4a');rect(13,2,1,10,'#eee');rect(11,11,3,2,'#aaa');}
   else{const color=({100:'#8f6239',101:'#292c32',102:'#b6947e',103:'#d6dce0',104:'#b69840',105:'#f2cf55',106:'#47d5d6',107:'#6e514d',108:'#51464d',111:'#c0aa4e',113:'#608b3b',116:'#eee9db',118:'#6d803c',119:'#d7d4bf',230:'#49484c',231:'#dfdbd5'})[id]||'#aaa';rect(3,6,10,7,'#333');rect(3,5,10,6,color);rect(5,3,7,3,color);rect(5,5,5,2,'#ffffff44');}
  }
  const texture = new THREE.CanvasTexture(atlas);
  texture.userData.grassSource=referenceLoaded?'block-reference':'fallback';
  texture.userData.source=referenceLoaded?'reference-sheet':'procedural-fallback';
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  const icons = new Map();
  function icon(id) {
    if (!icons.has(id)) {
      const c = document.createElement('canvas'); c.width = c.height = 48;
      const draw=c.getContext('2d');draw.imageSmoothingEnabled=false;
      function face(tile,points,shade){
        draw.save();draw.beginPath();points.forEach(([x,y],i)=>i?draw.lineTo(x,y):draw.moveTo(x,y));draw.closePath();draw.clip();
        const [o,u,,v]=points;draw.transform((u[0]-o[0])/16,(u[1]-o[1])/16,(v[0]-o[0])/16,(v[1]-o[1])/16,o[0],o[1]);
        draw.drawImage(atlas,tile*16,0,16,16,0,0,16,16);draw.fillStyle=`rgba(0,0,0,${shade})`;draw.fillRect(0,0,16,16);draw.restore();
      }
      if(id>=100||id===25){draw.drawImage(atlas,tileFor(id,0)*16,0,16,16,3,3,42,42);icons.set(id,c.toDataURL());return icons.get(id);}
      face(tileFor(id,0,1),[[4,12],[24,22],[24,46],[4,36]],.1);
      face(tileFor(id,0),[[24,22],[44,12],[44,36],[24,46]],.28);
      face(tileFor(id,1),[[24,2],[44,12],[24,22],[4,12]],0);
      icons.set(id, c.toDataURL());
    }
    return icons.get(id);
  }
  return { texture, icon };
}

export function createAtmosphere(scene) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(110, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,uniforms:{daylight:{value:1}},
    vertexShader: 'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform float daylight;varying vec3 direction; void main(){float t=smoothstep(-0.08,0.9,normalize(direction).y);gl_FragColor=vec4(mix(vec3(0.73,0.83,1.0),vec3(0.40,0.61,1.0),t)*daylight,1.0);}'
  }));
  sky.renderOrder = -10;
  scene.add(sky);
  const sunlight = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: 0xfff0c3, fog: false, side: THREE.DoubleSide }));
  sunlight.position.set(-44, 76, -68); sunlight.lookAt(0, 15, 0); sky.add(sunlight);
  const moon=new THREE.Mesh(new THREE.PlaneGeometry(6,6),new THREE.MeshBasicMaterial({color:0xcbdaf2,fog:false,side:THREE.DoubleSide}));sky.add(moon);
  const clouds = new THREE.Group();
  const cloudMaterial = new THREE.MeshLambertMaterial({ color: 0xfffcf3, transparent: true, opacity: .88 });
  const cloudGeometry = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 13; i++) {
    const cloud = new THREE.Group();
    cloud.position.set(random(i, 0, 88) * 150 - 75, 64 + random(i, 1, 88) * 9, random(i, 2, 88) * 150 - 75);
    for (let j = 0; j < 4; j++) {
      const puff = new THREE.Mesh(cloudGeometry, cloudMaterial);
      puff.scale.set(7 + random(i, j, 2) * 9, 1.4 + random(i, j, 3), 5 + random(i, j, 4) * 7);
      puff.position.set(j * 5, random(i, j, 5), random(i, j, 6) * 5);
      cloud.add(puff);
    }
    clouds.add(cloud);
  }
  scene.add(clouds);
  return (now, camera,worldTime=6000) => {
    const angle=(worldTime%24000)/24000*Math.PI*2;sunlight.position.set(Math.cos(angle)*90,Math.sin(angle)*90,-35);sunlight.lookAt(0,0,0);moon.position.copy(sunlight.position).multiplyScalar(-1);moon.lookAt(0,0,0);
    sky.position.copy(camera.position);
    clouds.position.x = Math.sin(now * .000012) * 5;
  };
}

export function createHeldBlock(camera, texture, {left=false}={}) {
  const group = new THREE.Group();group.name=left?'first-person-offhand':'first-person-mainhand';if(left)group.scale.x=-1; camera.add(group);
  const handMaterial = new THREE.MeshLambertMaterial({ color: 0xc99a72, depthTest: false, fog: false });
  const sleeveMaterial = new THREE.MeshLambertMaterial({ color: 0x229b9d, depthTest: false, fog: false });
  const hand = new THREE.Mesh(new THREE.BoxGeometry(.17, .34, .18), handMaterial);
  hand.position.set(.41, -.48, -.64); hand.rotation.set(-.38, -.2, -.18); hand.renderOrder = 1000; group.add(hand);
  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(.18, .27, .19), sleeveMaterial);
  sleeve.position.set(.43, -.69, -.55); sleeve.rotation.copy(hand.rotation); sleeve.renderOrder = 1000; group.add(sleeve);
  const material = new THREE.MeshLambertMaterial({ map: texture, alphaTest: .5, depthTest: false, fog: false });
  const block = new THREE.Mesh(new THREE.BoxGeometry(.24, .24, .24), material);
  block.name='held-item';block.position.set(.43, -.35, -.76); block.rotation.set(.12, -.5, -.1); block.renderOrder = 1001; group.add(block);
  let selected = null, swingAt = -1000;
  return {
    select(id, count) {
      group.userData.itemId=count>0?id:0;
      if(id!==selected&&id){block.geometry.dispose();block.geometry=id>=100||id===25?new THREE.PlaneGeometry(.3,.3):new THREE.BoxGeometry(.24,.24,.24);material.side=THREE.DoubleSide;}
      block.visible = count > 0;
      if (!id || id === selected) return; selected = id;
      const uv = block.geometry.attributes.uv;
      for (let face = 0; face < (id>=100||id===25?1:6); face++) {
        const tile = tileFor(id, face === 2 ? 1 : face === 3 ? -1 : 0,face===4?1:face===5?-1:0);
        for (let v = 0; v < 4; v++) uv.setXY(face * 4 + v, (tile * 16 + .2 + (v % 2) * 15.6) / (TILE_COUNT * 16), (.2 + (v < 2 ? 1 : 0) * 15.6) / 16);
      }
      uv.needsUpdate = true;
    },
    swing() { swingAt = performance.now(); },
    update(now, moving, visible) {
      group.visible = visible;
      const swing = Math.sin(Math.min(1, (now - swingAt) / 220) * Math.PI);
      const narrow=Math.min(1,camera.aspect/1.25),scale=Math.max(.6,narrow);hand.scale.setScalar(scale);sleeve.scale.setScalar(scale);block.scale.setScalar(scale);
      group.position.set((moving ? Math.sin(now * .009) * .012 : 0)+(left?1:-1)*.43*(1-narrow), (moving ? Math.abs(Math.cos(now * .009)) * .018 : 0) - swing * .08, -swing * .1);
      group.rotation.x = -swing * .22;
    }
  };
}
