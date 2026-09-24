/* ============================================================
   mobs.js — мирные мобы с текстурами, звуками, HP и AI.
   + isBlockOccupied(x,y,z) — не даёт поставить блок внутрь моба
   + unstickMob — если моб оказался в блоке, выталкивает наверх
   + Скрытие мобов за пределами радиуса прорисовки
   ============================================================ */
window.MOBS = (function () {
'use strict';

if (!window.MC) {
  console.warn('[mobs.js] world.js не загрузился — мобы недоступны');
  const noop = function () {};
  return {
    init: noop, update: noop,
    spawnInitial: noop, spawnAt: noop,
    clear: noop, serialize: function () { return []; },
    deserialize: noop, count: function () { return 0; },
    raycast: function () { return null; }, hit: function () { return false; },
    rebuildTextures: noop,
    isBlockOccupied: function () { return false; }
  };
}

const MC = window.MC;
const SX = MC.SX, SZ = MC.SZ, SY = MC.SY;
const CS = MC.CS;
const world = MC.world, IDX = MC.IDX;
const isSolid = MC.isSolid, highestAt = MC.highestAt;

let scene = null;
const mobs = [];

let playerPos = null;
let lastMobSoundTime = -99999;
/* Радиус прорисовки в блоках — обновляется из game.js */
let renderDistBlocks = 6 * CS;

const GRAVITY = 28;
const JUMP_VELOCITY = 8.6;
const SOUND_MIN_DIST2 = 15 * 15;
const SOUND_INTERVAL_MIN = 8;
const SOUND_INTERVAL_MAX = 16;
const PANIC_DURATION = 4.0;
const PANIC_SPEED_MULT = 1.6;
const LEG_SWING = 0.55;
/* Запас: скрываем моба на 1 блок раньше границы видимости,
   чтобы он не «выскакивал» резко на самом краю */
const VISIBILITY_MARGIN = 1.0;

function cl(v) { return v < 0 ? 0 : v > 255 ? 255 : (v | 0); }
function fract(v) { return v - Math.floor(v); }
function hash01(x, y, s) {
  return fract(Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453123);
}

function newTexCanvas(px) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  return c;
}

function finalizeTex(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function makeTex(px, base, variation, blobs, seed) {
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(px, px);
  const d = img.data;
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      let r = base[0], g = base[1], b = base[2];

      const n = hash01(x, y, seed);
      const dv = (n - 0.5) * variation;
      r += dv; g += dv; b += dv;

      if (blobs && blobs.length) {
        for (let i = 0; i < blobs.length; i++) {
          const bl = blobs[i];
          const scale = bl.scale || 4;
          const bx = Math.floor(x / scale), by = Math.floor(y / scale);
          const nb = hash01(bx, by, seed + i * 17);
          if (nb < bl.chance) {
            r = bl.color[0]; g = bl.color[1]; b = bl.color[2];
          }
        }
      }

      const o = (y * px + x) * 4;
      d[o] = cl(r); d[o + 1] = cl(g); d[o + 2] = cl(b); d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finalizeTex(c);
}

function makePigSnoutTex() {
  const px = 16;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(px, px);
  const d = img.data;
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      let r = 204, g = 106, b = 122;
      const n = (hash01(x, y, 41) - 0.5) * 20;
      r += n; g += n; b += n;
      const cy = Math.abs(y - 8);
      if (cy <= 2 && (Math.abs(x - 5) <= 1 || Math.abs(x - 10) <= 1)) {
        r = 55; g = 22; b = 32;
      }
      const o = (y * px + x) * 4;
      d[o] = cl(r); d[o + 1] = cl(g); d[o + 2] = cl(b); d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finalizeTex(c);
}

function makeCowFaceTex() {
  const px = 16;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(px, px);
  const d = img.data;
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      let r = 102, g = 68, b = 34;
      const n = (hash01(x, y, 91) - 0.5) * 22;
      r += n; g += n; b += n;
      if (Math.abs(x - 8) <= 1 && y > 2) {
        r = 235; g = 232; b = 226;
      }
      const o = (y * px + x) * 4;
      d[o] = cl(r); d[o + 1] = cl(g); d[o + 2] = cl(b); d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finalizeTex(c);
}

const MOB_TEXTURES = {
  pigBody:  makeTex(16, [238, 156, 156], 22, [{ chance: 0.10, color: [220, 132, 132], scale: 3 }], 1),
  pigHead:  makeTex(16, [238, 156, 156], 22, [{ chance: 0.06, color: [216, 122, 128], scale: 4 }], 2),
  pigSnout: makePigSnoutTex(),
  pigLeg:   makeTex(16, [204, 106, 122], 22, null, 4),

  sheepWool: makeTex(16, [235, 235, 235], 34, [
    { chance: 0.18, color: [218, 218, 218], scale: 2 },
    { chance: 0.06, color: [200, 200, 200], scale: 3 }
  ], 5),
  sheepFace: makeTex(16, [68, 68, 68], 20, null, 6),
  sheepLeg:  makeTex(16, [51, 51, 51], 22, null, 7),

  cowHide: makeTex(16, [110, 70, 35], 24, [
    { chance: 0.30, color: [240, 235, 225], scale: 3 }
  ], 8),
  cowFace: makeCowFaceTex(),
  cowHorn: makeTex(16, [240, 240, 208], 14, null, 10),
  cowLeg:  makeTex(16, [68, 34, 17], 22, null, 11),

  chickenBody: makeTex(16, [250, 250, 250], 26, [
    { chance: 0.14, color: [236, 236, 232], scale: 2 },
    { chance: 0.05, color: [222, 222, 218], scale: 3 }
  ], 12),
  chickenBeak: makeTex(16, [232, 160, 32], 14, null, 13),
  chickenLeg:  makeTex(16, [200, 140, 40], 18, null, 14)
};

const SHADES = [0.92, 0.76, 1.00, 0.55, 0.86, 0.86];
const MAT_CACHE = new Map();

function getMobMaterial(color, texKey, faceIdx) {
  const s = SHADES[faceIdx];
  const key = (texKey ? 'T:' + texKey : 'C:' + color) + ':' + faceIdx;
  const cached = MAT_CACHE.get(key);
  if (cached) return cached;

  const m = new THREE.MeshBasicMaterial({ fog: true });
  const tex = texKey ? MOB_TEXTURES[texKey] : null;
  if (tex) {
    m.map = tex;
    m.color.setRGB(s, s, s);
  } else {
    m.color.set(color).multiplyScalar(s);
  }
  MAT_CACHE.set(key, m);
  return m;
}

function makeBox(w, h, d, color, texKey) {
  const mats = [];
  for (let i = 0; i < 6; i++) mats.push(getMobMaterial(color, texKey, i));
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
}

const MOB_TYPES = {

  pig: {
    h: 0.9, r: 0.42, speed: 1.4, hp: 10,
    parts: [
      [0.625, 0.5,   1.0,   0xEE9999,  0,    0.625,  0,     false, 'pigBody'],
      [0.5,   0.5,   0.5,   0xEE9999,  0,    0.75,  -0.55,  false, 'pigHead'],
      [0.25,  0.2,   0.1,   0xCC6677,  0,    0.66,  -0.85,  false, 'pigSnout'],
      [0.05,  0.05,  0.02,  0x551122, -0.06, 0.66,  -0.91,  false, null],
      [0.05,  0.05,  0.02,  0x551122,  0.06, 0.66,  -0.91,  false, null],
      [0.08,  0.08,  0.02,  0x111111, -0.15, 0.875, -0.81,  false, null],
      [0.08,  0.08,  0.02,  0x111111,  0.15, 0.875, -0.81,  false, null],
      [0.1,   0.1,   0.08,  0xCC6677, -0.15, 1.02,  -0.5,   false, null],
      [0.1,   0.1,   0.08,  0xCC6677,  0.15, 1.02,  -0.5,   false, null],
      [0.25,  0.375, 0.25,  0xCC6677, -0.19, 0.1875, -0.33, true,  'pigLeg'],
      [0.25,  0.375, 0.25,  0xCC6677,  0.19, 0.1875, -0.33, true,  'pigLeg'],
      [0.25,  0.375, 0.25,  0xCC6677, -0.19, 0.1875,  0.33, true,  'pigLeg'],
      [0.25,  0.375, 0.25,  0xCC6677,  0.19, 0.1875,  0.33, true,  'pigLeg']
    ]
  },

  sheep: {
    h: 1.25, r: 0.42, speed: 1.2, hp: 8,
    parts: [
      [0.75,  0.75,  1.0,   0xEEEEEE,  0,    0.875,  0,     false, 'sheepWool'],
      [0.4,   0.5,   0.4,   0x444444,  0,    0.875, -0.7,   false, 'sheepFace'],
      [0.06,  0.06,  0.02,  0xFFFFFF, -0.1,  0.95,  -0.91,  false, null],
      [0.06,  0.06,  0.02,  0xFFFFFF,  0.1,  0.95,  -0.91,  false, null],
      [0.25,  0.5,   0.25,  0x333333, -0.2,  0.25,  -0.3,   true,  'sheepLeg'],
      [0.25,  0.5,   0.25,  0x333333,  0.2,  0.25,  -0.3,   true,  'sheepLeg'],
      [0.25,  0.5,   0.25,  0x333333, -0.2,  0.25,   0.3,   true,  'sheepLeg'],
      [0.25,  0.5,   0.25,  0x333333,  0.2,  0.25,   0.3,   true,  'sheepLeg']
    ]
  },

  cow: {
    h: 1.45, r: 0.45, speed: 1.2, hp: 10,
    parts: [
      [0.75,  0.625, 1.125, 0x664422,  0,    1.0625,  0,     false, 'cowHide'],
      [0.5,   0.5,   0.5,   0x664422,  0,    1.0625, -0.7,   false, 'cowFace'],
      [0.1,   0.15,  0.1,   0xF0F0D0, -0.15, 1.38,   -0.7,   false, 'cowHorn'],
      [0.1,   0.15,  0.1,   0xF0F0D0,  0.15, 1.38,   -0.7,   false, 'cowHorn'],
      [0.07,  0.07,  0.02,  0x000000, -0.15, 1.15,   -0.96,  false, null],
      [0.07,  0.07,  0.02,  0x000000,  0.15, 1.15,   -0.96,  false, null],
      [0.25,  0.75,  0.25,  0x442211, -0.25, 0.375,  -0.4,   true,  'cowLeg'],
      [0.25,  0.75,  0.25,  0x442211,  0.25, 0.375,  -0.4,   true,  'cowLeg'],
      [0.25,  0.75,  0.25,  0x442211, -0.25, 0.375,   0.4,   true,  'cowLeg'],
      [0.25,  0.75,  0.25,  0x442211,  0.25, 0.375,   0.4,   true,  'cowLeg']
    ]
  },

  chicken: {
    h: 0.7, r: 0.22, speed: 2.0, hp: 4,
    parts: [
      [0.3,   0.4,   0.4,   0xFFFFFF,  0,    0.45,   0,     false, 'chickenBody'],
      [0.2,   0.3,   0.2,   0xFFFFFF,  0,    0.75,  -0.28,  false, 'chickenBody'],
      [0.15,  0.1,   0.15,  0xE8A020,  0,    0.7,   -0.45,  false, 'chickenBeak'],
      [0.1,   0.08,  0.04,  0xCC2222,  0,    0.6,   -0.45,  false, null],
      [0.05,  0.05,  0.02,  0x000000, -0.06, 0.8,   -0.39,  false, null],
      [0.05,  0.05,  0.02,  0x000000,  0.06, 0.8,   -0.39,  false, null],
      [0.05,  0.25,  0.3,   0xEEEEEE, -0.175, 0.45,  0,     false, 'chickenBody'],
      [0.05,  0.25,  0.3,   0xEEEEEE,  0.175, 0.45,  0,     false, 'chickenBody'],
      [0.08,  0.25,  0.08,  0xE8A020, -0.08, 0.125,  0.05,  true,  'chickenLeg'],
      [0.08,  0.25,  0.08,  0xE8A020,  0.08, 0.125,  0.05,  true,  'chickenLeg']
    ]
  }

};

function buildMobMesh(type) {
  const def = MOB_TYPES[type];
  const group = new THREE.Group();
  const legs = [];

  for (let i = 0; i < def.parts.length; i++) {
    const p = def.parts[i];
    const w = p[0], h = p[1], d = p[2], color = p[3];
    const x = p[4], y = p[5], z = p[6];
    const isLeg = p[7];
    const texKey = p[8];

    if (isLeg) {
      const pivotY = y + h / 2;
      const pivot = new THREE.Group();
      pivot.position.set(x, pivotY, z);
      const legMesh = makeBox(w, h, d, color, texKey);
      legMesh.position.set(0, -h / 2, 0);
      pivot.add(legMesh);
      group.add(pivot);
      legs.push({ pivot: pivot, dir: (i % 2 === 0) ? 1 : -1 });
    } else {
      const mesh = makeBox(w, h, d, color, texKey);
      mesh.position.set(x, y, z);
      group.add(mesh);
    }
  }

  return { group: group, legs: legs };
}

function createMob(type, x, y, z, yaw) {
  if (!MOB_TYPES[type]) type = 'pig';
  const def = MOB_TYPES[type];
  const built = buildMobMesh(type);
  const group = built.group;
  const startYaw = (typeof yaw === 'number') ? yaw : Math.random() * Math.PI * 2;
  group.position.set(x, y, z);
  group.rotation.y = startYaw;
  scene.add(group);

  const mob = {
    type: type,
    def: def,
    group: group,
    legs: built.legs,
    pos: new THREE.Vector3(x, y, z),
    vel: new THREE.Vector3(0, 0, 0),
    yaw: startYaw,
    targetYaw: startYaw,
    wanderTimer: 1 + Math.random() * 3,
    walking: false,
    walkPhase: 0,
    onGround: false,
    lastX: x,
    lastZ: z,
    stuckTimer: 0,
    avoidCooldown: 0,
    jumpCooldown: 0,
    soundTimer: 2 + Math.random() * 6,
    hp: def.hp,
    maxHp: def.hp,
    dead: false,
    hurtTimer: 0,
    panicTimer: 0,
    lookAtCooldown: 1 + Math.random() * 3
  };
  mobs.push(mob);
  return mob;
}

function mobCollides(px, py, pz, r, h) {
  if (px - r < 0 || px + r > SX) return true;
  if (pz - r < 0 || pz + r > SZ) return true;
  const e = 1e-4;
  const x0 = Math.floor(px - r + e), x1 = Math.floor(px + r - e);
  const y0 = Math.floor(py + e),     y1 = Math.floor(py + h - e);
  const z0 = Math.floor(pz - r + e), z1 = Math.floor(pz + r - e);
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++)
        if (isSolid(x, y, z)) return true;
  return false;
}

function canJumpOver(mob, axisX, axisZ) {
  const r = mob.def.r, h = mob.def.h;
  const look = 1.0;
  const nx = mob.pos.x + axisX * look;
  const nz = mob.pos.z + axisZ * look;

  if (!mobCollides(nx, mob.pos.y, nz, r, h)) return false;
  const upY = mob.pos.y + 1.0;
  if (mobCollides(nx, upY, nz, r, h)) return false;

  const groundY = Math.floor(upY - 0.01);
  const ix = Math.floor(nx), iz = Math.floor(nz);
  if (ix < 0 || ix >= SX || iz < 0 || iz >= SZ) return false;
  if (!isSolid(ix, groundY, iz)) return false;

  return true;
}

function tryJump(mob, axisX, axisZ) {
  if (mob.jumpCooldown > 0) return false;
  if (!mob.onGround) return false;
  if (!canJumpOver(mob, axisX, axisZ)) return false;
  mob.vel.y = JUMP_VELOCITY;
  mob.jumpCooldown = 0.4;
  return true;
}

function mobMove(mob, dx, dy, dz) {
  const r = mob.def.r, h = mob.def.h;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.2));
  const sx = dx / steps, sy = dy / steps, sz = dz / steps;

  for (let i = 0; i < steps; i++) {
    if (sx !== 0) {
      mob.pos.x += sx;
      if (mobCollides(mob.pos.x, mob.pos.y, mob.pos.z, r, h)) {
        mob.pos.x -= sx;
        if (tryJump(mob, Math.sign(sx), 0)) return;
        if (mob.onGround && mob.vel.y <= 0.01) reactToWall(mob);
      }
    }
    if (sz !== 0) {
      mob.pos.z += sz;
      if (mobCollides(mob.pos.x, mob.pos.y, mob.pos.z, r, h)) {
        mob.pos.z -= sz;
        if (tryJump(mob, 0, Math.sign(sz))) return;
        if (mob.onGround && mob.vel.y <= 0.01) reactToWall(mob);
      }
    }
    if (sy !== 0) {
      mob.pos.y += sy;
      if (mobCollides(mob.pos.x, mob.pos.y, mob.pos.z, r, h)) {
        mob.pos.y -= sy;
        if (sy < 0) mob.onGround = true;
        mob.vel.y = 0;
      }
    }
  }
}

function reactToWall(mob) {
  if (mob.avoidCooldown > 0) return;
  const back = mob.yaw + Math.PI;
  const turn = (Math.random() - 0.5) * Math.PI / 2;
  mob.targetYaw = back + turn;
  mob.wanderTimer = Math.max(mob.wanderTimer, 0.8 + Math.random() * 0.6);
  mob.walking = true;
  mob.avoidCooldown = 0.4;
}

function maybePlaySound(mob) {
  if (!playerPos) return;
  if (!window.SFX) return;
  if (mob.panicTimer > 0) return;

  const dx = mob.pos.x - playerPos.x;
  const dy = mob.pos.y - playerPos.y;
  const dz = mob.pos.z - playerPos.z;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 > SOUND_MIN_DIST2) return;

  const now = performance.now();
  if (now - lastMobSoundTime < 500) return;
  lastMobSoundTime = now;

  const snd = window.SFX[mob.type];
  if (typeof snd === 'function') snd();
}

function hitMob(mob, damage, fromX, fromZ) {
  if (!mob || mob.dead) return false;
  mob.hp -= damage;
  mob.hurtTimer = 0.3;
  mob.panicTimer = PANIC_DURATION;
  mob.walking = true;

  const dx = mob.pos.x - fromX;
  const dz = mob.pos.z - fromZ;
  const len = Math.hypot(dx, dz);
  if (len > 0.001) {
    mob.vel.x += (dx / len) * 5.0;
    mob.vel.z += (dz / len) * 5.0;
  }
  mob.vel.y = 4.5;
  mob.onGround = false;

  if (mob.hp <= 0) {
    mob.hp = 0;
    mob.dead = true;
    if (window.SFX && window.SFX.mobDeath) window.SFX.mobDeath(mob.type);
    return true;
  }
  if (window.SFX && window.SFX.mobHurt) window.SFX.mobHurt(mob.type);
  return false;
}

function raycastMob(origin, dir, maxDist) {
  let best = null;
  let bestT = maxDist;

  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (m.dead) continue;
    /* не даём целиться в мобов, скрытых за границей прорисовки */
    if (!m.group.visible) continue;
    const r = m.def.r, h = m.def.h;
    const minX = m.pos.x - r, maxX = m.pos.x + r;
    const minY = m.pos.y,     maxY = m.pos.y + h;
    const minZ = m.pos.z - r, maxZ = m.pos.z + r;

    let tmin = 0, tmax = bestT;

    if (Math.abs(dir.x) < 1e-8) {
      if (origin.x < minX || origin.x > maxX) continue;
    } else {
      let t1 = (minX - origin.x) / dir.x;
      let t2 = (maxX - origin.x) / dir.x;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }
    if (Math.abs(dir.y) < 1e-8) {
      if (origin.y < minY || origin.y > maxY) continue;
    } else {
      let t1 = (minY - origin.y) / dir.y;
      let t2 = (maxY - origin.y) / dir.y;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }
    if (Math.abs(dir.z) < 1e-8) {
      if (origin.z < minZ || origin.z > maxZ) continue;
    } else {
      let t1 = (minZ - origin.z) / dir.z;
      let t2 = (maxZ - origin.z) / dir.z;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }

    if (tmin >= 0 && tmin < bestT) {
      bestT = tmin;
      best = m;
    }
  }

  return best ? { mob: best, t: bestT } : null;
}

function isBlockOccupied(bx, by, bz) {
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (m.dead) continue;
    const r = m.def.r, h = m.def.h;
    const minX = m.pos.x - r, maxX = m.pos.x + r;
    const minY = m.pos.y,     maxY = m.pos.y + h;
    const minZ = m.pos.z - r, maxZ = m.pos.z + r;

    if (bx + 1 <= minX) continue;
    if (bx     >= maxX) continue;
    if (by + 1 <= minY) continue;
    if (by     >= maxY) continue;
    if (bz + 1 <= minZ) continue;
    if (bz     >= maxZ) continue;
    return true;
  }
  return false;
}

function unstickMob(mob) {
  const r = mob.def.r, h = mob.def.h;
  if (!mobCollides(mob.pos.x, mob.pos.y, mob.pos.z, r, h)) return;

  for (let k = 1; k <= 14; k++) {
    const ny = mob.pos.y + 0.3 * k;
    if (!mobCollides(mob.pos.x, ny, mob.pos.z, r, h)) {
      mob.pos.y = ny;
      mob.vel.y = 0;
      return;
    }
  }
  const ix = Math.floor(mob.pos.x), iz = Math.floor(mob.pos.z);
  if (ix >= 0 && ix < SX && iz >= 0 && iz < SZ) {
    mob.pos.y = highestAt(ix, iz) + 0.5;
    mob.vel.y = 0;
  }
}

/* --- Видимость моба: скрываем, если за пределами радиуса --- */
function updateMobVisibility(mob) {
  if (!playerPos) return;
  const dx = mob.pos.x - playerPos.x;
  const dz = mob.pos.z - playerPos.z;
  const limit = renderDistBlocks + VISIBILITY_MARGIN;
  const visible = (dx * dx + dz * dz) <= limit * limit;

  /* Если у моба сейчас hurtTimer мигает — не мешаем миганию:
     при visible=true флаг мигания уже обрабатывается в updateMob. */
  if (mob.hurtTimer > 0) {
    if (visible) {
      // мигание под контролем updateMob, не перебиваем
    } else {
      mob.group.visible = false;
    }
  } else {
    mob.group.visible = visible;
  }
}

function updateMob(mob, dt) {
  const def = mob.def;

  if (mob.dead) {
    mob.group.visible = false;
    return;
  }

  unstickMob(mob);

  if (mob.hurtTimer > 0) {
    mob.hurtTimer -= dt;
    mob.group.visible = (Math.floor(mob.hurtTimer * 30) % 2 === 0);
    if (mob.hurtTimer <= 0) mob.group.visible = true;
  }

  if (mob.avoidCooldown > 0) mob.avoidCooldown -= dt;
  if (mob.jumpCooldown > 0)  mob.jumpCooldown  -= dt;

  mob.soundTimer -= dt;
  if (mob.soundTimer <= 0) {
    mob.soundTimer = SOUND_INTERVAL_MIN + Math.random() * (SOUND_INTERVAL_MAX - SOUND_INTERVAL_MIN);
    maybePlaySound(mob);
  }

  if (mob.panicTimer > 0) {
    mob.panicTimer -= dt;
    if (playerPos) {
      const dx = mob.pos.x - playerPos.x;
      const dz = mob.pos.z - playerPos.z;
      mob.targetYaw = Math.atan2(-dx, -dz);
      mob.walking = true;
    }
  } else {
    mob.wanderTimer -= dt;
    if (mob.wanderTimer <= 0) {
      if (mob.walking && Math.random() < 0.45) {
        mob.walking = false;
        mob.wanderTimer = 1.5 + Math.random() * 3;
      } else {
        mob.walking = true;
        mob.targetYaw = Math.random() * Math.PI * 2;
        mob.wanderTimer = 2 + Math.random() * 3;
      }
    }

    if (!mob.walking && playerPos) {
      mob.lookAtCooldown -= dt;
      if (mob.lookAtCooldown <= 0) {
        mob.lookAtCooldown = 3 + Math.random() * 4;
        const dx = playerPos.x - mob.pos.x;
        const dz = playerPos.z - mob.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 36) {
          mob.targetYaw = Math.atan2(-dx, -dz);
        }
      }
    }
  }

  let dyaw = mob.targetYaw - mob.yaw;
  while (dyaw >  Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  mob.yaw += dyaw * Math.min(1, 5 * dt);

  const speedMult = mob.panicTimer > 0 ? PANIC_SPEED_MULT : 1.0;
  let vx = 0, vz = 0;
  if (mob.walking) {
    vx = -Math.sin(mob.yaw) * def.speed * speedMult;
    vz = -Math.cos(mob.yaw) * def.speed * speedMult;
  }

  mob.vel.y -= GRAVITY * dt;
  if (mob.vel.y < -30) mob.vel.y = -30;

  const prevVx = mob.vel.x, prevVz = mob.vel.z;
  mob.vel.x = prevVx * Math.max(0, 1 - 4 * dt);
  mob.vel.z = prevVz * Math.max(0, 1 - 4 * dt);
  const totalVx = vx + mob.vel.x;
  const totalVz = vz + mob.vel.z;

  mobMove(mob, totalVx * dt, mob.vel.y * dt, totalVz * dt);

  mob.onGround = mobCollides(mob.pos.x, mob.pos.y - 0.05, mob.pos.z, def.r, def.h);
  if (mob.onGround && mob.vel.y < 0) mob.vel.y = 0;

  if (mob.walking && mob.onGround && mob.panicTimer <= 0) {
    const movedSq = (mob.pos.x - mob.lastX) * (mob.pos.x - mob.lastX) +
                    (mob.pos.z - mob.lastZ) * (mob.pos.z - mob.lastZ);
    const expected = def.speed * dt * 0.1;
    if (movedSq < expected * expected) {
      mob.stuckTimer += dt;
    } else {
      mob.stuckTimer = 0;
    }
    if (mob.stuckTimer > 0.6) {
      const turn = (Math.random() < 0.5 ? 1 : -1) * (Math.PI * 0.5 + Math.random() * Math.PI * 0.5);
      mob.targetYaw = mob.yaw + turn;
      mob.wanderTimer = Math.max(mob.wanderTimer, 1.0 + Math.random() * 1.0);
      mob.stuckTimer = 0;
      mob.avoidCooldown = 0.3;
    }
  } else {
    mob.stuckTimer = 0;
  }
  mob.lastX = mob.pos.x;
  mob.lastZ = mob.pos.z;

  if (mob.walking && mob.onGround) {
    mob.walkPhase += dt * 8 * speedMult;
  } else {
    mob.walkPhase *= 0.85;
  }
  const swing = Math.sin(mob.walkPhase) * LEG_SWING;
  for (let i = 0; i < mob.legs.length; i++) {
    const leg = mob.legs[i];
    leg.pivot.rotation.x = swing * leg.dir;
  }

  mob.group.position.copy(mob.pos);
  mob.group.rotation.y = mob.yaw;

  /* --- видимость: скрываем, если игрок далеко --- */
  updateMobVisibility(mob);

  if (mob.pos.y < -10) {
    const ix = Math.floor(mob.pos.x), iz = Math.floor(mob.pos.z);
    if (ix >= 0 && ix < SX && iz >= 0 && iz < SZ) {
      mob.pos.y = highestAt(ix, iz) + 0.5;
    } else {
      mob.pos.y = 30;
    }
    mob.vel.set(0, 0, 0);
  }
}

function findGround(x, z) {
  for (let y = SY - 1; y >= 0; y--) {
    if (world[IDX(x, y, z)] !== 0) return y + 1;
  }
  return -1;
}

function spawnAt(type, x, y, z, yaw) {
  if (!scene) return null;
  return createMob(type, x, y, z, yaw);
}

function spawnInitial(count) {
  if (!scene) {
    console.warn('[mobs.js] init(scene) не был вызван — пропускаю спавн');
    return 0;
  }
  const types = ['pig', 'sheep', 'cow', 'chicken'];
  let spawned = 0;
  let attempts = 0;
  const maxAttempts = count * 40;

  while (spawned < count && attempts < maxAttempts) {
    attempts++;
    const x = 2 + Math.floor(Math.random() * (SX - 4));
    const z = 2 + Math.floor(Math.random() * (SZ - 4));
    const y = findGround(x, z);
    if (y < 1 || y >= SY - 1) continue;
    const top = world[IDX(x, y - 1, z)];
    if (top !== 1 && top !== 5 && top !== 11) continue;

    let ok = true;
    for (let dx = -1; dx <= 1 && ok; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const nx = x + dx, nz = z + dz;
        if (nx < 1 || nx >= SX - 1 || nz < 1 || nz >= SZ - 1) { ok = false; break; }
        if (world[IDX(nx, y, nz)] !== 0) { ok = false; break; }
      }
    }
    if (!ok) continue;

    const type = types[Math.floor(Math.random() * types.length)];
    createMob(type, x + 0.5, y, z + 0.5);
    spawned++;
  }
  console.log('[mobs.js] заспавнено мобов:', spawned, 'из', count);
  return spawned;
}

function clear() {
  for (let i = 0; i < mobs.length; i++) {
    scene.remove(mobs[i].group);
    mobs[i].group.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
    });
  }
  mobs.length = 0;
}

function serialize() {
  const out = [];
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (m.dead) continue;
    out.push({ t: m.type, x: m.pos.x, y: m.pos.y, z: m.pos.z, yaw: m.yaw, hp: m.hp });
  }
  return out;
}

function deserialize(arr) {
  clear();
  if (!arr || !arr.length) return;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i];
    if (!MOB_TYPES[d.t]) continue;
    const mob = createMob(d.t, d.x, d.y, d.z, d.yaw);
    if (typeof d.hp === 'number' && d.hp > 0) mob.hp = Math.min(mob.maxHp, d.hp);
  }
}

function rebuildTextures() {
  for (const key in MOB_TEXTURES) {
    const t = MOB_TEXTURES[key];
    if (t && t.needsUpdate !== undefined) t.needsUpdate = true;
  }
  MAT_CACHE.forEach(function (m) {
    if (m.map) m.map.needsUpdate = true;
    m.needsUpdate = true;
  });
}

function init(sc) {
  scene = sc;
}

function update(dt, pPos, renderDistanceBlocks) {
  if (pPos) playerPos = pPos;
  if (typeof renderDistanceBlocks === 'number' && renderDistanceBlocks > 0) {
    renderDistBlocks = renderDistanceBlocks;
  }
  for (let i = 0; i < mobs.length; i++) updateMob(mobs[i], dt);

  for (let i = mobs.length - 1; i >= 0; i--) {
    if (mobs[i].dead) {
      scene.remove(mobs[i].group);
      mobs[i].group.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
      });
      mobs.splice(i, 1);
    }
  }
}

function raycast(origin, dir, maxDist) {
  return raycastMob(origin, dir, maxDist);
}

function hit(mob, damage, fromX, fromZ) {
  return hitMob(mob, damage, fromX, fromZ);
}

return {
  init: init,
  update: update,
  spawnAt: spawnAt,
  spawnInitial: spawnInitial,
  clear: clear,
  serialize: serialize,
  deserialize: deserialize,
  count: function () { return mobs.length; },
  raycast: raycast,
  hit: hit,
  rebuildTextures: rebuildTextures,
  isBlockOccupied: isBlockOccupied
};

})();