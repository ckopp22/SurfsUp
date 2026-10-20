import { getSettings } from './storage.js';
import { PLAYER_CONFIG } from './player.js';
import { SCORE_CONFIG } from './ride.js';

// Everything that tunes the hazards and how the run gets harder. Ranges are [easy, hard] and blend with difficulty (0..1).
export const HAZARD_CONFIG = {
  rampTime: { compete: 150, fun: 300 }, // s to reach full difficulty
  funDensity: 0.6,        // Fun mode: multiplier on rock density and shark chance
  funGapScale: 1.25,      // Fun mode: wider gaps
  funTimeScale: 1.3,      // Fun mode: more time between rows
  firstDelay: 2.2,        // s of clean water before the first hazards reach the screen
  spawnMargin: 160,       // px beyond the right screen edge where hazards appear
  cullBehind: 240,        // px behind the camera where hazards are removed

  // rock rows: a row of rocks across the face with one guaranteed gap
  gapTime: [2.6, 1.15],   // s of riding between rows (spacing = rider speed x this)
  gapWidth: [260, 112],   // px of clear water in each row (never below the rider plus a safety margin)
  shiftFrac: 0.5,         // how much of the reachable sideways distance consecutive gaps may use
  rockFill: [0.18, 0.7],  // chance of a rock in each free slot of a row
  rockRadius: [16, 26],   // px (smallest, largest) when easy
  rockRadiusHard: 34,     // px largest rock at full difficulty
  rockStep: [60, 110],    // px between rock slots along the row

  // mix of events at each slot (weights); sharks and surfers unlock over time
  mix: { rock: 0.6, shark: [0.18, 0.3], surfer: 0.2 },
  sharkUnlock: 18,        // s
  surferUnlock: 8,        // s
  shark: { speed: [80, 140], drift: -25, radius: 18, length: 64, warnDist: 380 }, // across-face px/s, px/s toward the rider
  surfer: { speedFrac: [0.25, 0.45], weaveAmp: [30, 70], weaveHz: [0.5, 1.0], radius: 15 }, // fraction of rider speed
  slotScale: { rock: 1, shark: 1.15, surfer: 1.3 }, // extra spacing after each kind of event
};

const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const SURFER_COLORS = ['#ff5e7e', '#8be0a4', '#b388ff', '#ffd166'];

export function createHazards() {
  return { list: [], touchList: [], nearList: [], cursor: 0, lastGap: 0, mode: 'compete', time: 0, d: 0, hits: 0 };
}

// rightEdgeX: world x of the hazard spawn line at the start of the run.
export function resetHazards(hz, rightEdgeX, startSpeed, bounds) {
  hz.list.length = 0;
  hz.touchList.length = 0;
  hz.nearList.length = 0;
  hz.mode = getSettings().mode === 'fun' ? 'fun' : 'compete';
  hz.time = 0;
  hz.d = 0;
  hz.hits = 0;
  hz.cursor = rightEdgeX + HAZARD_CONFIG.firstDelay * startSpeed;
  hz.lastGap = (bounds.minY + bounds.maxY) / 2;
}

function spawnRocks(hz, x, y0, y1, fill) {
  const C = HAZARD_CONFIG;
  const rMax = lerp(C.rockRadius[1], C.rockRadiusHard, hz.d);
  let y = y0 + rand(0, 30);
  while (y < y1) {
    const r = rand(C.rockRadius[0], rMax);
    if (y + 2 * r <= y1 && Math.random() < fill) {
      hz.list.push({ kind: 'rock', x: x + rand(-40, 40), y: y + r, vx: 0, vy: 0, r: r * 0.85, size: r, phase: rand(0, 6.28), touched: false });
      y += 2 * r + rand(C.rockStep[0], C.rockStep[1]) * 0.4;
    } else {
      y += rand(C.rockStep[0], C.rockStep[1]);
    }
  }
}

function spawnRow(hz, x, run, bounds) {
  const C = HAZARD_CONFIG;
  const fun = hz.mode === 'fun';
  const gapW = lerp(C.gapWidth[0], C.gapWidth[1], hz.d) * (fun ? C.funGapScale : 1);
  const half = gapW / 2;
  const time = lerp(C.gapTime[0], C.gapTime[1], hz.d) * (fun ? C.funTimeScale : 1);
  // consecutive gaps never move further than the rider can reach in the time between rows
  const shiftMax = C.shiftFrac * run.speed * Math.max(0, time - 0.35);
  const g = clamp(hz.lastGap + rand(-shiftMax, shiftMax), bounds.minY + half, bounds.maxY - half);
  hz.lastGap = g;
  const fill = lerp(C.rockFill[0], C.rockFill[1], hz.d) * (fun ? C.funDensity : 1);
  spawnRocks(hz, x, bounds.minY - 24, g - half, fill);
  spawnRocks(hz, x, g + half, bounds.maxY + 24, fill);
  return run.speed * time * C.slotScale.rock;
}

function spawnShark(hz, x, run, bounds) {
  const C = HAZARD_CONFIG;
  const S = C.shark;
  const dir = Math.random() < 0.5 ? 1 : -1;
  const speed = lerp(S.speed[0], S.speed[1], hz.d) * rand(0.9, 1.1);
  hz.list.push({
    kind: 'shark', x, y: dir > 0 ? bounds.minY + 8 : bounds.maxY - 8, vx: S.drift, vy: dir * speed,
    r: S.radius, size: S.length, phase: rand(0, 6.28), touched: false,
  });
  const time = lerp(C.gapTime[0], C.gapTime[1], hz.d) * (hz.mode === 'fun' ? C.funTimeScale : 1);
  return run.speed * time * C.slotScale.shark;
}

function spawnSurfer(hz, x, run, bounds) {
  const C = HAZARD_CONFIG;
  const S = C.surfer;
  hz.list.push({
    kind: 'surfer', x, y: 0, vx: run.speed * rand(S.speedFrac[0], S.speedFrac[1]), vy: 0, r: S.radius, size: 1,
    baseY: rand(bounds.minY + 50, bounds.maxY - 50), amp: rand(S.weaveAmp[0], S.weaveAmp[1]),
    hz: rand(S.weaveHz[0], S.weaveHz[1]), phase: rand(0, 6.28), t: 0, touched: false,
    color: SURFER_COLORS[Math.floor(Math.random() * SURFER_COLORS.length)],
  });
  const time = lerp(C.gapTime[0], C.gapTime[1], hz.d) * (hz.mode === 'fun' ? C.funTimeScale : 1);
  return run.speed * time * C.slotScale.surfer;
}

// Picks what happens at the next slot and returns the distance to the one after it.
function spawnSlot(hz, x, run, bounds) {
  const C = HAZARD_CONFIG;
  const fun = hz.mode === 'fun';
  const wShark = hz.time >= C.sharkUnlock ? lerp(C.mix.shark[0], C.mix.shark[1], hz.d) * (fun ? C.funDensity : 1) : 0;
  const wSurfer = hz.time >= C.surferUnlock ? C.mix.surfer : 0;
  let pick = Math.random() * (C.mix.rock + wShark + wSurfer);
  if ((pick -= C.mix.rock) < 0) return spawnRow(hz, x, run, bounds);
  if ((pick -= wShark) < 0) return spawnShark(hz, x, run, bounds);
  return spawnSurfer(hz, x, run, bounds);
}

// Debug: drop a row of hazards just off the right edge of the screen.
export function spawnNow(hz, g) {
  const C = HAZARD_CONFIG;
  const x = g.camX + g.w + C.spawnMargin;
  const kind = Math.random();
  if (kind < 0.5) spawnRow(hz, x, g.run, g.bounds);
  else if (kind < 0.8) spawnShark(hz, x, g.run, g.bounds);
  else spawnSurfer(hz, x, g.run, g.bounds);
}

// g: { camX, w, run, player, bounds }. Fills hz.touchList (hazards touched this frame) and hz.nearList (near misses scored this frame).
export function updateHazards(hz, dt, g) {
  const C = HAZARD_CONFIG;
  hz.touchList.length = 0;
  hz.nearList.length = 0;
  hz.time += dt;
  hz.d = clamp(hz.time / C.rampTime[hz.mode], 0, 1);

  while (hz.cursor <= g.camX + g.w + C.spawnMargin) {
    hz.cursor += spawnSlot(hz, hz.cursor, g.run, g.bounds);
  }

  const p = g.player;
  const hitR = PLAYER_CONFIG.hitRadius;
  for (let i = hz.list.length - 1; i >= 0; i--) {
    const h = hz.list[i];
    if (h.kind === 'surfer') {
      h.t += dt;
      h.x += h.vx * dt;
      h.y = clamp(h.baseY + h.amp * Math.sin(h.t * h.hz * 6.2832 + h.phase), g.bounds.minY, g.bounds.maxY);
      h.vy = h.amp * h.hz * 6.2832 * Math.cos(h.t * h.hz * 6.2832 + h.phase);
    } else if (h.kind === 'shark') {
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      if (h.y < g.bounds.minY) { h.y = g.bounds.minY; h.vy = Math.abs(h.vy); }
      if (h.y > g.bounds.maxY) { h.y = g.bounds.maxY; h.vy = -Math.abs(h.vy); }
    }
    if (h.x < g.camX - C.cullBehind) {
      hz.list[i] = hz.list[hz.list.length - 1];
      hz.list.pop();
      continue;
    }
    const dx = h.x - p.x;
    const dy = h.y - p.y;
    const rr = h.r + hitR;
    const gap = Math.sqrt(dx * dx + dy * dy) - rr; // clear space between the rider and the hazard
    if (h.minGap === undefined || gap < h.minGap) h.minGap = gap;
    if (!h.touched && gap < 0) {
      h.touched = true;
      hz.hits++;
      hz.touchList.push(h);
    }
    if (!h.passed && h.x < p.x - rr) {
      h.passed = true;
      if (!h.touched && h.minGap <= SCORE_CONFIG.nearMissDist) hz.nearList.push(h);
    }
  }
}
