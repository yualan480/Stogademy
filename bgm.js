'use strict';
// Site background music: one seamless ambient loop (site-ambient.wav, 40 s) played with Web Audio, so it repeats with no gap or click.
// - Starts on the first tap or key press (browsers block sound before that), fades in gently, and the speaker button in the header turns it off for good.
// - Only plays once Stogademy is unlocked (so the calculator page stays silent), and pauses on its own while Orbit is open (Orbit and its games have their own sound) or the tab is hidden.
// - To change the loudness edit LEVEL (0 to 1). To play before unlocking too, change allowed() to ignore unlocked().
(function(){
  var SRC='site-ambient.wav',KEY='stg_bgm',LEVEL=0.32,FADE_IN=2.5,FADE_OUT=0.8;
  var btn=document.getElementById('bgmBtn');if(!btn)return;
  var AC=window.AudioContext||window.webkitAudioContext;if(!AC){btn.hidden=true;return}
  var ctx=null,master=null,buf=null,loading=null,node=null,touched=false,busy=false;
  function wanted(){try{return localStorage.getItem(KEY)!=='off'}catch(e){return true}}
  function store(on){try{localStorage.setItem(KEY,on?'on':'off')}catch(e){}}
  function unlocked(){try{return JSON.parse(localStorage.getItem('stg_ok'))===1}catch(e){return false}}
  function allowed(){return unlocked()&&!document.hidden&&!document.body.classList.contains('in-orbit')}
  function paint(){var on=wanted();btn.classList.toggle('off',!on);btn.setAttribute('aria-pressed',String(on));btn.setAttribute('aria-label',on?'Turn background music off':'Turn background music on');btn.title=on?'Music on':'Music off'}
  function ensure(){if(ctx)return;ctx=new AC();master=ctx.createGain();master.gain.value=0;master.connect(ctx.destination)}
  function load(){
    if(buf)return Promise.resolve(buf);
    if(!loading)loading=fetch(SRC).then(function(r){if(!r.ok)throw new Error('audio '+r.status);return r.arrayBuffer()})
      .then(function(d){return new Promise(function(ok,no){ctx.decodeAudioData(d,ok,no)})})
      .then(function(b){return(buf=b)}).catch(function(){loading=null;return null});
    return loading;
  }
  async function start(){
    if(node||busy||!touched||!wanted()||!allowed())return;
    busy=true;
    try{
      ensure();var b=await load();
      if(!b||node||!wanted()||!allowed())return;
      if(ctx.state!=='running'){try{await ctx.resume()}catch(e){}}
      if(ctx.state!=='running')return;            // still blocked: the next tap or key press tries again
      node=ctx.createBufferSource();node.buffer=b;node.loop=true;node.loopStart=0;node.loopEnd=b.duration;node.connect(master);
      var t=ctx.currentTime;master.gain.cancelScheduledValues(t);master.gain.setValueAtTime(0,t);master.gain.linearRampToValueAtTime(LEVEL,t+FADE_IN);
      node.start(t);
    }finally{busy=false}
  }
  function stop(){
    if(!node)return;
    var n=node,t=ctx.currentTime;node=null;
    master.gain.cancelScheduledValues(t);master.gain.setValueAtTime(master.gain.value,t);master.gain.linearRampToValueAtTime(0,t+FADE_OUT);
    setTimeout(function(){try{n.stop();n.disconnect()}catch(e){}},FADE_OUT*1000+80);
  }
  function sync(){
    btn.hidden=!unlocked();
    if(wanted()&&allowed())start();else stop();
  }
  btn.addEventListener('click',function(){touched=true;var on=!wanted();store(on);paint();sync()});
  ['pointerdown','keydown','touchend'].forEach(function(e){addEventListener(e,function(){if(!touched){touched=true}if(!node)sync()},true)});
  document.addEventListener('visibilitychange',sync);
  addEventListener('hashchange',function(){setTimeout(sync,0)});
  new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
  setInterval(sync,1500);                          // picks up unlocking / signing out
  paint();sync();
})();
