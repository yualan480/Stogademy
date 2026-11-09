export function furnaceFacing(yaw=0){const angle=Math.round(yaw/(Math.PI/2))*Math.PI/2;return {x:(Math.round(Math.sin(angle))||0),z:(Math.round(Math.cos(angle))||0)};}
export function furnaceView(key,f){const [x,y,z]=key.split(',').map(Number);return {x,y,z,facing:f.facing||{x:0,z:1},lit:!!f.job};}
export function furnaceFront(normalX,normalZ,facing={x:0,z:1}){return normalX===facing.x&&normalZ===facing.z;}
