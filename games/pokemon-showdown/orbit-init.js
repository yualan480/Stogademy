// Initialize our hosted fork in its frame. The official website is never framed.
Storage.initTestClient=function(){
 Config.server=Config.server||Config.defaultserver;
 Storage.whenTeamsLoaded.load();
 Storage.whenAppLoaded(function(app){
  $.post=function(uri,data,callback){
   if(data?.act==='upkeep'){callback?.(JSON.stringify({username:'',loggedin:false}));return;}
   if(data?.act==='logout'){callback?.('{}');return;}
   if(data?.act!=='getassertion'){
    app.addPopupMessage('Orbit supports guest Showdown names. Choose an unused name to battle here; registered-account sign-in is not available in this client.');return;
   }
   fetch('/pokemon-showdown/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userid:data.userid,challstr:data.challstr}),credentials:'omit'})
    .then(async response=>{if(!response.ok)throw Error('Could not verify this name. Please try again.');return response.text();})
    .then(result=>callback?.(result)).catch(error=>app.addPopupMessage(error.message));
  };
  Storage.whenPrefsLoaded.load();
 });
};
Storage.initTestClient();
var app=new App();
window.orbitShowdownReady=true;
