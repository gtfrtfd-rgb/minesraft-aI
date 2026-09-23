/* ============================================================
   game.js — рендерер, игрок, управление, интерфейс, сохранения
   + анимация ломания блоков
   + материальные звуки и шаги
   + невидимые барьеры по краям мира
   + бег (Shift / двойной W / двойная ↑) и полёт (F) с FOV
   + мирные мобы (MOBS) со своими текстурами и звуками
   + здоровье игрока (HP, урон от падения, регенерация, смерть)
   + 11 слотов хотбара: 1–9, 0, − (снег)
   + ЛКМ: удар по мобу (урон, отбрасывание, паника)
   + облака на небе: 26 разных облаков с 8 текстурами
   + биомы и увеличенный мир (256×256×48)
   + МОБИЛЬНАЯ ПОДДЕРЖКА
   + НАСТРОЙКИ: громкость, полный экран, перетаскивание панели
   ============================================================ */
(function () {
'use strict';

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

const GAME_VERSION = 'V2.1.1.TEST';

const isMobile = ('ontouchstart' in window) ||
                 (navigator.maxTouchPoints > 0) ||
                 (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
if (isMobile) document.body.classList.add('mobile');

const SFX = (function () {
  const s = window.SFX;
  if (s) {
    if (!s.flyOn)  s.flyOn  = function () {};
    if (!s.flyOff) s.flyOff = function () {};
    if (!s.hurt)   s.hurt   = function () {};
    if (!s.death)  s.death  = function () {};
    if (!s.setVolume) s.setVolume = function () {};
    if (!s.getVolume) s.getVolume = function () { return 1; };
    return s;
  }
  console.warn('[game.js] sounds.js не загрузился — работаем без звуков');
  const noop = function () {};
  return {
    resume: noop, break: noop, place: noop, step: noop, jump: noop,
    select: noop, flyOn: noop, flyOff: noop, hurt: noop, death: noop,
    setVolume: noop, getVolume: function () { return 1; }
  };
})();

const MOBS = (function () {
  const m = window.MOBS;
  if (m && m.raycast && m.hit) return m;
  console.warn('[game.js] mobs.js не загрузился полностью — мобы отключены');
  const noop = function () {};
  return {
    init: noop, update: noop,
    spawnInitial: function () { return 0; },
    spawnAt: function () { return null; },
    clear: noop,
    serialize: function () { return []; },
    deserialize: noop,
    count: function () { return 0; },
    raycast: function () { return null; },
    hit: function () { return false; }
  };
})();

/* ============================================================
   1. СЦЕНА, РЕНДЕРЕР, КАМЕРА
   ============================================================ */
const BASE_FOV = 75;
const SPRINT_FOV = 82;
const FLY_FOV    = 80;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 90, 220);
scene.add(chunkGroup);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.2 : 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 450);
camera.rotation.order = 'YXZ';

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  clampSettingsPosition();
});

MOBS.init(scene);

const hlBox = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 })
);
hlBox.visible = false;
scene.add(hlBox);

/* ============================================================
   1.0. ОБЛАКА
   ============================================================ */
const clouds = (function makeClouds() {
  const group = new THREE.Group();
  group.renderOrder = -1;

  function makeCloudTexture(seed) {
    const S = 64;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(S, S);
    const d = img.data;

    let sd = seed >>> 0;
    function rnd() {
      sd = (Math.imul(sd, 1103515245) + 12345) & 0x7fffffff;
      return sd / 0x7fffffff;
    }

    const nb = 5 + Math.floor(rnd() * 5);
    const blobs = [];
    for (let i = 0; i < nb; i++) {
      blobs.push({
        x: 0.5 + (rnd() - 0.5) * 0.55,
        y: 0.5 + (rnd() - 0.5) * 0.55,
        r: 0.10 + rnd() * 0.18
      });
    }

    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const dx = u - 0.5, dy = v - 0.5;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const mask = 1 - Math.max(0, (dist - 0.34) / 0.14);
        if (mask <= 0) continue;

        let val = 0;
        for (let i = 0; i < blobs.length; i++) {
          const bl = blobs[i];
          const ddx = u - bl.x, ddy = v - bl.y;
          const dd = Math.sqrt(ddx * ddx + ddy * ddy);
          const t = 1 - dd / bl.r;
          if (t > val) val = t;
        }
        val = Math.max(0, Math.min(1, val * mask));

        const o = (y * S + x) * 4;
        if (val > 0.55) {
          d[o] = 255; d[o + 1] = 255; d[o + 2] = 255;
          d[o + 3] = Math.floor(220 + (val - 0.55) * 60);
        } else if (val > 0.30) {
          d[o] = 255; d[o + 1] = 255; d[o + 2] = 255;
          d[o + 3] = Math.floor(((val - 0.30) / 0.25) * 200);
        } else {
          d[o] = 0; d[o + 1] = 0; d[o + 2] = 0; d[o + 3] = 0;
        }
      }
    }

    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  const textures = [];
  for (let i = 0; i < 8; i++) textures.push(makeCloudTexture(1000 + i * 137));
  const materials = textures.map(function (t) {
    return new THREE.MeshBasicMaterial({
      map: t, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, fog: false
    });
  });

  const SPREAD = 420;
  const COUNT = 26;

  let s2 = 424242;
  function rnd2() { s2 = (Math.imul(s2, 1103515245) + 12345) & 0x7fffffff; return s2 / 0x7fffffff; }

  const list = [];
  for (let i = 0; i < COUNT; i++) {
    const mat = materials[Math.floor(rnd2() * materials.length)];
    const size = 40 + rnd2() * 60;
    const geo = new THREE.PlaneGeometry(size, size);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.set(-Math.PI / 2, 0, rnd2() * Math.PI * 2);
    mesh.position.set(
      (rnd2() - 0.5) * SPREAD * 2,
      90 + rnd2() * 25,
      (rnd2() - 0.5) * SPREAD * 2
    );
    mesh.frustumCulled = false;
    group.add(mesh);
    list.push({ mesh: mesh, speed: 0.4 + rnd2() * 0.8 });
  }

  scene.add(group);
  return { group: group, list: list, spread: SPREAD };
})();

function updateClouds(dt, pPos) {
  clouds.group.position.x = pPos.x;
  clouds.group.position.z = pPos.z;
  const S = clouds.spread;
  for (let i = 0; i < clouds.list.length; i++) {
    const c = clouds.list[i];
    c.mesh.position.x += c.speed * dt;
    if (c.mesh.position.x > S) c.mesh.position.x -= S * 2;
  }
}

/* ============================================================
   1.1. НЕВИДИМЫЕ БАРЬЕРЫ
   ============================================================ */
(function makeBorderWalls() {
  const H = 40;
  const mat = new THREE.MeshBasicMaterial({
    color: 0x7ec850, transparent: true, opacity: 0.10,
    side: THREE.DoubleSide, depthWrite: false
  });
  const geoNS = new THREE.PlaneGeometry(SX, H);
  const geoEW = new THREE.PlaneGeometry(SZ, H);
  const w1 = new THREE.Mesh(geoNS, mat); w1.position.set(SX / 2, H / 2, 0); scene.add(w1);
  const w2 = new THREE.Mesh(geoNS, mat); w2.position.set(SX / 2, H / 2, SZ); scene.add(w2);
  const w3 = new THREE.Mesh(geoEW, mat); w3.rotation.y = Math.PI / 2; w3.position.set(0, H / 2, SZ / 2); scene.add(w3);
  const w4 = new THREE.Mesh(geoEW, mat); w4.rotation.y = Math.PI / 2; w4.position.set(SX, H / 2, SZ / 2); scene.add(w4);
})();

/* ============================================================
   1.2. ТРЕЩИНЫ
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
  map: crackTextures[0], transparent: true, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
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
   1.3. НАСТРОЙКИ
   ============================================================ */
const SETTINGS_KEY = 'mcweb_settings_v1';

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { volume: 1 };
    const d = JSON.parse(raw);
    return { volume: typeof d.volume === 'number' ? d.volume : 1 };
  } catch (e) { return { volume: 1 }; }
}
function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
}

const settings = loadSettings();

const settingsBtn   = document.getElementById('btn-settings');
const settingsPanel = document.getElementById('settings-panel');
const volSlider     = document.getElementById('set-volume');
const volValueEl    = document.getElementById('set-volume-val');
const fsCheckbox    = document.getElementById('set-fullscreen');

SFX.setVolume(settings.volume);
volSlider.value = Math.round(settings.volume * 100);
volValueEl.textContent = Math.round(settings.volume * 100) + '%';

volSlider.addEventListener('input', function () {
  const v = parseFloat(volSlider.value) / 100;
  SFX.setVolume(v);
  volValueEl.textContent = Math.round(v * 100) + '%';
  settings.volume = v;
  saveSettings(settings);
});

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}
fsCheckbox.checked = isFullscreen();

function enterFullscreen() {
  const el = document.documentElement;
  const p = el.requestFullscreen || el.webkitRequestFullscreen ||
            el.mozRequestFullScreen || el.msRequestFullscreen;
  if (p) { try { p.call(el); } catch (e) {} }
}
function exitFullscreen() {
  const p = document.exitFullscreen || document.webkitExitFullscreen ||
            document.mozCancelFullScreen || document.msExitFullscreen;
  if (p) { try { p.call(document); } catch (e) {} }
}

fsCheckbox.addEventListener('change', function () {
  if (fsCheckbox.checked) enterFullscreen();
  else exitFullscreen();
});
document.addEventListener('fullscreenchange', function () {
  fsCheckbox.checked = isFullscreen();
});
document.addEventListener('webkitfullscreenchange', function () {
  fsCheckbox.checked = isFullscreen();
});

/* ---------- открытие/закрытие панели ---------- */
let wasInGameBeforeSettings = false;
let panelJustDragged = false;

function toggleSettings(force) {
  const open = settingsPanel.classList.contains('open');
  const shouldOpen = (force === undefined) ? !open : force;
  if (shouldOpen === open) return;

  if (shouldOpen) {
    wasInGameBeforeSettings = !!document.pointerLockElement;
    settingsPanel.classList.add('open');
    settingsBtn.classList.add('active');

    if (!isMobile && document.pointerLockElement) {
      document.exitPointerLock();
    }
    clampSettingsPosition();
  } else {
    settingsPanel.classList.remove('open');
    settingsBtn.classList.remove('active');

    if (!isMobile && wasInGameBeforeSettings && !dead) {
      lockPointer();
    }
    wasInGameBeforeSettings = false;
  }
}

settingsBtn.addEventListener('click', function (e) {
  e.stopPropagation();
  toggleSettings();
});

document.addEventListener('click', function (e) {
  if (panelJustDragged) { panelJustDragged = false; return; }
  if (!settingsPanel.classList.contains('open')) return;
  if (e.target.closest && e.target.closest('#settings-panel, #btn-settings')) return;
  toggleSettings(false);
});

document.addEventListener('keydown', function (e) {
  if (e.code === 'Escape' && settingsPanel.classList.contains('open')) {
    toggleSettings(false);
  }
});

/* ---------- перетаскивание панели (только ПК) ---------- */
const settingsDragHandle = document.getElementById('settings-drag');

function clampSettingsPosition() {
  if (!settingsPanel.style.left) return;
  const r = settingsPanel.getBoundingClientRect();
  let x = parseFloat(settingsPanel.style.left);
  let y = parseFloat(settingsPanel.style.top);
  if (isNaN(x)) x = r.left;
  if (isNaN(y)) y = r.top;

  const maxX = window.innerWidth  - settingsPanel.offsetWidth;
  const maxY = window.innerHeight - settingsPanel.offsetHeight;
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x > maxX) x = maxX;
  if (y > maxY) y = maxY;

  settingsPanel.style.left = x + 'px';
  settingsPanel.style.top  = y + 'px';
}

if (!isMobile && settingsDragHandle) {
  let dragging = false;
  let dragOffX = 0, dragOffY = 0;

  function switchToLeftTop() {
    if (settingsPanel.style.left) return;
    const r = settingsPanel.getBoundingClientRect();
    settingsPanel.style.left  = r.left + 'px';
    settingsPanel.style.top   = r.top  + 'px';
    settingsPanel.style.right = 'auto';
  }

  settingsDragHandle.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    switchToLeftTop();

    const r = settingsPanel.getBoundingClientRect();
    dragOffX = e.clientX - r.left;
    dragOffY = e.clientY - r.top;

    dragging = true;
    panelJustDragged = false;
    document.body.classList.add('settings-dragging');
  });

  document.addEventListener('mousemove', function (e) {
    if (!dragging) return;

    let x = e.clientX - dragOffX;
    let y = e.clientY - dragOffY;

    const maxX = window.innerWidth  - settingsPanel.offsetWidth;
    const maxY = window.innerHeight - settingsPanel.offsetHeight;
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x > maxX) x = maxX;
    if (y > maxY) y = maxY;

    settingsPanel.style.left = x + 'px';
    settingsPanel.style.top  = y + 'px';

    panelJustDragged = true;
  });

  document.addEventListener('mouseup', function () {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('settings-dragging');
    setTimeout(function () { panelJustDragged = false; }, 0);
  });
}

/* ============================================================
   2. ЗДОРОВЬЕ ИГРОКА
   ============================================================ */
const MAX_HP = 20;
const HEARTS = MAX_HP / 2;
const FALL_SAFE = 3;
const REGEN_DELAY_MS = 8000;
const REGEN_INTERVAL_S = 4.0;

let hp = MAX_HP;
let dead = false;
let lastDamageTime = -99999;
let regenAcc = 0;
let wasOnGround = true;
let highestAirY = 0;

const healthEl = document.getElementById('health');
const hurtEl = document.getElementById('hurt');
const deathEl = document.getElementById('death');
const respawnBtn = document.getElementById('respawnBtn');

const heartEls = [];
for (let i = 0; i < HEARTS; i++) {
  const h = document.createElement('div');
  h.className = 'heart';
  healthEl.appendChild(h);
  heartEls.push(h);
}

function refreshHearts() {
  for (let i = 0; i < HEARTS; i++) {
    const v = hp - i * 2;
    const el = heartEls[i];
    if (v >= 2) el.classList.remove('empty', 'half');
    else if (v === 1) { el.classList.add('half'); el.classList.remove('empty'); }
    else { el.classList.add('empty'); el.classList.remove('half'); }
  }
}

let hurtTimer = null;
function flashHurt() {
  hurtEl.style.opacity = '1';
  clearTimeout(hurtTimer);
  hurtTimer = setTimeout(function () { hurtEl.style.opacity = '0'; }, 130);
}

function damagePlayer(amount, silent) {
  if (dead || amount <= 0) return;
  hp -= amount;
  if (hp < 0) hp = 0;
  lastDamageTime = performance.now();
  regenAcc = 0;
  refreshHearts();
  flashHurt();
  if (!silent) {
    if (hp > 0) SFX.hurt();
    else        SFX.death();
  }
  if (hp === 0) die();
}

function healPlayer(amount) {
  if (dead || amount <= 0) return;
  hp = Math.min(MAX_HP, hp + amount);
  refreshHearts();
}

function die() {
  if (dead) return;
  dead = true;
  player.fly = false;
  player.vel.set(0, 0, 0);
  deathEl.style.display = 'flex';
  if (document.pointerLockElement) document.exitPointerLock();
  console.log('[game.js] игрок умер');
}

function respawnFromDeath() {
  dead = false;
  hp = MAX_HP;
  lastDamageTime = -99999;
  regenAcc = 0;
  refreshHearts();
  deathEl.style.display = 'none';
  respawn();
  wasOnGround = true;
  highestAirY = player.pos.y;
  if (!isMobile) lockPointer();
  else { locked = true; menu.style.display = 'none'; }
}

respawnBtn.addEventListener('click', function (e) {
  e.stopPropagation();
  respawnFromDeath();
});

refreshHearts();

/* ============================================================
   3. ИГРОК
   ============================================================ */
const PR = 0.3, PH = 1.8, EYE = 1.62;
const GRAVITY = 28, JUMP = 9;
const PLAYER_DAMAGE = 4;
const ATTACK_RANGE = 3.5;
const ATTACK_COOLDOWN = 0.4;
let attackTimer = 0;

const player = {
  pos: new THREE.Vector3(SX / 2 + 0.5, 40, SZ / 2 + 0.5),
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
   4. УПРАВЛЕНИЕ
   ============================================================ */
const keys = Object.create(null);
let locked = false;

const DOUBLE_TAP_MS = 280;
const lastTap = { KeyW: 0, ArrowUp: 0 };
const doubleLock = { KeyW: false, ArrowUp: false };

function toggleFly() {
  if (dead) return;
  player.fly = !player.fly;
  player.vel.y = 0;
  wasOnGround = false;
  highestAirY = player.pos.y;
  if (player.fly) { SFX.flyOn();  showHint('Полёт: ВКЛ'); }
  else            { SFX.flyOff(); showHint('Полёт: ВЫКЛ'); }
}

const menu = document.getElementById('menu');
const startBtn = document.getElementById('startBtn');

function lockPointer() {
  SFX.resume();
  if (isMobile) {
    locked = true;
    menu.style.display = 'none';
    return;
  }
  renderer.domElement.requestPointerLock();
}

startBtn.addEventListener('click', lockPointer);
renderer.domElement.addEventListener('click', function () {
  if (!isMobile && !locked && !dead && !settingsPanel.classList.contains('open')) lockPointer();
});

document.addEventListener('pointerlockchange', () => {
  if (isMobile) return;
  const nowLocked = document.pointerLockElement === renderer.domElement;

  if (locked && !nowLocked && settingsPanel.classList.contains('open')) {
    locked = false;
    return;
  }

  locked = nowLocked;
  menu.style.display = (locked || dead) ? 'none' : 'flex';
  if (!locked) {
    for (const k in keys) keys[k] = false;
    stopBreaking();
    doubleLock.KeyW = false;
    doubleLock.ArrowUp = false;
  }
});

document.addEventListener('mousemove', (e) => {
  if (isMobile) return;
  if (!locked || dead) return;
  yaw   -= e.movementX * 0.0022;
  pitch -= e.movementY * 0.0022;
  const lim = Math.PI / 2 - 0.001;
  if (pitch >  lim) pitch =  lim;
  if (pitch < -lim) pitch = -lim;
});

document.addEventListener('keydown', (e) => {
  if (dead) return;
  if (e.code === 'KeyO' && !e.repeat) {
    e.preventDefault();
    toggleSettings();
    return;
  }
  if (e.code === 'KeyF' && !e.repeat) toggleFly();
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
    let n = parseInt(e.code.slice(5), 10);
    if (n === 0) n = 10;
    if (n >= 1 && n <= HOTBAR.length) selectSlot(n - 1);
  } else if (e.code === 'Minus') {
    if (HOTBAR.length >= 11) selectSlot(10);
  }
});
document.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'KeyW')    doubleLock.KeyW = false;
  if (e.code === 'ArrowUp') doubleLock.ArrowUp = false;
});

document.addEventListener('contextmenu', e => e.preventDefault());

let mouseDown = [false, false, false];
renderer.domElement.addEventListener('mousedown', (e) => {
  if (isMobile) return;
  if (!locked || dead) return;
  mouseDown[e.button] = true;
  if (e.button === 0) {
    breaking.active = false;
    breaking.progress = 0;
    breaking.stage = 0;
  }
  if (e.button === 2) placeBlock();
});
renderer.domElement.addEventListener('mouseup', (e) => {
  if (isMobile) return;
  mouseDown[e.button] = false;
  if (e.button === 0) stopBreaking();
});

document.addEventListener('wheel', (e) => {
  if (isMobile) return;
  if (!locked || dead) return;
  const d = e.deltaY > 0 ? 1 : -1;
  selectSlot((selected + d + HOTBAR.length) % HOTBAR.length);
}, { passive: true });

/* ============================================================
   4.1. МОБИЛЬНОЕ УПРАВЛЕНИЕ
   ============================================================ */
const mobileInput = { active: false, mx: 0, my: 0, sprint: false };

if (isMobile) {
  const joyEl = document.getElementById('joystick');
  const stickEl = document.getElementById('joystick-stick');
  const JOY_RADIUS = 55;
  const SPRINT_THRESHOLD = 0.85;
  let joyTouchId = null;
  let joyCx = 0, joyCy = 0;

  function joyReset() {
    stickEl.style.transform = 'translate(0px,0px)';
    mobileInput.active = false;
    mobileInput.mx = 0;
    mobileInput.my = 0;
    mobileInput.sprint = false;
    joyTouchId = null;
  }
  function joyStart(e) {
    e.preventDefault();
    const t = e.changedTouches[0];
    joyTouchId = t.identifier;
    const r = joyEl.getBoundingClientRect();
    joyCx = r.left + r.width / 2;
    joyCy = r.top + r.height / 2;
    joyMove(e);
  }
  function joyMove(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier !== joyTouchId) continue;
      let dx = t.clientX - joyCx;
      let dy = t.clientY - joyCy;
      const len = Math.hypot(dx, dy);
      if (len > JOY_RADIUS) { dx = dx / len * JOY_RADIUS; dy = dy / len * JOY_RADIUS; }
      stickEl.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      mobileInput.mx = dx / JOY_RADIUS;
      mobileInput.my = dy / JOY_RADIUS;
      mobileInput.active = true;
      mobileInput.sprint = (Math.hypot(dx, dy) / JOY_RADIUS) > SPRINT_THRESHOLD;
    }
  }
  joyEl.addEventListener('touchstart', joyStart, { passive: false });
  joyEl.addEventListener('touchmove',  joyMove,  { passive: false });
  joyEl.addEventListener('touchend',    joyReset);
  joyEl.addEventListener('touchcancel', joyReset);

  const LOOK_SENS = 0.005;
  let lookTouchId = null;
  let lastLookX = 0, lastLookY = 0;

  function isUIElement(target) {
    if (!target) return false;
    return !!(target.closest && target.closest('#joystick, #mob-buttons, #btn-menu, #btn-settings, #settings-panel, #hotbar, #menu, #death'));
  }

  document.addEventListener('touchstart', function (e) {
    if (dead || !locked) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (isUIElement(t.target)) continue;
      if (lookTouchId === null) {
        lookTouchId = t.identifier;
        lastLookX = t.clientX;
        lastLookY = t.clientY;
      }
    }
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (dead || !locked) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier !== lookTouchId) continue;
      const dx = t.clientX - lastLookX;
      const dy = t.clientY - lastLookY;
      lastLookX = t.clientX;
      lastLookY = t.clientY;
      yaw   -= dx * LOOK_SENS;
      pitch -= dy * LOOK_SENS;
      const lim = Math.PI / 2 - 0.001;
      if (pitch >  lim) pitch =  lim;
      if (pitch < -lim) pitch = -lim;
    }
  }, { passive: true });

  function lookEnd(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === lookTouchId) lookTouchId = null;
    }
  }
  document.addEventListener('touchend', lookEnd);
  document.addEventListener('touchcancel', lookEnd);

  /* ---------- кнопки ---------- */
  const btnBreak = document.getElementById('btn-break');
  const btnPlace = document.getElementById('btn-place');
  const btnJump  = document.getElementById('btn-jump');
  const btnFly   = document.getElementById('btn-fly');
  const btnMenu  = document.getElementById('btn-menu');

  function bindHold(btn, onDown, onUp) {
    if (!btn) return;
    btn.addEventListener('touchstart', function (e) {
      e.preventDefault(); e.stopPropagation();
      btn.classList.add('pressed');
      if (onDown) onDown();
    }, { passive: false });
    const end = function (e) {
      e.preventDefault(); e.stopPropagation();
      btn.classList.remove('pressed');
      if (onUp) onUp();
    };
    btn.addEventListener('touchend', end, { passive: false });
    btn.addEventListener('touchcancel', end, { passive: false });
  }

  bindHold(btnBreak,
    function () {
      if (dead || !locked) return;
      mouseDown[0] = true;
      breaking.active = false; breaking.progress = 0; breaking.stage = 0;
      if (tryAttackMob() && breaking.active) stopBreaking();
    },
    function () { mouseDown[0] = false; stopBreaking(); }
  );

  if (btnPlace) {
    btnPlace.addEventListener('touchstart', function (e) {
      e.preventDefault(); e.stopPropagation();
      btnPlace.classList.add('pressed');
      if (!dead && locked) placeBlock();
      setTimeout(function () { btnPlace.classList.remove('pressed'); }, 120);
    }, { passive: false });
  }

  bindHold(btnJump,
    function () { if (!dead && locked) keys['Space'] = true; },
    function () { keys['Space'] = false; }
  );

  if (btnFly) {
    btnFly.addEventListener('touchstart', function (e) {
      e.preventDefault(); e.stopPropagation();
      btnFly.classList.add('pressed');
      if (!dead && locked) toggleFly();
      setTimeout(function () { btnFly.classList.remove('pressed'); }, 120);
    }, { passive: false });
  }

  /* Кнопка МЕНЮ на телефоне: открыть/закрыть игровое меню */
  if (btnMenu) {
    btnMenu.addEventListener('touchstart', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (menu.style.display === 'flex') {
        locked = true;
        menu.style.display = 'none';
      } else {
        locked = false;
        menu.style.display = 'flex';
        for (const k in keys) keys[k] = false;
        mouseDown[0] = false;
        stopBreaking();
        joyReset();
      }
    }, { passive: false });
  }

  /* Кнопка НАСТРОЕК на телефоне: открыть/закрыть панель */
  if (settingsBtn) {
    settingsBtn.addEventListener('touchstart', function (e) {
      e.preventDefault(); e.stopPropagation();
      toggleSettings();
    }, { passive: false });
  }

  console.log('[game.js] мобильный режим активен');
}

/* ============================================================
   5. РЕЙКАСТ
   ============================================================ */
const _dir = new THREE.Vector3();
const _hitDir = new THREE.Vector3();

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
const breaking = { active: false, target: null, progress: 0, stage: 0 };

function stopBreaking() {
  breaking.active = false;
  breaking.progress = 0;
  breaking.stage = 0;
  breaking.target = null;
  crackMesh.visible = false;
}

function tryAttackMob() {
  if (attackTimer > 0) return false;
  _hitDir.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const hit = MOBS.raycast(camera.position, _hitDir, ATTACK_RANGE);
  if (!hit) return false;
  MOBS.hit(hit.mob, PLAYER_DAMAGE, player.pos.x, player.pos.z);
  attackTimer = ATTACK_COOLDOWN;
  return true;
}

function updateBreaking(dt) {
  if (!locked || !mouseDown[0] || !currentTarget || dead) {
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
   6. ХОТБАР
   ============================================================ */
const HOTBAR = [1, 2, 3, 4, 8, 9, 6, 7, 10, 5, 11];
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
  const label = (i === 9) ? '0' : (i === 10) ? '−' : (i + 1);
  el.innerHTML = '<span class="num">' + label + '</span>';
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
   7. СОХРАНЕНИЕ
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
      v: 1, seed: worldSeed,
      w: u8ToB64(world),
      px: player.pos.x, py: player.pos.y, pz: player.pos.z,
      yaw: yaw, pitch: pitch, fly: player.fly,
      hp: hp,
      mobs: MOBS.serialize()
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
    if (typeof d.hp === 'number' && d.hp > 0) hp = Math.min(MAX_HP, d.hp);
    else hp = MAX_HP;
    refreshHearts();
    if (d.mobs && d.mobs.length) MOBS.deserialize(d.mobs);
    return true;
  } catch (e) { console.warn('Не удалось загрузить:', e); return false; }
}

function newWorld() {
  worldSeed = (Math.random() * 1e9) | 0;
  generateWorld(worldSeed);
  rebuildAll();
  MOBS.clear();
  respawn();
  yaw = 0; pitch = 0;
  hp = MAX_HP;
  refreshHearts();
  MOBS.spawnInitial(40);
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
   8. ИНИЦИАЛИЗАЦИЯ
   ============================================================ */
const loadingEl = document.getElementById('loading');
const loadingTextEl = loadingEl ? loadingEl.querySelector('div') : null;

function setLoadingText(t) { if (loadingTextEl) loadingTextEl.textContent = t; }
function showLoading(on) { if (loadingEl) loadingEl.style.display = on ? 'flex' : 'none'; }

function buildChunksAsync(onProgress, onDone) {
  const total = CHX * CHZ;
  let cx = 0, cz = 0, built = 0;
  function step() {
    const t0 = performance.now();
    while (cz < CHZ && (performance.now() - t0) < 14) {
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
            if (MOBS.count() === 0) {
              setLoadingText('Спавн мобов…');
              MOBS.spawnInitial(40);
            }
            wasOnGround = true;
            highestAirY = player.pos.y;
            showLoading(false);
            console.log('[game.js] init OK. Игрок:', player.pos.toArray(),
                        '| мобов:', MOBS.count(), '| hp:', hp,
                        '| mobile:', isMobile, '| volume:', settings.volume);
          }
        );
      } catch (e) {
        fatal('Ошибка при инициализации: ' + (e && e.message ? e.message : e));
      }
    });
  });
})();

/* ============================================================
   9. ГЛАВНЫЙ ЦИКЛ
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
  if (attackTimer > 0) attackTimer -= dt;
  updateClouds(dt, player.pos);

  if (!dead) {
    _fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    _rgt.set( Math.cos(yaw), 0, -Math.sin(yaw));
    _wish.set(0, 0, 0);

    let moving = false;

    if (isMobile) {
      if (mobileInput.active) {
        const fwdAmt    = -mobileInput.my;
        const strafeAmt =  mobileInput.mx;
        _wish.x = _fwd.x * fwdAmt + _rgt.x * strafeAmt;
        _wish.z = _fwd.z * fwdAmt + _rgt.z * strafeAmt;
        if (_wish.lengthSq() > 1) _wish.normalize();
        moving = _wish.lengthSq() > 0.001;
      }
    } else {
      if (locked) {
        if (keys['KeyW']) _wish.add(_fwd);
        if (keys['KeyS']) _wish.sub(_fwd);
        if (keys['KeyD']) _wish.add(_rgt);
        if (keys['KeyA']) _wish.sub(_rgt);
        if (keys['ArrowUp'])    _wish.add(_fwd);
        if (keys['ArrowDown'])  _wish.sub(_fwd);
        if (keys['ArrowRight']) _wish.add(_rgt);
        if (keys['ArrowLeft'])  _wish.sub(_rgt);
        moving = _wish.lengthSq() > 0;
        if (moving) _wish.normalize();
      }
    }

    const forwardHeld = keys['KeyW'] || keys['ArrowUp'];
    const forwardLock = (keys['KeyW'] && doubleLock.KeyW) || (keys['ArrowUp'] && doubleLock.ArrowUp);
    const shift = !!keys['ShiftLeft'];
    const ctrl  = !!keys['ControlLeft'];

    let fovTarget = BASE_FOV;
    sprintActive = false;

    if (player.fly) {
      const sp = ctrl ? 26 : 12;
      if (isMobile) {
        player.vel.x = _wish.x * sp;
        player.vel.z = _wish.z * sp;
        let vy = -mobileInput.my * sp;
        if (!mobileInput.active) { player.vel.x = 0; player.vel.z = 0; vy = 0; }
        player.vel.y = vy;
      } else {
        player.vel.x = _wish.x * sp;
        player.vel.z = _wish.z * sp;
        let vy = 0;
        if (keys['Space']) vy += sp;
        if (shift)         vy -= sp;
        player.vel.y = vy;
      }
      player.onGround = false;
      stepAcc = 0;
      fovTarget = ctrl ? FLY_FOV + 8 : FLY_FOV;
    } else {
      sprintActive = shift || ctrl ||
                     (forwardLock && forwardHeld && moving) ||
                     (isMobile && mobileInput.sprint && moving);
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

    if (!player.fly) {
      if (!player.onGround) {
        if (wasOnGround) highestAirY = player.pos.y;
        if (player.pos.y > highestAirY) highestAirY = player.pos.y;
      } else {
        if (!wasOnGround) {
          const fallDist = highestAirY - player.pos.y;
          if (fallDist > FALL_SAFE) {
            const dmg = Math.floor(fallDist - FALL_SAFE);
            if (dmg > 0) damagePlayer(dmg);
          }
        }
      }
    } else {
      highestAirY = player.pos.y;
    }
    wasOnGround = player.onGround;

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

    if (hp > 0 && hp < MAX_HP) {
      const sinceDmg = performance.now() - lastDamageTime;
      if (sinceDmg > REGEN_DELAY_MS) {
        regenAcc += dt;
        if (regenAcc >= REGEN_INTERVAL_S) {
          regenAcc = 0;
          healPlayer(1);
        }
      }
    }

    if (player.pos.y < -30) damagePlayer(MAX_HP);

    const newFov = camera.fov + (fovTarget - camera.fov) * Math.min(1, 8 * dt);
    if (Math.abs(newFov - camera.fov) > 0.01) {
      camera.fov = newFov;
      camera.updateProjectionMatrix();
    }
  } else {
    sprintActive = false;
  }

  try {
    MOBS.update(dt, player.pos);
  } catch (e) {
    console.error('mobs update error', e);
  }

  camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;

  currentTarget = (locked && !dead) ? raycastBlock() : null;
  if (currentTarget) {
    hlBox.visible = true;
    hlBox.position.set(currentTarget.x + 0.5, currentTarget.y + 0.5, currentTarget.z + 0.5);
  } else {
    hlBox.visible = false;
  }

  if (locked && mouseDown[0] && !dead) {
    if (tryAttackMob()) {
      if (breaking.active) stopBreaking();
    }
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

  infoEl.textContent =
    'XYZ: ' + player.pos.x.toFixed(1) + ' / ' + player.pos.y.toFixed(1) + ' / ' + player.pos.z.toFixed(1) + '\n' +
    'FPS: ' + fpsVal + '  ·  ' + GAME_VERSION;

  renderer.render(scene, camera);
}

requestAnimationFrame(loop);

console.log('[game.js] скрипт загружен, размер мира', SX + '×' + SZ + '×' + SY,
            '| mobile:', isMobile, '| version:', GAME_VERSION);

})();