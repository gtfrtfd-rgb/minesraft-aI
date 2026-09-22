/* ============================================================
   sounds.js — процедурные звуки на Web Audio API (без файлов)
   Публичный объект:
     window.SFX = {
       resume, break, place, step, jump, select,
       flyOn, flyOff, hurt, death,
       pig, sheep, cow, chicken,
       mobHurt, mobDeath
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

function sndHurt() {
  playTone({ type: 'square',   f0: 260, f1: 110, duration: 0.14, gain: 0.16 });
  playTone({ type: 'triangle', f0: 200, f1: 90,  duration: 0.16, gain: 0.10, when: 0.005 });
  playNoise({ duration: 0.09, decay: 4.5, filterType: 'bandpass', freq: 800, freqEnd: 300, Q: 1.5, gain: 0.18 });
  playNoise({ duration: 0.04, decay: 6.0, filterType: 'highpass', freq: 2400, gain: 0.05, when: 0.004 });
}

function sndDeath() {
  playTone({ type: 'square',   f0: 220, f1: 55,  duration: 0.75, gain: 0.14 });
  playTone({ type: 'triangle', f0: 180, f1: 45,  duration: 0.85, gain: 0.10, when: 0.02 });
  playTone({ type: 'sine',     f0: 110, f1: 40,  duration: 1.0,  gain: 0.07, when: 0.05 });
  playNoise({ duration: 0.9, decay: 1.6, filterType: 'lowpass', freq: 1200, freqEnd: 200, gain: 0.16, when: 0.02 });
  playNoise({ duration: 0.10, decay: 5, filterType: 'highpass', freq: 3200, gain: 0.08 });
}

/* ---------- обычные звуки мобов ---------- */
function sndPig() {
  const p = 0.9 + Math.random() * 0.2;
  playTone({ type: 'sawtooth', f0: 220 * p, f1: 150 * p, duration: 0.12, gain: 0.10 });
  playTone({ type: 'sawtooth', f0: 240 * p, f1: 160 * p, duration: 0.10, gain: 0.08, when: 0.14 });
  playNoise({ duration: 0.18, decay: 3, filterType: 'bandpass', freq: 550, Q: 1.4, gain: 0.06 });
}

function sndSheep() {
  const c = getCtx(); if (!c) return;
  const p = 0.9 + Math.random() * 0.15;
  const t0 = c.currentTime;
  const dur = 0.55;

  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(380 * p, t0);
  osc.frequency.linearRampToValueAtTime(320 * p, t0 + dur);

  const lfo = c.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 16 + Math.random() * 4;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 22;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  const filt = c.createBiquadFilter();
  filt.type = 'bandpass';
  filt.Q.value = 1.2;
  filt.frequency.value = 1800;

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.10, t0 + 0.03);
  g.gain.setValueAtTime(0.10, t0 + dur - 0.18);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(filt).connect(g).connect(c.destination);
  osc.start(t0);
  lfo.start(t0);
  osc.stop(t0 + dur + 0.05);
  lfo.stop(t0 + dur + 0.05);
}

function sndCow() {
  const c = getCtx(); if (!c) return;
  const p = 0.9 + Math.random() * 0.15;
  const t0 = c.currentTime;
  const dur = 0.75;

  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(160 * p, t0);
  osc.frequency.linearRampToValueAtTime(115 * p, t0 + dur);

  const lfo = c.createOscillator();
  lfo.frequency.value = 6;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 10;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  const filt = c.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 900;

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.11, t0 + 0.05);
  g.gain.setValueAtTime(0.11, t0 + dur - 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(filt).connect(g).connect(c.destination);
  osc.start(t0);
  lfo.start(t0);
  osc.stop(t0 + dur + 0.05);
  lfo.stop(t0 + dur + 0.05);
}

function sndChicken() {
  const p = 0.95 + Math.random() * 0.15;
  playTone({ type: 'square', f0: 1000 * p, f1: 600 * p, duration: 0.05, gain: 0.07 });
  playTone({ type: 'square', f0: 1200 * p, f1: 700 * p, duration: 0.06, gain: 0.06, when: 0.13 });
  playNoise({ duration: 0.03, decay: 6, filterType: 'highpass', freq: 3000, gain: 0.03 });
}

/* ---------- звуки боли мобов (короткие, с искажением) ---------- */
function sndMobHurt(type) {
  const p = 0.9 + Math.random() * 0.2;
  if (type === 'pig') {
    playTone({ type: 'sawtooth', f0: 200 * p, f1: 110 * p, duration: 0.14, gain: 0.13 });
    playNoise({ duration: 0.10, decay: 4, filterType: 'bandpass', freq: 700, Q: 1.4, gain: 0.06 });
    return;
  }
  if (type === 'sheep') {
    playTone({ type: 'sawtooth', f0: 380 * p, f1: 500 * p, duration: 0.16, gain: 0.11 });
    playNoise({ duration: 0.06, decay: 5, filterType: 'highpass', freq: 1800, gain: 0.04 });
    return;
  }
  if (type === 'cow') {
    playTone({ type: 'sawtooth', f0: 150 * p, f1: 95 * p, duration: 0.22, gain: 0.13 });
    playNoise({ duration: 0.08, decay: 4, filterType: 'lowpass', freq: 900, gain: 0.05 });
    return;
  }
  if (type === 'chicken') {
    playTone({ type: 'square', f0: 1400 * p, f1: 850 * p, duration: 0.09, gain: 0.09 });
    playTone({ type: 'square', f0: 1200 * p, f1: 780 * p, duration: 0.07, gain: 0.06, when: 0.08 });
    playNoise({ duration: 0.04, decay: 5, filterType: 'highpass', freq: 2800, gain: 0.035 });
    return;
  }
}

/* ---------- звуки смерти мобов (ниже, длиннее, мрачнее) ---------- */
function sndMobDeath(type) {
  const p = 0.9 + Math.random() * 0.15;
  if (type === 'pig') {
    playTone({ type: 'sawtooth', f0: 200 * p, f1: 65, duration: 0.55, gain: 0.14 });
    playNoise({ duration: 0.5, decay: 2.0, filterType: 'bandpass', freq: 500, freqEnd: 180, Q: 1.2, gain: 0.08 });
    return;
  }
  if (type === 'sheep') {
    playTone({ type: 'sawtooth', f0: 400 * p, f1: 140, duration: 0.65, gain: 0.13 });
    playNoise({ duration: 0.6, decay: 1.8, filterType: 'bandpass', freq: 1400, freqEnd: 350, Q: 1.2, gain: 0.07 });
    return;
  }
  if (type === 'cow') {
    playTone({ type: 'sawtooth', f0: 150 * p, f1: 55, duration: 0.85, gain: 0.14 });
    playNoise({ duration: 0.8, decay: 1.5, filterType: 'lowpass', freq: 800, freqEnd: 200, gain: 0.10 });
    return;
  }
  if (type === 'chicken') {
    playTone({ type: 'square', f0: 1300 * p, f1: 350, duration: 0.35, gain: 0.10 });
    playNoise({ duration: 0.3, decay: 2.2, filterType: 'highpass', freq: 2400, gain: 0.05 });
    return;
  }
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
  death:  sndDeath,
  pig:    sndPig,
  sheep:  sndSheep,
  cow:    sndCow,
  chicken: sndChicken,
  mobHurt: sndMobHurt,
  mobDeath: sndMobDeath
};

})();