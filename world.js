/* ============================================================
   world.js — мир 256×256×48 с биомами и улучшенным рельефом.
   ============================================================ */
window.MC = window.MC || {};
(function (MC) {
'use strict';

const SX = 256, SZ = 256, SY = 48;
const CS = 16;
const CHX = SX / CS, CHZ = SZ / CS;
const world = new Uint8Array(SX * SZ * SY);
const IDX = (x, y, z) => x + z * SX + y * SX * SZ;
const SAVE_KEY = 'mcweb_world_v3';

const BIOME_PLAINS   = 0;
const BIOME_FOREST   = 1;
const BIOME_DESERT   = 2;
const BIOME_SNOW     = 3;
const BIOME_MOUNTAIN = 4;

let _r = 123456789;
function rnd() {
  _r = (Math.imul(_r, 1103515245) + 12345) & 0x7fffffff;
  return _r / 0x7fffffff;
}
function hash2(x, z, s) {
  const n = Math.sin(x * 127.1 + z * 311.7 + s * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}
function vnoise(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi, s),     b = hash2(xi + 1, zi, s);
  const c = hash2(xi, zi + 1, s), d = hash2(xi + 1, zi + 1, s);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

const TILE = 16, ACOLS = 4, AROWS = 4;
const atlasCanvas = document.createElement('canvas');
atlasCanvas.width  = TILE * ACOLS;
atlasCanvas.height = TILE * AROWS;
const actx = atlasCanvas.getContext('2d');
const tileImg = actx.createImageData(TILE, TILE);

const cl = v => v < 0 ? 0 : v > 255 ? 255 : (v | 0);
function nc(r, g, b, amt) {
  const d = (rnd() - 0.5) * amt;
  return [cl(r + d), cl(g + d), cl(b + d)];
}
function drawTile(index, fn) {
  const tx = (index % ACOLS) * TILE;
  const ty = Math.floor(index / ACOLS) * TILE;
  const d = tileImg.data;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const c = fn(x, y);
      const o = (y * TILE + x) * 4;
      d[o] = c[0]; d[o+1] = c[1]; d[o+2] = c[2];
      d[o+3] = c.length > 3 ? c[3] : 255;
    }
  }
  actx.putImageData(tileImg, tx, ty);
}

_r = 777;
drawTile(0, () => nc(92, 156, 52, 30));
drawTile(1, (x, y) => {
  const edge = 3 + ((x * 5 + 1) % 3);
  if (y < edge) return nc(92, 156, 52, 26);
  return nc(136, 98, 66, 24);
});
drawTile(2, () => nc(136, 98, 66, 26));
drawTile(3, () => nc(126, 126, 126, 26));
drawTile(4, (x, y) => {
  const gx = (x / 4) | 0, gy = (y / 4) | 0;
  const v = ((gx * 7 + gy * 13) % 5) * 9;
  const edge = (x % 4 === 0 || y % 4 === 0) ? -18 : 0;
  const c = 108 + (rnd() - 0.5) * 16 + v + edge;
  return [cl(c), cl(c), cl(c)];
});
drawTile(5, () => nc(218, 206, 158, 18));
drawTile(6, (x) => {
  const s = Math.sin(x * 1.9) * 9;
  return nc(108 + s, 82 + s, 48 + s, 12);
});
drawTile(7, (x, y) => {
  const dx = x - 7.5, dy = y - 7.5;
  const ring = Math.sin(Math.sqrt(dx*dx + dy*dy) * 2.4) * 12;
  return nc(152 + ring, 118 + ring, 74 + ring, 10);
});
drawTile(8, () => {
  const dark = rnd() < 0.20 ? -38 : 0;
  return nc(56 + dark, 128 + dark, 40 + dark, 34);
});
drawTile(9, (x, y) => {
  let v = 0;
  if (y % 5 === 0) v = -34;
  else if (((x + ((y / 5) | 0) * 7) % 11) === 0) v = -22;
  return nc(166 + v, 134 + v, 84 + v, 16);
});
drawTile(10, (x, y) => {
  const row = (y / 4) | 0;
  const off = (row % 2) * 4;
  if (y % 4 === 0 || ((x + off) % 8) === 0) return nc(196, 190, 184, 12);
  return nc(150, 66, 50, 16);
});
drawTile(11, (x, y) => {
  if (x === 0 || y === 0 || x === 15 || y === 15) return [212, 236, 245, 255];
  if ((x === 2 && y < 6) || (y === 2 && x < 6)) return [238, 250, 255, 170];
  return [188, 226, 240, 55];
});
drawTile(12, () => nc(242, 246, 250, 10));
drawTile(13, () => {
  const d = (rnd() - 0.5) * 24;
  return [cl(38 + d), cl(28 + d), cl(58 + d)];
});

const atlasTexture = new THREE.CanvasTexture(atlasCanvas);
atlasTexture.magFilter = THREE.NearestFilter;
atlasTexture.minFilter = THREE.NearestFilter;
atlasTexture.generateMipmaps = false;
atlasTexture.wrapS = atlasTexture.wrapT = THREE.ClampToEdgeWrapping;

const BLOCKS = {
  1:  { name: 'Трава',     top: 0,  side: 1,  bottom: 2  },
  2:  { name: 'Земля',     top: 2,  side: 2,  bottom: 2  },
  3:  { name: 'Камень',    top: 3,  side: 3,  bottom: 3  },
  4:  { name: 'Булыжник',  top: 4,  side: 4,  bottom: 4  },
  5:  { name: 'Песок',     top: 5,  side: 5,  bottom: 5  },
  6:  { name: 'Дерево',    top: 7,  side: 6,  bottom: 7  },
  7:  { name: 'Листва',    top: 8,  side: 8,  bottom: 8  },
  8:  { name: 'Доски',     top: 9,  side: 9,  bottom: 9  },
  9:  { name: 'Кирпич',    top: 10, side: 10, bottom: 10 },
  10: { name: 'Стекло',    top: 11, side: 11, bottom: 11, transparent: true },
  11: { name: 'Снег',      top: 12, side: 12, bottom: 12 },
  12: { name: 'Обсидиан',  top: 13, side: 13, bottom: 13 }
};

function generateWorld(s) {
  world.fill(0);
  _r = (s >>> 0) || 1;

  const heights = new Int16Array(SX * SZ);
  const biomes  = new Uint8Array(SX * SZ);

  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      const wx = x + (vnoise(x / 40, z / 40, s + 700) - 0.5) * 30;
      const wz = z + (vnoise(x / 40, z / 40, s + 800) - 0.5) * 30;

      let h = 0;
      h += vnoise(wx / 128, wz / 128, s)      * 16;
      h += vnoise(wx / 64,  wz / 64,  s + 11) * 8;
      h += vnoise(wx / 32,  wz / 32,  s + 23) * 4;
      h += vnoise(wx / 16,  wz / 16,  s + 37) * 2;
      h += vnoise(wx / 8,   wz / 8,   s + 51) * 1;
      h += vnoise(wx / 4,   wz / 4,   s + 63) * 0.5;
      h = Math.floor(h) + 6;
      if (h < 3) h = 3;
      if (h > SY - 12) h = SY - 12;
      heights[x + z * SX] = h;

      const temp  = vnoise(x / 180, z / 180, s + 300);
      const humid = vnoise(x / 140, z / 140, s + 400);
      const mount = vnoise(x / 90,  z / 90,  s + 500);

      let biome;
      if (h > 30 || mount > 0.72)              biome = BIOME_MOUNTAIN;
      else if (temp < 0.34)                    biome = BIOME_SNOW;
      else if (temp > 0.66 && humid < 0.42)    biome = BIOME_DESERT;
      else if (humid > 0.58)                   biome = BIOME_FOREST;
      else                                     biome = BIOME_PLAINS;
      biomes[x + z * SX] = biome;
    }
  }

  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      const h = heights[x + z * SX];
      const biome = biomes[x + z * SX];

      for (let y = 0; y <= h; y++) {
        let b;

        if (y === 0) {
          b = 12;
        } else if (y < h - 3) {
          b = 3;
          if (biome === BIOME_MOUNTAIN && y < h - 6) {
            const rv = vnoise(x * 0.7 + y * 3.1, z * 0.7 + y * 1.3, s + 999);
            if (rv > 0.985) b = 12;
          }
        } else if (y < h) {
          if (biome === BIOME_DESERT)      b = 5;
          else if (biome === BIOME_SNOW)   b = 2;
          else if (biome === BIOME_MOUNTAIN) b = 3;
          else                              b = 2;
        } else {
          if (biome === BIOME_DESERT)                    b = 5;
          else if (biome === BIOME_SNOW)                 b = 11;
          else if (biome === BIOME_MOUNTAIN)             b = (h > 32) ? 11 : 3;
          else                                           b = 1;
        }

        world[IDX(x, y, z)] = b;
      }
    }
  }

  plantTrees(heights, biomes, 380, BIOME_FOREST,   'oak');
  plantTrees(heights, biomes, 90,  BIOME_PLAINS,   'oak');
  plantTrees(heights, biomes, 160, BIOME_SNOW,     'pine');
  plantTrees(heights, biomes, 40,  BIOME_MOUNTAIN, 'pine');
}

function plantTrees(heights, biomes, count, targetBiome, kind) {
  for (let i = 0; i < count; i++) {
    const x = 4 + Math.floor(rnd() * (SX - 8));
    const z = 4 + Math.floor(rnd() * (SZ - 8));
    if (biomes[x + z * SX] !== targetBiome) continue;

    const h = heights[x + z * SX];
    if (targetBiome === BIOME_MOUNTAIN && h > 28) continue;

    const top = world[IDX(x, h, z)];
    if (top !== 1 && top !== 11 && top !== 3 && top !== 5) continue;

    let ok = true;
    for (let dx = -2; dx <= 2 && ok; dx++)
      for (let dz = -2; dz <= 2; dz++)
        if (world[IDX(x + dx, h + 3, z + dz)] === 6) { ok = false; break; }
    if (!ok) continue;

    if (kind === 'oak')  buildOak(x, h + 1, z);
    if (kind === 'pine') buildPine(x, h + 1, z);
  }
}

function buildOak(x, y, z) {
  const th = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < th; i++) {
    if (y + i < SY) world[IDX(x, y + i, z)] = 6;
  }
  const top = y + th;
  for (let dy = -2; dy <= 1; dy++) {
    const r = dy <= -1 ? 2 : 1;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx === 0 && dz === 0 && dy < 1) continue;
        if (Math.abs(dx) === r && Math.abs(dz) === r && rnd() < 0.65) continue;
        const bx = x + dx, by = top + dy, bz = z + dz;
        if (bx < 0 || bx >= SX || bz < 0 || bz >= SZ) continue;
        if (by < 0 || by >= SY) continue;
        if (world[IDX(bx, by, bz)] === 0) world[IDX(bx, by, bz)] = 7;
      }
    }
  }
}

function buildPine(x, y, z) {
  const th = 6 + Math.floor(rnd() * 3);
  for (let i = 0; i < th; i++) {
    if (y + i < SY) world[IDX(x, y + i, z)] = 6;
  }
  const top = y + th;
  for (let layer = 0; layer < 5; layer++) {
    const r = Math.max(0, 2 - Math.floor(layer * 0.55));
    const ly = top + layer - 4;
    if (ly < 0 || ly >= SY) continue;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) + Math.abs(dz) > r + 1) continue;
        const bx = x + dx, bz = z + dz;
        if (bx < 0 || bx >= SX || bz < 0 || bz >= SZ) continue;
        if (world[IDX(bx, ly, bz)] === 0) world[IDX(bx, ly, bz)] = 7;
      }
    }
  }
}

function getBlock(x, y, z) {
  if (x < 0 || x >= SX || z < 0 || z >= SZ) return 0;
  if (y < 0) return 1;
  if (y >= SY) return 0;
  return world[IDX(x, y, z)];
}

function isSolid(x, y, z) {
  if (y < 0) return true;
  if (y >= SY) return false;
  if (x < 0 || x >= SX || z < 0 || z >= SZ) return false;
  return world[IDX(x, y, z)] !== 0;
}

function highestAt(x, z) {
  for (let y = SY - 1; y >= 0; y--)
    if (world[IDX(x, y, z)] !== 0) return y + 1;
  return 1;
}

const matOpaque = new THREE.MeshBasicMaterial({ map: atlasTexture, vertexColors: true });
const matTrans  = new THREE.MeshBasicMaterial({
  map: atlasTexture, vertexColors: true, transparent: true,
  depthWrite: false, side: THREE.DoubleSide
});

const chunkGroup = new THREE.Group();

const FACES = [
  { d: [ 1, 0, 0], c: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]], s: 0.72, k: 'side'   },
  { d: [-1, 0, 0], c: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]], s: 0.72, k: 'side'   },
  { d: [ 0, 1, 0], c: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]], s: 1.00, k: 'top'    },
  { d: [ 0,-1, 0], c: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], s: 0.50, k: 'bottom' },
  { d: [ 0, 0, 1], c: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]], s: 0.86, k: 'side'   },
  { d: [ 0, 0,-1], c: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]], s: 0.86, k: 'side'   }
];
const FACE_UV = [[0,0],[1,0],[1,1],[0,1]];

const chunks = new Map();

function makeGeom(D) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(D.p, 3));
  g.setAttribute('uv',       new THREE.Float32BufferAttribute(D.u, 2));
  g.setAttribute('color',    new THREE.Float32BufferAttribute(D.c, 3));
  g.setIndex(D.i);
  return g;
}

function buildChunk(cx, cz) {
  const key = cx + ',' + cz;
  const old = chunks.get(key);
  if (old) {
    chunkGroup.remove(old.opaque);
    chunkGroup.remove(old.trans);
    old.opaque.geometry.dispose();
    old.trans.geometry.dispose();
  }

  const O = { p: [], u: [], c: [], i: [] };
  const T = { p: [], u: [], c: [], i: [] };
  const x0 = cx * CS, z0 = cz * CS;

  for (let y = 0; y < SY; y++) {
    for (let z = z0; z < z0 + CS; z++) {
      for (let x = x0; x < x0 + CS; x++) {
        const b = world[IDX(x, y, z)];
        if (b === 0) continue;
        const def = BLOCKS[b];
        const isT = !!def.transparent;
        const D = isT ? T : O;

        for (let fi = 0; fi < 6; fi++) {
          const f = FACES[fi];
          const nb = getBlock(x + f.d[0], y + f.d[1], z + f.d[2]);

          if (isT) {
            if (nb !== 0) continue;
          } else {
            if (nb !== 0 && !BLOCKS[nb].transparent) continue;
          }

          const tile = f.k === 'top' ? def.top : (f.k === 'bottom' ? def.bottom : def.side);
          const tc = tile % ACOLS, tr = (tile / ACOLS) | 0;
          const u0 = tc / ACOLS, u1 = (tc + 1) / ACOLS;
          const v0 = 1 - (tr + 1) / AROWS, v1 = 1 - tr / AROWS;

          const base = D.p.length / 3;
          for (let vi = 0; vi < 4; vi++) {
            const cv = f.c[vi];
            D.p.push(x + cv[0], y + cv[1], z + cv[2]);
            const uv = FACE_UV[vi];
            D.u.push(u0 + uv[0] * (u1 - u0), v0 + uv[1] * (v1 - v0));
            D.c.push(f.s, f.s, f.s);
          }
          D.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }

  const mO = new THREE.Mesh(makeGeom(O), matOpaque);
  mO.frustumCulled = true;
  const mT = new THREE.Mesh(makeGeom(T), matTrans);
  mT.frustumCulled = true;
  mT.renderOrder = 1;

  chunkGroup.add(mO);
  chunkGroup.add(mT);
  chunks.set(key, { opaque: mO, trans: mT });
}

function buildAllChunks() {
  for (let cz = 0; cz < CHZ; cz++)
    for (let cx = 0; cx < CHX; cx++)
      buildChunk(cx, cz);
}

function rebuildAround(x, z) {
  const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
  const dirty = new Set([cx + ',' + cz]);
  if (x % CS === 0)      dirty.add((cx - 1) + ',' + cz);
  if (x % CS === CS - 1) dirty.add((cx + 1) + ',' + cz);
  if (z % CS === 0)      dirty.add(cx + ',' + (cz - 1));
  if (z % CS === CS - 1) dirty.add(cx + ',' + (cz + 1));
  dirty.forEach(k => {
    const [a, b] = k.split(',').map(Number);
    if (a >= 0 && a < CHX && b >= 0 && b < CHZ) buildChunk(a, b);
  });
}

function rebuildAll() {
  chunks.forEach(c => {
    chunkGroup.remove(c.opaque);
    chunkGroup.remove(c.trans);
    c.opaque.geometry.dispose();
    c.trans.geometry.dispose();
  });
  chunks.clear();
  buildAllChunks();
}

MC.SX = SX; MC.SZ = SZ; MC.SY = SY;
MC.CS = CS; MC.CHX = CHX; MC.CHZ = CHZ;
MC.world = world;
MC.IDX = IDX;
MC.SAVE_KEY = SAVE_KEY;

MC.BLOCKS = BLOCKS;
MC.ACOLS = ACOLS;
MC.atlasCanvas = atlasCanvas;
MC.atlasTexture = atlasTexture;

MC.chunkGroup = chunkGroup;
MC.getBlock = getBlock;
MC.isSolid = isSolid;
MC.highestAt = highestAt;

MC.generateWorld = generateWorld;
MC.buildChunk = buildChunk;
MC.buildAllChunks = buildAllChunks;
MC.rebuildAround = rebuildAround;
MC.rebuildAll = rebuildAll;

console.log('[world.js] готов. Размер:', SX, '×', SZ, '×', SY, '=', (SX * SZ * SY / 1000000).toFixed(2), 'млн блоков');

})(window.MC);