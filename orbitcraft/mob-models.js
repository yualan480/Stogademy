import * as THREE from './vendor/three.module.js';
// Original pixel artwork and cuboid models, using the species silhouettes shown
// at https://minecraft.wiki/w/Mob as the visual reference. Forward is negative Z.
export function createMobModel(m){
 const group=new THREE.Group(),legs=[],wings=[],materials=new Map();
 function paint(base,style='plain',face=''){
  const key=[base,style,face].join(':');if(materials.has(key))return materials.get(key);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=16;const c=canvas.getContext('2d');c.fillStyle=base;c.fillRect(0,0,16,16);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){const h=(x*13+y*7+x*y*3)%23;c.fillStyle=h<5?'#00000022':h>18?'#ffffff19':'#00000000';c.fillRect(x,y,1,1);}
  const rect=(color,x,y,w,h)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
  if(style==='cow'){for(const [x,y,w,h]of [[1,1,5,4],[9,4,6,5],[2,10,4,5],[11,12,4,3]])rect('#dddcd4',x,y,w,h);}
  if(style==='wool'){for(let y=0;y<16;y+=4)for(let x=0;x<16;x+=4){rect('#bdb9af',x,y,4,1);rect('#f4f1e6',x,y+1,1,2);}}
  if(style==='creeper'){for(let y=0;y<16;y+=2)for(let x=0;x<16;x+=2)rect(['#316331','#6b9e4b','#9ac77c','#478944'][(x*7+y*3+x*y)%4],x,y,2,2);}
  if(style==='ribs'){for(const y of [3,7,11])rect('#e0dfcf',1,y,14,2);rect('#e6e4d7',7,0,2,16);}
  if(style==='shirt'){rect('#276e77',0,11,16,5);rect('#377d84',1,1,3,8);rect('#2d7277',11,4,3,7);}
  if(style==='trousers'){rect('#34316f',0,12,16,4);rect('#6862a0',3,1,2,8);}
  if(style==='salmon'){rect('#7b8855',0,0,16,4);rect('#dfb5a1',0,12,16,4);for(let x=1;x<16;x+=4)rect('#9c5350',x,6,2,4);}
  if(face){
   if(face==='creeper'){rect('#0b2011',2,4,4,4);rect('#0b2011',10,4,4,4);rect('#0b2011',6,7,4,6);rect('#0b2011',4,10,2,5);rect('#0b2011',10,10,2,5);}
   else if(face==='skeleton'){rect('#333630',2,5,4,4);rect('#333630',10,5,4,4);rect('#54564c',7,9,2,3);rect('#55564b',3,13,10,2);for(const x of [4,7,10])rect('#d8d8ca',x,13,1,2);}
   else if(face==='enderman'){rect('#c58ae9',1,8,6,2);rect('#c58ae9',9,8,6,2);rect('#f2b8ff',3,8,2,2);rect('#f2b8ff',11,8,2,2);}
   else if(face==='squid'){rect('#e9e8d6',1,5,5,5);rect('#e9e8d6',10,5,5,5);rect('#182b3c',3,7,3,3);rect('#182b3c',10,7,3,3);}
   else if(face==='spider'){for(const [x,y]of [[1,5],[4,3],[7,5],[10,3],[13,5],[4,9],[10,9],[7,9]])rect('#d3292c',x,y,2,2);}
   else {const eyes=face==='zombie'?'#223427':'#28251f';rect(eyes,2,5,3,3);rect(eyes,11,5,3,3);if(face==='zombie'){rect('#405336',5,11,7,2);rect('#426b34',6,8,4,2);}if(face==='cow'){rect('#c9b4ad',2,10,12,6);rect('#46332e',4,12,2,2);rect('#46332e',10,12,2,2);}if(face==='pig'){rect('#edb1a5',4,9,8,5);rect('#a9565c',5,10,2,2);rect('#a9565c',9,10,2,2);}if(face==='sheep'){rect('#a28e7a',4,9,8,6);rect('#806254',6,12,4,2);}if(face==='axolotl'){rect('#f4e6e8',1,6,1,1);rect('#f4e6e8',11,6,1,1);rect('#c16687',7,11,2,1);}}
  }
  const map=new THREE.CanvasTexture(canvas);map.magFilter=map.minFilter=THREE.NearestFilter;map.colorSpace=THREE.SRGBColorSpace;const mat=new THREE.MeshLambertMaterial({map});materials.set(key,mat);return mat;
 }
 function box(name,w,h,d,x,y,z,base,style='plain',face='',parent=group){const side=paint(base,style),front=face?paint(base,style,face):side;const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),[side,side,side,side,side,front]);mesh.name=name;mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
 function limb(name,w,h,d,x,top,z,base,style='plain'){const pivot=new THREE.Group();pivot.name=name;pivot.position.set(x,top,z);group.add(pivot);box(name+'-part',w,h,d,0,-h/2,0,base,style,'',pivot);return pivot;}
 function fourLegs(w,h,d,x,z,color,style='plain'){for(const sx of [-1,1])for(const sz of [-1,1])legs.push(limb('leg-'+sx+'-'+sz,w,h,d,sx*x,h,sz*z,color,style));}
 const kind=m.kind;
 if(kind==='creeper'){
  fourLegs(.25,.4,.3,.15,.25,'#508b3e','creeper');box('body',.5,.75,.28,0,.775,0,'#508b3e','creeper');box('head',.5,.5,.5,0,1.4,0,'#508b3e','creeper','creeper');
 }else if(kind==='zombie'||kind==='skeleton'){
  const bone=kind==='skeleton',skin=bone?'#c8c8b7':'#648448';
  box('torso',bone?.38:.5,.65,.25,0,.975,0,bone?'#8f9385':'#3d999d',bone?'ribs':'shirt');box('head',.5,.5,.5,0,1.55,0,skin,'plain',kind);
  for(const x of [-.15,.15])legs.push(limb('leg-'+x,bone?.12:.23,.65,.24,x,.65,0,bone?skin:'#514b87',bone?'plain':'trousers'));
  for(const x of [-.34,.34]){const arm=limb('arm-'+x,bone?.11:.2,.65,bone?.11:.22,x,1.3,0,skin);arm.rotation.x=bone?.85:Math.PI/2;}
  if(bone){const bow=new THREE.Group();bow.name='bow';bow.position.set(.42,.95,-.48);group.add(bow);for(let i=0;i<5;i++){const part=box('bow-wood-'+i,.06,.18,.06,Math.sin(i/4*Math.PI)*.17,(i-2)*.14,0,'#8a6034','plain','',bow);part.rotation.z=(i-2)*.35;}box('bow-string',.018,.66,.018,0,0,0,'#ded9bd','plain','',bow);}
 }else if(kind==='enderman'){
  for(const x of [-.13,.13])legs.push(limb('leg-'+x,.13,1.4,.13,x,1.4,0,'#17141e'));box('torso',.5,.9,.25,0,1.85,0,'#18141f');box('head',.5,.5,.5,0,2.55,0,'#17141e','plain','enderman');for(const x of [-.33,.33])limb('arm-'+x,.12,1.7,.12,x,2.3,0,'#17141e');
 }else if(kind==='spider'){
  box('abdomen',.8,.45,.8,0,.45,.28,'#3a302d');box('thorax',.5,.35,.5,0,.4,-.28,'#342c2b');box('head',.5,.38,.5,0,.4,-.65,'#30282a','plain','spider');for(const side of [-1,1])for(let i=0;i<4;i++){const leg=limb('leg-'+side+'-'+i,.09,.65,.09,side*.4,.45,(i-1.5)*.24,'#352d2c');leg.rotation.z=side*1.2;leg.rotation.y=(i-1.5)*.35;leg.userData.restX=0;legs.push(leg);box('leg-tip',.085,.34,.085,0,-.66,0,'#292426','plain','',leg);}
 }else if(['cow','pig','sheep'].includes(kind)){
  const sheep=kind==='sheep',pig=kind==='pig',color=sheep?'#e5e0d5':pig?'#d89391':'#534034',style=sheep?'wool':pig?'plain':'cow',height=pig?.55:.65;
  fourLegs(.19,height,.2,.26,.4,pig?'#bf7778':sheep?'#aa9682':'#4a3b35');box('body',sheep?.88:.78,sheep?.78:pig?.6:.8,1.15,0,height+(sheep?.39:pig?.3:.4),.06,color,style);
  box('head',sheep?.46:.55,pig?.5:.6,.5,0,pig?1:1.15,-.72,sheep?'#84796c':color,sheep?'plain':style,kind);
  for(const side of [-1,1])box('ear-'+side,.18,.12,.17,side*.34,pig?1.22:1.37,-.7,pig?'#c17d7e':sheep?'#b5a997':'#6e5142');
  if(kind==='cow'){for(const x of [-.22,.22])box('horn-'+x,.1,.19,.1,x,1.51,-.7,'#d6d0bd');box('udder',.27,.16,.34,0,.6,.35,'#bf8e89');}
  if(pig){box('snout',.31,.21,.13,0,.91,-1.025,'#e6a09d','plain','pig');for(const [x,y]of [[0,.85],[.1,.85],[.1,.96]])box('tail',.1,.1,.12,x,y,.7,'#d28c8e');}
 }else if(kind==='chicken'){
  box('body',.5,.5,.65,0,.61,0,'#e9e7dc');box('head',.38,.47,.38,0,1,-.3,'#efeee7','plain','chicken');box('beak',.25,.13,.2,0,.96,-.57,'#d6a238');box('wattle',.12,.2,.1,0,.78,-.51,'#b73731');for(const side of [-1,1]){legs.push(limb('leg-'+side,.07,.35,.07,side*.13,.35,0,'#c79b42'));box('foot-'+side,.17,.05,.24,side*.13,.035,-.08,'#c79b42');box('wing-'+side,.12,.38,.45,side*.3,.63,.02,'#d4d0c4');}box('tail',.28,.28,.12,0,.8,.35,'#dedbd1').rotation.x=-.5;
 }else if(kind==='bat'){
  box('body',.27,.4,.25,0,.6,0,'#5b4332');box('head',.3,.28,.28,0,.92,-.06,'#694d37','plain','bat');for(const side of [-1,1]){box('ear-'+side,.1,.19,.08,side*.11,1.13,-.05,'#694d37');const wing=new THREE.Group();wing.position.set(side*.12,.75,0);wing.userData.side=side;group.add(wing);wings.push(wing);box('wing-'+side,.6,.055,.4,side*.3,0,0,'#3f2b25','plain','',wing);for(let i=0;i<3;i++)box('wing-finger',.04,.07,.48,side*(.12+i*.17),0,.04,'#765744','plain','',wing);}
 }else if(kind==='squid'){
  box('mantle',.7,.8,.7,0,.9,0,'#3d5368','plain','squid');for(let i=0;i<8;i++){const leg=limb('tentacle-'+i,.1,.5,.1,Math.cos(i*Math.PI/4)*.29,.5,Math.sin(i*Math.PI/4)*.29,'#435a70');legs.push(leg);}box('mouth',.25,.02,.25,0,.49,0,'#6c333a');
 }else if(kind==='dolphin'){
  box('body',.5,.45,1.3,0,.6,0,'#6d949a');box('head',.42,.36,.45,0,.63,-.72,'#7ca1a5');box('snout',.25,.16,.45,0,.52,-1.09,'#8eb0b1');box('tail',.2,.2,.45,0,.57,.82,'#6b9197');box('flukes',.78,.08,.34,0,.58,1.03,'#6b9197');box('dorsal-fin',.08,.3,.35,0,.93,.1,'#5b8187').rotation.x=-.45;for(const side of [-1,1]){box('flipper-'+side,.36,.07,.37,side*.35,.42,-.24,'#729a9e').rotation.z=side*.25;box('eye-'+side,.02,.06,.07,side*.215,.7,-.8,'#202a2d');}
 }else if(kind==='axolotl'){
  box('body',.42,.25,.85,0,.27,.05,'#e5a6b3');box('head',.64,.35,.44,0,.36,-.54,'#efb6c3','plain','axolotl');fourLegs(.1,.16,.18,.3,.26,'#d98fa6');for(const side of [-1,1])for(let i=0;i<3;i++){const gill=box('gill-'+side+'-'+i,.22,.055,.08,side*.4,.27+i*.12,-.5,'#c9658a');gill.rotation.z=side*(i-1)*.6;}box('tail',.2,.18,.6,0,.25,.74,'#e3a0b4');box('tail-fin',.035,.34,.55,0,.3,.78,'#d77da0');
 }else {
  const salmon=kind==='salmon',color=salmon?'#ba7065':'#b5a48a',length=salmon?1.05:.65;
  box('body',.24,.35,length,0,.4,0,color,salmon?'salmon':'plain');box('head',.25,.34,.25,0,.4,-length/2-.1,salmon?'#7c8564':'#c6b89d');box('tail-fin',.045,.42,.27,0,.4,length/2+.17,salmon?'#995e54':'#a79475');box('dorsal-fin',.035,.18,.35,0,.65,0,salmon?'#829067':'#a08d70');for(const side of [-1,1]){box('eye-'+side,.02,.07,.07,side*.132,.46,-length/2-.14,'#1d2422');box('fin-'+side,.2,.04,.2,side*.18,.3,-.05,color);}
 }
 group.userData.hitbox={width:kind==='spider'?1.4:.9,height:kind==='spider'?.8:kind==='enderman'?2.9:1.8};group.userData.kind=kind;group.name='mob:'+m.id;group.position.set(m.x,m.y,m.z);return {group,legs,wings,target:m};
}
export function disposeMobModel(model){const geometries=new Set(),materials=new Set(),maps=new Set();model.group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const mat of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){materials.add(mat);if(mat.map)maps.add(mat.map);}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const map of maps)map.dispose();}
