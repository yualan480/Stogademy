import {containerSlot,context,startFurnace,chestStacks} from './containers.js';
import {ITEMS,SMELTING,FUEL,stackLimit} from '../items.js';
import {matchGrid} from '../crafting-grid.js';
import {stacks,swapSlots,setLayout} from '../inventory.js';
export function containerShortcut(s,p,m){
 if(!['container-drag','quick-move','container-hotbar','container-offhand'].includes(m.type))return false;const c=p.survival.container;if(!c)return true;const at=context(s,p,c.kind),key=at&&`${at.x},${at.y},${at.z}`;
 s.atomic(p,()=>{
  if(m.type==='container-drag'){
   if(!c.cursor||!Array.isArray(m.slots))return;const seen=new Set(),targets=[];
   for(const spec of m.slots.slice(0,72)){if(!spec||spec.area==='output')continue;const k=spec.area+':'+spec.index;if(seen.has(k))continue;seen.add(k);const a=containerSlot(s,p,c,spec.area,spec.index);if(!a||!a.accept(c.cursor.id))continue;const v=a.get();if(!v||v.id===c.cursor.id&&v.count<stackLimit(c.cursor.id))targets.push(a);}
   if(!m.right&&targets.length>c.cursor.count)targets.length=c.cursor.count;
   const n=m.right?1:Math.floor(c.cursor.count/Math.max(1,targets.length));if(n<1)return;
   for(const a of targets){if(!c.cursor)break;const old=a.get(),amount=Math.min(n,c.cursor.count,stackLimit(c.cursor.id)-(old?.count||0));if(amount<1)continue;a.put({id:c.cursor.id,count:(old?.count||0)+amount});c.cursor.count-=amount;if(!c.cursor.count)c.cursor=null;}
  }else if(m.type==='container-offhand'){
   if(m.area==='offhand')return;const slot=containerSlot(s,p,c,m.area,m.index);if(!slot)return;const item=slot.get(),off=p.survival.offhand;if(off&&!slot.accept(off.id))return;slot.put(off||null);p.survival.offhand=item||null;
  }else if(m.type==='container-hotbar'){
   if(!Number.isInteger(m.to)||m.to<0||m.to>8)return;if(m.area==='bag'){swapSlots(p,m.index,m.to);return;}const a=containerSlot(s,p,c,m.area,m.index),b=containerSlot(s,p,c,'bag',m.to);if(!a||!b)return;const av=a.get(),bv=b.get();if(bv&&!a.accept(bv.id)||av&&!b.accept(av.id))return;if(m.area==='bag'&&m.index===m.to)return;a.put(bv||null);b.put(av||null);
  }else{
   if(m.area==='craft-output'){
    if(!['hand','table'].includes(c.kind))return;
    const r=matchGrid(c.grid,c.size);if(!r)return;
    if(ITEMS[r.out]?.durability&&(p.inventory[r.out]>0||c.cursor?.id===r.out))return;
    // The carried stack is independent of shift-crafting. Prefer hotbar stacks,
    // then empty hotbar slots, before using the main inventory.
    const slots=stacks(p),hotbar=Array.from({length:9},(_,i)=>i),bag=Array.from({length:27},(_,i)=>i+9);
    const targets=[...hotbar.filter(i=>slots[i]?.id===r.out),...hotbar.filter(i=>!slots[i]),...bag.filter(i=>slots[i]?.id===r.out),...bag.filter(i=>!slots[i])];
    const capacity=targets.reduce((n,i)=>n+stackLimit(r.out)-(slots[i]?.count||0),0);
    const times=Math.min(ITEMS[r.out]?.durability?1:Math.floor(64/r.count),Math.floor(capacity/r.count),...c.grid.filter(Boolean).map(v=>v.count));
    if(times<1)return;
    for(let i=0;i<c.grid.length;i++)if(c.grid[i]){c.grid[i].count-=times;if(!c.grid[i].count)c.grid[i]=null;}
    const count=r.count*times;p.inventory[r.out]=(p.inventory[r.out]||0)+count;
    let remaining=count;for(const i of targets){const n=Math.min(remaining,stackLimit(r.out)-(slots[i]?.count||0));slots[i]={id:r.out,count:(slots[i]?.count||0)+n};remaining-=n;if(!remaining)break;}
    setLayout(p,slots);if(ITEMS[r.out]?.durability)p.survival.durability[r.out]=ITEMS[r.out].durability;return;
   }
   if(c.cursor)return;
   let source=containerSlot(s,p,c,m.area,m.index);if(!source)return;let value=source.get();
   if(m.all&&c.kind==='chest'&&Number.isInteger(m.id)&&m.id>0){const bag=m.area==='bag'?p.inventory:s.world.chests[key];if(bag?.[m.id]>0)value={id:m.id,count:bag[m.id]};}
   if(!value)return;let remaining=value.count;
   const targets=m.area==='bag'?(c.kind==='chest'?Array.from({length:27},(_,index)=>containerSlot(s,p,c,'chest',index)):c.kind==='furnace'?[containerSlot(s,p,c,SMELTING[value.id]?'input':'fuel',0)]:c.grid.map((_,index)=>containerSlot(s,p,c,'grid',index))):Array.from({length:36},(_,index)=>containerSlot(s,p,c,'bag',index));
   for(const target of [...targets.filter(a=>a?.get()?.id===value.id),...targets.filter(a=>a&&!a.get())]){if(!remaining)break;if(!target.accept(value.id))continue;const v=target.get(),n=Math.min(remaining,stackLimit(value.id)-(v?.count||0));if(n>0){target.put({id:value.id,count:(v?.count||0)+n});remaining-=n;}}
   const moved=value.count-remaining;if(moved){if(m.all&&c.kind==='chest'){const bag=m.area==='bag'?p.inventory:s.world.chests[key];bag[value.id]-=moved;}else source.put(remaining?{id:value.id,count:remaining}:null);}
  }
  if(c.kind==='furnace')startFurnace(s,key);
 });return true;
}
