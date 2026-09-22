/* ============================================================
   mobs.js — мирные мобы (свинья, овца, корова, курица)
   Простые воксельные модели + AI блуждания + анимация ходьбы.

   AI:
     - прыжок через блок высотой 1 при столкновении (как в Minecraft)
     - после прыжка вертикальное движение в ЭТОМ кадре пропускается,
       чтобы не сбросить только что установленную скорость
     - горизонтальная скорость сохраняется в прыжке
     - детектор застревания

   Публичный объект: window.MOBS = {
     init(scene), update(dt),
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

const GRAVITY = 28;
const JUMP_VELOCITY = 8.6;

/* ---------- утилита: бокс с простым затенением граней ---------- */
function makeBox(w, h, d, color) {
  const base   = new THREE.Color(color);
  const top    = base.clone().multiplyScalar(1.15);
  const bottom = base.clone().multiplyScalar(0.55);
  const px     = base.clone().multiplyScalar(1.00);
  const nx     = base.clone().multiplyScalar(0.80);
  const pz     = base.clone().multiplyScalar(0.90);
  const nz     = base.clone().multiplyScalar(0.90);
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
   ============================================================ */
const MOB_TYPES = {

  pig: {
    h: 0.95, r: 0.35, speed: 1.4,
    parts: [
      [0.9,  0.55, 0.5,  0xEE9999,  0,    0.55,  0,     false],
      [0.45, 0.45, 0.4,  0xEE9999,  0,    0.75, -0.55,  false],
      [0.22, 0.14, 0.08, 0xCC6677,  0,    0.66, -0.80,  false],
      [0.07, 0.07, 0.04, 0x111111, -0.13, 0.86, -0.74,  false],
      [0.07, 0.07, 0.04, 0x111111,  0.13, 0.86, -0.74,  false],
      [0.15, 0.5,  0.15, 0xCC6677, -0.30, 0.25, -0.15,  true],
      [0.15, 0.5,  0.15, 0xCC6677,  0.30, 0.25, -0.15,  true],
      [0.15, 0.5,  0.15, 0xCC6677, -0.30, 0.25,  0.15,  true],
      [0.15, 0.5,  0.15, 0xCC6677,  0.30, 0.25,  0.15,  true]
    ]
  },

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

  cow: {
    h: 1.2, r: 0.42, speed: 1.2,
    parts: [
      [1.1,  0.7,  0.65, 0x664422,  0,    0.65,  0,     false],
      [0.5,  0.5,  0.5,  0x664422,  0,    0.85, -0.70,  false],
      [0.08, 0.08, 0.05, 0x000000, -0.15, 0.95, -0.93,  false],
      [0.08, 0.08, 0.05, 0x000000,  0.15, 0.95, -0.93,  false],
      [0.08, 0.16, 0.08, 0xF0F0D0, -0.20, 1.18, -0.70,  false],
      [0.08, 0.16, 0.08, 0xF0F0D0,  0.20, 1.18, -0.70,  false],
      [0.15, 0.55, 0.15, 0x442211, -0.35, 0.275, -0.20, true],
      [0.15, 0.55, 0.15, 0x442211,  0.35, 0.275, -0.20, true],
      [0.15, 0.55, 0.15, 0x442211, -0.35, 0.275,  0.20, true],
      [0.15, 0.55, 0.15, 0x442211,  0.35, 0.275,  0.20, true]
    ]
  },

  chicken: {
    h: 0.6, r: 0.20, speed: 2.0,
    parts: [
      [0.40, 0.40, 0.40, 0xFFFFFF,  0,    0.35,  0,     false],
      [0.28, 0.28, 0.28, 0xFFFFFF,  0,    0.62, -0.30,  false],
      [0.10, 0.08, 0.14, 0xE8A020,  0,    0.56, -0.48,  false],
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
    onGround: false,
    lastX: x,
    lastZ: z,
    stuckTimer: 0,
    avoidCooldown: 0,
    jumpCooldown: 0
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

/* Может ли моб перепрыгнуть препятствие в направлении (axisX, axisZ)?
   axisX/axisZ — знак направления (±1 или 0). Смотрим РОВНО на 1 блок вперёд. */
function canJumpOver(mob, axisX, axisZ) {
  const r = mob.def.r, h = mob.def.h;
  const look = 1.0;
  const nx = mob.pos.x + axisX * look;
  const nz = mob.pos.z + axisZ * look;

  // 1) на текущем уровне — должно блокировать
  if (!mobCollides(nx, mob.pos.y, nz, r, h)) return false;

  // 2) приподнявшись на 1 блок — должно быть свободно
  const upY = mob.pos.y + 1.0;
  if (mobCollides(nx, upY, nz, r, h)) return false;

  // 3) под подъёмом должна быть опора
  const groundY = Math.floor(upY - 0.01);
  const ix = Math.floor(nx), iz = Math.floor(nz);
  if (ix < 0 || ix >= SX || iz < 0 || iz >= SZ) return false;
  if (!isSolid(ix, groundY, iz)) return false;

  return true;
}

/* Прыжок: возвращает true, если прыгнули. */
function tryJump(mob, axisX, axisZ) {
  if (mob.jumpCooldown > 0) return false;
  if (!mob.onGround) return false;
  if (!canJumpOver(mob, axisX, axisZ)) return false;
  mob.vel.y = JUMP_VELOCITY;
  mob.jumpCooldown = 0.4;
  return true;
}

/* Ключевое изменение: если прыжок удался — ВЫХОДИМ из mobMove,
   не применяя вертикальный шаг этого кадра (иначе он обнулит vel.y). */
function mobMove(mob, dx, dy, dz) {
  const r = mob.def.r, h = mob.def.h;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.2));
  const sx = dx / steps, sy = dy / steps, sz = dz / steps;

  for (let i = 0; i < steps; i++) {
    if (sx !== 0) {
      mob.pos.x += sx;
      if (mobCollides(mob.pos.x, mob.pos.y, mob.pos.z, r, h)) {
        mob.pos.x -= sx;
        if (tryJump(mob, Math.sign(sx), 0)) return;   // прыгнули — пропускаем вертикальный шаг
        if (mob.onGround && mob.vel.y <= 0.01) reactToWall(mob);
      }
    }
    if (sz !== 0) {
      mob.pos.z += sz;
      if (mobCollides(mob.pos.x, mob.pos.y, mob.pos.z, r, h)) {
        mob.pos.z -= sz;
        if (tryJump(mob, 0, Math.sign(sz))) return;   // аналогично
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

/* Отойти от стены, когда прыжок невозможен (стена 2+) */
function reactToWall(mob) {
  if (mob.avoidCooldown > 0) return;
  const back = mob.yaw + Math.PI;
  const turn = (Math.random() - 0.5) * Math.PI / 2;
  mob.targetYaw = back + turn;
  mob.wanderTimer = Math.max(mob.wanderTimer, 0.8 + Math.random() * 0.6);
  mob.walking = true;
  mob.avoidCooldown = 0.4;
}

/* ============================================================
   AI + ОБНОВЛЕНИЕ
   ============================================================ */
function updateMob(mob, dt) {
  const def = mob.def;

  if (mob.avoidCooldown > 0) mob.avoidCooldown -= dt;
  if (mob.jumpCooldown > 0)  mob.jumpCooldown  -= dt;

  // --- таймер блуждания ---
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

  // --- плавный поворот ---
  let dyaw = mob.targetYaw - mob.yaw;
  while (dyaw >  Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  mob.yaw += dyaw * Math.min(1, 5 * dt);

  // --- горизонтальная скорость: сохраняется и в прыжке ---
  let vx = 0, vz = 0;
  if (mob.walking) {
    vx = -Math.sin(mob.yaw) * def.speed;
    vz = -Math.cos(mob.yaw) * def.speed;
  }

  // --- гравитация ---
  mob.vel.y -= GRAVITY * dt;
  if (mob.vel.y < -30) mob.vel.y = -30;

  // --- перемещение ---
  mobMove(mob, vx * dt, mob.vel.y * dt, vz * dt);

  // --- земля под ногами ---
  mob.onGround = mobCollides(mob.pos.x, mob.pos.y - 0.05, mob.pos.z, def.r, def.h);
  if (mob.onGround && mob.vel.y < 0) mob.vel.y = 0;

  /* ---------- ДЕТЕКТОР ЗАСТРЕВАНИЯ ---------- */
  if (mob.walking && mob.onGround) {
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

/* ============================================================
   ОЧИСТКА / СЕРИАЛИЗАЦИЯ
   ============================================================ */
function clear() {
  for (let i = 0; i < mobs.length; i++) {
    scene.remove(mobs[i].group);
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