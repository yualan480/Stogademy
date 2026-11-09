// Keep navigation in Orbit. No popup or top-level navigation permission is granted.
document.addEventListener('click',function(event){
 const a=event.target.closest?.('a[href]');if(!a)return;
 const url=new URL(a.getAttribute('href'),location.href);
 if(url.origin===location.origin&&!a.target)return;
 event.preventDefault();event.stopImmediatePropagation();
 const room=url.pathname.slice(1);
 if(/^(battle-|user-)[a-z0-9-]+$/.test(room)&&window.app){app.tryJoinRoom(room);return;}
 if(window.app)app.addPopupMessage('External links stay closed while you play in Orbit.');
},true);
