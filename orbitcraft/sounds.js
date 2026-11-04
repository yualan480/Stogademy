// Original synthesized effects. Audio starts only after a user gesture.
export function createSounds(){let context,master,noiseBuffer,volume=.55,muted=false,unavailable=false;const played=new Map();let lastPosition=null,lastGrounded=true,lastWet=false,lastStep=0,lastWater=0,lastEat=0,lastMob=0,lastFurnace=0,distanceWalked=0;
 try{const saved=JSON.parse(localStorage.getItem('orbitcraft-audio-v1')||'{}');if(Number.isFinite(saved.volume))volume=Math.max(0,Math.min(1,saved.volume));muted=saved.muted===true;}catch{}
 const panel=document.createElement('section');panel.className='audio-settings';panel.innerHTML='<label for="sound-volume">Sound Volume: <output id="sound-volume-value"></output></label><input id="sound-volume" type="range" min="0" max="100" step="5"><button id="sound-mute" type="button"></button>';
 document.querySelector('#keybind-list').before(panel);const slider=panel.querySelector('input'),label=panel.querySelector('output'),mute=panel.querySelector('button');slider.value=Math.round(volume*100);
 function draw(){label.textContent=muted?'Muted':Math.round(volume*100)+'%';mute.textContent=muted?'Unmute Sounds':'Mute Sounds';mute.setAttribute('aria-pressed',String(muted));if(master)master.gain.setValueAtTime(muted||document.hidden?0:volume,context.currentTime);}
 function save(){try{localStorage.setItem('orbitcraft-audio-v1',JSON.stringify({volume,muted}));}catch{}draw();}
 function unlock(){if(unavailable)return;try{if(context?.state==='closed')context=null;if(!context){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio){unavailable=true;slider.disabled=mute.disabled=true;label.textContent='Unavailable';return;}context=new Audio();master=context.createGain();master.gain.value=muted?0:volume;master.connect(context.destination);noiseBuffer=context.createBuffer(1,Math.ceil(context.sampleRate*.6),context.sampleRate);const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;}if(context.state!=='running')context.resume().catch(()=>{});}catch{unavailable=true;slider.disabled=mute.disabled=true;label.textContent='Unavailable';}}
 slider.oninput=()=>{unlock();volume=+slider.value/100;muted=false;save();};mute.onclick=()=>{unlock();muted=!muted;save();};draw();document.addEventListener('pointerdown',unlock,{capture:true});document.addEventListener('keydown',unlock,{capture:true});
 function tone(freq,end,duration,gain,type='sine',delay=0){const t=context.currentTime+delay,o=context.createOscillator(),g=context.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(30,end),t+duration);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(master);o.start(t);o.stop(t+duration+.01);o.onended=()=>{o.disconnect();g.disconnect();};}
 function noise(freq,duration,gain,type='lowpass'){const t=context.currentTime,n=context.createBufferSource(),f=context.createBiquadFilter(),g=context.createGain();n.buffer=noiseBuffer;f.type=type;f.frequency.value=freq;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+duration);n.connect(f);f.connect(g);g.connect(master);n.start(t,Math.random()*.1,duration);n.onended=()=>{n.disconnect();f.disconnect();g.disconnect();};}
 function play(kind,{block=3,distance=0,species=''}={}){if(!context||context.state!=='running'||muted||!volume||document.hidden||distance>24)return false;const now=performance.now();if(now-(played.get(kind)||-Infinity)<(kind==='mine'?150:70))return false;played.set(kind,now);const gain=Math.max(0,1-distance/24)*.22,wood=[5,10,18,20,23,26].includes(block),soft=[1,2,4,6,7,21,22,31,32,33].includes(block);
 switch(kind){case 'step':noise(soft?1700:wood?650:380,.08,gain*.35);tone(wood?145:95,60,.08,gain*.15);break;
 case 'jump':tone(180,310,.09,gain*.17);noise(800,.06,gain*.15);break;
 case 'land':noise(480,.16,gain*.65);tone(110,45,.16,gain*.2);break;
 case 'mine':noise(soft?2300:wood?900:1600,.09,gain*.3,'bandpass');tone(wood?210:110,80,.06,gain*.1);break;
 case 'break':noise(soft?2000:wood?700:1800,.22,gain*.7);tone(wood?160:95,45,.14,gain*.2);break;
 case 'place':noise(wood?650:soft?1300:420,.1,gain*.5);tone(150,75,.1,gain*.18);break;
 case 'swing':noise(1200,.09,gain*.2,'bandpass');break;
 case 'hit':noise(800,.13,gain*.65);tone(190,65,.15,gain*.28,'triangle');break;
 case 'hurt':tone(260,90,.22,gain*.35,'triangle');noise(750,.18,gain*.45);break;
 case 'death':tone(180,45,.65,gain*.5,'triangle');noise(500,.28,gain*.4);break;
 case 'eat':noise(1300,.12,gain*.4);noise(2800,.07,gain*.18,'highpass');break;
 case 'burp':tone(150,75,.18,gain*.22,'triangle');break;
 case 'splash':noise(1800,.3,gain*.55);tone(350,100,.14,gain*.08);break;
 case 'water':noise(1200,.4,gain*.09,'bandpass');tone(430,220,.15,gain*.035);break;
 case 'pickup':tone(950,1400,.09,gain*.2);break;
 case 'xp':tone(900,1200,.1,gain*.23);tone(1350,1500,.12,gain*.18,'sine',.07);break;
 case 'level':for(const [i,n]of [600,800,1000,1200,1500].entries())tone(n,n*1.02,.17,gain*.23,'sine',i*.08);break;
 case 'open':tone(230,110,.13,gain*.13,'triangle');noise(600,.1,gain*.12);break;
 case 'close':tone(140,90,.1,gain*.1,'triangle');break;
 case 'click':tone(650,400,.04,gain*.08,'square');break;
 case 'furnace':noise(1800,.3,gain*.07,'highpass');break;
 case 'mob':{const f=({cow:95,sheep:260,pig:160,chicken:700,bat:1100,skeleton:380,spider:420,enderman:220})[species]||105;tone(f,f*.72,.35,gain*.12,'triangle');noise(species==='skeleton'?1800:400,.22,gain*.07);break;}
 default:return false;}
 return true;
 }
 function frame({player:p,active,eating,furnace,get,grounded,now}){if(!p||!active){lastPosition=null;distanceWalked=0;lastGrounded=true;lastWet=false;return;}const wet=get(Math.floor(p.x),Math.floor(p.y+.3),Math.floor(p.z))===8;if(lastPosition){const d=Math.hypot(p.x-lastPosition.x,p.z-lastPosition.z);if(d<.6)distanceWalked+=d;if(!grounded&&lastGrounded&&p.vy>1&&!p.survival?.flying&&!p.survival?.boat)play('jump');if(grounded&&!lastGrounded)play('land',{block:get(Math.floor(p.x),Math.floor(p.y-.1),Math.floor(p.z))});if(wet!==lastWet)play('splash');if(distanceWalked>.95&&now-lastStep>200&&(grounded||wet)&&!p.survival?.boat){play(wet?'splash':'step',{block:get(Math.floor(p.x),Math.floor(p.y-.1),Math.floor(p.z))});distanceWalked=0;lastStep=now;}}
 if(furnace&&now-lastFurnace>1600){play('furnace');lastFurnace=now;}if(eating&&now-lastEat>260){play('eat');lastEat=now;}if(now-lastWater>1700){lastWater=now;if(wet||[[2,0],[-2,0],[0,2],[0,-2]].some(([dx,dz])=>get(Math.floor(p.x)+dx,Math.floor(p.y),Math.floor(p.z)+dz)===8))play('water');}lastPosition={x:p.x,z:p.z};lastGrounded=grounded;lastWet=wet;
 }
 function mobs(items,p){if(!p||performance.now()-lastMob<8000)return;const nearby=items.find(m=>m.health>0&&Math.hypot(m.x-p.x,m.y-p.y,m.z-p.z)<12);if(nearby){lastMob=performance.now();play(['squid','dolphin','cod','salmon','fish','axolotl'].includes(nearby.kind)?'water':'mob',{species:nearby.kind,block:nearby.hostile?3:5,distance:Math.hypot(nearby.x-p.x,nearby.z-p.z)});}}
 document.addEventListener('click',e=>{if(e.target.closest?.('button')&&e.target.closest('dialog,#death-screen'))play('click');});
 document.addEventListener('visibilitychange',draw);
 addEventListener('pagehide',()=>context?.close().catch(()=>{}));return{play,frame,mobs};
}
