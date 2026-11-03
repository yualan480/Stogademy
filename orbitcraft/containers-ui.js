import {ITEMS,itemName,RECIPES,SMELTING} from './items.js';
import {matchGrid,recipePattern} from './crafting-grid.js';
export function createContainerView({send,icon}){
 const $=id=>document.getElementById(id);let state={},kind='hand',point={x:innerWidth/2,y:innerHeight/2};
 const cursor=document.createElement('div');cursor.id='carried-item';cursor.hidden=true;cursor.setAttribute('aria-hidden','true');$('inventory').append(cursor);
 const panel=$('furnace-controls');panel.innerHTML='<div class="furnace-layout"><button id="furnace-input" aria-label="Furnace input" class="ingredient"></button><div class="furnace-flame" aria-hidden="true">♨</div><button id="furnace-fuel" aria-label="Furnace fuel" class="ingredient"></button><span class="furnace-arrow" aria-hidden="true">➜</span><button id="furnace-output" aria-label="Furnace output" class="ingredient"></button></div><small id="furnace-status" role="status"></small>';
 function position(){cursor.style.left=point.x+'px';cursor.style.top=point.y+'px';}
 document.addEventListener('pointermove',e=>{point={x:e.clientX,y:e.clientY};position();});
 function paint(el,stack,label){el.style.backgroundImage=stack?`url("${icon(stack.id)}")`:'';el.textContent=stack?.count>1?stack.count:'';el.title=stack?`${itemName(stack.id)} (${stack.count})`:label;el.setAttribute('aria-label',el.title);}
 function click(area,index,e){e?.preventDefault();if(e){point={x:e.clientX,y:e.clientY};position();}send({type:'container-click',area,index,right:e?.button===2});}
 for(const area of ['input','fuel','output']){const b=$('furnace-'+area);b.onclick=e=>click(area,0,e);b.oncontextmenu=e=>click(area,0,e);}
 $('recipe-output').onclick=()=>send({type:'container-craft'});
 $('recipe-list').onchange=()=>help();
 function help(){if(kind==='furnace'){const raw=Number($('recipe-list').value);$('recipe-needs').textContent=SMELTING[raw]?`${itemName(raw)} + fuel → ${itemName(SMELTING[raw])}`:'';return;}const r=RECIPES.find(r=>r.id===$('recipe-list').value);$('recipe-needs').textContent=r?`${r.name}: ${Object.entries(r.ingredients).map(([id,n])=>`${n} ${itemName(+id)}`).join(', ')}. Place items in the grid.`:'';}
 const book=document.createElement('button');book.id='recipe-book';book.type='button';book.textContent='▣';book.title='Recipes';book.setAttribute('aria-label','Show recipes');$('survival-crafting').append(book);let showRecipes=false;book.onclick=()=>{showRecipes=!showRecipes;$('recipe-list').hidden=!showRecipes;$('recipe-needs').hidden=!showRecipes;help();};$('recipe-list').hidden=true;$('recipe-needs').hidden=true;
 function render(){const c=state.container;$('inventory').dataset.station=kind;cursor.hidden=!c?.cursor||!$('inventory').open;paint(cursor,c?.cursor,'Carried item');position();const size=kind==='table'?3:2,grid=$('recipe-pattern');if(grid.children.length!==size*size)grid.replaceChildren();grid.style.gridTemplateColumns=`repeat(${size},var(--craft-cell,32px))`;
 for(let i=0;i<size*size;i++){let b=grid.children[i];if(!b){b=document.createElement('button');b.type='button';b.className='ingredient';b.onclick=e=>click('grid',i,e);b.oncontextmenu=e=>click('grid',i,e);grid.append(b);}paint(b,c?.grid?.[i],`Crafting slot ${i+1}`);}
 const r=c&&matchGrid(c.grid,size);paint($('recipe-output'),r?{id:r.out,count:r.count}:null,'Crafting output');$('recipe-output').disabled=!r;
 const f=state.furnace;paint($('furnace-input'),f?.input,'Furnace input');paint($('furnace-fuel'),f?.fuelStack,'Furnace fuel');const output=Object.entries(f?.output||{}).find(([,n])=>n>0);paint($('furnace-output'),output?{id:+output[0],count:output[1]}:null,'Furnace output');panel.classList.toggle('burning',!!f?.job);
 $('station-name').textContent=kind==='furnace'?'Furnace':'Crafting';$('furnace-controls').hidden=kind!=='furnace';
 }
 function open(next){kind=next;const options=kind==='furnace'?Object.entries(SMELTING).map(([id,out])=>({id,name:itemName(+id)+' → '+itemName(out)})):RECIPES.filter(r=>r.station==='hand'||kind==='table');$('recipe-list').replaceChildren(...options.map(r=>{const o=document.createElement('option');o.value=r.id;o.textContent=r.name;return o;}));showRecipes=false;$('recipe-list').hidden=true;$('recipe-needs').hidden=true;send({type:'container-open',kind});render();}
 $('inventory').addEventListener('close',()=>{cursor.hidden=true;send({type:'container-close'});});
 return {open,render,update(next){state=next;kind=next.container?.kind||kind;render();},bag(index,e){click('bag',index,e);}};
}
