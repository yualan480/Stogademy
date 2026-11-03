import {stacks} from '../inventory.js';
import {ITEMS,SMELTING,FUEL} from '../items.js';
import {matchGrid} from '../crafting-grid.js';
export function returnContainer(p,tx){const c=p.survival.container;if(!c)return;if(tx)stacks(p);const returned={};for(const item of [c.cursor,...c.grid||[]])if(item){p.inventory[item.id]=(p.inventory[item.id]||0)+item.count;returned[item.id]=(returned[item.id]||0)+item.count;}p.survival.container=null;
 if(tx){const represented={};for(const stack of stacks(p))if(stack)represented[stack.id]=(represented[stack.id]||0)+stack.count;for(const [id,n]of Object.entries(returned)){const overflow=Math.min(n,Math.max(0,(p.inventory[id]||0)-(represented[id]||0)));if(overflow){p.inventory[id]-=overflow;tx.drop(+id,overflow,{x:Math.floor(p.x),y:p.y,z:Math.floor(p.z)});}}}}

function context(s,p,kind){if(kind==='hand')return null;const a=p.station;if(!a||Math.hypot(a.x+.5-p.x,a.y-p.y,a.z+.5-p.z)>6)throw Error('Stand beside the station.');const id=s.g.get(a.x,a.y,a.z);if(kind==='table'&&id!==18||kind==='furnace'&&![19,24].includes(id))throw Error('Station is no longer here.');return a;}
export function startFurnace(s,key){const f=s.world.furnaces[key];if(!f||f.job||!f.input||!SMELTING[f.input.id])return;const [x,y,z]=key.split(',').map(Number);if(s.g.get(x,y,z)===24&&[109,114].includes(f.input.id))return;if((f.fuel||0)<1){const stack=f.fuelStack;if(!stack||!FUEL[stack.id])return;f.fuel=(f.fuel||0)+FUEL[stack.id];if(!--stack.count)f.fuelStack=null;if(f.fuel<1)return;}f.fuel--;const out=SMELTING[f.input.id];if(!--f.input.count)f.input=null;f.job={out,done:s.world.time+(s.g.get(x,y,z)===24?100:200)};}
export function containerMessage(s,p,m){
 if(!['container-open','container-close','container-click','container-craft'].includes(m.type))return false;
 if(m.type==='container-close'){s.atomic(p,tx=>returnContainer(p,tx));return true;}
 if(m.type==='container-open'){const kind=m.kind;if(!['hand','table','furnace'].includes(kind))return true;context(s,p,kind);s.atomic(p,tx=>{returnContainer(p,tx);p.survival.container={kind,size:kind==='table'?3:2,grid:Array(kind==='table'?9:4).fill(null),cursor:null};});return true;}
 const c=p.survival.container;if(!c)return true;const a=context(s,p,c.kind);
 s.atomic(p,()=>{
  if(m.type==='container-craft'){if(c.kind==='furnace')return;const r=matchGrid(c.grid,c.size);if(!r)return;if(c.cursor&&(c.cursor.id!==r.out||c.cursor.count+r.count>64))return;if(ITEMS[r.out]?.durability&&(p.inventory[r.out]>0||c.cursor?.id===r.out))throw Error('You already have this tool or armor.');for(let i=0;i<c.grid.length;i++)if(c.grid[i]&&!--c.grid[i].count)c.grid[i]=null;c.cursor={id:r.out,count:(c.cursor?.count||0)+r.count};if(ITEMS[r.out]?.durability)p.survival.durability[r.out]=ITEMS[r.out].durability;return;}
  const area=m.area,index=m.index;let slot,put;
  if(area==='bag'){if(!Number.isInteger(index)||index<0||index>=36)return;const bag=stacks(p);slot=bag[index];put=value=>{if(slot)p.inventory[slot.id]-=slot.count;if(value)p.inventory[value.id]=(p.inventory[value.id]||0)+value.count;bag[index]=value;p.survival.layout=bag.map(v=>v?.id||0);p.hotbar=bag.slice(0,9).map(v=>v?.id||0);};}
  else if(area==='grid'&&c.kind!=='furnace'){if(!Number.isInteger(index)||index<0||index>=c.grid.length)return;slot=c.grid[index];put=value=>c.grid[index]=value;}
  else if(['input','fuel','output'].includes(area)&&c.kind==='furnace'){const key=`${a.x},${a.y},${a.z}`,f=s.world.furnaces[key]??={output:{},fuel:0};if(area==='output'){const entry=Object.entries(f.output).find(([,n])=>n>0);if(!entry)return;const [id,n]=entry;if(c.cursor&&c.cursor.id!==+id)return;const take=Math.min(n,64-(c.cursor?.count||0));if(take<1)return;f.output[id]-=take;c.cursor={id:+id,count:(c.cursor?.count||0)+take};return;}const field=area==='input'?'input':'fuelStack';if(c.cursor&&!(area==='input'?SMELTING[c.cursor.id]:FUEL[c.cursor.id]))return;slot=f[field];put=value=>f[field]=value;}
  else return;
  const cursor=c.cursor;
  if(!cursor){if(!slot)return;const n=m.right?Math.ceil(slot.count/2):slot.count;c.cursor={id:slot.id,count:n};put(slot.count===n?null:{...slot,count:slot.count-n});}
  else if(!slot||slot.id===cursor.id){const n=Math.min(m.right?1:cursor.count,64-(slot?.count||0));if(n<=0)return;put({id:cursor.id,count:(slot?.count||0)+n});cursor.count-=n;if(!cursor.count)c.cursor=null;}
  else if(!m.right){put({...cursor});c.cursor={...slot};}
  if(c.kind==='furnace')startFurnace(s,`${a.x},${a.y},${a.z}`);
 });return true;
}
