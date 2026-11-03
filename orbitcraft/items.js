// Shared item definitions and recipes. The server validates every transaction.
export const PUNCH_DAMAGE=1; // Half a heart before armor or shields.
export const ITEMS={};
const add=(id,name,extra={})=>ITEMS[id]={id,name,...extra};
for(const [id,name] of [[11,'Cobblestone'],[12,'Gravel'],[13,'Coal ore'],[14,'Iron ore'],[15,'Diamond ore'],[16,'Gold ore'],[17,'Ancient debris'],[18,'Crafting table'],[19,'Furnace'],[20,'Bed'],[21,'Farmland'],[22,'Wheat crop'],[23,'Chest'],[24,'Blast furnace'],[25,'Torch']])add(id,name,{block:true});
for(const [id,name] of [[100,'Stick'],[101,'Coal'],[102,'Raw iron'],[103,'Iron ingot'],[104,'Raw gold'],[105,'Gold ingot'],[106,'Diamond'],[107,'Netherite scrap'],[108,'Netherite ingot'],[109,'Raw meat'],[110,'Cooked meat'],[111,'Wheat'],[112,'Bread'],[113,'Seeds'],[114,'Raw fish'],[115,'Cooked fish'],[116,'Wool'],[117,'Apple'],[118,'Rotten flesh'],[119,'Bone'],[180,'Fishing rod'],[181,'Shield'],[230,'Gunpowder'],[231,'String'],[232,'Oak boat']])add(id,name);
for(const [id,food] of [[109,3],[110,8],[112,5],[114,2],[115,6],[117,4],[118,2]])ITEMS[id].food=food;
export const TIERS=[{name:'Wooden',base:120,material:10,tier:0,speed:2,uses:59},{name:'Stone',base:130,material:11,tier:1,speed:4,uses:131},{name:'Iron',base:140,material:103,tier:2,speed:6,uses:250},{name:'Gold',base:150,material:105,tier:0,speed:12,uses:32},{name:'Diamond',base:160,material:106,tier:3,speed:8,uses:1561},{name:'Netherite',base:170,material:108,tier:4,speed:9,uses:2031}];
const tools=['pickaxe','axe','sword','shovel','hoe'];
for(const t of TIERS)tools.forEach((tool,i)=>add(t.base+i,`${t.name} ${tool}`,{tool,tier:t.tier,speed:t.speed,durability:t.uses,damage:tool==='sword'?4+Math.min(t.tier,4):tool==='axe'?5+Math.min(t.tier,4):2}));
ITEMS[180].durability=64;ITEMS[181].durability=336;ITEMS[181].slot='shield';
for(const [base,name,material,defense] of [[190,'Iron',103,[2,6,5,2]],[200,'Diamond',106,[3,8,6,3]],[210,'Netherite',108,[3,8,6,3]],[220,'Gold',105,[2,5,3,1]]])['helmet','chestplate','leggings','boots'].forEach((slot,i)=>add(base+i,`${name} ${slot}`,{slot,defense:defense[i],durability:base===210?480:base===200?400:base===190?240:100,material}));
export const RECIPES=[];
const recipe=(id,name,ingredients,out,count=1,station='hand',pattern=[])=>RECIPES.push({id,name,ingredients,out,count,station,pattern});
recipe('planks','Oak planks',{5:1},10,4,'hand',[5]);recipe('sticks','Sticks',{10:2},100,4,'hand',[10,0,10]);recipe('table','Crafting table',{10:4},18,1,'hand',[10,10,10,10]);
recipe('torch','Torch',{101:1,100:1},25,4,'hand',[101,0,100]);recipe('boat','Oak boat',{10:5},232,1,'table',[10,0,10,10,10,10]);
recipe('chest','Chest',{10:8},23,1,'table',[10,10,10,10,0,10,10,10,10]);recipe('blast','Blast furnace',{19:1,103:5,3:3},24,1,'table',[103,103,103,103,19,103,3,3,3]);
recipe('furnace','Furnace',{11:8},19,1,'table',[11,11,11,11,0,11,11,11,11]);recipe('bed','Bed',{116:3,10:3},20,1,'table',[116,116,116,10,10,10]);recipe('bread','Bread',{111:3},112,1,'table',[111,111,111]);recipe('rod','Fishing rod',{100:3,231:2},180,1,'table',[0,0,100,0,100,231,100,0,231]);recipe('shield','Shield',{10:6,103:1},181,1,'table',[10,103,10,10,10,10,0,10,0]);
for(const t of TIERS)for(let i=0;i<5;i++){
 const id=t.base+i;if(t.base===170){recipe('tool'+id,ITEMS[id].name,{[160+i]:1,108:1},id,1,'table');continue;}
 const n=[3,3,2,1,2][i],sticks=i===2?1:2;
 const patterns=[[t.material,t.material,t.material,0,100,0,0,100,0],[t.material,t.material,0,t.material,100,0,0,100,0],[0,t.material,0,0,t.material,0,0,100,0],[0,t.material,0,0,100,0,0,100,0],[t.material,t.material,0,0,100,0,0,100,0]];
 recipe('tool'+id,ITEMS[id].name,{[t.material]:n,100:sticks},id,1,'table',patterns[i]);
}
recipe('netherite','Netherite ingot',{107:4,105:4},108,1,'table');
for(const [id,item] of Object.entries(ITEMS))if(item.slot&&Number(id)!==181){const i=['helmet','chestplate','leggings','boots'].indexOf(item.slot),n=[5,8,7,4][i];recipe('armor'+id,item.name,Number(id)>=210&&Number(id)<214?{[200+i]:1,108:1}:{[item.material]:n},Number(id),1,'table');}
export const SMELTING={11:3,102:103,104:105,17:107,109:110,114:115};
export const FUEL={101:8,5:2,10:1,100:.5};
export const itemName=id=>ITEMS[id]?.name||({1:'Grass block',2:'Dirt',3:'Stone',4:'Sand',5:'Oak log',6:'Oak leaves',7:'Snow',8:'Water',9:'Bedrock',10:'Oak planks'})[id]||'Item';
export const isBlock=id=>id>0&&id<=25;
export const defaultHotbar=[2,3,5,10,4,1,6,7,0];
