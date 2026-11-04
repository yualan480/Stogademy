import * as THREE from './vendor/three.module.js';
export function stairGeometry(boxes,size,tile,tileCount){const positions=[],normals=[],uvs=[];
 for(const [x,y,z,a,b,c]of boxes){const g=new THREE.BoxGeometry((a-x)*size,(b-y)*size,(c-z)*size);g.translate(((a+x)/2-.5)*size,((b+y)/2-.5)*size,((c+z)/2-.5)*size);const uv=g.attributes.uv;for(let f=0;f<6;f++)for(let v=0;v<4;v++)uv.setXY(f*4+v,(tile*16+.2+(v%2)*15.6)/(tileCount*16),(.2+(v<2?1:0)*15.6)/16);const flat=g.toNonIndexed();positions.push(...flat.attributes.position.array);normals.push(...flat.attributes.normal.array);uvs.push(...flat.attributes.uv.array);flat.dispose();g.dispose();}
 const out=new THREE.BufferGeometry();out.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));out.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));out.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));out.computeBoundingSphere();return out;
}
