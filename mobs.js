/* ============================================================
   mobs.js — мирные мобы с текстурами, звуками, HP и AI.
   + Анимации: голова с pivot, слежение за игроком (периодически),
     покачивание, поза прыжка
   + Текстуры в стиле Minecraft + живые глаза
   + FIX: звуки мобов отключаются, когда игра не активна (меню)
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
    isBlockOccupied: function () { return false; },
    setMuted: noop
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
let renderDistBlocks = 6 * CS;

/* Приглушение звуков: когда игрок в меню, звуки мобов не играют */
let soundsMuted = false;
function setMuted(v) { soundsMuted = !!v; }

const GRAVITY = 28;
const JUMP_VELOCITY = 8.6;
const SOUND_MIN_DIST2 = 15 * 15;
const SOUND_INTERVAL_MIN = 8;
const SOUND_INTERVAL_MAX = 16;
const PANIC_DURATION = 4.0;
const PANIC_SPEED_MULT = 1.6;
const LEG_SWING = 0.55;
const VISIBILITY_MARGIN = 1.0;

/* --- Параметры анимаций головы --- */
const HEAD_LOOK_RANGE_SQ = 12 * 12;
const HEAD_MAX_YAW       = 1.15;
const HEAD_MAX_PITCH     = 0.55;
const HEAD_SMOOTH        = 5.5;
const HEAD_BOB_Y         = 0.02;
const HEAD_SWAY          = 0.045;
const JUMP_LEG_POSE      = 0.32;

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

function makeTex(px, palette, options) {
  options = options || {};
  const density   = options.density   != null ? options.density   : 0.35;
  const patchChance = options.patchChance != null ? options.patchChance : 0;
  const patchColors = options.patchColors || null;
  const patchScale  = options.patchScale  || 3;
  const seed        = options.seed        || 1;

  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(px, px);
  const d = img.data;

  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const bx = (x / 2) | 0;
      const by = (y / 2) | 0;
      const n = hash01(bx, by, seed);
      let idx = 0;
      if (n < density * 0.4)      idx = 0;
      else if (n < density * 0.75) idx = 1;
      else if (n < density)        idx = 2;
      else                          idx = (n > 0.5 ? 2 : 3);

      const fine = hash01(x, y, seed + 31);
      if (fine < 0.15 && idx > 0) idx--;
      else if (fine > 0.9 && idx < palette.length - 1) idx++;

      let col = palette[Math.min(idx, palette.length - 1)];

      if (patchColors && patchChance > 0) {
        const pbx = (x / patchScale) | 0;
        const pby = (y / patchScale) | 0;
        const pn = hash01(pbx, pby, seed + 91);
        if (pn < patchChance) {
          col = patchColors[Math.min(idx, patchColors.length - 1)];
        }
      }

      const o = (y * px + x) * 4;
      d[o]     = col[0];
      d[o + 1] = col[1];
      d[o + 2] = col[2];
      d[o + 3] = 255;
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
  const light = [242, 165, 160];
  const dark  = [214, 138, 134];
  const nos   = [90, 40, 50];

  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const n = hash01((x / 2) | 0, (y / 2) | 0, 41);
      let col = n < 0.5 ? light : dark;
      const ny = y >= 6 && y <= 9;
      if (ny && ((x >= 4 && x <= 5) || (x >= 10 && x <= 11))) col = nos;
      const o = (y * px + x) * 4;
      d[o] = col[0]; d[o+1] = col[1]; d[o+2] = col[2]; d[o+3] = 255;
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
  const brown    = [62, 39, 22];
  const brownLt  = [88, 58, 36];
  const brownDk  = [42, 25, 12];
  const muzzle   = [242, 235, 225];
  const muzzleDk = [200, 190, 180];

  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const n = hash01((x / 2) | 0, (y / 2) | 0, 91);
      let col = n < 0.4 ? brown : (n < 0.8 ? brownLt : brownDk);
      if ((Math.abs(x - 7) <= 1 || Math.abs(x - 8) <= 1) && y >= 3) {
        col = (n < 0.5) ? muzzle : muzzleDk;
      }
      if (y <= 2 && (x < 4 || x > 11)) col = brownDk;
      const o = (y * px + x) * 4;
      d[o] = col[0]; d[o+1] = col[1]; d[o+2] = col[2]; d[o+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finalizeTex(c);
}

function makeSheepWoolTex() {
  const px = 16;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(px, px);
  const d = img.data;
  const shade = [
    [235, 235, 235],
    [220, 220, 220],
    [205, 205, 205],
    [190, 190, 190]
  ];
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const bx = (x / 2) | 0;
      const by = (y / 2) | 0;
      const n = hash01(bx, by, 5);
      const checker = ((bx + by) & 1) === 0 ? 0.15 : 0;
      let idx;
      if (n + checker < 0.30)      idx = 0;
      else if (n + checker < 0.55) idx = 1;
      else if (n + checker < 0.80) idx = 2;
      else                          idx = 3;
      const o = (y * px + x) * 4;
      d[o] = shade[idx][0]; d[o+1] = shade[idx][1]; d[o+2] = shade[idx][2];
      d[o+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finalizeTex(c);
}

function makeCowHideTex() {
  const px = 16;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(px, px);
  const d = img.data;
  const brown   = [62, 39, 22];
  const brownLt = [88, 58, 36];
  const brownDk = [42, 25, 12];
  const white   = [242, 240, 236];
  const whiteDk = [216, 214, 210];

  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const n = hash01((x / 2) | 0, (y / 2) | 0, 8);
      let col = n < 0.4 ? brown : (n < 0.8 ? brownLt : brownDk);
      const pbx = (x / 3) | 0;
      const pby = (y / 3) | 0;
      const pn = hash01(pbx, pby, 8 + 200);
      const inBlob1 = (x >= 1 && x <= 7 && y >= 2 && y <= 8) && pn < 0.55;
      const inBlob2 = (x >= 8 && x <= 14 && y >= 9 && y <= 14) && pn > 0.35;
      if (inBlob1 || inBlob2) col = (n > 0.5) ? white : whiteDk;
      const o = (y * px + x) * 4;
      d[o] = col[0]; d[o+1] = col[1]; d[o+2] = col[2]; d[o+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finalizeTex(c);
}

function makeChickenBodyTex() {
  const px = 16;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(px, px);
  const d = img.data;
  const white   = [250, 250, 250];
  const whiteMd = [232, 232, 228];
  const whiteDk = [210, 210, 205];
  const whiteSh = [188, 188, 184];

  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const n = hash01((x / 2) | 0, (y / 2) | 0, 12);
      let col;
      if (n < 0.4) col = white;
      else if (n < 0.7) col = whiteMd;
      else if (n < 0.9) col = whiteDk;
      else col = whiteSh;
      if (y % 5 === 2 && (x + ((y / 5) | 0) * 3) % 4 === 0) col = whiteDk;
      const o = (y * px + x) * 4;
      d[o] = col[0]; d[o+1] = col[1]; d[o+2] = col[2]; d[o+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finalizeTex(c);
}

function makeChickenHeadTex() {
  const px = 16;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(px, px);
  const d = img.data;
  const white   = [250, 250, 250];
  const whiteMd = [232, 232, 228];
  const whiteDk = [210, 210, 205];
  const comb    = [204, 34, 34];
  const combDk  = [160, 20, 20];

  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const n = hash01((x / 2) | 0, (y / 2) | 0, 12);
      let col;
      if (n < 0.5) col = white;
      else if (n < 0.85) col = whiteMd;
      else col = whiteDk;
      if (y <= 2 && x >= 3 && x <= 12) col = (n > 0.5) ? comb : combDk;
      const o = (y * px + x) * 4;
      d[o] = col[0]; d[o+1] = col[1]; d[o+2] = col[2]; d[o+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finalizeTex(c);
}

function makeEyeTex() {
  const px = 16;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(px, px);
  const d = img.data;
  const cx = 7.5, cy = 7.5;

  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      let r, g, b;
      const dx = x - cx, dy = y - cy;
      const dist2 = dx * dx + dy * dy;

      if (dist2 > 42) { r = 8; g = 6; b = 10; }
      else if (dist2 > 14) { r = 34; g = 28; b = 32; }
      else { r = 10; g = 6; b = 8; }

      const hx = x - 4.7, hy = y - 4.7;
      const hd2 = hx * hx + hy * hy;
      if (hd2 < 2.4) { r = 255; g = 255; b = 255; }
      else if (hd2 < 5.5) {
        const t = (5.5 - hd2) / 3.1;
        r = Math.min(255, r + 190 * t);
        g = Math.min(255, g + 195 * t);
        b = Math.min(255, b + 200 * t);
      }

      const h2x = x - 10, h2y = y - 10.5;
      const h2d2 = h2x * h2x + h2y * h2y;
      if (h2d2 < 1.4) { r = 195; g = 200; b = 215; }
      else if (h2d2 < 3) {
        r = Math.min(255, r + 70);
        g = Math.min(255, g + 70);
        b = Math.min(255, b + 80);
      }

      const o = (y * px + x) * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finalizeTex(c);
}

function makeCowEyeTex() {
  const px = 16;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(px, px);
  const d = img.data;
  const cx = 7.5, cy = 7.5;

  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      let r, g, b;
      const dx = x - cx, dy = y - cy;
      const dist2 = dx * dx + dy * dy;

      if (dist2 > 30) { r = 245; g = 242; b = 234; }
      else if (dist2 > 12) { r = 200; g = 196; b = 188; }
      else { r = 14; g = 10; b = 12; }

      const hx = x - 5, hy = y - 5;
      const hd2 = hx * hx + hy * hy;
      if (hd2 < 2) { r = 255; g = 255; b = 255; }
      else if (hd2 < 4.5) {
        const t = (4.5 - hd2) / 2.5;
        r = Math.min(255, r + 180 * t);
        g = Math.min(255, g + 180 * t);
        b = Math.min(255, b + 185 * t);
      }

      const o = (y * px + x) * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finalizeTex(c);
}

function makeSolidTex(px, palette, seed) {
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(px, px);
  const d = img.data;
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const n = hash01((x / 2) | 0, (y / 2) | 0, seed);
      const idx = n < 0.5 ? 0 : (n < 0.85 ? 1 : 2);
      const col = palette[Math.min(idx, palette.length - 1)];
      const o = (y * px + x) * 4;
      d[o] = col[0]; d[o+1] = col[1]; d[o+2] = col[2]; d[o+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finalizeTex(c);
}

const PIG_BASE = [[242,165,160],[228,148,144],[214,130,128],[196,114,112]];
const PIG_LEG = [[214,130,128],[198,116,114],[180,100,100]];
const SHEEP_FACE = [[88,78,70],[70,62,56],[52,46,42]];
const SHEEP_LEG = [[72,66,60],[58,52,48],[44,40,36]];
const COW_HORN = [[238,234,214],[216,208,186],[188,178,156]];
const COW_LEG = [[62,39,22],[50,30,16],[38,22,10]];
const CHICKEN_BEAK = [[242,168,40],[222,148,28],[198,126,18]];
const CHICKEN_LEG = [[232,158,30],[208,136,20],[180,114,12]];
const WATTLE_RED = [[220,40,40],[190,26,26],[160,18,18]];

const MOB_TEXTURES = {
  pigBody:  makeTex(16, PIG_BASE, { density: 0.55, seed: 1 }),
  pigHead:  makeTex(16, PIG_BASE, { density: 0.55, seed: 2 }),
  pigSnout: makePigSnoutTex(),
  pigLeg:   makeSolidTex(16, PIG_LEG, 4),
  sheepWool: makeSheepWoolTex(),
  sheepFace: makeSolidTex(16, SHEEP_FACE, 6),
  sheepLeg:  makeSolidTex(16, SHEEP_LEG, 7),
  cowHide: makeCowHideTex(),
  cowFace: makeCowFaceTex(),
  cowHorn: makeSolidTex(16, COW_HORN, 10),
  cowLeg:  makeSolidTex(16, COW_LEG, 11),
  chickenBody: makeChickenBodyTex(),
  chickenHead: makeChickenHeadTex(),
  chickenBeak: makeSolidTex(16, CHICKEN_BEAK, 13),
  chickenLeg:  makeSolidTex(16, CHICKEN_LEG, 14),
  wattle: makeSolidTex(16, WATTLE_RED, 15),
  eye:    makeEyeTex(),
  cowEye: makeCowEyeTex()
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
  const mats = new Array(6);
  for (let i = 0; i < 6; i++) mats[i] = getMobMaterial(color, texKey, i);
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
}

const MOB_TYPES = {
  pig: {
    h: 0.9, r: 0.42, speed: 1.4, hp: 10,
    headPivot: [0, 0.75, -0.35],
    parts: [
      [0.625, 0.5,   1.0,   0xEE9999,  0,    0.625,  0,     '',  'pigBody'],
      [0.5,   0.5,   0.5,   0xEE9999,  0,    0.75,  -0.55,  'h', 'pigHead'],
      [0.25,  0.2,   0.1,   0xCC6677,  0,    0.66,  -0.85,  'h', 'pigSnout'],
      [0.05,  0.05,  0.02,  0x551122, -0.06, 0.66,  -0.91,  'h', null],
      [0.05,  0.05,  0.02,  0x551122,  0.06, 0.66,  -0.91,  'h', null],
      [0.1,   0.1,   0.02,  0x111111, -0.15, 0.875, -0.81,  'h', 'eye'],
      [0.1,   0.1,   0.02,  0x111111,  0.15, 0.875, -0.81,  'h', 'eye'],
      [0.1,   0.1,   0.08,  0xCC6677, -0.15, 1.02,  -0.5,   'h', null],
      [0.1,   0.1,   0.08,  0xCC6677,  0.15, 1.02,  -0.5,   'h', null],
      [0.25,  0.375, 0.25,  0xCC6677, -0.19, 0.1875, -0.33, 'l', 'pigLeg'],
      [0.25,  0.375, 0.25,  0xCC6677,  0.19, 0.1875, -0.33, 'l', 'pigLeg'],
      [0.25,  0.375, 0.25,  0xCC6677, -0.19, 0.1875,  0.33, 'l', 'pigLeg'],
      [0.25,  0.375, 0.25,  0xCC6677,  0.19, 0.1875,  0.33, 'l', 'pigLeg']
    ]
  },

  sheep: {
    h: 1.25, r: 0.42, speed: 1.2, hp: 8,
    headPivot: [0, 0.875, -0.5],
    parts: [
      [0.75,  0.75,  1.0,   0xEEEEEE,  0,    0.875,  0,     '',  'sheepWool'],
      [0.4,   0.5,   0.4,   0x444444,  0,    0.875, -0.7,   'h', 'sheepFace'],
      [0.09,  0.09,  0.02,  0xFFFFFF, -0.1,  0.95,  -0.91,  'h', 'eye'],
      [0.09,  0.09,  0.02,  0xFFFFFF,  0.1,  0.95,  -0.91,  'h', 'eye'],
      [0.25,  0.5,   0.25,  0x333333, -0.2,  0.25,  -0.3,   'l', 'sheepLeg'],
      [0.25,  0.5,   0.25,  0x333333,  0.2,  0.25,  -0.3,   'l', 'sheepLeg'],
      [0.25,  0.5,   0.25,  0x333333, -0.2,  0.25,   0.3,   'l', 'sheepLeg'],
      [0.25,  0.5,   0.25,  0x333333,  0.2,  0.25,   0.3,   'l', 'sheepLeg']
    ]
  },

  cow: {
    h: 1.45, r: 0.45, speed: 1.2, hp: 10,
    headPivot: [0, 1.0625, -0.5],
    parts: [
      [0.75,  0.625, 1.125, 0x664422,  0,    1.0625,  0,     '',  'cowHide'],
      [0.5,   0.5,   0.5,   0x664422,  0,    1.0625, -0.7,   'h', 'cowFace'],
      [0.1,   0.15,  0.1,   0xF0F0D0, -0.15, 1.38,   -0.7,   'h', 'cowHorn'],
      [0.1,   0.15,  0.1,   0xF0F0D0,  0.15, 1.38,   -0.7,   'h', 'cowHorn'],
      [0.09,  0.09,  0.02,  0x000000, -0.15, 1.15,   -0.96,  'h', 'cowEye'],
      [0.09,  0.09,  0.02,  0x000000,  0.15, 1.15,   -0.96,  'h', 'cowEye'],
      [0.25,  0.75,  0.25,  0x442211, -0.25, 0.375,  -0.4,   'l', 'cowLeg'],
      [0.25,  0.75,  0.25,  0x442211,  0.25, 0.375,  -0.4,   'l', 'cowLeg'],
      [0.25,  0.75,  0.25,  0x442211, -0.25, 0.375,   0.4,   'l', 'cowLeg'],
      [0.25,  0.75,  0.25,  0x442211,  0.25, 0.375,   0.4,   'l', 'cowLeg']
    ]
  },

  chicken: {
    h: 0.7, r: 0.22, speed: 2.0, hp: 4,
    headPivot: [0, 0.75, -0.18],
    parts: [
      [0.3,   0.4,   0.4,   0xFFFFFF,  0,    0.45,   0,     '',  'chickenBody'],
      [0.2,   0.3,   0.2,   0xFFFFFF,  0,    0.75,  -0.28,  'h', 'chickenHead'],
      [0.15,  0.1,   0.15,  0xE8A020,  0,    0.7,   -0.45,  'h', 'chickenBeak'],
      [0.1,   0.08,  0.04,  0xCC2222,  0,    0.6,   -0.45,  'h', 'wattle'],
      [0.07,  0.07,  0.02,  0x000000, -0.06, 0.8,   -0.39,  'h', 'eye'],
      [0.07,  0.07,  0.02,  0x000000,  0.06, 0.8,   -0.39,  'h', 'eye'],
      [0.05,  0.25,  0.3,   0xEEEEEE, -0.175, 0.45,  0,     '',  'chickenBody'],
      [0.05,  0.25,  0.3,   0xEEEEEE,  0.175, 0.45,  0,     '',  'chickenBody'],
      [0.08,  0.25,  0.08,  0xE8A020, -0.08, 0.125,  0.05,  'l', 'chickenLeg'],
      [0.08,  0.25,  0.08,  0xE8A020,  0.08, 0.125,  0.05,  'l', 'chickenLeg']
    ]
  }
};

function buildMobMesh(type) {
  const def = MOB_TYPES[type];
  const group = new THREE.Group();
  const legs = [];
  let headGroup = null;

  const hp = def.headPivot;
  if (hp) {
    headGroup = new THREE.Group();
    headGroup.position.set(hp[0], hp[1], hp[2]);
    headGroup.rotation.order = 'YXZ';
    group.add(headGroup);
  }

  for (let i = 0; i < def.parts.length; i++) {
    const p = def.parts[i];
    const w = p[0], h = p[1], d = p[2], color = p[3];
    const x = p[4], y = p[5], z = p[6];
    const tag = p[7] || '';
    const texKey = p[8];

    if (tag === 'l') {
      const pivotY = y + h / 2;
      const pivot = new THREE.Group();
      pivot.position.set(x, pivotY, z);
      const legMesh = makeBox(w, h, d, color, texKey);
      legMesh.position.set(0, -h / 2, 0);
      pivot.add(legMesh);
      group.add(pivot);
      legs.push({
        pivot: pivot,
        dir: (i % 2 === 0) ? 1 : -1,
        front: z < 0
      });
    } else if (tag === 'h' && headGroup) {
      const mesh = makeBox(w, h, d, color, texKey);
      mesh.position.set(x - hp[0], y - hp[1], z - hp[2]);
      headGroup.add(mesh);
    } else {
      const mesh = makeBox(w, h, d, color, texKey);
      mesh.position.set(x, y, z);
      group.add(mesh);
    }
  }

  return { group: group, legs: legs, headGroup: headGroup };
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
    headGroup: built.headGroup,

    headYaw: 0,
    headPitch: 0,
    headBobPhase: Math.random() * Math.PI * 2,
    headLookAtPlayer: false,
    headLookTimer: 1 + Math.random() * 4,
    headGlanceTimer: 0,
    headIdleYaw: 0,
    headIdlePitch: 0,

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
  if (soundsMuted) return;
  if (!playerPos || !window.SFX) return;
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
    if (!soundsMuted && window.SFX && window.SFX.mobDeath) window.SFX.mobDeath(mob.type);
    return true;
  }
  if (!soundsMuted && window.SFX && window.SFX.mobHurt) window.SFX.mobHurt(mob.type);
  return false;
}

function raycastMob(origin, dir, maxDist) {
  let best = null;
  let bestT = maxDist;

  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (m.dead) continue;
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
    if (bx + 1 <= m.pos.x - r) continue;
    if (bx     >= m.pos.x + r) continue;
    if (by + 1 <= m.pos.y)     continue;
    if (by     >= m.pos.y + h) continue;
    if (bz + 1 <= m.pos.z - r) continue;
    if (bz     >= m.pos.z + r) continue;
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

function updateMobVisibility(mob) {
  if (!playerPos) return;
  const dx = mob.pos.x - playerPos.x;
  const dz = mob.pos.z - playerPos.z;
  const limit = renderDistBlocks + VISIBILITY_MARGIN;
  const visible = (dx * dx + dz * dz) <= limit * limit;
  if (mob.hurtTimer > 0) {
    if (!visible) mob.group.visible = false;
  } else {
    mob.group.visible = visible;
  }
}

function animateHead(mob, dt) {
  const hg = mob.headGroup;
  if (!hg) return;

  let targetYaw = 0;
  let targetPitch = 0;

  let playerNearby = false;
  let relYawToPlayer = 0;
  let relPitchToPlayer = 0;

  if (playerPos && !mob.dead) {
    const dx = playerPos.x - mob.pos.x;
    const dz = playerPos.z - mob.pos.z;
    const distSq = dx * dx + dz * dz;

    if (distSq < HEAD_LOOK_RANGE_SQ && distSq > 0.25) {
      playerNearby = true;
      const distXZ = Math.sqrt(distSq);
      const playerEyeY = playerPos.y + 1.62;
      const headWorldY = mob.pos.y + mob.def.headPivot[1];
      const dy = playerEyeY - headWorldY;

      const desiredWorldYaw = Math.atan2(-dx, -dz);
      let relYaw = desiredWorldYaw - mob.yaw;
      while (relYaw >  Math.PI) relYaw -= Math.PI * 2;
      while (relYaw < -Math.PI) relYaw += Math.PI * 2;
      if (relYaw >  HEAD_MAX_YAW) relYaw =  HEAD_MAX_YAW;
      if (relYaw < -HEAD_MAX_YAW) relYaw = -HEAD_MAX_YAW;
      relYawToPlayer = relYaw;

      let relPitch = -Math.atan2(dy, distXZ);
      if (relPitch >  HEAD_MAX_PITCH) relPitch =  HEAD_MAX_PITCH;
      if (relPitch < -HEAD_MAX_PITCH) relPitch = -HEAD_MAX_PITCH;
      relPitchToPlayer = relPitch;
    }
  }

  if (mob.panicTimer > 0) {
    mob.headLookAtPlayer = false;
    targetYaw = 0;
    targetPitch = 0;
  } else if (mob.headLookAtPlayer) {
    mob.headGlanceTimer -= dt;
    if (!playerNearby || mob.headGlanceTimer <= 0) {
      mob.headLookAtPlayer = false;
      mob.headLookTimer = 2 + Math.random() * 5;
      const sign = Math.random() < 0.5 ? -1 : 1;
      mob.headIdleYaw = sign * (0.15 + Math.random() * 0.55);
      if (mob.headIdleYaw >  HEAD_MAX_YAW) mob.headIdleYaw =  HEAD_MAX_YAW;
      if (mob.headIdleYaw < -HEAD_MAX_YAW) mob.headIdleYaw = -HEAD_MAX_YAW;
      mob.headIdlePitch = (Math.random() - 0.5) * 0.35;
    } else {
      targetYaw = relYawToPlayer;
      targetPitch = relPitchToPlayer;
    }
  } else {
    mob.headLookTimer -= dt;
    if (mob.headLookTimer <= 0) {
      if (playerNearby && Math.random() < 0.45) {
        mob.headLookAtPlayer = true;
        mob.headGlanceTimer = 1.2 + Math.random() * 2.5;
        targetYaw = relYawToPlayer;
        targetPitch = relPitchToPlayer;
      } else {
        mob.headLookTimer = 2 + Math.random() * 5;
        const sign = Math.random() < 0.5 ? -1 : 1;
        mob.headIdleYaw = sign * (0.15 + Math.random() * 0.55);
        if (mob.headIdleYaw >  HEAD_MAX_YAW) mob.headIdleYaw =  HEAD_MAX_YAW;
        if (mob.headIdleYaw < -HEAD_MAX_YAW) mob.headIdleYaw = -HEAD_MAX_YAW;
        mob.headIdlePitch = (Math.random() - 0.5) * 0.35;
        targetYaw = mob.headIdleYaw;
        targetPitch = mob.headIdlePitch;
      }
    } else {
      targetYaw = mob.headIdleYaw;
      targetPitch = mob.headIdlePitch;
    }
  }

  const k = Math.min(1, HEAD_SMOOTH * dt);
  mob.headYaw   += (targetYaw   - mob.headYaw)   * k;
  mob.headPitch += (targetPitch - mob.headPitch) * k;

  let bobY = 0;
  let sway = 0;
  if (mob.walking && mob.onGround && mob.panicTimer <= 0) {
    const ph = mob.walkPhase + mob.headBobPhase;
    bobY = Math.sin(ph * 2) * HEAD_BOB_Y;
    sway = Math.sin(ph) * HEAD_SWAY;
  }

  hg.position.y = mob.def.headPivot[1] + bobY;
  hg.rotation.y = mob.headYaw;
  hg.rotation.x = mob.headPitch;
  hg.rotation.z = sway;
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
        if (d2 < 36) mob.targetYaw = Math.atan2(-dx, -dz);
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

  const friction = Math.max(0, 1 - 4 * dt);
  mob.vel.x *= friction;
  mob.vel.z *= friction;
  const totalVx = vx + mob.vel.x;
  const totalVz = vz + mob.vel.z;

  mobMove(mob, totalVx * dt, mob.vel.y * dt, totalVz * dt);

  mob.onGround = mobCollides(mob.pos.x, mob.pos.y - 0.05, mob.pos.z, def.r, def.h);
  if (mob.onGround && mob.vel.y < 0) mob.vel.y = 0;

  if (mob.walking && mob.onGround && mob.panicTimer <= 0) {
    const mdx = mob.pos.x - mob.lastX;
    const mdz = mob.pos.z - mob.lastZ;
    const movedSq = mdx * mdx + mdz * mdz;
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

  if (!mob.onGround) {
    const rising = mob.vel.y > 0;
    const frontPose = rising ? -JUMP_LEG_POSE : -JUMP_LEG_POSE * 0.4;
    const backPose  = rising ?  JUMP_LEG_POSE :  JUMP_LEG_POSE * 0.4;
    for (let i = 0; i < mob.legs.length; i++) {
      const leg = mob.legs[i];
      const target = leg.front ? frontPose : backPose;
      leg.pivot.rotation.x += (target - leg.pivot.rotation.x) * Math.min(1, 10 * dt);
    }
  } else if (mob.walking) {
    const swing = Math.sin(mob.walkPhase) * LEG_SWING;
    for (let i = 0; i < mob.legs.length; i++) {
      const leg = mob.legs[i];
      leg.pivot.rotation.x = swing * leg.dir;
    }
  } else {
    const k = Math.min(1, 8 * dt);
    for (let i = 0; i < mob.legs.length; i++) {
      const leg = mob.legs[i];
      leg.pivot.rotation.x += (0 - leg.pivot.rotation.x) * k;
    }
  }

  if (mob.walking && mob.onGround) {
    mob.walkPhase += dt * 8 * speedMult;
  } else {
    mob.walkPhase *= 0.85;
  }

  mob.group.position.copy(mob.pos);
  mob.group.rotation.y = mob.yaw;

  animateHead(mob, dt);

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

function init(sc) { scene = sc; }

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

function raycast(origin, dir, maxDist) { return raycastMob(origin, dir, maxDist); }
function hit(mob, damage, fromX, fromZ) { return hitMob(mob, damage, fromX, fromZ); }

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
  isBlockOccupied: isBlockOccupied,
  setMuted: setMuted
};

})();