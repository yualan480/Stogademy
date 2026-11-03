export function createPauseMenu({openDialog,closeDialog,bindings,stats,players,disconnect}){
 const dialog=document.createElement('dialog');dialog.id='pause-menu';dialog.innerHTML='<h2>Game Menu</h2><div class="pause-grid"><button id="resume-game" class="wide">Back to Game</button><button data-pause-page="advancements">Advancements</button><button data-pause-page="statistics">Statistics</button><button data-pause-page="feedback">Feedback</button><button data-pause-page="links">Server Links</button><button id="pause-options">Options...</button><button data-pause-page="reporting">Player Reporting</button><button id="pause-disconnect" class="wide">Disconnect</button></div>';
 const details=document.createElement('dialog');details.id='pause-details';details.innerHTML='<h2></h2><div class="pause-content"></div><button data-close="pause-details">Done</button>';document.body.append(dialog,details);
 dialog.querySelector('#resume-game').onclick=()=>closeDialog('pause-menu');dialog.querySelector('#pause-options').onclick=()=>openDialog('keybind-options');dialog.querySelector('#pause-disconnect').onclick=disconnect;
 dialog.querySelectorAll('[data-pause-page]').forEach(b=>b.onclick=()=>{const page=b.dataset.pausePage,s=stats(),area=details.querySelector('.pause-content');details.querySelector('h2').textContent=b.textContent;area.replaceChildren();const line=text=>{const p=document.createElement('p');p.textContent=text;area.append(p);};
 if(page==='statistics'){line(`Blocks mined: ${s.mined}`);line(`Blocks placed: ${s.placed}`);line(`Health: ${Math.ceil(s.health)} / 20`);line(`Hunger: ${Math.ceil(s.hunger)} / 20`);}
 if(page==='advancements'){for(const [name,ok]of [['First block',s.mined>0],['Builder: 10 blocks placed',s.placed>=10],['Miner: 100 blocks mined',s.mined>=100]])line((ok?'✓ ':'□ ')+name);}
 if(page==='reporting'){line('Players online:');players().forEach(p=>line(p.name));line('Use Orbit to contact the team about a player.');}
 if(page==='feedback')line('Share feedback with the team in Orbit.');
 if(['links','feedback','reporting'].includes(page)){for(const [name,href]of [['Orbit','../chatter/'],['Orbit Games','../games/']]){const a=document.createElement('a');a.textContent=name;a.href=href;a.target='_blank';a.rel='noopener';area.append(a);}}
 openDialog('pause-details');});return dialog;
}
