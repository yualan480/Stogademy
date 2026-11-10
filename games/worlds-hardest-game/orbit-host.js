document.body.classList.toggle('orbit-touch',mobile);
// Release controls when a phone gesture is cancelled or the game loses focus.
function orbitReleaseKeys(){keyUp=keyDown=keyLeft=keyRight=false;if(window.keydown)Object.keys(keydown).forEach(k=>keydown[k]=false);}
canvasElement.addEventListener('touchcancel',orbitReleaseKeys);
window.addEventListener('blur',orbitReleaseKeys);
document.addEventListener('visibilitychange',()=>{if(document.hidden)orbitReleaseKeys();});
