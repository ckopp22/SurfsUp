import { getSettings } from './storage.js';
import { WORLD_CONFIG } from './world.js';

// All wave tuning lives here. Ranges are [min, max].
// The wave is one crest along the whole break, always peeling left to right.
export const WAVE_CONFIG = {
  waveSpeed: 60,           // px/s the swell approaches the break line (the wave then holds its line while it peels)
  waveSpeedVariance: 6,    // +/- px/s random per wave
  peelSpeed: [70, 120],    // px/s the pocket travels along the crest
  // The break line is set by WORLD_CONFIG (breakTopFrac, breakShoreGap, rideDistance).
  spawnDelay: { compete: [6, 9], fun: [4, 6] },     // s between waves; counts only while the break line is free
  firstDelay: { compete: [2.5, 4], fun: [1.5, 3] }, // s until the first wave of a run
  maxWaves: 2,             // simultaneous waves (debug spawn ignores this)
  swellTime: 3,            // s in SWELL (faint warning)
  buildTime: 2.5,          // s in BUILDING (crest + pocket form); the swell arrives on the break line as this ends
  closeTime: 2,            // s in CLOSING (collapse into foam and fade)
  pocketMinY: 20,          // px: pocket must be this far down the screen before BREAKING
  pocketFadeRate: 1.5,     // 1/s: pocket burst shrink once the wave closes
  washRange: 600,          // px of break before the beach end where the shore wash starts to build
};

export const WaveState = { SWELL: 'SWELL', BUILDING: 'BUILDING', BREAKING: 'BREAKING', CLOSING: 'CLOSING', DEAD: 'DEAD' };

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (r) => rand(r[0], r[1]);

function currentMode() {
  return getSettings().mode === 'fun' ? 'fun' : 'compete';
}

// field: { shoreY, breakY0, breakY1 } break line height at x = 0 and at x = rideDistance.
function createWave(field) {
  const C = WAVE_CONFIG;
  const W = WORLD_CONFIG.rideDistance;
  const L = Math.hypot(W, field.breakY1 - field.breakY0);
  const px = W / L;                          // unit vector along the crest, left to right
  const py = (field.breakY1 - field.breakY0) / L;
  const speed = C.waveSpeed + rand(-C.waveSpeedVariance, C.waveSpeedVariance);
  const approach = speed * (C.swellTime + C.buildTime);
  const baseCy = (field.breakY0 + field.breakY1) / 2;

  return {
    state: WaveState.SWELL,
    stateT: 0,
    age: 0,
    cx: W / 2,
    cy: baseCy - approach, // starts above the screen, settles on baseCy
    baseCy, approach,
    L, px, py,
    nx: py, ny: -px,       // unit normal toward open ocean (up the screen)
    speed,
    peelSpeed: pick(C.peelSpeed),
    s: 0,                  // pocket distance along the crest from the take-off end
    pocketDone: false,     // pocket has reached the beach end
    pocketScale: 0,        // 0..1 visual size of the pocket burst
    swellAlpha: 0,         // 0..1 fade-in of the warning band
    build: 0,              // 0..1 how defined the crest/face are
    flat: 0,               // 0..1 closing progress
    fade: 1,               // 1..0 overall opacity while closing
    isRideable: false,
    hint: 0,               // 0..1 catchable glow (set by the catch logic)
    locked: false,         // true while a surfer is riding it: it can't be removed
    ridden: false,         // has been caught once; can't be caught again
    phase: Math.random() * 6.28,
  };
}

function updateWave(w, dt) {
  const C = WAVE_CONFIG;
  w.age += dt;
  w.stateT += dt;
  w.cy = Math.min(w.baseCy, w.baseCy - w.approach + w.speed * w.age);
  const settled = w.cy >= w.baseCy;

  switch (w.state) {
    case WaveState.SWELL:
      w.swellAlpha = Math.min(1, w.stateT);
      if (w.stateT >= C.swellTime) { w.state = WaveState.BUILDING; w.stateT = 0; }
      break;
    case WaveState.BUILDING:
      w.swellAlpha = 1;
      w.build = Math.min(1, w.stateT / C.buildTime);
      w.pocketScale = w.build;
      if (w.build >= 1 && settled && w.cy - (w.py * w.L) / 2 > C.pocketMinY) { w.state = WaveState.BREAKING; w.stateT = 0; }
      break;
    case WaveState.BREAKING:
      w.s += w.peelSpeed * dt;
      if (w.s >= w.L) {
        w.s = w.L;
        w.pocketDone = true;
        w.state = WaveState.CLOSING; // pocket reached the beach: the whole wave collapses
        w.stateT = 0;
      }
      break;
    case WaveState.CLOSING:
      w.flat = Math.min(1, w.stateT / C.closeTime);
      w.fade = 1 - w.flat;
      w.pocketScale = Math.max(0, w.pocketScale - C.pocketFadeRate * dt);
      if (w.flat >= 1) w.state = WaveState.DEAD;
      break;
    default:
  }
  w.isRideable = w.state === WaveState.BREAKING;
}

// Pocket world position and velocity (wave motion + peel motion). Pass an object to avoid allocating.
// The wave's own motion only exists while the swell is still approaching the break line.
export function getPocket(w, out = {}) {
  out.x = w.cx - (w.px * w.L) / 2 + w.px * w.s;
  out.y = w.cy - (w.py * w.L) / 2 + w.py * w.s;
  const peeling = w.state === WaveState.BREAKING;
  const approaching = w.cy < w.baseCy;
  out.vx = peeling ? w.px * w.peelSpeed : 0;
  out.vy = (approaching ? w.speed : 0) + (peeling ? w.py * w.peelSpeed : 0);
  return out;
}

export function createWaveManager() {
  const m = {
    waves: [],
    timer: 0,
    wash: 0, // 0..1 shoreline foam intensity as a pocket nears the beach

    reset() {
      m.waves.length = 0;
      m.timer = pick(WAVE_CONFIG.firstDelay[currentMode()]);
      m.wash = 0;
    },

    spawn(field) {
      m.waves.push(createWave(field));
    },

    // The break line is busy while any wave is approaching or peeling along it.
    lineBusy() {
      for (const w of m.waves) {
        if (w.state !== WaveState.CLOSING && w.state !== WaveState.DEAD) return true;
      }
      return false;
    },

    update(dt, field) {
      const C = WAVE_CONFIG;
      if (!m.lineBusy()) m.timer -= dt;
      if (m.timer <= 0 && m.waves.length < C.maxWaves && !m.lineBusy()) {
        m.spawn(field);
        m.timer = pick(C.spawnDelay[currentMode()]);
      }

      let wash = 0;
      const W = WORLD_CONFIG.rideDistance;
      for (let i = m.waves.length - 1; i >= 0; i--) {
        const w = m.waves[i];
        updateWave(w, dt);
        if (w.state === WaveState.DEAD && !w.locked) {
          m.waves[i] = m.waves[m.waves.length - 1];
          m.waves.pop();
          continue;
        }
        const pocketX = w.px * w.s;
        const reach = w.state === WaveState.CLOSING
          ? w.fade
          : Math.max(0, 1 - (W - pocketX) / C.washRange);
        if (reach > wash) wash = reach;
      }
      m.wash = wash;
    },

    // Debug/query helper: rideable wave whose pocket is closest to (x, y).
    getNearestRideable(x, y) {
      let best = null;
      let bestD = Infinity;
      for (const w of m.waves) {
        if (!w.isRideable) continue;
        const px = w.cx - (w.px * w.L) / 2 + w.px * w.s;
        const py = w.cy - (w.py * w.L) / 2 + w.py * w.s;
        const d = (px - x) * (px - x) + (py - y) * (py - y);
        if (d < bestD) { bestD = d; best = w; }
      }
      return best;
    },
  };
  return m;
}
