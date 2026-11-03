import {ITEMS,itemName,RECIPES,SMELTING} from './items.js';
import {matchGrid,recipePattern} from './crafting-grid.js';
export function createContainerView({send,icon}){
 const $=id=>document.getElementById(id);let state={},kind='hand',point={x:innerWidth/2,y:innerHeight/2};
 const cursor=document.createElement('div');cursor.id='carried-item';cursor.hidden=true;cursor.setAttribute('aria-hidden','true');$('inventory').append(cursor);
 const panel=$('furnace-controls');panel.innerHTML='<div class="furnace-layout"><button id="furnace-input" aria-label="Furnace input" class="ingredient"></button><div class="furnace-flame" aria-hidden="true">♨</div><button id="furnace-fuel" aria-label="Furnace fuel" class="ingredient"></button><span class="furnace-arrow" aria-hidden="true">➜</span><button id="furnace-output" aria-label="Furnace output" class="ingredient"></button></div><small id="furnace-status" role="status"></small>';
 function position(){const scale=Number(getComputedStyle($('inventory')).zoom)||1;cursor.style.left=point.x/scale+'px';cursor.style.top=point.y/scale+'px';}
 document.addEventListener('pointermove',e=>{point={x:e.clientX,y:e.clientY};position();});
 function paint(el,stack,label){el.style.backgroundImage=stack?`url("${icon(stack.id)}")`:'';el.textContent=stack?.count>1?stack.count:'';el.title=stack?`${itemName(stack.id)} (${stack.count})`:label;el.setAttribute('aria-label',el.title);}
 let drag=null,suppressUntil=0,lastQuick=null;
 const slotOf=element=>{const b=element?.closest?.('[data-slot-area]');return b?{area:b.dataset.slotArea,index:+b.dataset.slotIndex}:null;};
 function quick(area,index,e){const previous=lastQuick,now=performance.now();let id=area==='bag'?state.slots?.[index]?.id:area==='chest'?state.chestSlots?.[index]?.id:null;const all=kind==='chest'&&previous&&previous.area===area&&previous.index===index&&now-previous.time<450;if(all)id=previous.id;lastQuick={area,index,id,time:now};send({type:'quick-move',area,index,id,all:!!all});}
 function click(area,index,e){e?.preventDefault();if(performance.now()<suppressUntil||drag)return;if(e){point={x:e.clientX,y:e.clientY};position();}if(e?.shiftKey&&!state.container?.cursor){quick(area,index,e);return;}send({type:'container-click',area,index,right:e?.button===2});}
 function tag(button,area,index){button.dataset.slotArea=area;button.dataset.slotIndex=index;}
 $('inventory').addEventListener('pointerdown',e=>{const slot=slotOf(e.target);if(!slot||!state.container?.cursor||e.shiftKey||![0,2].includes(e.button))return;e.preventDefault();drag={right:e.button===2,slots:new Map([[slot.area+':'+slot.index,slot]])};});
 $('inventory').addEventListener('pointerover',e=>{if(!drag)return;const slot=slotOf(e.target);if(slot)drag.slots.set(slot.area+':'+slot.index,slot);});
 addEventListener('pointerup',e=>{if(!drag)return;const d=drag;drag=null;if(d.slots.size>1){send({type:'container-drag',right:d.right,slots:[...d.slots.values()]});suppressUntil=performance.now()+150;}else if(d.right){const slot=[...d.slots.values()][0];send({type:'container-click',...slot,right:true});suppressUntil=performance.now()+150;}});
 function scalePanel(){if(!$('inventory').open)return;const dialog=$('inventory');const scale=Math.max(.4,Math.min(2.2,(innerWidth-24)/360,(innerHeight-24)/dialog.offsetHeight));dialog.style.zoom=String(scale);position();}
 addEventListener('resize',scalePanel);new ResizeObserver(()=>requestAnimationFrame(scalePanel)).observe($('inventory'));$('inventory').addEventListener('toggle',scalePanel);

 for(const area of ['input','fuel','output','offhand']){const b=area==='offhand'?$('offhand-button'):$('furnace-'+area);tag(b,area,0);b.onclick=e=>click(area,0,e);b.oncontextmenu=e=>click(area,0,e);}
 $('recipe-output').onclick=e=>{if(e.shiftKey)send({type:'quick-move',area:'craft-output'});else send({type:'container-craft'});};
 $('recipe-list').onchange=()=>help();
 function help(){if(kind==='furnace'){const raw=Number($('recipe-list').value);$('recipe-needs').textContent=SMELTING[raw]?`${itemName(raw)} + fuel → ${itemName(SMELTING[raw])}`:'';return;}const r=RECIPES.find(r=>r.id===$('recipe-list').value);$('recipe-needs').textContent=r?`${r.name}: ${Object.entries(r.ingredients).map(([id,n])=>`${n} ${itemName(+id)}`).join(', ')}. Place items in the grid.`:'';}
 const book=document.createElement('button');book.id='recipe-book';book.type='button';book.textContent='▣';book.title='Recipes';book.setAttribute('aria-label','Show recipes');$('survival-crafting').append(book);let showRecipes=false;book.onclick=()=>{showRecipes=!showRecipes;$('recipe-list').hidden=!showRecipes;$('recipe-needs').hidden=!showRecipes;help();};$('recipe-list').hidden=true;$('recipe-needs').hidden=true;
 function render(){const c=state.container;$('inventory').dataset.station=kind;cursor.hidden=!c?.cursor||!$('inventory').open;paint(cursor,c?.cursor,'Carried item');position();const size=kind==='table'?3:2,grid=$('recipe-pattern');if(grid.children.length!==size*size)grid.replaceChildren();grid.style.gridTemplateColumns=`repeat(${size},var(--craft-cell,32px))`;
 for(let i=0;i<size*size;i++){let b=grid.children[i];if(!b){b=document.createElement('button');b.type='button';b.className='ingredient';tag(b,'grid',i);b.onclick=e=>click('grid',i,e);b.oncontextmenu=e=>click('grid',i,e);grid.append(b);}paint(b,c?.grid?.[i],`Crafting slot ${i+1}`);}
 const r=c&&matchGrid(c.grid,size);paint($('recipe-output'),r?{id:r.out,count:r.count}:null,'Crafting output');$('recipe-output').disabled=!r;
 const f=state.furnace;paint($('furnace-input'),f?.input,'Furnace input');paint($('furnace-fuel'),f?.fuelStack,'Furnace fuel');const output=Object.entries(f?.output||{}).find(([,n])=>n>0);paint($('furnace-output'),output?{id:+output[0],count:output[1]}:null,'Furnace output');panel.classList.toggle('burning',!!f?.job);
 $('station-name').textContent=kind==='furnace'?'Furnace':kind==='chest'?'Chest':'Crafting';
 const chest=$('chest-items');if(chest.children.length!==27){chest.replaceChildren();for(let i=0;i<27;i++){const b=document.createElement('button');b.type='button';b.className='ingredient';tag(b,'chest',i);b.onclick=e=>click('chest',i,e);b.oncontextmenu=e=>click('chest',i,e);chest.append(b);}}for(let i=0;i<27;i++)paint(chest.children[i],state.chestSlots?.[i],`Chest slot ${i+1}`);
 $('chest-controls').hidden=kind!=='chest';$('furnace-controls').hidden=kind!=='furnace';
 }
 function open(next){kind=next;const options=kind==='furnace'?Object.entries(SMELTING).map(([id,out])=>({id,name:itemName(+id)+' → '+itemName(out)})):RECIPES.filter(r=>r.station==='hand'||kind==='table');$('recipe-list').replaceChildren(...options.map(r=>{const o=document.createElement('option');o.value=r.id;o.textContent=r.name;return o;}));showRecipes=false;$('recipe-list').hidden=true;$('recipe-needs').hidden=true;send({type:'container-open',kind});render();requestAnimationFrame(scalePanel);}
 $('inventory').addEventListener('close',()=>{cursor.hidden=true;send({type:'container-close'});});
 return {open,render,update(next){state=next;kind=next.container?.kind||kind;render();},bag(index,e){click('bag',index,e);}};
}
