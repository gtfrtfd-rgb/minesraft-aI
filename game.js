/* ============================================================
   game.js — рендерер, игрок, управление, интерфейс, сохранения
   + анимация ломания блоков
   + материальные звуки и шаги
   + невидимые барьеры по краям мира
   + бег (Shift / двойной W / двойная ↑) и полёт (F) с FOV
   ============================================================ */
(function () {
'use strict';

/* ---------- аварийный экран, если что-то не загрузилось ---------- */
function fatal(msg) {
  const el = document.getElementById('loading');
  if (el) {
    el.style.display = 'flex';
    el.innerHTML = '<div style="max-width:640px;padding:20px;text-align:center">' +
      '<div style="font-size:22px;margin-bottom:12px">Ошибка запуска</div>' +
      '<div style="font-size:14px;opacity:.8;line-height:1.5">' + msg + '</div>' +
      '<div style="font-size:13px;opacity:.6;margin-top:16px">Откройте F12 → Console для подробностей</div></div>';
  }
  console.error('[game.js] FATAL:', msg);
}

if (typeof THREE === 'undefined') {
  fatal('Библиотека three.js не загрузилась. Проверьте подключение к интернету — она грузится с cdnjs.cloudflare.com.');
  return;
}
if (!window.MC || !window.MC.generateWorld) {
  fatal('world.js не загрузился или упал. Проверьте, что файл лежит рядом с index.html и в консоли нет ошибок.');
  return;
}

const MC = window.MC;
const SX = MC.SX, SZ = MC.SZ, SY = MC.SY;
const CHX = MC.CHX, CHZ = MC.CHZ;
const world = MC.world, IDX = MC.IDX, SAVE_KEY = MC.SAVE_KEY;
const BLOCKS = MC.BLOCKS, ACOLS = MC.ACOLS;
const atlasCanvas = MC.atlasCanvas, chunkGroup = MC.chunkGroup;
const isSolid = MC.isSolid, highestAt = MC.highestAt;
const generateWorld = MC.generateWorld;
const buildChunk = MC.buildChunk, buildAllChunks = MC.buildAllChunks;
const rebuildAround = MC.rebuildAround, rebuildAll = MC.rebuildAll;

/* ---------- безопасная обёртка SFX ---------- */
const SFX = (function () {
  const s = window.SFX;
  if (s) {
    if (!s.flyOn)  s.flyOn  = function () {};
    if (!s.flyOff) s.flyOff = function () {};
    return s;
  }
  console.warn('[game.js] sounds.js не загрузился — работаем без звуков');
  const noop = function () {};
  return { resume: noop, break: noop, place: noop, step: noop, jump: noop, select: noop, flyOn: noop, flyOff: noop };
})();

/* ============================================================
   1. СЦЕНА, РЕНДЕРЕР, КАМЕРА
   ============================================================ */
const BASE_FOV = 75;
const SPRINT_FOV = 82;
const FLY_FOV    = 80;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 70, 150);
scene.add(chunkGroup);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 340);
camera.rotation.order = 'YXZ';

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const hlBox = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 })
);
hlBox.visible = false;
scene.add(hlBox);

/* ============================================================
   1.1. НЕВИДИМЫЕ БАРЬЕРЫ ПО КРАЯМ МИРА
   ============================================================ */
(function makeBorderWalls() {
  const H = 40;
  const mat = new THREE.MeshBasicMaterial({
    color: 0x7ec850,
    transparent: true,
    opacity: 0.10,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  const geoNS = new THREE.PlaneGeometry(SX, H);
  const geoEW = new THREE.PlaneGeometry(SZ, H);

  const w1 = new THREE.Mesh(geoNS, mat);
  w1.position.set(SX / 2, H / 2, 0);
  scene.add(w1);

  const w2 = new THREE.Mesh(geoNS, mat);
  w2.position.set(SX / 2, H / 2, SZ);
  scene.add(w2);

  const w3 = new THREE.Mesh(geoEW, mat);
  w3.rotation.y = Math.PI / 2;
  w3.position.set(0, H / 2, SZ / 2);
  scene.add(w3);

  const w4 = new THREE.Mesh(geoEW, mat);
  w4.rotation.y = Math.PI / 2;
  w4.position.set(SX, H / 2, SZ / 2);
  scene.add(w4);
})();

/* ============================================================
   1.2. ТРЕЩИНЫ (10 стадий)
   ============================================================ */
const CRACK_STAGES = 10;

const CRACK_MAP = (function () {
  const S = 16;
  const map = new Uint8Array(S * S);
  let seed = 987654;
  const rnd = function () { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  const arms = 6;
  for (let a = 0; a < arms; a++) {
    let angle = (a / arms) * Math.PI * 2 + (rnd() - 0.5) * 0.6;
    let x = 7.5 + (rnd() - 0.5) * 3;
    let y = 7.5 + (rnd() - 0.5) * 3;
    const len = 6 + rnd() * 8;
    for (let s = 0; s < len; s++) {
      angle += (rnd() - 0.5) * 0.75;
      x += Math.cos(angle);
      y += Math.sin(angle);
      const xi = Math.round(x) | 0;
      const yi = Math.round(y) | 0;
      if (xi < 0 || xi >= S || yi < 0 || yi >= S) break;
      const stage = Math.min(CRACK_STAGES, Math.max(1, Math.round((s / len) * CRACK_STAGES)));
      const idx = yi * S + xi;
      if (map[idx] === 0 || map[idx] > stage) map[idx] = stage;
    }
  }
  for (let i = 0; i < 30; i++) {
    const xi = (rnd() * S) | 0;
    const yi = (rnd() * S) | 0;
    const idx = yi * S + xi;
    if (map[idx] === 0) map[idx] = 5 + ((rnd() * (CRACK_STAGES - 5 + 1)) | 0);
  }
  return map;
})();

function makeCrackTexture(stage) {
  const S = 16;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = CRACK_MAP[y * S + x];
      if (v === 0 || v > stage) continue;
      const o = (y * S + x) * 4;
      d[o] = 0; d[o+1] = 0; d[o+2] = 0;
      d[o+3] = Math.min(255, 110 + (stage - v) * 32);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

const crackTextures = [];
for (let s = 1; s <= CRACK_STAGES; s++) crackTextures.push(makeCrackTexture(s));

const crackMat = new THREE.MeshBasicMaterial({
  map: crackTextures[0],
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1
});
const crackMesh = new THREE.Mesh(new THREE.BoxGeometry(1.01, 1.01, 1.01), crackMat);
crackMesh.visible = false;
crackMesh.renderOrder = 2;
scene.add(crackMesh);

const HARDNESS = {
  1: 0.55, 2: 0.45, 3: 1.30, 4: 1.10, 5: 0.45,
  6: 0.85, 7: 0.20, 8: 0.85, 9: 1.20,
  10: 0.28, 11: 0.35, 12: 3.50
};

/* ============================================================
   2. ИГРОК
   ============================================================ */
const PR = 0.3, PH = 1.8, EYE = 1.62;
const GRAVITY = 28, JUMP = 9;

const player = {
  pos: new THREE.Vector3(SX / 2 + 0.5, 30, SZ / 2 + 0.5),
  vel: new THREE.Vector3(),
  onGround: false,
  fly: false
};
let yaw = 0, pitch = 0;

function collides(px, py, pz) {
  if (px - PR < 0)  return true;
  if (px + PR > SX) return true;
  if (pz - PR < 0)  return true;
  if (pz + PR > SZ) return true;

  const e = 1e-4;
  const x0 = Math.floor(px - PR + e), x1 = Math.floor(px + PR - e);
  const y0 = Math.floor(py + e),      y1 = Math.floor(py + PH - e);
  const z0 = Math.floor(pz - PR + e), z1 = Math.floor(pz + PR - e);
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++)
        if (isSolid(x, y, z)) return true;
  return false;
}

function tryMove(dx, dy, dz) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.2));
  const sx = dx / steps, sy = dy / steps, sz = dz / steps;
  for (let i = 0; i < steps; i++) {
    if (sx !== 0) {
      player.pos.x += sx;
      if (collides(player.pos.x, player.pos.y, player.pos.z)) {
        player.pos.x -= sx; player.vel.x = 0;
      }
    }
    if (sz !== 0) {
      player.pos.z += sz;
      if (collides(player.pos.x, player.pos.y, player.pos.z)) {
        player.pos.z -= sz; player.vel.z = 0;
      }
    }
    if (sy !== 0) {
      player.pos.y += sy;
      if (collides(player.pos.x, player.pos.y, player.pos.z)) {
        player.pos.y -= sy;
        if (sy < 0) player.onGround = true;
        player.vel.y = 0;
      }
    }
  }
}

function respawn() {
  const cx = Math.floor(SX / 2), cz = Math.floor(SZ / 2);
  player.pos.set(cx + 0.5, highestAt(cx, cz) + 0.1, cz + 0.5);
  player.vel.set(0, 0, 0);
}

/* ============================================================
   3. УПРАВЛЕНИЕ
   ============================================================ */
const keys = Object.create(null);
let locked = false;

// --- спринт-лок по двойному тапу ---
// Работает и для W, и для стрелки ↑. Каждое направление трекается отдельно,
// чтобы быстрая смена клавиш не путала логику.
const DOUBLE_TAP_MS = 280;
const lastTap = { KeyW: 0, ArrowUp: 0 };
const doubleLock = { KeyW: false, ArrowUp: false };

function sprintLockActive() {
  return doubleLock.KeyW || doubleLock.ArrowUp;
}

function resetSprintLock() {
  doubleLock.KeyW = false;
  doubleLock.ArrowUp = false;
}

function toggleFly() {
  player.fly = !player.fly;
  player.vel.y = 0;
  if (player.fly) {
    SFX.flyOn();
    showHint('Полёт: ВКЛ');
  } else {
    SFX.flyOff();
    showHint('Полёт: ВЫКЛ');
  }
}

const menu = document.getElementById('menu');
const startBtn = document.getElementById('startBtn');

function lockPointer() {
  SFX.resume();
  renderer.domElement.requestPointerLock();
}

startBtn.addEventListener('click', lockPointer);
renderer.domElement.addEventListener('click', function () { if (!locked) lockPointer(); });

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  menu.style.display = locked ? 'none' : 'flex';
  if (!locked) {
    for (const k in keys) keys[k] = false;
    stopBreaking();
    resetSprintLock();
  }
});

document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  yaw   -= e.movementX * 0.0022;
  pitch -= e.movementY * 0.0022;
  const lim = Math.PI / 2 - 0.001;
  if (pitch >  lim) pitch =  lim;
  if (pitch < -lim) pitch = -lim;
});

document.addEventListener('keydown', (e) => {
  // F — переключение полёта
  if (e.code === 'KeyF' && !e.repeat) {
    toggleFly();
  }

  // двойной тап W или стрелки ↑ — спринт-лок
  if ((e.code === 'KeyW' || e.code === 'ArrowUp') && !e.repeat) {
    const now = performance.now();
    if (now - lastTap[e.code] < DOUBLE_TAP_MS) {
      doubleLock[e.code] = true;
      showHint('Бег: ВКЛ');
    }
    lastTap[e.code] = now;
  }

  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.code.indexOf('Arrow') === 0) e.preventDefault();
  if (e.code.indexOf('Digit') === 0) {
    const n = parseInt(e.code.slice(5), 10);
    if (n >= 1 && n <= 9) selectSlot(n - 1);
  }
});
document.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  // отпустили клавишу — её спринт-лок снимается
  if (e.code === 'KeyW')     doubleLock.KeyW = false;
  if (e.code === 'ArrowUp')  doubleLock.ArrowUp = false;
});

document.addEventListener('contextmenu', e => e.preventDefault());

let mouseDown = [false, false, false];
renderer.domElement.addEventListener('mousedown', (e) => {
  if (!locked) return;
  mouseDown[e.button] = true;
  if (e.button === 0) {
    breaking.active = false;
    breaking.progress = 0;
    breaking.stage = 0;
  }
  if (e.button === 2) placeBlock();
});
renderer.domElement.addEventListener('mouseup', (e) => {
  mouseDown[e.button] = false;
  if (e.button === 0) stopBreaking();
});

document.addEventListener('wheel', (e) => {
  if (!locked) return;
  const d = e.deltaY > 0 ? 1 : -1;
  selectSlot((selected + d + HOTBAR.length) % HOTBAR.length);
}, { passive: true });

/* ============================================================
   4. РЕЙКАСТ И ВЗАИМОДЕЙСТВИЕ
   ============================================================ */
const _dir = new THREE.Vector3();

function raycastBlock() {
  _dir.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const ox = camera.position.x, oy = camera.position.y, oz = camera.position.z;
  let prev = null;
  for (let t = 0; t < 6; t += 0.02) {
    const px = ox + _dir.x * t, py = oy + _dir.y * t, pz = oz + _dir.z * t;
    const bx = Math.floor(px), by = Math.floor(py), bz = Math.floor(pz);
    if (isSolid(bx, by, bz)) return { x: bx, y: by, z: bz, prev };
    prev = { x: bx, y: by, z: bz };
  }
  return null;
}

let currentTarget = null;

const breaking = {
  active: false,
  target: null,
  progress: 0,
  stage: 0
};

function stopBreaking() {
  breaking.active = false;
  breaking.progress = 0;
  breaking.stage = 0;
  breaking.target = null;
  crackMesh.visible = false;
}

function updateBreaking(dt) {
  if (!locked || !mouseDown[0] || !currentTarget) {
    if (breaking.active) stopBreaking();
    else crackMesh.visible = false;
    return;
  }
  const t = currentTarget;
  if (t.y <= 0) { stopBreaking(); return; }

  if (!breaking.active || !breaking.target ||
      breaking.target.x !== t.x ||
      breaking.target.y !== t.y ||
      breaking.target.z !== t.z) {
    breaking.active = true;
    breaking.target = { x: t.x, y: t.y, z: t.z };
    breaking.progress = 0;
    breaking.stage = 0;
    crackMat.map = crackTextures[0];
  }

  const id = world[IDX(t.x, t.y, t.z)];
  const hardness = HARDNESS[id] || 1.0;
  breaking.progress += dt / hardness;

  const stage = Math.min(CRACK_STAGES, Math.floor(breaking.progress * CRACK_STAGES) + 1);
  if (stage !== breaking.stage) {
    breaking.stage = stage;
    crackMat.map = crackTextures[stage - 1];
  }

  crackMesh.visible = true;
  crackMesh.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);

  if (breaking.progress >= 1) {
    world[IDX(t.x, t.y, t.z)] = 0;
    rebuildAround(t.x, t.z);
    markDirty();
    SFX.break(id);
    stopBreaking();
  }
}

function placeBlock() {
  if (!currentTarget || !currentTarget.prev) return;
  const p = currentTarget.prev;
  if (p.x < 0 || p.x >= SX || p.y < 0 || p.y >= SY || p.z < 0 || p.z >= SZ) return;
  if (world[IDX(p.x, p.y, p.z)] !== 0) return;

  const px0 = player.pos.x - PR, px1 = player.pos.x + PR;
  const py0 = player.pos.y,      py1 = player.pos.y + PH;
  const pz0 = player.pos.z - PR, pz1 = player.pos.z + PR;
  if (p.x + 1 > px0 && p.x < px1 && p.y + 1 > py0 && p.y < py1 && p.z + 1 > pz0 && p.z < pz1) return;

  const id = HOTBAR[selected];
  world[IDX(p.x, p.y, p.z)] = id;
  rebuildAround(p.x, p.z);
  markDirty();
  SFX.place(id);
}

/* ============================================================
   5. ИНТЕРФЕЙС: ХОТБАР
   ============================================================ */
const HOTBAR = [1, 2, 3, 4, 8, 9, 6, 7, 10];
let selected = 0;
const hotbarEl = document.getElementById('hotbar');
const slotEls = [];
const atlasURL = atlasCanvas.toDataURL();

HOTBAR.forEach((id, i) => {
  const el = document.createElement('div');
  el.className = 'slot';
  const t = BLOCKS[id].side;
  const col = t % ACOLS, row = (t / ACOLS) | 0;
  el.style.backgroundImage = 'url(' + atlasURL + ')';
  el.style.backgroundPosition = (col * 100 / 3) + '% ' + (row * 100 / 3) + '%';
  el.innerHTML = '<span class="num">' + (i + 1) + '</span>';
  el.title = BLOCKS[id].name;
  el.addEventListener('click', function () { selectSlot(i); });
  hotbarEl.appendChild(el);
  slotEls.push(el);
});

function selectSlot(i) {
  if (i === selected && slotEls[i].classList.contains('active')) return;
  selected = i;
  slotEls.forEach(function (el, k) { el.classList.toggle('active', k === i); });
  SFX.select();
}
selectSlot(0);

const hintEl = document.getElementById('hint');
let hintTimer = null;
function showHint(text) {
  hintEl.textContent = text;
  hintEl.style.opacity = '1';
  clearTimeout(hintTimer);
  hintTimer = setTimeout(function () { hintEl.style.opacity = '0'; }, 1200);
}

const infoEl = document.getElementById('info');

/* ============================================================
   6. СОХРАНЕНИЕ
   ============================================================ */
function u8ToB64(u8) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH)
    s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}
function b64ToU8(str) {
  const s = atob(str);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

let dirty = false;
function markDirty() { dirty = true; }

let worldSeed = 1337;

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1,
      seed: worldSeed,
      w: u8ToB64(world),
      px: player.pos.x, py: player.pos.y, pz: player.pos.z,
      yaw: yaw, pitch: pitch, fly: player.fly
    }));
    dirty = false;
  } catch (e) { console.warn('Не удалось сохранить:', e); }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    const arr = b64ToU8(d.w);
    if (arr.length !== world.length) return false;
    world.set(arr);
    worldSeed = d.seed || worldSeed;
    player.pos.set(d.px, d.py, d.pz);
    player.vel.set(0, 0, 0);
    yaw = d.yaw || 0; pitch = d.pitch || 0;
    player.fly = !!d.fly;
    return true;
  } catch (e) { console.warn('Не удалось загрузить:', e); return false; }
}

function newWorld() {
  worldSeed = (Math.random() * 1e9) | 0;
  generateWorld(worldSeed);
  rebuildAll();
  respawn();
  yaw = 0; pitch = 0;
  saveGame();
  showHint('Создан новый мир');
}

document.getElementById('newBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  newWorld();
  lockPointer();
});

window.addEventListener('beforeunload', function () { if (dirty) saveGame(); });

/* ============================================================
   7. ИНИЦИАЛИЗАЦИЯ
   ============================================================ */
const loadingEl = document.getElementById('loading');
const loadingTextEl = loadingEl ? loadingEl.querySelector('div') : null;

function setLoadingText(t) {
  if (loadingTextEl) loadingTextEl.textContent = t;
}

function showLoading(on) {
  if (loadingEl) loadingEl.style.display = on ? 'flex' : 'none';
}

function buildChunksAsync(onProgress, onDone) {
  const total = CHX * CHZ;
  let cx = 0, cz = 0, built = 0;

  function step() {
    const t0 = performance.now();
    while (cz < CHZ && (performance.now() - t0) < 12) {
      buildChunk(cx, cz);
      built++;
      cx++;
      if (cx >= CHX) { cx = 0; cz++; }
    }
    onProgress(built, total);
    if (cz >= CHZ) { onDone(); return; }
    requestAnimationFrame(step);
  }
  step();
}

(function init() {
  showLoading(true);
  setLoadingText('Загрузка сохранения…');

  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      try {
        const loaded = loadGame();
        if (!loaded) {
          setLoadingText('Генерация мира…');
          generateWorld(worldSeed);
        }
        if (!loaded) respawn();
        if (player.pos.y < 0 || player.pos.y > SY) respawn();

        if (loaded) {
          const cx = Math.floor(player.pos.x), cz = Math.floor(player.pos.z);
          if (cx >= 0 && cx < SX && cz >= 0 && cz < SZ) {
            const top = highestAt(cx, cz);
            if (player.pos.y < top) player.pos.y = top + 0.1;
          }
        }

        setLoadingText('Построение мешей… 0%');

        buildChunksAsync(
          function (built, total) {
            setLoadingText('Построение мешей… ' + Math.round(built / total * 100) + '%');
          },
          function () {
            showLoading(false);
            console.log('[game.js] init OK. Игрок:', player.pos.toArray());
          }
        );
      } catch (e) {
        fatal('Ошибка при инициализации: ' + (e && e.message ? e.message : e));
      }
    });
  });
})();

/* ============================================================
   8. ГЛАВНЫЙ ЦИКЛ
   ============================================================ */
const _fwd = new THREE.Vector3();
const _rgt = new THREE.Vector3();
const _wish = new THREE.Vector3();

let lastT = performance.now();
let saveTimer = 0;
let fpsAcc = 0, fpsCount = 0, fpsVal = 60;

const STEP_DIST_WALK   = 1.6;
const STEP_DIST_SPRINT = 1.25;
let stepAcc = 0;

let sprintActive = false;

function update(dt) {
  _fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  _rgt.set( Math.cos(yaw), 0, -Math.sin(yaw));
  _wish.set(0, 0, 0);
  if (locked) {
    if (keys['KeyW']) _wish.add(_fwd);
    if (keys['KeyS']) _wish.sub(_fwd);
    if (keys['KeyD']) _wish.add(_rgt);
    if (keys['KeyA']) _wish.sub(_rgt);
    if (keys['ArrowUp'])    _wish.add(_fwd);
    if (keys['ArrowDown'])  _wish.sub(_fwd);
    if (keys['ArrowRight']) _wish.add(_rgt);
    if (keys['ArrowLeft'])  _wish.sub(_rgt);
  }
  const moving = _wish.lengthSq() > 0;
  if (moving) _wish.normalize();

  // «вперёд» считается активным, если зажат W ИЛИ стрелка ↑.
  // Спринт-лок работает, если зажата соответствующая клавиша и её лок установлен.
  const forwardHeld = keys['KeyW'] || keys['ArrowUp'];
  const forwardLock = (keys['KeyW'] && doubleLock.KeyW) || (keys['ArrowUp'] && doubleLock.ArrowUp);

  const shift = !!keys['ShiftLeft'];
  const ctrl  = !!keys['ControlLeft'];

  let fovTarget = BASE_FOV;
  sprintActive = false;

  if (player.fly) {
    const sp = ctrl ? 26 : 12;
    player.vel.x = _wish.x * sp;
    player.vel.z = _wish.z * sp;
    let vy = 0;
    if (keys['Space']) vy += sp;
    if (shift)         vy -= sp;
    player.vel.y = vy;
    player.onGround = false;
    stepAcc = 0;
    fovTarget = ctrl ? FLY_FOV + 8 : FLY_FOV;
  } else {
    sprintActive = shift || ctrl || (forwardLock && forwardHeld && moving);
    const sp = sprintActive ? 7.4 : 4.6;
    const tx = _wish.x * sp, tz = _wish.z * sp;
    const k = player.onGround ? 14 : 3.2;
    const a = Math.min(1, k * dt);
    player.vel.x += (tx - player.vel.x) * a;
    player.vel.z += (tz - player.vel.z) * a;

    player.vel.y -= GRAVITY * dt;
    if (player.vel.y < -55) player.vel.y = -55;

    if (locked && keys['Space'] && player.onGround) {
      player.vel.y = JUMP;
      player.onGround = false;
      SFX.jump();
    }
    player.onGround = false;

    if (sprintActive && moving && player.onGround) fovTarget = SPRINT_FOV;
  }

  tryMove(player.vel.x * dt, player.vel.y * dt, player.vel.z * dt);

  if (!player.fly) {
    player.onGround = collides(player.pos.x, player.pos.y - 0.03, player.pos.z);
    if (player.onGround && player.vel.y < 0) player.vel.y = 0;
  }

  /* ---- ШАГИ ---- */
  if (!player.fly && player.onGround) {
    const spd = Math.hypot(player.vel.x, player.vel.z);
    if (spd > 0.4) {
      stepAcc += spd * dt;
      const need = sprintActive ? STEP_DIST_SPRINT : STEP_DIST_WALK;
      if (stepAcc >= need) {
        const fx = Math.floor(player.pos.x);
        const fz = Math.floor(player.pos.z);
        const fy = Math.floor(player.pos.y - 0.1);
        let underId = 0;
        if (fx >= 0 && fx < SX && fz >= 0 && fz < SZ && fy >= 0 && fy < SY) {
          underId = world[IDX(fx, fy, fz)];
        }
        SFX.step(underId, sprintActive);
        stepAcc = 0;
      }
    } else {
      stepAcc = 0;
    }
  } else {
    stepAcc = 0;
  }

  if (player.pos.y < -30) respawn();

  /* ---- ПЛАВНОЕ ИЗМЕНЕНИЕ FOV ---- */
  const newFov = camera.fov + (fovTarget - camera.fov) * Math.min(1, 8 * dt);
  if (Math.abs(newFov - camera.fov) > 0.01) {
    camera.fov = newFov;
    camera.updateProjectionMatrix();
  }

  camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;

  currentTarget = locked ? raycastBlock() : null;
  if (currentTarget) {
    hlBox.visible = true;
    hlBox.position.set(currentTarget.x + 0.5, currentTarget.y + 0.5, currentTarget.z + 0.5);
  } else {
    hlBox.visible = false;
  }
  updateBreaking(dt);

  saveTimer += dt;
  if (saveTimer > 12) {
    saveTimer = 0;
    if (dirty) saveGame();
  }
}

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;

  fpsAcc += dt; fpsCount++;
  if (fpsAcc > 0.5) {
    fpsVal = Math.round(fpsCount / fpsAcc);
    fpsAcc = 0; fpsCount = 0;
  }

  try {
    update(dt);
  } catch (e) {
    console.error('update error', e);
  }

  let status = '';
  if (player.fly) status = '  ✈ ПОЛЁТ';
  else if (sprintActive) status = '  🏃 БЕГ';

  infoEl.textContent =
    'XYZ: ' + player.pos.x.toFixed(1) + ' / ' + player.pos.y.toFixed(1) + ' / ' + player.pos.z.toFixed(1) + '\n' +
    'FPS: ' + fpsVal + status;

  renderer.render(scene, camera);
}

requestAnimationFrame(loop);

console.log('[game.js] скрипт загружен, размер мира', SX + '×' + SZ + '×' + SY);

})();