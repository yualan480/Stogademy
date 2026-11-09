// Horizontal, full-height chunk addresses. Heights never affect loading.
export const RENDER_MIN=1,RENDER_MAX=4,RENDER_DEFAULT=3,SIMULATION_DISTANCE=2,MAX_CACHED_CHUNKS=256;
export const chunkOf=(x,z,size=16)=>({x:Math.floor(x/size),z:Math.floor(z/size)});
export const chunkKey=(x,z)=>`${x},${z}`;
export const inRange=(a,b,distance)=>{const ac=chunkOf(a.x,a.z),bc=chunkOf(b.x,b.z);return Math.abs(ac.x-bc.x)<=distance&&Math.abs(ac.z-bc.z)<=distance;};
export const renderDistance=value=>Number.isInteger(value)?Math.max(RENDER_MIN,Math.min(RENDER_MAX,value)):RENDER_DEFAULT;
export function wantedChunks(p,distance,worldSize){const center=chunkOf(p.x,p.z),limit=worldSize/32,list=[];for(let x=center.x-distance;x<=center.x+distance;x++)for(let z=center.z-distance;z<=center.z+distance;z++)if(x>=-limit&&x<limit&&z>=-limit&&z<limit)list.push([x,z]);return list.sort((a,b)=>(a[0]-center.x)**2+(a[1]-center.z)**2-((b[0]-center.x)**2+(b[1]-center.z)**2));}

export function encodeChunk(data){let binary="";for(let i=0;i<data.length;i+=8192)binary+=String.fromCharCode(...data.subarray(i,i+8192));return btoa(binary);}
