import * as THREE from './vendor/three.module.js';
import { BLOCKS } from './world.js';

export const TILE_COUNT = 13;
const random = (x, y, seed) => {
  let n = Math.imul(x + seed * 71, 374761393) ^ Math.imul(y + seed * 13, 668265263);
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967295;
};
export function tileFor(id, normalY) {
  if (id === 1) return normalY > 0 ? 0 : normalY < 0 ? 1 : 10;
  if (id === 5 && normalY !== 0) return 11;
  if (id === 7 && normalY === 0) return 12;
  return id - 1;
}

export function createTextures() {
  const atlas = document.createElement('canvas');
  atlas.width = TILE_COUNT * 16;
  atlas.height = 16;
  const context = atlas.getContext('2d');
  for (let tile = 0; tile < TILE_COUNT; tile++) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const grain = random(x, y, tile + 1), patch = random(x >> 2, y >> 2, tile + 3);
      let color = BLOCKS[Math.min(tile + 1, 10)].color;
      let shade = .77 + grain * .32 + patch * .15, alpha = 1;
      if (tile === 0) {
        color = patch > .6 ? '#6b9741' : '#608b36';
        if (grain > .88) shade *= 1.14;
      } else if (tile === 1) {
        color = grain > .94 ? '#b6a08a' : '#86603f';
      } else if (tile === 2) {
        color = '#8a8c88';
        if ((x + Math.floor(random(0, y >> 2, 41) * 5)) % 7 === 0 && grain > .35) shade *= .64;
      } else if (tile === 3) {
        color = '#dac58e'; shade = .89 + grain * .18;
      } else if (tile === 4) {
        color = '#796044';
        shade = .62 + random(x >> 1, y >> 3, 7) * .5 + grain * .15;
        if ((x + (y >> 3)) % 5 === 0) shade *= .68;
      } else if (tile === 5) {
        color = patch > .5 ? '#4d7933' : '#3c662c';
        alpha = grain > .84 && random(x >> 1, y >> 1, 26) > .44 ? 0 : 1;
      } else if (tile === 6) {
        color = '#e5edf0'; shade = .91 + grain * .1;
      } else if (tile === 7) {
        color = '#589bb5'; shade = .87 + grain * .09 + (y % 5 === 0 ? .12 : 0);
      } else if (tile === 8) {
        color = '#424746'; shade = .5 + grain * .65;
      } else if (tile === 9) {
        color = '#bc955e';
        shade = y % 4 === 0 ? .55 : .87 + grain * .2;
        if ((x + (Math.floor(y / 4) % 2) * 8) % 16 === 0) shade *= .65;
      } else if (tile === 10 || tile === 12) {
        const cap = tile === 10 ? 3 + Math.floor(random(x >> 1, 0, 11) * 3) : 5;
        color = y < cap ? (tile === 10 ? '#668f3b' : '#e6edf0') : '#86603f';
        if (y === cap) shade *= .6;
      } else if (tile === 11) {
        const distance = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        color = distance > 6 ? '#735438' : '#b4925e';
        shade = distance > 6 ? .75 + grain * .2 : (Math.floor(distance) % 3 === 0 ? .67 : .92) + grain * .12;
      }
      const c = new THREE.Color(color).multiplyScalar(shade);
      context.fillStyle = '#' + c.getHexString();
      context.globalAlpha = alpha;
      context.fillRect(tile * 16 + x, y, 1, 1);
    }
  }
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(atlas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  const icons = new Map();
  function icon(id) {
    if (!icons.has(id)) {
      const c = document.createElement('canvas'); c.width = c.height = 16;
      c.getContext('2d').drawImage(atlas, tileFor(id, 0) * 16, 0, 16, 16, 0, 0, 16, 16);
      icons.set(id, c.toDataURL());
    }
    return icons.get(id);
  }
  return { texture, icon };
}

export function createAtmosphere(scene) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(110, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec3 direction; void main(){float t=smoothstep(-0.08,0.9,normalize(direction).y);gl_FragColor=vec4(mix(vec3(0.77,0.88,0.91),vec3(0.30,0.59,0.85),t),1.0);}'
  }));
  sky.renderOrder = -10;
  scene.add(sky);
  const sunlight = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: 0xfff0c3, fog: false, side: THREE.DoubleSide }));
  sunlight.position.set(-44, 76, -68); sunlight.lookAt(0, 15, 0); sky.add(sunlight);
  const clouds = new THREE.Group();
  const cloudMaterial = new THREE.MeshLambertMaterial({ color: 0xfffcf3, transparent: true, opacity: .88 });
  const cloudGeometry = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 13; i++) {
    const cloud = new THREE.Group();
    cloud.position.set(random(i, 0, 88) * 150 - 75, 64 + random(i, 1, 88) * 9, random(i, 2, 88) * 150 - 75);
    for (let j = 0; j < 4; j++) {
      const puff = new THREE.Mesh(cloudGeometry, cloudMaterial);
      puff.scale.set(7 + random(i, j, 2) * 9, 1.4 + random(i, j, 3), 5 + random(i, j, 4) * 7);
      puff.position.set(j * 5, random(i, j, 5), random(i, j, 6) * 5);
      cloud.add(puff);
    }
    clouds.add(cloud);
  }
  scene.add(clouds);
  return (now, camera) => {
    sky.position.copy(camera.position);
    clouds.position.x = Math.sin(now * .000012) * 5;
  };
}

export function createHeldBlock(camera, texture) {
  const group = new THREE.Group(); camera.add(group);
  const handMaterial = new THREE.MeshLambertMaterial({ color: 0xc99a72, depthTest: false, fog: false });
  const sleeveMaterial = new THREE.MeshLambertMaterial({ color: 0x2859a7, depthTest: false, fog: false });
  const hand = new THREE.Mesh(new THREE.BoxGeometry(.17, .34, .18), handMaterial);
  hand.position.set(.41, -.48, -.64); hand.rotation.set(-.38, -.2, -.18); hand.renderOrder = 1000; group.add(hand);
  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(.18, .27, .19), sleeveMaterial);
  sleeve.position.set(.43, -.69, -.55); sleeve.rotation.copy(hand.rotation); sleeve.renderOrder = 1000; group.add(sleeve);
  const material = new THREE.MeshLambertMaterial({ map: texture, alphaTest: .5, depthTest: false, fog: false });
  const block = new THREE.Mesh(new THREE.BoxGeometry(.29, .29, .29), material);
  block.position.set(.43, -.34, -.72); block.rotation.set(.12, -.5, -.1); block.renderOrder = 1001; group.add(block);
  let selected = null, swingAt = -1000;
  return {
    select(id, count) {
      block.visible = count > 0;
      if (id === selected) return; selected = id;
      const uv = block.geometry.attributes.uv;
      for (let face = 0; face < 6; face++) {
        const tile = tileFor(id, face === 2 ? 1 : face === 3 ? -1 : 0);
        for (let v = 0; v < 4; v++) uv.setXY(face * 4 + v, (tile * 16 + .2 + (v % 2) * 15.6) / (TILE_COUNT * 16), (.2 + (v < 2 ? 1 : 0) * 15.6) / 16);
      }
      uv.needsUpdate = true;
    },
    swing() { swingAt = performance.now(); },
    update(now, moving, visible) {
      group.visible = visible;
      const swing = Math.sin(Math.min(1, (now - swingAt) / 220) * Math.PI);
      group.position.set(moving ? Math.sin(now * .009) * .012 : 0, (moving ? Math.abs(Math.cos(now * .009)) * .018 : 0) - swing * .08, -swing * .1);
      group.rotation.x = -swing * .22;
    }
  };
}
