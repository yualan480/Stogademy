// Aggregate counts remain compatible with old saves; layout stores 36 real stacks.
export function stacks(p,{strict=false}={}){
 const left={...p.inventory},layout=p.survival?.layout||[...(p.hotbar||Array(9).fill(0)),...Array(27).fill(0)],slots=Array(36).fill(null);
 for(let i=0;i<36;i++){const id=layout[i];if(id&&left[id]>0){const count=Math.min(64,left[id]);slots[i]={id,count};left[id]-=count;}}
 for(const [key,n]of Object.entries(left)){const id=+key;let count=n;while(count>0){const i=slots.indexOf(null);if(i<0){if(strict)throw Error('Your 36 inventory slots are full. Store items in a chest.');break;}const amount=Math.min(64,count);slots[i]={id,count:amount};count-=amount;}}
 if(p.survival)p.survival.layout=slots.map(s=>s?.id||0);p.hotbar=slots.slice(0,9).map(s=>s?.id||0);return slots;
}
export function swapSlots(p,from,to){if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||from>=36||to<0||to>=36)return;const slots=stacks(p);[slots[from],slots[to]]=[slots[to],slots[from]];p.survival.layout=slots.map(s=>s?.id||0);p.hotbar=slots.slice(0,9).map(s=>s?.id||0);}
