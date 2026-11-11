'use strict';
// Home page telegraph key (footer). Quick tap = dot, hold = dash. A pause ends a letter.
// What is keyed is handed to window.StgUnlock (stogademy.js), which opens Orbit for the right Morse code.
(function(){
  var key=document.getElementById('morseKey');
  var out=document.getElementById('morseOut'),DASH=220,LETTER=900,RESET=3500;
  var buf='',downAt=0,held=false,activePointer=null,tLetter=0,tReset=0,ac=null,osc=null,gain=null;
  function show(){if(out)out.textContent=buf.replace(/ /g,'  ')||'tap · hold'}
  function tone(on){
    try{
      if(on){
        ac=ac||new (window.AudioContext||window.webkitAudioContext)();
        if(ac.state==='suspended')ac.resume();
        osc=ac.createOscillator();gain=ac.createGain();osc.frequency.value=620;osc.type='sine';
        gain.gain.value=.0001;osc.connect(gain);gain.connect(ac.destination);osc.start();
        gain.gain.exponentialRampToValueAtTime(.08,ac.currentTime+.01);
      }else if(osc){
        gain.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+.03);osc.stop(ac.currentTime+.04);osc=null;
      }
    }catch(e){}
  }
  function down(){
    if(held)return;held=true;downAt=Date.now();clearTimeout(tLetter);clearTimeout(tReset);
    key.classList.add('down');tone(true);
  }
  function scheduleEnd(){
    clearTimeout(tLetter);clearTimeout(tReset);
    if(!buf.trim())return;
    tLetter=setTimeout(function(){
      buf=buf.replace(/ +$/,'')+' ';
      var src=buf.trim();
      Promise.resolve(window.StgUnlock&&window.StgUnlock(src)).then(function(ok){
        if(ok){buf='';show();key.classList.add('ok');setTimeout(function(){key.classList.remove('ok')},900)}
      }).catch(function(){});
    },LETTER);
    tReset=setTimeout(function(){buf='';show()},RESET);
  }
  function up(){
    if(!held)return;held=false;activePointer=null;key.classList.remove('down');tone(false);
    buf+=(Date.now()-downAt)>=DASH?'-':'.';if(buf.length>40)buf=buf.slice(-40);show();scheduleEnd();
  }
  function cancel(){
    if(!held)return;held=false;activePointer=null;key.classList.remove('down');tone(false);scheduleEnd();
  }
  if(key){
  key.addEventListener('pointerdown',function(e){
    if(e.button>0||held)return;e.preventDefault();activePointer=e.pointerId;
    try{key.setPointerCapture(e.pointerId)}catch(x){}down();
  });
  key.addEventListener('pointerup',function(e){if(e.pointerId===activePointer)up()});
  key.addEventListener('pointercancel',function(e){if(e.pointerId===activePointer)cancel()});
  key.addEventListener('lostpointercapture',function(e){if(e.pointerId===activePointer)cancel()});
  key.addEventListener('keydown',function(e){if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();down()}});
  key.addEventListener('keyup',function(e){if((e.key===' '||e.key==='Enter')&&activePointer===null){e.preventDefault();up()}});
  key.addEventListener('blur',cancel);
  addEventListener('blur',cancel);
  document.addEventListener('visibilitychange',function(){if(document.hidden){cancel();clearTimeout(tLetter);clearTimeout(tReset);buf='';show()}});
  key.addEventListener('contextmenu',function(e){e.preventDefault()});
  }
  // Keyboard: on the home page, just type . and - with no spaces. The code is only stored as a hash (stogademy.js),
  // so each recent run of keys is tried split into two letters until one matches.
  var kb='',kt=0;
  function tryKeys(){
    var jobs=[];
    for(var L=2;L<=Math.min(kb.length,12);L++){
      var w=kb.slice(-L);
      for(var k=1;k<L;k++)jobs.push(w.slice(0,k)+' '+w.slice(k));
    }
    return Promise.all(jobs.map(function(c){return Promise.resolve(window.StgUnlock&&window.StgUnlock(c)).catch(function(){return false})}))
      .then(function(r){if(r.some(Boolean))kb=''});
  }
  addEventListener('keydown',function(e){
    if(e.ctrlKey||e.metaKey||e.altKey||e.repeat||e.target===key)return;
    var h=document.getElementById('home');if(!h||h.hidden)return;
    var t=e.target,tag=t&&t.tagName;
    if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(t&&t.isContentEditable))return;
    if(e.key!=='.'&&e.key!=='-')return;
    kb+=e.key;if(kb.length>16)kb=kb.slice(-16);
    clearTimeout(kt);kt=setTimeout(function(){kb=''},RESET);
    tryKeys();
  });
  show();
})();
