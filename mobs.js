/* ============================================================
   mobs.js — мирные мобы (свинья, овца, корова, курица)
   Простые воксельные модели + AI блуждания + анимация ходьбы.

   Публичный объект: window.MOBS = {
     init(scene), update(dt, playerPos),
     spawnInitial(count), spawnAt(type, x, y, z),
     clear(), serialize(), deserialize(arr),
     count()
   }
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
    deserialize: noop, count: function () { return 0; }
  };
}

const MC = window.MC;
const SX = MC.SX, SZ = MC.SZ, SY = MC.SY;
const world = MC.world, IDX = MC.IDX;
const isSolid = MC.isSolid, highestAt = MC.highestAt;

let scene = null;
const mobs = [];

/* ---------- утилита: бокс с простым затенением граней ---------- */
function makeBox(w, h, d, color) {
  const base   = new THREE.Color(color);
  const top    = base.clone().multiplyScalar(1.15);
  const bottom = base.clone().multiplyScalar(0.55);
  const px     = base.clone().multiplyScalar(1.00);
  const nx     = base.clone().multiplyScalar(0.80);
  const pz     = base.clone().multiplyScalar(0.90);
  const nz     = base.clone().multiplyScalar(0.90);
  // порядок материалов BoxGeometry: +X, -X, +Y, -Y, +Z, -Z
  const mats = [
    new THREE.MeshBasicMaterial({ color: px, fog: true }),
    new THREE.MeshBasicMaterial({ color: nx, fog: true }),
    new THREE.MeshBasicMaterial({ color: top, fog: true }),
    new THREE.MeshBasicMaterial({ color: bottom, fog: true }),
    new THREE.MeshBasicMaterial({ color: pz, fog: true }),
    new THREE.MeshBasicMaterial({ color: nz, fog: true })
  ];
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
}

/* ============================================================
   ОПРЕДЕЛЕНИЯ МОБОВ
   parts: [w, h, d, color, x, y, z, isLeg]
   ============================================================ */
const MOB_TYPES = {

  // --- Свинья: розовое тело, пятачок, короткие ноги ---
  pig: {
    h: 0.95, r: 0.35, speed: 1.4,
    parts: [
      [0.9,  0.55, 0.5,  0xEE9999,  0,    0.55,  0,     false], // тело
      [0.45, 0.45, 0.4,  0xEE9999,  0,    0.75, -0.55,  false], // голова
      [0.22, 0.14, 0.08, 0xCC6677,  0,    0.66, -0.80,  false], // пятачок
      [0.07, 0.07, 0.04, 0x111111, -0.13, 0.86, -0.74,  false], // глаз
      [0.07, 0.07, 0.04, 0x111111,  0.13, 0.86, -0.74,  false],
      [0.15, 0.5,  0.15, 0xCC6677, -0.30, 0.25, -0.15,  true],  // лапы
      [0.15, 0.5,  0.15, 0xCC6677,  0.30, 0.25, -0.15,  true],
      [0.15, 0.5,  0.15, 0xCC6677, -0.30, 0.25,  0.15,  true],
      [0.15, 0.5,  0.15, 0xCC6677,  0.30, 0.25,  0.15,  true]
    ]
  },

  // --- Овца: белое тело, тёмная голова, тёмные ноги ---
  sheep: {
    h: 1.0, r: 0.35, speed: 1.2,
    parts: [
      [0.9,  0.7,  0.6,  0xEEEEEE,  0,    0.60,  0,     false],
      [0.4,  0.4,  0.4,  0x444444,  0,    0.80, -0.60,  false],
      [0.09, 0.09, 0.04, 0xFFFFFF, -0.10, 0.90, -0.78,  false],
      [0.09, 0.09, 0.04, 0xFFFFFF,  0.10, 0.90, -0.78,  false],
      [0.13, 0.5,  0.13, 0x333333, -0.30, 0.25, -0.20,  true],
      [0.13, 0.5,  0.13, 0x333333,  0.30, 0.25, -0.20,  true],
      [0.13, 0.5,  0.13, 0x333333, -0.30, 0.25,  0.20,  true],
      [0.13, 0.5,  0.13, 0x333333,  0.30, 0.25,  0.20,  true]
    ]
  },

  // --- Корова: коричневое тело, рожки ---
  cow: {
    h: 1.2, r: 0.42, speed: 1.2,
    parts: [
      [1.1,  0.7,  0.65, 0x664422,  0,    0.65,  0,     false],
      [0.5,  0.5,  0.5,  0x664422,  0,    0.85, -0.70,  false],
      [0.08, 0.08, 0.05, 0x000000, -0.15, 0.95, -0.93,  false],
      [0.08, 0.08, 0.05, 0x000000,  0.15, 0.95, -0.93,  false],
      [0.08, 0.16, 0.08, 0xF0F0D0, -0.20, 1.18, -0.70,  false], // рог
      [0.08, 0.16, 0.08, 0xF0F0D0,  0.20, 1.18, -0.70,  false], // рог
      [0.15, 0.55, 0.15, 0x442211, -0.35, 0.275, -0.20, true],
      [0.15, 0.55, 0.15, 0x442211,  0.35, 0.275, -0.20, true],
      [0.15, 0.55, 0.15, 0x442211, -0.35, 0.275,  0.20, true],
      [0.15, 0.55, 0.15, 0x442211,  0.35, 0.275,  0.20, true]
    ]
  },

  // --- Курица: маленькая, белая, клюв ---
  chicken: {
    h: 0.6, r: 0.20, speed: 2.0,
    parts: [
      [0.40, 0.40, 0.40, 0xFFFFFF,  0,    0.35,  0,     false],
      [0.28, 0.28, 0.28, 0xFFFFFF,  0,    0.62, -0.30,  false],
      [0.10, 0.08, 0.14, 0xE8A020,  0,    0.56, -0.48,  false], // клюв
      [0.06, 0.06, 0.04, 0x000000, -0.08, 0.68, -0.42,  false],
      [0.06, 0.06, 0.04, 0x000000,  0.08, 0.68, -0.42,  false],
      [0.10, 0.18, 0.10, 0xE8A020, -0.10, 0.09,  0.05,  true],
      [0.10, 0.18, 0.10, 0xE8A020,  0.10, 0.09,  0.05,  true]
    ]
  }

};

/* ============================================================
   СОЗДАНИЕ МОБА
   ============================================================ */
function buildMobMesh(type) {
  const def = MOB_TYPES[type];
  const group = new THREE.Group();
  const legs = [];
  for (let i = 0; i < def.parts.length; i++) {
    const p = def.parts[i];
    const mesh = makeBox(p[0], p[1], p[2], p[3]);
    mesh.position.set(p[4], p[5], p[6]);
    group.add(mesh);
    if (p[7]) legs.push({ mesh: mesh, baseY: p[5] });
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
    onGround: false
  };
  mobs.push(mob);
  return mob;
}

/* ============================================================
   ФИЗИКА И КОЛЛИЗИИ
   ============================================================ */
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

function mobMove(mob, dx, dy, dz) {
  const r = mob.def.r, h = mob.def.h;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.2));
  const sx = dx / steps, sy = dy / steps, sz = dz / steps;
  for (let i = 0; i < steps; i++) {
    if (sx !== 0) {
      mob.pos.x += sx;
      if (mobCollides(mob.pos.x, mob.pos.y, mob.pos.z, r, h)) {
        mob.pos.x -= sx;
        mob.targetYaw = Math.random() * Math.PI * 2;
        mob.wanderTimer = 1.2 + Math.random() * 1.5;
      }
    }
    if (sz !== 0) {
      mob.pos.z += sz;
      if (mobCollides(mob.pos.x, mob.pos.y, mob.pos.z, r, h)) {
        mob.pos.z -= sz;
        mob.targetYaw = Math.random() * Math.PI * 2;
        mob.wanderTimer = 1.2 + Math.random() * 1.5;
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

/* ============================================================
   AI + ОБНОВЛЕНИЕ
   ============================================================ */
function updateMob(mob, dt) {
  const def = mob.def;

  // --- таймер блуждания ---
  mob.wanderTimer -= dt;
  if (mob.wanderTimer <= 0) {
    if (mob.walking && Math.random() < 0.45) {
      // пауза
      mob.walking = false;
      mob.wanderTimer = 1.5 + Math.random() * 3;
    } else {
      // пойти в новом направлении
      mob.walking = true;
      mob.targetYaw = Math.random() * Math.PI * 2;
      mob.wanderTimer = 2 + Math.random() * 3;
    }
  }

  // --- плавный поворот ---
  let dyaw = mob.targetYaw - mob.yaw;
  while (dyaw >  Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  mob.yaw += dyaw * Math.min(1, 5 * dt);

  // --- горизонтальная скорость ---
  let vx = 0, vz = 0;
  if (mob.walking && mob.onGround) {
    vx = -Math.sin(mob.yaw) * def.speed;
    vz = -Math.cos(mob.yaw) * def.speed;
  }

  // --- гравитация ---
  mob.vel.y -= 28 * dt;
  if (mob.vel.y < -30) mob.vel.y = -30;

  // --- перемещение ---
  mobMove(mob, vx * dt, mob.vel.y * dt, vz * dt);

  // --- земля под ногами ---
  mob.onGround = mobCollides(mob.pos.x, mob.pos.y - 0.05, mob.pos.z, def.r, def.h);
  if (mob.onGround && mob.vel.y < 0) mob.vel.y = 0;

  // --- анимация ходьбы ---
  if (mob.walking && mob.onGround) {
    mob.walkPhase += dt * 8;
  } else {
    mob.walkPhase *= 0.9;
  }
  const swing = Math.sin(mob.walkPhase) * 0.06;
  for (let i = 0; i < mob.legs.length; i++) {
    const s = (i % 2 === 0) ? swing : -swing;
    mob.legs[i].mesh.position.y = mob.legs[i].baseY + s;
  }

  // --- трансформ ---
  mob.group.position.copy(mob.pos);
  mob.group.rotation.y = mob.yaw;

  // --- страховка от падения в бездну ---
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

/* ============================================================
   СПАВН
   ============================================================ */
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
    if (top !== 1 && top !== 5 && top !== 11) continue;   // трава / песок / снег

    const type = types[Math.floor(Math.random() * types.length)];
    createMob(type, x + 0.5, y, z + 0.5);
    spawned++;
  }
  console.log('[mobs.js] заспавнено мобов:', spawned, 'из', count);
  return spawned;
}

/* ============================================================
   ОЧИСТКА / СЕРИАЛИЗАЦИЯ
   ============================================================ */
function clear() {
  for (let i = 0; i < mobs.length; i++) {
    scene.remove(mobs[i].group);
    // три геометрии у каждой части — пройдёмся по детям
    mobs[i].group.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(function (m) { m.dispose(); });
        else o.material.dispose();
      }
    });
  }
  mobs.length = 0;
}

function serialize() {
  const out = [];
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    out.push({ t: m.type, x: m.pos.x, y: m.pos.y, z: m.pos.z, yaw: m.yaw });
  }
  return out;
}

function deserialize(arr) {
  clear();
  if (!arr || !arr.length) return;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i];
    if (!MOB_TYPES[d.t]) continue;
    createMob(d.t, d.x, d.y, d.z, d.yaw);
  }
}

/* ============================================================
   ПУБЛИЧНОЕ API
   ============================================================ */
function init(sc) {
  scene = sc;
}

function update(dt) {
  for (let i = 0; i < mobs.length; i++) updateMob(mobs[i], dt);
}

return {
  init: init,
  update: update,
  spawnAt: spawnAt,
  spawnInitial: spawnInitial,
  clear: clear,
  serialize: serialize,
  deserialize: deserialize,
  count: function () { return mobs.length; }
};

})();