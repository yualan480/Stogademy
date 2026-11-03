import {stacks,setLayout} from '../inventory.js';
import {ITEMS,SMELTING,FUEL} from '../items.js';
import {matchGrid} from '../crafting-grid.js';
export function returnContainer(p,tx){const c=p.survival.container;if(!c)return;if(tx)stacks(p);const returned={};for(const item of [c.cursor,...c.grid||[]])if(item){p.inventory[item.id]=(p.inventory[item.id]||0)+item.count;returned[item.id]=(returned[item.id]||0)+item.count;}p.survival.container=null;
 if(tx){const represented={};for(const stack of stacks(p))if(stack)represented[stack.id]=(represented[stack.id]||0)+stack.count;for(const [id,n]of Object.entries(returned)){const overflow=Math.min(n,Math.max(0,(p.inventory[id]||0)-(represented[id]||0)));if(overflow){p.inventory[id]-=overflow;tx.drop(+id,overflow,{x:Math.floor(p.x),y:p.y,z:Math.floor(p.z)});}}}}

export function context(s,p,kind){if(kind==='hand')return null;const a=p.station;if(!a||Math.hypot(a.x+.5-p.x,a.y-p.y,a.z+.5-p.z)>6)throw Error('Stand beside the station.');const id=s.g.get(a.x,a.y,a.z);if(kind==='table'&&id!==18||kind==='furnace'&&![19,24].includes(id)||kind==='chest'&&id!==23)throw Error('Station is no longer here.');return a;}
export function startFurnace(s,key){const f=s.world.furnaces[key];if(!f||f.job||!f.input||!SMELTING[f.input.id])return;const [x,y,z]=key.split(',').map(Number);if(!s.g.simulated({x,z}))return;if(s.g.get(x,y,z)===24&&[109,114].includes(f.input.id))return;if((f.fuel||0)<1){const stack=f.fuelStack;if(!stack||!FUEL[stack.id])return;f.fuel=(f.fuel||0)+FUEL[stack.id];if(!--stack.count)f.fuelStack=null;if(f.fuel<1)return;}f.fuel--;const out=SMELTING[f.input.id];if(!--f.input.count)f.input=null;f.job={out,done:s.world.time+(s.g.get(x,y,z)===24?100:200)};}
export function containerMessage(s,p,m){
 if(!['container-open','container-close','container-click','container-craft'].includes(m.type))return false;
 if(m.type==='container-close'){s.atomic(p,tx=>returnContainer(p,tx));return true;}
 if(m.type==='container-open'){const kind=m.kind;if(!['hand','table','furnace','chest'].includes(kind))return true;context(s,p,kind);s.atomic(p,tx=>{returnContainer(p,tx);p.survival.container={kind,size:kind==='table'?3:2,grid:Array(kind==='chest'?0:kind==='table'?9:4).fill(null),cursor:null};});return true;}
 const c=p.survival.container;if(!c)return true;const a=context(s,p,c.kind);
 s.atomic(p,()=>{
  if(m.type==='container-craft'){if(c.kind==='furnace'||c.kind==='chest')return;const r=matchGrid(c.grid,c.size);if(!r)return;if(c.cursor&&(c.cursor.id!==r.out||c.cursor.count+r.count>64))return;if(ITEMS[r.out]?.durability&&(p.inventory[r.out]>0||c.cursor?.id===r.out))throw Error('You already have this tool or armor.');for(let i=0;i<c.grid.length;i++)if(c.grid[i]&&!--c.grid[i].count)c.grid[i]=null;c.cursor={id:r.out,count:(c.cursor?.count||0)+r.count};if(ITEMS[r.out]?.durability)p.survival.durability[r.out]=ITEMS[r.out].durability;return;}
  const area=m.area,index=m.index;
  const access=containerSlot(s,p,c,area,index);if(!access)return;let slot=access.get();const put=access.put;
  if(area==='output'){if(!slot||c.cursor&&c.cursor.id!==slot.id)return;const n=Math.min(slot.count,64-(c.cursor?.count||0));if(n<1)return;put(slot.count===n?null:{...slot,count:slot.count-n});c.cursor={id:slot.id,count:(c.cursor?.count||0)+n};return;}
  if(c.cursor&&!access.accept(c.cursor.id))return;
  const cursor=c.cursor;
  if(!cursor){if(!slot)return;const n=m.right?Math.ceil(slot.count/2):slot.count;c.cursor={id:slot.id,count:n};put(slot.count===n?null:{...slot,count:slot.count-n});}
  else if(!slot||slot.id===cursor.id){const n=Math.min(m.right?1:cursor.count,64-(slot?.count||0));if(n<=0)return;put({id:cursor.id,count:(slot?.count||0)+n});cursor.count-=n;if(!cursor.count)c.cursor=null;}
  else if(!m.right){put({...cursor});c.cursor={...slot};}
  if(c.kind==='furnace')startFurnace(s,`${a.x},${a.y},${a.z}`);
 });return true;
}

export function chestStacks(s,key){s.world.chestLayouts??={};s.world.chestCounts??={};const fake={inventory:s.world.chests[key]??={},survival:{layout:s.world.chestLayouts[key]||[],layoutCounts:s.world.chestCounts[key]}};const list=stacks(fake).slice(0,27);s.world.chestLayouts[key]=list.map(v=>v?.id||0);s.world.chestCounts[key]=list.map(v=>v?.count||0);return list;}
export function containerSlot(s,p,c,area,index){
 if(area==='offhand')return {get:()=>p.survival.offhand,accept:()=>true,put:value=>p.survival.offhand=value};
 if(area==='bag'){if(!Number.isInteger(index)||index<0||index>=36)return null;return {get:()=>stacks(p)[index],accept:()=>true,put:value=>{const list=stacks(p),old=list[index];if(old)p.inventory[old.id]-=old.count;if(value)p.inventory[value.id]=(p.inventory[value.id]||0)+value.count;list[index]=value;setLayout(p,list);}};}
 if(area==='grid'&&c.kind!=='furnace'&&c.kind!=='chest'){if(!Number.isInteger(index)||index<0||index>=c.grid.length)return null;return {get:()=>c.grid[index],accept:()=>true,put:value=>c.grid[index]=value};}
 const a=context(s,p,c.kind),key=a&&`${a.x},${a.y},${a.z}`;
 if(area==='chest'&&c.kind==='chest'){if(!Number.isInteger(index)||index<0||index>=27)return null;return {get:()=>chestStacks(s,key)[index],accept:()=>true,put:value=>{const list=chestStacks(s,key),bag=s.world.chests[key],old=list[index];if(old)bag[old.id]-=old.count;if(value)bag[value.id]=(bag[value.id]||0)+value.count;list[index]=value;s.world.chestLayouts[key]=list.map(v=>v?.id||0);s.world.chestCounts[key]=list.map(v=>v?.count||0);}};}
 if(c.kind==='furnace'&&['input','fuel','output'].includes(area)){const f=s.world.furnaces[key]??={output:{},fuel:0};if(area==='output')return {get:()=>{const e=Object.entries(f.output||{}).find(([,n])=>n>0);return e?{id:+e[0],count:e[1]}:null;},accept:()=>false,put:value=>{const e=Object.entries(f.output||{}).find(([,n])=>n>0);if(e)f.output[e[0]]=value?.count||0;}};const field=area==='input'?'input':'fuelStack';return {get:()=>f[field],accept:id=>!!(area==='input'?SMELTING[id]:FUEL[id]),put:value=>f[field]=value};}
 return null;
}
