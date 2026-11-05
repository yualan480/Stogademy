import {ITEMS} from './items.js';
export function showDurability(element,id,state,label=element.title){
 element.querySelector('.durability-strip')?.remove();const item=ITEMS[id];if(!item?.durability)return;
 const remaining=Math.max(0,Math.min(item.durability,state.durability?.[id]??item.durability)),ratio=remaining/item.durability;
 const bar=document.createElement('i');bar.className='durability-strip';bar.setAttribute('aria-hidden','true');bar.style.setProperty('--durability',ratio*100+'%');bar.style.setProperty('--durability-color',`hsl(${ratio*120} 90% 45%)`);element.append(bar);
 element.title=`${label} — Durability ${remaining} / ${item.durability}`;element.setAttribute('aria-label',element.title);
}
