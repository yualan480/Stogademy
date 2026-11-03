export const TORCH_IDS=[25,27,28,29,30],PLANT_IDS=[31,32,33];
export const isTorch=id=>TORCH_IDS.includes(id),isPlant=id=>PLANT_IDS.includes(id);
export function torchAxis(id){return ({27:[-1,0],28:[1,0],29:[0,-1],30:[0,1]})[id]||[0,0];}
export function torchBoxes(id){const [dx,dz]=torchAxis(id),out=[];for(let i=0;i<6;i++){const t=i/5,x=.5+dx*(.4-.23*t),z=.5+dz*(.4-.23*t),y=(dx||dz?.2:0)+t*.58;out.push([x-.065,y,z-.065,x+.065,y+.14,z+.065]);}return out;}
export function blockBoxes(id){if(isTorch(id))return torchBoxes(id);if(isPlant(id)||id===22)return [[.15,0,.15,.85,id===31?.75:.65,.85]];if(id===20||id===26)return [[0,0,0,1,.6,1]];if(id===23)return [[.0625,0,.0625,.9375,.875,.9375]];return [[0,0,0,1,1,1]];}
export function inShape(id,x,y,z){return blockBoxes(id).some(([a,b,c,d,e,f])=>x>=a&&x<=d&&y>=b&&y<=e&&z>=c&&z<=f);}
