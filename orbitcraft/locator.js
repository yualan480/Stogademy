const COLORS=['#ffbd39','#35dbe5','#f279c2','#a68cff','#83df58','#ff795e','#74b5ff','#f5e98a'];
export function playerColor(id){let hash=2166136261;for(const c of String(id))hash=Math.imul(hash^c.charCodeAt(0),16777619);return COLORS[(hash>>>0)%COLORS.length];}
export function locatePlayer(viewer,target){
 const dx=target.x-viewer.x,dz=target.z-viewer.z,dy=target.y-viewer.y;
 const bearing=Math.hypot(dx,dz)<.001?(viewer.yaw||0):Math.atan2(-dx,-dz);
 const relative=Math.atan2(Math.sin(bearing-(viewer.yaw||0)),Math.cos(bearing-(viewer.yaw||0)));
 return {position:Math.max(0,Math.min(1,.5-relative/Math.PI)),behind:Math.abs(relative)>Math.PI/2,turn:relative>0?'left':'right',height:dy>3?'above':dy< -3?'below':'level',distance:Math.round(Math.hypot(dx,dy,dz))};
}
export function createLocatorBar(element){
 const markers=new Map();let last=-Infinity,count=-1;
 return {
  update(viewer,players,now=performance.now()){
   if(now-last<50)return;last=now;const live=new Set();
   for(const target of players){if(target.id===viewer.id||target.health<=0||![target.x,target.y,target.z].every(Number.isFinite))continue;live.add(target.id);let marker=markers.get(target.id);if(!marker){marker=document.createElement('span');marker.className='locator-marker';marker.setAttribute('role','img');marker.style.setProperty('--locator-color',playerColor(target.id));element.append(marker);markers.set(target.id,marker);}
    const at=locatePlayer(viewer,target),direction=at.behind?`behind, turn ${at.turn}`:Math.abs(at.position-.5)<.04?'ahead':at.turn;
    const label=`${target.name||'Player'} · ${at.distance} blocks · ${direction}${at.height==='level'?'':` · ${at.height}`}`;
    marker.style.left=`${at.position*100}%`;marker.classList.toggle('locator-behind',at.behind);marker.dataset.turn=at.turn;marker.dataset.height=at.height;marker.title=label;marker.setAttribute('aria-label',label);marker.style.zIndex=String(Math.max(1,1100-at.distance));
   }
   for(const [id,marker]of markers)if(!live.has(id)){marker.remove();markers.delete(id);}
   element.hidden=!live.size;if(count!==live.size){count=live.size;element.setAttribute('aria-label',`Player locator: ${count} other ${count===1?'player':'players'}. Center points ahead; edge arrows point toward players behind you.`);}
  },
  clear(){for(const marker of markers.values())marker.remove();markers.clear();element.hidden=true;last=-Infinity;count=-1;}
 };
}
