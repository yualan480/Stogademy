import {ITEMS} from '../items.js';
export const EAT_DURATION_MS=1600;
export function tickEating(s,p){
 const now=s.g.now(),id=s.selected(p),food=ITEMS[id]?.food;
 if(!p.input.eat||now-(p.lastInput??-Infinity)>350||p.input.mine||p.survival.health<=0||p.survival.sleeping||p.survival.container||!food||!(p.inventory[id]>0)||p.survival.hunger>=20){p.eating=null;return;}
 if(!p.eating||p.eating.id!==id||p.eating.slot!==p.selected){p.eating={id,slot:p.selected,started:now};return;}
 if(now-p.eating.started<EAT_DURATION_MS)return;
 s.atomic(p,()=>{p.inventory[id]--;p.survival.hunger=Math.min(20,p.survival.hunger+food);p.survival.saturation=Math.min(p.survival.hunger,(p.survival.saturation||0)+food*([110,115].includes(id)?1.6:1.2));p.survival.health=Math.min(20,p.survival.health+Math.max(1,food/2));p.eating=p.inventory[id]>0&&p.survival.hunger<20?{id,slot:p.selected,started:now}:null;});
}
