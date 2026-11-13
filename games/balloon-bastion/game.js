(() => {
  'use strict';

  const W = 960, H = 600;
  const canvas = document.getElementById('field');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const SAVE = 'orbit-balloon-bastion-save-v1';
  const BEST = 'orbit-balloon-bastion-best-v1';
  const towerTypes = [
    {id:'dart',name:'Dart Turret',cost:120,range:143,damage:1.3,rate:.48,velocity:520,color:'#61e9f6',symbol:'➤',detail:'Fast shots · reliable starter'},
    {id:'prism',name:'Prism Cannon',cost:260,range:174,damage:4.2,rate:.92,velocity:680,color:'#b996ff',symbol:'✦',detail:'Long range · heavy hits'},
    {id:'frost',name:'Frost Beacon',cost:205,range:138,damage:.8,rate:1.1,velocity:480,color:'#9ddcff',symbol:'❄',detail:'Slows balloons for 2 seconds'},
    {id:'nova',name:'Nova Launcher',cost:365,range:161,damage:2.5,rate:1.7,velocity:380,color:'#ffc57b',symbol:'✹',detail:'Area damage · great for groups'}
  ];
  const path = [[-60,130],[135,130],[135,330],[358,330],[358,102],[600,102],[600,465],[845,465],[845,270],[1020,270]];
  const pathSegments = []; let pathLength = 0;
  for (let i=1;i<path.length;i++) {
    const [x,y] = path[i-1], [xx,yy]=path[i], length=Math.hypot(xx-x,yy-y);
    pathSegments.push({x,y,xx,yy,length,from:pathLength}); pathLength+=length;
  }
  const stars=Array.from({length:55},(_,i)=>({x:(i*173+43)%W,y:(i*239+87)%H,r:i%7===0?2:1}));
  const bushes=Array.from({length:44},(_,i)=>({x:(i*157+62)%W,y:(i*97+337)%H,r:9+i%5*3}));

  const defaults=()=>({wave:0,lives:20,cash:650,score:0,towers:[]});
  const readJSON=(key)=>{try{return JSON.parse(localStorage.getItem(key))}catch{return null}};
  let game=defaults(), best=Number(readJSON(BEST))||0;
  const previous=readJSON(SAVE);
  if(previous&&Number.isInteger(previous.wave)&&previous.wave>=0&&previous.wave<999&&Number.isFinite(previous.cash)&&previous.cash>=0&&Number.isFinite(previous.lives)&&previous.lives>0&&Array.isArray(previous.towers)){
    game={wave:previous.wave,lives:Math.min(99,previous.lives),cash:previous.cash,score:previous.score||0,towers:previous.towers.filter(t=>towerTypes.some(type=>type.id===t.kind)&&Number.isFinite(t.x)&&Number.isFinite(t.y)&&t.level>=1&&t.level<=3).map(t=>({...t,cd:0,angle:-Math.PI/2})).slice(0,200)};
  }
  let enemies=[],projectiles=[],particles=[],selectedBuild='dart',selectedTower=null,hover=null;
  let active=false,paused=false,gameOver=false,speedMult=1,waveQueue=0,waveSpawns=0,waveTimer=0,clock=0;
  let toastTimer=null,resetArmed=false,resetTimer=null,last=0,uiTimer=0;

  function pointAt(distance){
    for(const s of pathSegments){if(distance<=s.from+s.length){const p=Math.max(0,(distance-s.from)/s.length);return{x:s.x+(s.xx-s.x)*p,y:s.y+(s.yy-s.y)*p};}}
    const s=pathSegments[pathSegments.length-1];return{x:s.xx,y:s.yy};
  }
  function distanceToSegment(x,y,s){const dx=s.xx-s.x,dy=s.yy-s.y;const t=Math.max(0,Math.min(1,((x-s.x)*dx+(y-s.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(x-(s.x+dx*t),y-(s.y+dy*t));}
  function validSpot(x,y){return x>=35&&x<=W-35&&y>=35&&y<=H-35&&pathSegments.every(s=>distanceToSegment(x,y,s)>52)&&game.towers.every(t=>Math.hypot(x-t.x,y-t.y)>49);}
  function typeOf(tower){return towerTypes.find(t=>t.id===tower.kind);}
  const roundNum=n=>Math.round(n).toLocaleString('en-US');
  function showToast(message){const el=$('toast');el.textContent=message;el.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('on'),1900);}
  function save(){if(active||gameOver)return;try{localStorage.setItem(SAVE,JSON.stringify({wave:game.wave,lives:game.lives,cash:game.cash,score:game.score,towers:game.towers.map(({kind,x,y,level,invested})=>({kind,x,y,level,invested}))}));}catch{}}
  function saveBest(){if(game.wave>best){best=game.wave;try{localStorage.setItem(BEST,JSON.stringify(best));}catch{}}$('best-wave').textContent=best;}
  function selectBuild(kind){if(gameOver)return;selectedBuild=kind;selectedTower=null;$('tip').hidden=true;syncUI();}
  function selectTower(tower){selectedTower=tower;selectedBuild=null;syncUI();}
  function towerCost(kind){return towerTypes.find(t=>t.id===kind).cost;}
  function placeTower(x,y){
    const t=towerTypes.find(v=>v.id===selectedBuild);
    if(!t)return;
    if(!validSpot(x,y)){showToast('Build on open ground, away from the trail and other towers.');return;}
    if(game.cash<t.cost){showToast('Not enough coins for '+t.name+'.');return;}
    game.cash-=t.cost;
    game.towers.push({kind:t.id,x,y,level:1,invested:t.cost,cd:0,angle:-Math.PI/2});
    burst(x,y,t.color,9);showToast(t.name+' built!');save();syncUI();
  }
  function upgradeCost(t){return Math.round(towerCost(t.kind)*(.65+.45*(t.level-1)));}
  function upgradeTower(){
    if(!selectedTower||selectedTower.level>=3||gameOver)return;
    const cost=upgradeCost(selectedTower);
    if(game.cash<cost){showToast('You need '+roundNum(cost-game.cash)+' more coins.');return;}
    game.cash-=cost;selectedTower.invested+=cost;selectedTower.level++;
    burst(selectedTower.x,selectedTower.y,'#e4ffad',16);showToast('Tower upgraded to level '+selectedTower.level+'!');save();syncUI();
  }
  function sellTower(){if(!selectedTower||gameOver)return;const t=selectedTower;const value=Math.round(t.invested*.65);game.cash+=value;game.towers=game.towers.filter(e=>e!==t);selectedTower=null;showToast('Tower sold for '+roundNum(value)+' coins.');save();syncUI();}

  function syncUI(){
    $('wave-num').textContent=game.wave;$('lives-num').textContent=game.lives;$('cash-num').textContent=roundNum(game.cash);$('score-num').textContent=roundNum(game.score);
    $('best-wave').textContent=best;
    const button=$('send-wave');button.disabled=active||gameOver;button.textContent=active?'Wave in progress…':'▶ Start wave '+(game.wave+1);
    $('pause').disabled=!active||gameOver;$('pause').textContent=paused?'▶ Resume':'Ⅱ Pause';$('speed').textContent=speedMult+'× Speed';
    const status=$('status');status.textContent=gameOver?'The balloons reached your portal.':paused?'Paused — take your time.':active?'Defend the portal! '+waveQueue+' balloons still to enter.':'Wave '+game.wave+' cleared · build your next defense.';
    for(const button of document.querySelectorAll('[data-build]')){const kind=button.dataset.build;button.classList.toggle('active',selectedBuild===kind);button.setAttribute('aria-pressed',String(selectedBuild===kind));button.disabled=gameOver||game.cash<towerCost(kind);}
    const selection=$('selection');
    if(selectedTower&&game.towers.includes(selectedTower)){
      const base=typeOf(selectedTower),next=upgradeCost(selectedTower),max=selectedTower.level>=3;
      selection.innerHTML='<b>'+base.name+' · Level '+selectedTower.level+'</b><div style="margin-top:5px">Damage '+(base.damage*(1+.75*(selectedTower.level-1))).toFixed(1)+' · Range '+Math.round(base.range+(selectedTower.level-1)*18)+'</div><div class="button-row"><button id="upgrade" '+(max||game.cash<next?'disabled':'')+'>'+(max?'Max level':'Upgrade · '+roundNum(next))+'</button><button class="danger" id="sell">Sell · '+roundNum(selectedTower.invested*.65)+'</button></div>';
      $('upgrade').onclick=upgradeTower;$('sell').onclick=sellTower;
    }else{
      selection.textContent=selectedBuild?'Building: '+towerTypes.find(t=>t.id===selectedBuild).name+'. Tap open ground on the map to place it.':'Select one of your towers on the map to upgrade or sell it.';
    }
  }

  function startWave(){
    if(active||gameOver)return;
    active=true;paused=false;game.wave++;waveQueue=6+game.wave*3;waveSpawns=0;waveTimer=.15;
    $('tip').hidden=true;showToast('Wave '+game.wave+' incoming!');syncUI();
  }
  function makeEnemy(index){
    const w=game.wave;
    let tier=0;
    if(w>=9&&index%12===0)tier=3;
    else if(w>=5&&index%7===0)tier=2;
    else if(w>=3&&index%4===0)tier=1;
    const hp=[1.2,3.8,2.5,10][tier]*(1+(w-1)*.15);
    return {dist:0,hp,maxHp:hp,speed:[65,57,110,43][tier]*(1+w*.025),color:['#ff85c8','#a4f0ff','#ffd76c','#c7a9ff'][tier],size:[15,17,13,22][tier],reward:[8,14,12,29][tier],tier,slowUntil:0,dead:false};
  }
  function spawn(){enemies.push(makeEnemy(waveSpawns++));waveQueue--;}
  function burst(x,y,color,count){for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,v=30+Math.random()*120;particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.3+Math.random()*.45,max:.7,color,r:1.6+Math.random()*3});}if(particles.length>600)particles.splice(0,particles.length-600);}
  function hit(enemy,damage,slow){
    if(enemy.dead)return;enemy.hp-=damage;
    if(slow)enemy.slowUntil=Math.max(enemy.slowUntil,clock+2.2);
    if(enemy.hp<=0){enemy.dead=true;const p=pointAt(enemy.dist);burst(p.x,p.y,enemy.color,8);game.cash+=enemy.reward;game.score+=Math.round(enemy.maxHp*12);}
  }
  function shoot(tower,enemy){
    const base=typeOf(tower),p=pointAt(enemy.dist);
    tower.angle=Math.atan2(p.y-tower.y,p.x-tower.x);
    projectiles.push({x:tower.x+Math.cos(tower.angle)*20,y:tower.y+Math.sin(tower.angle)*20,target:enemy,kind:tower.kind,damage:base.damage*(1+.75*(tower.level-1)),speed:base.velocity,color:base.color});
    tower.cd=base.rate/Math.pow(1.18,tower.level-1);
    burst(tower.x+Math.cos(tower.angle)*19,tower.y+Math.sin(tower.angle)*19,base.color,2);
  }
  function simulate(delta){
    clock+=delta;
    if(!active||paused||gameOver)return;
    const dt=delta*speedMult;
    waveTimer-=dt;
    if(waveQueue>0&&waveTimer<=0){spawn();waveTimer+=Math.max(.25,.82-game.wave*.018);}
    for(const enemy of enemies){
      if(enemy.dead)continue;
      enemy.dist+=enemy.speed*dt*(enemy.slowUntil>clock ? .47 : 1);
      if(enemy.dist>=pathLength){enemy.dead=true;game.lives-=enemy.tier===3?3:1;if(game.lives<=0){game.lives=0;endGame();break;}}
    }
    if(gameOver)return;
    for(const tower of game.towers){
      tower.cd=Math.max(0,tower.cd-dt);
      if(tower.cd>0)continue;
      const base=typeOf(tower),range=base.range+(tower.level-1)*18;
      const target=enemies.filter(e=>!e.dead).filter(e=>{const p=pointAt(e.dist);return Math.hypot(p.x-tower.x,p.y-tower.y)<=range;}).sort((a,b)=>b.dist-a.dist)[0];
      if(target)shoot(tower,target);
    }
    for(const p of projectiles){
      if(p.dead||p.target.dead){p.dead=true;continue;}
      const target=pointAt(p.target.dist),dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy);
      if(d<=p.speed*dt+ p.target.size){
        p.dead=true;
        if(p.kind==='nova'){burst(target.x,target.y,'#ffd49c',15);for(const e of enemies){if(e.dead)continue;const q=pointAt(e.dist);if(Math.hypot(q.x-target.x,q.y-target.y)<57)hit(e,p.damage,false);}}
        else hit(p.target,p.damage,p.kind==='frost');
      }else{p.x+=dx/d*p.speed*dt;p.y+=dy/d*p.speed*dt;}
    }
    enemies=enemies.filter(e=>!e.dead);projectiles=projectiles.filter(p=>!p.dead);
    if(waveQueue===0&&enemies.length===0){
      active=false;paused=false;const bonus=35+game.wave*12;game.cash+=bonus;
      if(game.wave%5===0)game.lives=Math.min(30,game.lives+1);
      saveBest();save();showToast('Wave clear! +'+bonus+' coins'+(game.wave%5===0?' and +1 life!':''));
    }
    uiTimer+=delta;
    if(uiTimer>.12){uiTimer=0;syncUI();}
  }
  function endGame(){gameOver=true;active=false;paused=false;saveBest();try{localStorage.removeItem(SAVE)}catch{}$('end-score').textContent='You defended through wave '+game.wave+' and scored '+roundNum(game.score)+' points.';$('end-screen').hidden=false;syncUI();}
  function resetGame(){game=defaults();enemies=[];projectiles=[];particles=[];selectedTower=null;selectedBuild='dart';active=false;paused=false;gameOver=false;waveQueue=0;speedMult=1;clock=0;resetArmed=false;$('reset').textContent='↻ Restart';$('end-screen').hidden=true;$('tip').hidden=false;try{localStorage.removeItem(SAVE)}catch{}syncUI();}

  function roundRect(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.stroke()}}
  function drawBackground(){
    const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,'#13395c');g.addColorStop(.58,'#0a2b4b');g.addColorStop(1,'#09213f');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='#ffffff07';ctx.lineWidth=1;
    for(let x=0;x<W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}
    for(let y=0;y<H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
    for(const s of stars){ctx.beginPath();ctx.fillStyle=s.r>1?'#b6e9ff8e':'#b2e7ff31';ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill()}
    for(const b of bushes){if(pathSegments.some(s=>distanceToSegment(b.x,b.y,s)<57))continue;ctx.beginPath();ctx.fillStyle='#184d5d91';ctx.ellipse(b.x,b.y,b.r,b.r*.62,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.fillStyle='#2b79827d';ctx.ellipse(b.x-3,b.y-3,b.r*.6,b.r*.4,0,0,Math.PI*2);ctx.fill()}
  }
  function drawTrail(){
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    function trace(){ctx.beginPath();path.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y))}
    trace();ctx.strokeStyle='#061c32';ctx.lineWidth=86;ctx.stroke();
    trace();ctx.strokeStyle='#448ca6';ctx.lineWidth=75;ctx.stroke();
    trace();ctx.strokeStyle='#163f63';ctx.lineWidth=66;ctx.stroke();
    trace();ctx.strokeStyle='#2a6177';ctx.lineWidth=54;ctx.stroke();
    ctx.setLineDash([5,20]);trace();ctx.strokeStyle='#a0e1d46e';ctx.lineWidth=3;ctx.stroke();ctx.setLineDash([]);
    ctx.restore();
    const entry=pointAt(61),exit=pointAt(pathLength-62);
    for(const [p,color,symbol] of [[entry,'#77e0cb','▶'],[exit,'#d9a3ff','◆']]){ctx.save();ctx.shadowColor=color;ctx.shadowBlur=28;ctx.fillStyle='#071e3e';ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y,24,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle=color;ctx.font='bold 21px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(symbol,p.x,p.y+1);ctx.restore()}
  }
  function drawTower(t){
    const base=typeOf(t),level=t.level;ctx.save();ctx.translate(t.x,t.y);
    ctx.shadowColor=base.color;ctx.shadowBlur=selectedTower===t?21:8;
    ctx.beginPath();ctx.arc(0,0,23,0,Math.PI*2);ctx.fillStyle='#071f3e';ctx.fill();ctx.lineWidth=4;ctx.strokeStyle=base.color;ctx.stroke();ctx.shadowBlur=0;
    ctx.beginPath();ctx.arc(0,0,16,0,Math.PI*2);ctx.fillStyle='#1d3d67';ctx.fill();
    ctx.save();ctx.rotate(t.angle);roundRect(0,-6,25+(level-1)*3,12,5,base.color,'#c4eeff');ctx.restore();
    ctx.beginPath();ctx.arc(0,0,10,0,Math.PI*2);ctx.fillStyle=base.color;ctx.fill();
    ctx.fillStyle='#09203c';ctx.font='bold 12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(level,0,1);ctx.restore();
  }
  function drawBalloon(enemy){
    const p=pointAt(enemy.dist),size=enemy.size;
    ctx.save();ctx.translate(p.x,p.y);ctx.shadowColor=enemy.color;ctx.shadowBlur=12;
    const fill=ctx.createRadialGradient(-size*.4,-size*.55,2,0,0,size*1.1);fill.addColorStop(0,'#fff');fill.addColorStop(.16,enemy.color);fill.addColorStop(1,enemy.tier===3?'#5c448c':'#92466e');
    ctx.beginPath();ctx.ellipse(0,-3,size*.83,size*1.03,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();ctx.shadowBlur=0;
    ctx.beginPath();ctx.moveTo(-3,size*.82);ctx.lineTo(0,size+5);ctx.lineTo(4,size*.82);ctx.fillStyle=enemy.color;ctx.fill();
    ctx.strokeStyle='#d1edffb5';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(0,size+5);ctx.quadraticCurveTo(-7,size+12,1,size+21);ctx.stroke();
    if(enemy.slowUntil>clock){ctx.strokeStyle='#c8efff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,-3,size+4,0,Math.PI*2);ctx.stroke()}
    if(enemy.hp<enemy.maxHp){ctx.fillStyle='#061528';ctx.fillRect(-size,-size-13,size*2,4);ctx.fillStyle='#85ffc9';ctx.fillRect(-size,-size-13,size*2*Math.max(0,enemy.hp/enemy.maxHp),4)}
    ctx.restore();
  }
  function drawParticles(delta){for(const p of particles){p.life-=delta;p.x+=p.vx*delta;p.y+=p.vy*delta;p.vy+=130*delta;ctx.globalAlpha=Math.max(0,Math.min(1,p.life/p.max));ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1;particles=particles.filter(p=>p.life>0)}
  function render(delta){
    drawBackground();drawTrail();
    if(selectedTower&&game.towers.includes(selectedTower)){
      const base=typeOf(selectedTower);ctx.beginPath();ctx.arc(selectedTower.x,selectedTower.y,base.range+(selectedTower.level-1)*18,0,Math.PI*2);ctx.fillStyle='#7dd3ff17';ctx.fill();ctx.strokeStyle='#a3e9ff88';ctx.setLineDash([8,7]);ctx.lineWidth=2;ctx.stroke();ctx.setLineDash([]);
    }
    if(hover&&selectedBuild&&!gameOver){const type=towerTypes.find(t=>t.id===selectedBuild),valid=validSpot(hover.x,hover.y)&&game.cash>=type.cost;ctx.save();ctx.globalAlpha=.3;ctx.beginPath();ctx.arc(hover.x,hover.y,type.range,0,Math.PI*2);ctx.fillStyle=valid?'#75e9ff':'#ff7777';ctx.fill();ctx.globalAlpha=1;ctx.beginPath();ctx.arc(hover.x,hover.y,24,0,Math.PI*2);ctx.strokeStyle=valid?'#8bf6d6':'#ff8c9c';ctx.lineWidth=4;ctx.stroke();ctx.restore()}
    for(const tower of game.towers)drawTower(tower);
    for(const enemy of enemies)drawBalloon(enemy);
    for(const p of projectiles){ctx.save();ctx.shadowColor=p.color;ctx.shadowBlur=16;ctx.beginPath();ctx.arc(p.x,p.y,p.kind==='nova'?7:4,0,Math.PI*2);ctx.fillStyle=p.color;ctx.fill();ctx.restore()}
    drawParticles(delta);
    if(!active&&!gameOver){ctx.fillStyle='#d4ecffaa';ctx.font='700 12px system-ui';ctx.textAlign='right';ctx.fillText('PORTAL DEFENSE · WAVE '+(game.wave+1),W-18,H-17)}
  }
  function frame(now){let delta=last?Math.min(.04,(now-last)/1000):0;last=now;simulate(delta);render(delta);requestAnimationFrame(frame)}

  function pointerPosition(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height};}
  canvas.addEventListener('pointermove',e=>{hover=pointerPosition(e)});
  canvas.addEventListener('pointerleave',()=>{hover=null});
  canvas.addEventListener('pointerdown',e=>{
    if(gameOver)return;e.preventDefault();const p=pointerPosition(e);
    const near=game.towers.find(t=>Math.hypot(p.x-t.x,p.y-t.y)<25);
    if(near){selectTower(near);return;}
    if(selectedBuild)placeTower(p.x,p.y);
    else{selectedTower=null;syncUI()}
  });
  $('tower-list').innerHTML=towerTypes.map((t,i)=>'<button class="tower-btn" data-build="'+t.id+'" aria-pressed="false"><span class="tower-glyph" style="background:'+t.color+'">'+t.symbol+'</span><span class="details"><b>'+(i+1)+'. '+t.name+'</b><small>'+t.detail+'</small></span><span class="cost">'+t.cost+'</span></button>').join('');
  for(const b of document.querySelectorAll('[data-build]'))b.addEventListener('click',()=>selectBuild(b.dataset.build));
  $('send-wave').addEventListener('click',startWave);
  $('pause').addEventListener('click',()=>{if(!active)return;paused=!paused;syncUI()});
  $('speed').addEventListener('click',()=>{speedMult=speedMult===1?2:1;syncUI()});
  $('reset').addEventListener('click',()=>{
    if(!resetArmed){resetArmed=true;$('reset').textContent='Confirm restart';showToast('Click Restart again to erase this run.');clearTimeout(resetTimer);resetTimer=setTimeout(()=>{resetArmed=false;$('reset').textContent='↻ Restart'},2800);return;}
    clearTimeout(resetTimer);resetGame();
  });
  $('again').addEventListener('click',resetGame);
  document.addEventListener('keydown',e=>{
    if(e.altKey||e.ctrlKey||e.metaKey||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))return;
    if(['1','2','3','4'].includes(e.key)){selectBuild(towerTypes[Number(e.key)-1].id)}
    if(e.key==='Escape'){selectedBuild=null;selectedTower=null;syncUI()}
    if(e.key===' '){e.preventDefault();if(active){paused=!paused;syncUI()}else startWave()}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&active&&!paused){paused=true;syncUI()}});
  syncUI();requestAnimationFrame(frame);
})();
