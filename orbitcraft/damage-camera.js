export function damageTilt(age,reduced=false){
 if(age<0||age>=360)return {roll:0,pitch:0};const t=age/360,scale=reduced?.18:1;
 return {roll:Math.sin(t*Math.PI)*.105*scale,pitch:Math.sin(t*Math.PI*3)*.025*(1-t)*scale};
}
export function createDamageTilt(reduced=()=>false){let at=-Infinity,side=1;return {hit(now){at=now;side=-side;},sample(now){const tilt=damageTilt(now-at,reduced());return {roll:tilt.roll*side,pitch:tilt.pitch};},clear(){at=-Infinity;}};}
