import {CHUNK,CHUNK_HEIGHT,MIN_Y,HEIGHT,chunkIndex,resourceBlock} from './world.js';
// Natural terrain ends well below the build limit. Typed arrays already contain
// air, so generating empty sky for every column only stalls streaming.
export function generateChunk(cx,cz,dimension='overworld',edits=[]){
 const data=new Uint8Array(CHUNK*CHUNK*CHUNK_HEIGHT),top=dimension==='nether'?130:54;
 for(let y=MIN_Y;y<=top;y++)for(let z=0;z<CHUNK;z++)for(let x=0;x<CHUNK;x++)data[chunkIndex(x,y,z)]=resourceBlock(cx*CHUNK+x,y,cz*CHUNK+z,dimension);
 for(const a of edits)if(a.y>=MIN_Y&&a.y<HEIGHT&&Math.floor(a.x/CHUNK)===cx&&Math.floor(a.z/CHUNK)===cz)data[chunkIndex((a.x%CHUNK+CHUNK)%CHUNK,a.y,(a.z%CHUNK+CHUNK)%CHUNK)]=a.block;
 return data;
}
