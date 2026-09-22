/* ============================================================
   test/smoke.test.js — быстрые проверки целостности проекта.
   Запуск:  npm test
   ============================================================ */
'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('node:fs');
const path     = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const STATIC_FILES = [
  'index.html',
  'style.css',
  'game.js',
  'world.js',
  'mobs.js',
  'sounds.js'
];

test('все файлы проекта на месте', () => {
  for (const f of STATIC_FILES) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `не найден ${f}`);
  }
});

test('index.html подключает все игровые скрипты', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const f of ['world.js', 'sounds.js', 'mobs.js', 'game.js']) {
    assert.ok(html.includes(f), `index.html не подключает ${f}`);
  }
  assert.ok(
    html.includes('three.js') || html.includes('three.min.js'),
    'index.html не подключает three.js'
  );
});

test('world.js экспортирует публичный API MC', () => {
  const src = fs.readFileSync(path.join(ROOT, 'world.js'), 'utf8');
  for (const key of [
    'SX', 'SZ', 'SY', 'CHX', 'CHZ',
    'world', 'IDX', 'BLOCKS',
    'generateWorld', 'buildChunk', 'buildAllChunks',
    'isSolid', 'highestAt', 'rebuildAround'
  ]) {
    assert.ok(src.includes(`MC.${key}`), `world.js не экспортирует MC.${key}`);
  }
});

test('mobs.js возвращает объект window.MOBS', () => {
  const src = fs.readFileSync(path.join(ROOT, 'mobs.js'), 'utf8');
  assert.ok(src.includes('window.MOBS'), 'mobs.js не создаёт window.MOBS');
  for (const m of ['raycast', 'hit', 'spawnInitial', 'update']) {
    assert.ok(src.includes(m + ':'), `MOBS не содержит ${m}`);
  }
});

test('sounds.js возвращает объект window.SFX', () => {
  const src = fs.readFileSync(path.join(ROOT, 'sounds.js'), 'utf8');
  assert.ok(src.includes('window.SFX'), 'sounds.js не создаёт window.SFX');
  for (const m of ['break', 'place', 'step', 'hurt', 'death']) {
    assert.ok(src.includes(m + ':'), `SFX не содержит ${m}`);
  }
});

test('server.js синтаксически корректен', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  // require компилирует модуль — синтаксическая ошибка бросит исключение
  assert.doesNotThrow(() => {
    // eslint-disable-next-line no-new-func
    new Function('require', 'module', 'exports', '__dirname', src);
  });
});

test('game.js содержит базовые константы мира', () => {
  const src = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
  assert.ok(src.includes('window.MC'), 'game.js не использует window.MC');
  assert.ok(/const\s+HOTBAR\s*=/.test(src), 'game.js не объявляет HOTBAR');
  assert.ok(/MAX_HP/.test(src), 'game.js не объявляет MAX_HP');
});