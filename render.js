/* ============================================================
   render.js — движок: сцена, рендерер, камера, облака,
   барьеры по краям мира, текстуры трещин, восстановление
   WebGL-контекста после его потери.

   Экспортирует через window.RENDER всё, что нужно игровой
   логике: scene, renderer, camera, crackTextures, crackMat,
   crackMesh, updateClouds, BASE_FOV/SPRINT_FOV/FLY_FOV,
   а также флаг isMobile (определяется здесь один раз).
   ============================================================ */
window.RENDER = (function () {
'use strict';

/* ---------- раннее обнаружение проблем с зависимостями ---------- */
if (typeof THREE === 'undefined') {
  return { ok: false, reason: 'no-three' };
}
if (!window.MC || !window.MC.generateWorld) {
  return { ok: false, reason: 'no-mc' };
}

const MC = window.MC;
const SX = MC.SX, SZ = MC.SZ, SY = MC.SY;
const chunkGroup = MC.chunkGroup;
const atlasTexture = MC.atlasTexture;

const isMobile = ('ontouchstart' in window) ||
                 (navigator.maxTouchPoints > 0) ||
                 (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
if (isMobile) document.body.classList.add('mobile');

/* ============================================================
   1. СЦЕНА, РЕНДЕРЕР, КАМЕРА
   ============================================================ */
const BASE_FOV   = 75;
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
});

/* ============================================================
   2. ОБЛАКА (26 процедурных мешей с 8 текстурами)
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
  return { group: group, list: list, spread: SPREAD, materials: materials };
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
   3. НЕВИДИМЫЕ БАРЬЕРЫ ПО КРАЯМ МИРА
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
   4. ТРЕЩИНЫ (10 стадий)
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

/* ============================================================
   5. ВОССТАНОВЛЕНИЕ WebGL-КОНТЕКСТА
   ------------------------------------------------------------
   На мобильных при выходе из fullscreen / сворачивании
   браузер может потерять GPU-контекст. Ловим событие потери
   и при восстановлении пересобираем все текстуры, чанки и
   меши мобов.
   ============================================================ */
function recoverGL() {
  try {
    if (MC.atlasTexture) MC.atlasTexture.needsUpdate = true;

    for (let i = 0; i < crackTextures.length; i++) {
      crackTextures[i].needsUpdate = true;
    }

    for (let i = 0; i < clouds.materials.length; i++) {
      const m = clouds.materials[i];
      if (m.map) m.map.needsUpdate = true;
      m.needsUpdate = true;
    }

    if (MC.rebuildAll) MC.rebuildAll();
    if (window.MOBS && window.MOBS.rebuildTextures) window.MOBS.rebuildTextures();

    if (renderer.resetState) renderer.resetState();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.render(scene, camera);

    console.log('[render.js] пересборка после потери контекста завершена');
  } catch (e) {
    console.error('[render.js] recoverGL error', e);
  }
}

renderer.domElement.addEventListener('webglcontextlost', function (e) {
  e.preventDefault();
  console.warn('[render.js] WebGL context lost');
}, false);

renderer.domElement.addEventListener('webglcontextrestored', function () {
  console.warn('[render.js] WebGL context restored — планирую пересборку');
  // Откладываем на следующий кадр, чтобы дать браузеру стабилизироваться
  requestAnimationFrame(function () { recoverGL(); });
}, false);

document.addEventListener('visibilitychange', function () {
  if (!document.hidden) {
    renderer.setSize(window.innerWidth, window.innerHeight);
    try { renderer.render(scene, camera); } catch (e) {}
  }
});

/* ============================================================
   6. ЭКСПОРТ
   ============================================================ */
return {
  ok: true,
  isMobile: isMobile,

  scene: scene,
  renderer: renderer,
  camera: camera,

  BASE_FOV:   BASE_FOV,
  SPRINT_FOV: SPRINT_FOV,
  FLY_FOV:    FLY_FOV,

  crackTextures: crackTextures,
  crackMat: crackMat,
  crackMesh: crackMesh,

  updateClouds: updateClouds
};

})();