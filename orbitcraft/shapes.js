export const isSpike=id=>id===50||id===52;
export const isStair=id=>id>=34&&id<=37;
export const TORCH_IDS=[25,27,28,29,30],PLANT_IDS=[31,32,33];
export const isTorch=id=>TORCH_IDS.includes(id),isPlant=id=>PLANT_IDS.includes(id);
export function torchAxis(id){return ({27:[-1,0],28:[1,0],29:[0,-1],30:[0,1]})[id]||[0,0];}
export function torchBoxes(id){const [dx,dz]=torchAxis(id),out=[];for(let i=0;i<6;i++){const t=i/5,x=.5+dx*(.4-.23*t),z=.5+dz*(.4-.23*t),y=(dx||dz?.2:0)+t*.58;out.push([x-.065,y,z-.065,x+.065,y+.14,z+.065]);}return out;}
export function blockBoxes(id){if(isSpike(id)){const boxes=[[.3,0,.3,.7,.2,.7],[.35,.2,.35,.65,.5,.65],[.4,.5,.4,.6,.75,.6],[.46,.75,.46,.54,1,.54]];return id===52?boxes.map(([a,b,c,d,e,f])=>[a,1-e,c,d,1-b,f]):boxes;}if(id===38)return [[.125,.5,.4375,.875,1,.5625],[.4375,0,.4375,.5625,.5,.5625]];if(isStair(id)){const upper=({34:[0,.5,0,1,1,.5],35:[0,.5,0,.5,1,1],36:[0,.5,.5,1,1,1],37:[.5,.5,0,1,1,1]})[id];return [[0,0,0,1,.5,1],upper];}if(isTorch(id))return torchBoxes(id);if(isPlant(id)||id===22)return [[.15,0,.15,.85,id===31?.75:.65,.85]];if(id===20||id===26)return [[0,0,0,1,.6,1]];if(id===23)return [[.0625,0,.0625,.9375,.875,.9375]];return [[0,0,0,1,1,1]];}
export function inShape(id,x,y,z){return blockBoxes(id).some(([a,b,c,d,e,f])=>x>=a&&x<=d&&y>=b&&y<=e&&z>=c&&z<=f);}
