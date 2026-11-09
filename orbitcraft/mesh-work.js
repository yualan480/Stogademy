// A block affects its own section and the neighboring section only at a seam.
export function changedSections(y){return new Set([Math.floor((y-1)/16),Math.floor(y/16),Math.floor((y+1)/16)]);}
export function mergeSections(previous,next,min=-4,max=19){if(previous===null||next===null)return null;return new Set([...(previous||[]),...next].filter(y=>y>=min&&y<=max));}
// Compute each corner once instead of repeating AO for duplicated triangle vertices.
export function faceShades(n,vertices,shade,x,y,z,opaque){
 const a=n[0]?1:0,b=n[2]?1:2,ox=x+n[0],oy=y+n[1],oz=z+n[2],values=[];
 for(const v of vertices){const sa=v[a]?1:-1,sb=v[b]?1:-1,ax=a===0?sa:0,ay=a===1?sa:0,az=a===2?sa:0,bx=b===0?sb:0,by=b===1?sb:0,bz=b===2?sb:0;
 values.push(shade*(1-.14*(Number(!!opaque(ox+ax,oy+ay,oz+az))+Number(!!opaque(ox+bx,oy+by,oz+bz))+Number(!!opaque(ox+ax+bx,oy+ay+by,oz+az+bz)))));}
 return values;
}
