// Keeps Chatter and Games inside Stogademy. Not unlocked -> back to the dashboard. Opened on its own -> forwarded into the dashboard.
try{var root=new URL('../',document.currentScript.src).href;
if(localStorage.getItem('stg_ok')!=='1')location.replace(root);
else if(top===self){var v=location.pathname.indexOf('/chatter/')>=0?'chat':'games';
sessionStorage.setItem('stg_fwd',JSON.stringify({v:v,u:location.pathname.split('/').pop()+location.search+location.hash}));location.replace(root+'#/'+v)}}catch(e){}
