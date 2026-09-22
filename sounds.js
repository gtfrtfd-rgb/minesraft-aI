/* ============================================================
   sounds.js — процедурные звуки на Web Audio API (без файлов)
   Профили: grass / dirt / sand / stone / wood / glass / snow
   Публичный объект:
     window.SFX = {
       resume, break, place, step, jump, select,
       flyOn, flyOff, hurt, death
     }
   ============================================================ */
window.SFX = (function () {
'use strict';

let ctx = null;
function getCtx() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { console.warn('[sounds.js] нет AudioContext', e); return null; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noiseBuffer(seconds, decay) {
  const c = getCtx(); if (!c) return null;
  const len = Math.max(1, Math.floor(c.sampleRate * seconds));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / len;
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
  }
  return buf;
}

function playNoise(o) {
  const c = getCtx(); if (!c) return;
  const duration = o.duration != null ? o.duration : 0.15;
  const decay    = o.decay    != null ? o.decay    : 2.5;
  const gain     = o.gain     != null ? o.gain     : 0.2;
  const attack   = o.attack   != null ? o.attack   : 0.003;
  const when     = o.when     != null ? o.when     : 0;

  const buf = noiseBuffer(duration, decay); if (!buf) return;
  const src = c.createBufferSource();
  src.buffer = buf;

  const filt = c.createBiquadFilter();
  filt.type = o.filterType || 'lowpass';
  filt.Q.value = o.Q != null ? o.Q : 1;
  const t0 = c.currentTime + when;
  const f0 = o.freq != null ? o.freq : 1000;
  filt.frequency.setValueAtTime(f0, t0);
  if (o.freqEnd != null) {
    filt.frequency.exponentialRampToValueAtTime(Math.max(40, o.freqEnd), t0 + duration);
  }

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  src.connect(filt).connect(g).connect(c.destination);
  src.start(t0);
  src.stop(t0 + duration + 0.03);
}

function playTone(o) {
  const c = getCtx(); if (!c) return;
  const duration = o.duration != null ? o.duration : 0.1;
  const gain     = o.gain     != null ? o.gain     : 0.15;
  const attack   = o.attack   != null ? o.attack   : 0.005;
  const when     = o.when     != null ? o.when     : 0;

  const osc = c.createOscillator();
  osc.type = o.type || 'sine';
  const t0 = c.currentTime + when;
  const f0 = o.f0 != null ? o.f0 : 440;
  osc.frequency.setValueAtTime(f0, t0);
  if (o.f1 != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + duration);
  }

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.03);
}

function matName(id) {
  switch (id) {
    case 1: case 7:  return 'grass';
    case 2:          return 'dirt';
    case 5:          return 'sand';
    case 3: case 4: case 9: case 12: return 'stone';
    case 6: case 8:  return 'wood';
    case 10:         return 'glass';
    case 11:         return 'snow';
    default:         return 'stone';
  }
}

function sndBreak(id) {
  const m = matName(id);
  if (m === 'grass') {
    playNoise({ duration: 0.18, decay: 2.8, filterType: 'bandpass', freq: 2400, freqEnd: 900, Q: 1.2, gain: 0.22 });
    playNoise({ duration: 0.26, decay: 2.0, filterType: 'highpass', freq: 3200, gain: 0.05, when: 0.01 });
    return;
  }
  if (m === 'dirt') {
    playNoise({ duration: 0.15, decay: 3.0, filterType: 'lowpass', freq: 950, freqEnd: 300, gain: 0.24 });
    playTone({ type: 'sine', f0: 140, f1: 80, duration: 0.06, gain: 0.05 });
    return;
  }
  if (m === 'sand') {
    playNoise({ duration: 0.22, decay: 1.6, filterType: 'highpass', freq: 2000, gain: 0.14 });
    playNoise({ duration: 0.15, decay: 2.0, filterType: 'bandpass', freq: 800, Q: 1.5, gain: 0.09 });
    return;
  }
  if (m === 'stone') {
    playNoise({ duration: 0.12, decay: 4, filterType: 'bandpass', freq: 1500, freqEnd: 500, Q: 2, gain: 0.28 });
    playNoise({ duration: 0.06, decay: 5, filterType: 'highpass', freq: 2500, gain: 0.08, when: 0.005 });
    playTone({ type: 'square', f0: 130, f1: 60, duration: 0.08, gain: 0.07 });
    return;
  }
  if (m === 'wood') {
    playNoise({ duration: 0.14, decay: 3, filterType: 'bandpass', freq: 1100, Q: 1.6, gain: 0.22 });
    playTone({ type: 'triangle', f0: 240, f1: 110, duration: 0.10, gain: 0.11 });
    playTone({ type: 'square',   f0: 480, f1: 220, duration: 0.05, gain: 0.04, when: 0.01 });
    return;
  }
  if (m === 'glass') {
    for (let i = 0; i < 6; i++) {
      playTone({
        type: 'triangle',
        f0: 2400 + Math.random() * 1800,
        f1: 1700 + Math.random() * 400,
        duration: 0.05 + Math.random() * 0.05,
        gain: 0.055,
        when: i * 0.022
      });
    }
    playNoise({ duration: 0.22, decay: 2.0, filterType: 'highpass', freq: 2800, gain: 0.13 });
    return;
  }
  if (m === 'snow') {
    playNoise({ duration: 0.16, decay: 2.5, filterType: 'lowpass', freq: 1700, freqEnd: 500, gain: 0.16 });
    return;
  }
}

function sndPlace(id) {
  const m = matName(id);
  const p = 0.94 + Math.random() * 0.12;
  if (m === 'glass') {
    playTone({ type: 'triangle', f0: 1800 * p, f1: 1650, duration: 0.05, gain: 0.12 });
    playNoise({ duration: 0.06, decay: 3, filterType: 'highpass', freq: 3200, gain: 0.06 });
    return;
  }
  if (m === 'grass') {
    playNoise({ duration: 0.10, decay: 3, filterType: 'bandpass', freq: 1700 * p, Q: 1.2, gain: 0.15 });
    return;
  }
  if (m === 'sand') {
    playNoise({ duration: 0.13, decay: 2.2, filterType: 'bandpass', freq: 1000 * p, Q: 1.3, gain: 0.13 });
    return;
  }
  if (m === 'wood') {
    playTone({ type: 'triangle', f0: 320 * p, f1: 180, duration: 0.08, gain: 0.14 });
    playNoise({ duration: 0.06, decay: 4, filterType: 'bandpass', freq: 950, Q: 2, gain: 0.10 });
    return;
  }
  playTone({ type: 'square', f0: 190 * p, f1: 90, duration: 0.05, gain: 0.10 });
  playNoise({ duration: 0.06, decay: 4, filterType: 'bandpass', freq: 1400 * p, Q: 2, gain: 0.15 });
}

function sndStep(id, sprinting) {
  const m = matName(id);
  const mult = sprinting ? 1.35 : 1.0;
  const jit  = 0.85 + Math.random() * 0.30;
  const sign = Math.random() < 0.5 ? -1 : 1;

  if (m === 'grass') {
    playNoise({ duration: 0.09, decay: 3.2, filterType: 'bandpass', freq: (780 + sign * 80) * jit, Q: 1.1, gain: 0.13 * mult });
    playNoise({ duration: 0.06, decay: 4.0, filterType: 'highpass', freq: 2200 * jit, gain: 0.045 * mult, when: 0.005 });
    return;
  }
  if (m === 'dirt') {
    playNoise({ duration: 0.09, decay: 3.4, filterType: 'lowpass', freq: (700 + sign * 70) * jit, freqEnd: 260, gain: 0.15 * mult });
    playTone({ type: 'sine', f0: 120, f1: 70, duration: 0.05, gain: 0.035 * mult });
    return;
  }
  if (m === 'sand') {
    playNoise({ duration: 0.10, decay: 2.6, filterType: 'highpass', freq: (2000 + sign * 150) * jit, gain: 0.11 * mult });
    playNoise({ duration: 0.07, decay: 3.2, filterType: 'bandpass', freq: 900 * jit, Q: 1.4, gain: 0.06 * mult });
    return;
  }
  if (m === 'stone') {
    playNoise({ duration: 0.06, decay: 4.5, filterType: 'bandpass', freq: (1300 + sign * 130) * jit, Q: 2.2, gain: 0.15 * mult });
    playTone({ type: 'square', f0: 130 * jit, f1: 70, duration: 0.045, gain: 0.075 * mult });
    playNoise({ duration: 0.03, decay: 5, filterType: 'highpass', freq: 2800, gain: 0.035 * mult, when: 0.003 });
    return;
  }
  if (m === 'wood') {
    playTone({ type: 'triangle', f0: 190 * jit, f1: 100, duration: 0.07, gain: 0.11 * mult });
    playNoise({ duration: 0.06, decay: 4, filterType: 'bandpass', freq: (900 + sign * 100) * jit, Q: 2, gain: 0.11 * mult });
    return;
  }
  if (m === 'snow') {
    playNoise({ duration: 0.10, decay: 3.0, filterType: 'lowpass', freq: 1500 * jit, freqEnd: 550, gain: 0.13 * mult });
    playNoise({ duration: 0.06, decay: 3.5, filterType: 'bandpass', freq: 500 * jit, Q: 1.2, gain: 0.05 * mult, when: 0.005 });
    return;
  }
  playNoise({ duration: 0.08, decay: 3.5, filterType: 'bandpass', freq: (620 + sign * 60) * jit, Q: 1.2, gain: 0.13 * mult });
}

function sndJump() {
  playTone({ type: 'sine', f0: 280, f1: 520, duration: 0.10, gain: 0.09 });
  playNoise({ duration: 0.05, decay: 4, filterType: 'lowpass', freq: 900, gain: 0.045 });
}

function sndSelect() {
  playTone({ type: 'square', f0: 1000, f1: 1400, duration: 0.04, gain: 0.05 });
}

function sndFlyOn() {
  playNoise({ duration: 0.35, decay: 1.8, filterType: 'bandpass', freq: 300, freqEnd: 1400, Q: 1.4, gain: 0.13 });
  playTone({ type: 'sine', f0: 220, f1: 660, duration: 0.30, gain: 0.06, when: 0.01 });
  playTone({ type: 'triangle', f0: 440, f1: 880, duration: 0.22, gain: 0.035, when: 0.05 });
}

function sndFlyOff() {
  playNoise({ duration: 0.30, decay: 2.2, filterType: 'bandpass', freq: 1400, freqEnd: 320, Q: 1.4, gain: 0.12 });
  playTone({ type: 'sine', f0: 620, f1: 200, duration: 0.26, gain: 0.06 });
  playTone({ type: 'square', f0: 110, f1: 60, duration: 0.09, gain: 0.05, when: 0.20 });
  playNoise({ duration: 0.10, decay: 3, filterType: 'lowpass', freq: 900, freqEnd: 400, gain: 0.07, when: 0.20 });
}

/* ---------- УРОН: отрывистый "удар" с понижением высоты ----------
   Классический "ух" из Minecraft — низкий короткий возглас
   + резкий шумовой щелчок сверху.
   --------------------------------------------------------------- */
function sndHurt() {
  // низкий тон, падающий вниз — «ой»
  playTone({ type: 'square',   f0: 260, f1: 110, duration: 0.14, gain: 0.16 });
  playTone({ type: 'triangle', f0: 200, f1: 90,  duration: 0.16, gain: 0.10, when: 0.005 });

  // короткий шумовой «удар» — слышно как толчок
  playNoise({ duration: 0.09, decay: 4.5, filterType: 'bandpass', freq: 800, freqEnd: 300, Q: 1.5, gain: 0.18 });
  playNoise({ duration: 0.04, decay: 6.0, filterType: 'highpass', freq: 2400, gain: 0.05, when: 0.004 });
}

/* ---------- СМЕРТЬ: нисходящий "стон" + длинный шумовой распад ---------- */
function sndDeath() {
  // «прощальный» длинный тон
  playTone({ type: 'square',   f0: 220, f1: 55,  duration: 0.75, gain: 0.14 });
  playTone({ type: 'triangle', f0: 180, f1: 45,  duration: 0.85, gain: 0.10, when: 0.02 });
  playTone({ type: 'sine',     f0: 110, f1: 40,  duration: 1.0,  gain: 0.07, when: 0.05 });

  // шумовой хвост, растворяющийся в тишине
  playNoise({ duration: 0.9, decay: 1.6, filterType: 'lowpass', freq: 1200, freqEnd: 200, gain: 0.16, when: 0.02 });
  // тонкий высокий «вскрик» в начале, чтобы резко привлечь внимание
  playNoise({ duration: 0.10, decay: 5, filterType: 'highpass', freq: 3200, gain: 0.08 });
}

return {
  resume: getCtx,
  break:  sndBreak,
  place:  sndPlace,
  step:   sndStep,
  jump:   sndJump,
  select: sndSelect,
  flyOn:  sndFlyOn,
  flyOff: sndFlyOff,
  hurt:   sndHurt,
  death:  sndDeath
};

})();