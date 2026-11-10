// Three held keys for the native Unity game, scoped to touch devices.
(()=>{
 const media=matchMedia('(pointer:coarse)'),held=new Map();let ready=!!window.gameInstance?.Module?.calledRun,pads=null;
 const keys={left:{key:'ArrowLeft',code:'ArrowLeft',keyCode:37,label:'Move left',text:'←'},right:{key:'ArrowRight',code:'ArrowRight',keyCode:39,label:'Move right',text:'→'},jump:{key:' ',code:'Space',keyCode:32,label:'Jump',text:'Jump'}};
 function emit(type,name,target){const k=keys[name];target.dispatchEvent(new KeyboardEvent(type,{key:k.key,code:k.code,keyCode:k.keyCode,which:k.keyCode,bubbles:true,cancelable:true}));}
 function release(pointerId){const press=held.get(pointerId);if(!press)return;held.delete(pointerId);
  if(![...held.values()].some(p=>p.name===press.name)){emit('keyup',press.name,press.target);press.button.classList.remove('held');press.button.setAttribute('aria-pressed','false');}
 }
 function releaseAll(){for(const id of [...held.keys()])release(id);}
 function render(){
  releaseAll();pads?.remove();pads=null;if(!ready||!media.matches)return;
  if(!document.getElementById('electron-touch-style')){const style=document.createElement('style');style.id='electron-touch-style';style.textContent=`
.ed-pads{position:fixed;inset:0;z-index:25;pointer-events:none;user-select:none;-webkit-user-select:none}
.ed-pad-group{position:absolute;bottom:max(12px,env(safe-area-inset-bottom,0px));display:flex;gap:10px}
.ed-pad-group.move{left:max(12px,env(safe-area-inset-left,0px))}.ed-pad-group.jump{right:max(12px,env(safe-area-inset-right,0px))}
.ed-pads button{box-sizing:border-box;width:56px;height:56px;padding:0;border:2px solid #c9faffb3;border-radius:16px;background:#063f67c9;color:white;font:700 18px system-ui;touch-action:none;pointer-events:auto;-webkit-touch-callout:none}
.ed-pads button.held{background:#19b9e4e6;border-color:white}.ed-pads button:focus-visible{outline:3px solid white;outline-offset:3px}`;document.head.append(style);}
  pads=document.createElement('div');pads.className='ed-pads';pads.setAttribute('role','group');pads.setAttribute('aria-label','Touch game controls');
  const move=document.createElement('div'),jump=document.createElement('div');move.className='ed-pad-group move';jump.className='ed-pad-group jump';pads.append(move,jump);
  for(const [name,key]of Object.entries(keys)){const button=document.createElement('button');button.type='button';button.textContent=key.text;button.setAttribute('aria-label',key.label);button.setAttribute('aria-pressed','false');button.dataset.key=name;
   button.addEventListener('pointerdown',event=>{if(event.button>0||held.has(event.pointerId))return;event.preventDefault();const target=document.querySelector('#gameContainer canvas');if(!target)return;target.focus({preventScroll:true});const wasHeld=[...held.values()].some(p=>p.name===name);held.set(event.pointerId,{name,target,button});try{button.setPointerCapture(event.pointerId);}catch{}button.classList.add('held');button.setAttribute('aria-pressed','true');if(!wasHeld)emit('keydown',name,target);});
   for(const event of['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,e=>release(e.pointerId));
   button.addEventListener('contextmenu',event=>event.preventDefault());(name==='jump'?jump:move).append(button);
  }
  document.body.append(pads);
 }
 window.OrbitTouchControls={ready(){ready=true;render();}};
 media.addEventListener('change',render);addEventListener('blur',releaseAll);addEventListener('resize',releaseAll);addEventListener('pagehide',releaseAll);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAll();});render();
})();
