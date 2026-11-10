// Keep game links inside the Orbit player.
(()=>{window.open=()=>null;document.addEventListener('click',event=>{const a=event.target.closest?.('a[href]');if(!a)return;try{const url=new URL(a.getAttribute('href'),location.href);if(/^https?:$/.test(url.protocol)&&url.origin!==location.origin){event.preventDefault();event.stopImmediatePropagation();}}catch{}},true);})();
