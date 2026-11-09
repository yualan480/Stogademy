// Keep the supplied game inside Orbit. Store links and credit links never open tabs.
window.open=function(){return null;};
document.addEventListener('click',event=>{const a=event.target.closest?.('a[href]');if(a&&new URL(a.href,location.href).origin!==location.origin){event.preventDefault();event.stopImmediatePropagation();}},true);
addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code))event.preventDefault();});
