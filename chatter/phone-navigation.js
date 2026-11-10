const mobile=matchMedia('(max-width:800px), (pointer:coarse) and (max-height:500px)');
export function syncSidebar(){
 const app=document.getElementById('app'),open=!!app?.classList.contains('open')&&mobile.matches;
 document.querySelectorAll('#mb').forEach(button=>{button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-controls','side');button.setAttribute('aria-label',open?'Close sidebar':'Open sidebar');});
 const main=document.getElementById('main');if(main)main.inert=open;
}
export function setSidebarOpen(open){
 const app=document.getElementById('app');if(!app)return;
 const wasInside=document.getElementById('side')?.contains(document.activeElement);
 app.classList.toggle('open',open);syncSidebar();
 if(open&&mobile.matches)document.querySelector('[data-sidebar-close]')?.focus({preventScroll:true});
 else if(wasInside&&mobile.matches)document.getElementById('mb')?.focus({preventScroll:true});
}
document.addEventListener('click',event=>{if(event.target.closest?.('[data-sidebar-close]'))setSidebarOpen(false);});
document.addEventListener('keydown',event=>{
 if(!mobile.matches||!document.getElementById('app')?.classList.contains('open'))return;
 if(event.key==='Escape'){event.preventDefault();setSidebarOpen(false);return;}
 if(event.key!=='Tab')return;
 const controls=Array.from(document.querySelectorAll('#side button:not(:disabled),#side a[href],#side input:not(:disabled),#side [tabindex="0"]')).filter(el=>el.getClientRects().length);
 if(!controls.length)return;const first=controls[0],last=controls.at(-1);
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
});
mobile.addEventListener('change',()=>{if(!mobile.matches)setSidebarOpen(false);else syncSidebar();});
