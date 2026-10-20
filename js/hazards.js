import { getSettings } from './storage.js';
import { PLAYER_CONFIG } from './player.js';
import { SCORE_CONFIG, faceScale } from './ride.js';

// Everything that tunes the hazards and how the run gets harder. Ranges are [easy, hard] and blend with difficulty (0..1).
// Compete: hazards move (sharks swim, other surfers ride) and every row has a gap.
// Fun: nothing moves; later on whole walls block the face and you must shoot a path through with coconuts.
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
  gapWidth: [260, 112],   // px of clear water in each row on a tall face (scaled down on a short one)
  minGap: 96,             // px: a gap is never narrower than this (the rider plus a safety margin)
  shiftFrac: 0.5,         // how much of the reachable sideways distance consecutive gaps may use
  rockFill: [0.18, 0.7],  // chance of a rock in each free slot of a row
  rockRadius: [16, 26],   // px (smallest, largest) when easy
  rockRadiusHard: 34,     // px largest rock at full difficulty
  rockStep: [60, 110],    // px between rock slots along the row

  // mix of events at each slot (weights); sharks and surfers unlock over time
  mix: { rock: 0.6, shark: [0.18, 0.3], surfer: 0.2 },
  sharkUnlock: 18,        // s
  surferUnlock: 8,        // s
  shark: { speed: [80, 140], drift: -25, radius: 18, length: 64, warnMin: 500, warnTime: 3.2 }, // across-face px/s, px/s toward the rider; heads-up marker shows warnTime seconds ahead (at least warnMin px)
  surfer: { speedFrac: [0.25, 0.45], weaveAmp: [30, 70], weaveHz: [0.5, 1.0], radius: 15 }, // fraction of rider speed
  slotScale: { rock: 1, shark: 1.15, surfer: 1.3, wall: 1.5 }, // extra spacing after each kind of event

  // Fun-mode walls: a full-height barrier built from rocks, sharks and surfers with no gap
  wall: {
    start: 0.15,          // difficulty at which walls begin to appear
    full: 0.85,           // difficulty at which they are as common as they get
    weight: 0.9,          // slot weight of a wall at full frequency (a rock row is 0.5)
    cell: 58,             // px height of each lane: a destroyed lane leaves a hole the rider can fit through
    rock: [30, 34],       // px rock radius in a wall (big boulders)
    surferWeight: [0.35, 0.05], // share of wall lanes that are the cheap 1-hit surfers
    sharkWeight: [0.1, 0.2],    // share that are 5-hit sharks
    maxCost: [1, 3],      // hits the cheapest lane may need (easy -> hard)
  },

  // Fun-mode coconuts
  hp: { surfer: 1, rock: 3, shark: 5 }, // coconut hits needed to destroy each hazard
  coconut: {
    speed: 520,     // px/s faster than the rider
    radius: 7,      // px
    life: 4,        // s a coconut can fly (it also ends when it leaves the screen on the right)
    cooldown: 0.22, // s between throws
    max: 8,         // coconuts in flight at once
  },
};

const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const SURFER_COLORS = ['#ff5e7e', '#8be0a4', '#b388ff', '#ffd166'];

export function createHazards() {
  return { list: [], shots: [], hitFx: [], fireT: 0, touchList: [], nearList: [], cursor: 0, lastGap: 0, mode: 'compete', time: 0, d: 0, hits: 0 };
}

// rightEdgeX: world x of the hazard spawn line at the start of the run.
export function resetHazards(hz, rightEdgeX, startSpeed, bounds) {
  hz.list.length = 0;
  hz.touchList.length = 0;
  hz.nearList.length = 0;
  hz.shots.length = 0;
  hz.hitFx.length = 0;
  hz.fireT = 0;
  hz.mode = getSettings().mode === 'fun' ? 'fun' : 'compete';
  hz.time = 0;
  hz.d = 0;
  hz.hits = 0;
  hz.cursor = rightEdgeX + HAZARD_CONFIG.firstDelay * startSpeed;
  hz.lastGap = (bounds.minY + bounds.maxY) / 2;
}

// ---- single hazards ----
function rockAt(hz, x, y, size) {
  const hp = HAZARD_CONFIG.hp.rock;
  hz.list.push({ kind: 'rock', x, y, vx: 0, vy: 0, r: size * 0.85, size, phase: rand(0, 6.28), touched: false, hp, maxHp: hp });
}

// vx/vy are 0 for a sitting shark (Fun); heading then makes it face the rider.
function sharkAt(hz, x, y, vx, vy) {
  const S = HAZARD_CONFIG.shark;
  const hp = HAZARD_CONFIG.hp.shark;
  hz.list.push({
    kind: 'shark', x, y, vx, vy, r: S.radius, size: S.length, phase: rand(0, 6.28), touched: false, hp, maxHp: hp,
    heading: vx === 0 && vy === 0 ? Math.PI : undefined,
  });
}

// amp = 0 for a surfer sitting still (Fun)
function surferAt(hz, x, baseY, vx, amp) {
  const S = HAZARD_CONFIG.surfer;
  const hp = HAZARD_CONFIG.hp.surfer;
  hz.list.push({
    kind: 'surfer', x, y: baseY, vx, vy: 0, r: S.radius, size: 1, baseY, amp,
    hz: rand(S.weaveHz[0], S.weaveHz[1]), phase: rand(0, 6.28), t: 0, touched: false, hp, maxHp: hp,
    color: SURFER_COLORS[Math.floor(Math.random() * SURFER_COLORS.length)],
  });
}

const slotTime = (hz) => lerp(HAZARD_CONFIG.gapTime[0], HAZARD_CONFIG.gapTime[1], hz.d) * (hz.mode === 'fun' ? HAZARD_CONFIG.funTimeScale : 1);

function spawnRocks(hz, x, y0, y1, fill, sc) {
  const C = HAZARD_CONFIG;
  const rMin = Math.max(10, C.rockRadius[0] * sc);
  const rMax = Math.max(rMin + 2, lerp(C.rockRadius[1], C.rockRadiusHard, hz.d) * sc);
  let y = y0 + rand(0, 30);
  while (y < y1) {
    const r = rand(rMin, rMax);
    if (y + 2 * r <= y1 && Math.random() < fill) {
      rockAt(hz, x + rand(-40, 40), y + r, r);
      y += 2 * r + rand(C.rockStep[0], C.rockStep[1]) * 0.4;
    } else {
      y += rand(C.rockStep[0], C.rockStep[1]);
    }
  }
}

function spawnRow(hz, x, run, bounds) {
  const C = HAZARD_CONFIG;
  const fun = hz.mode === 'fun';
  const sc = faceScale(bounds);
  const gapW = Math.max(C.minGap, lerp(C.gapWidth[0], C.gapWidth[1], hz.d) * sc) * (fun ? C.funGapScale : 1);
  const half = gapW / 2;
  const time = slotTime(hz);
  // consecutive gaps never move further than the rider can reach in the time between rows
  const shiftMax = C.shiftFrac * run.speed * Math.max(0, time - 0.35);
  const g = clamp(hz.lastGap + rand(-shiftMax, shiftMax), bounds.minY + half, bounds.maxY - half);
  hz.lastGap = g;
  const fill = lerp(C.rockFill[0], C.rockFill[1], hz.d) * (fun ? C.funDensity : 1);
  spawnRocks(hz, x, bounds.minY - 24, g - half, fill, sc);
  spawnRocks(hz, x, g + half, bounds.maxY + 24, fill, sc);
  return run.speed * time * C.slotScale.rock;
}

// Compete: a shark swims diagonally across the face. Fun: a shark sits in the water.
function spawnShark(hz, x, run, bounds) {
  const S = HAZARD_CONFIG.shark;
  if (hz.mode === 'fun') {
    sharkAt(hz, x, rand(bounds.minY + 20, bounds.maxY - 20), 0, 0);
  } else {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const speed = lerp(S.speed[0], S.speed[1], hz.d) * rand(0.9, 1.1);
    sharkAt(hz, x, dir > 0 ? bounds.minY + 8 : bounds.maxY - 8, S.drift, dir * speed);
  }
  return run.speed * slotTime(hz) * HAZARD_CONFIG.slotScale.shark;
}

// Compete: another surfer rides ahead, weaving. Fun: a surfer sits on their board.
function spawnSurfer(hz, x, run, bounds) {
  const S = HAZARD_CONFIG.surfer;
  if (hz.mode === 'fun') {
    surferAt(hz, x, rand(bounds.minY + 30, bounds.maxY - 30), 0, 0);
  } else {
    surferAt(hz, x, rand(bounds.minY + 50, bounds.maxY - 50), run.speed * rand(S.speedFrac[0], S.speedFrac[1]), rand(S.weaveAmp[0], S.weaveAmp[1]));
  }
  return run.speed * slotTime(hz) * HAZARD_CONFIG.slotScale.surfer;
}

// Fun only: a barrier across the whole face with no gap, made of equal-height lanes. Sharks and surfers only sit
// between rocks, so the only way through is to destroy a lane; the cheapest lane never needs more than maxCost hits.
function spawnWall(hz, x, run, bounds) {
  const C = HAZARD_CONFIG;
  const W = C.wall;
  const wSurfer = lerp(W.surferWeight[0], W.surferWeight[1], hz.d);
  const wShark = lerp(W.sharkWeight[0], W.sharkWeight[1], hz.d);
  const n = Math.ceil((bounds.maxY - bounds.minY + 48) / W.cell);
  const kinds = [];
  for (let i = 0; i < n; i++) {
    const roll = Math.random();
    const soft = i > 0 && i < n - 1 && kinds[i - 1] === 'rock'; // a non-rock lane needs rocks on both sides
    kinds.push(soft && roll < wSurfer ? 'surfer' : soft && roll < wSurfer + wShark ? 'shark' : 'rock');
  }
  for (let i = 1; i < n; i++) if (kinds[i] !== 'rock' && kinds[i - 1] !== 'rock') kinds[i] = 'rock';
  const maxCost = lerp(W.maxCost[0], W.maxCost[1], hz.d);
  if (!kinds.some((k) => C.hp[k] <= maxCost)) {
    const open = [];
    for (let i = 1; i < n - 1; i++) if (kinds[i - 1] === 'rock' && kinds[i] === 'rock' && kinds[i + 1] === 'rock') open.push(i);
    kinds[open.length ? open[Math.floor(Math.random() * open.length)] : 1] = 'surfer';
  }
  let y = bounds.minY - 24;
  const first = hz.list.length;
  for (let i = 0; i < n; i++) {
    const lx = x + rand(-12, 12);
    const cy = y + W.cell / 2;
    if (kinds[i] === 'rock') rockAt(hz, lx, cy, rand(W.rock[0], W.rock[1]));
    else if (kinds[i] === 'shark') sharkAt(hz, lx, cy, 0, 0);
    else surferAt(hz, lx, cy, 0, 0);
    y += W.cell;
  }
  hz.list[first + Math.floor(n / 2)].warnWall = true; // one marker for the whole wall
  return run.speed * slotTime(hz) * C.slotScale.wall;
}

// Picks what happens at the next slot and returns the distance to the one after it.
function spawnSlot(hz, x, run, bounds) {
  const C = HAZARD_CONFIG;
  const fun = hz.mode === 'fun';
  const wShark = hz.time >= C.sharkUnlock ? lerp(C.mix.shark[0], C.mix.shark[1], hz.d) * (fun ? C.funDensity : 1) : 0;
  const wSurfer = hz.time >= C.surferUnlock ? C.mix.surfer : 0;
  const wWall = fun ? C.wall.weight * clamp((hz.d - C.wall.start) / (C.wall.full - C.wall.start), 0, 1) : 0;
  let pick = Math.random() * (C.mix.rock + wShark + wSurfer + wWall);
  if ((pick -= C.mix.rock) < 0) return spawnRow(hz, x, run, bounds);
  if ((pick -= wShark) < 0) return spawnShark(hz, x, run, bounds);
  if ((pick -= wSurfer) < 0) return spawnSurfer(hz, x, run, bounds);
  return spawnWall(hz, x, run, bounds);
}

// Debug: drop a hazard (or, in Fun, sometimes a wall) just off the right edge of the screen.
export function spawnNow(hz, g) {
  const x = g.camX + g.w + HAZARD_CONFIG.spawnMargin;
  const kind = Math.random();
  if (hz.mode === 'fun' && kind > 0.7) spawnWall(hz, x, g.run, g.bounds);
  else if (kind < 0.5) spawnRow(hz, x, g.run, g.bounds);
  else if (kind < 0.8) spawnShark(hz, x, g.run, g.bounds);
  else spawnSurfer(hz, x, g.run, g.bounds);
}

// Fun mode: throw a coconut straight ahead along the rider's row. Returns true if one was thrown.
export function fireCoconut(hz, p) {
  const C = HAZARD_CONFIG.coconut;
  if (hz.mode !== 'fun' || hz.fireT > 0 || hz.shots.length >= C.max) return false;
  hz.shots.push({ x: p.x + PLAYER_CONFIG.boardLength / 2, y: p.y, x0: p.x, vx: p.vx + C.speed, age: 0 });
  hz.fireT = C.cooldown;
  return true;
}

// Moves the coconuts and applies their hits (a hit on a hazard's circle along the segment each coconut travelled).
function updateShots(hz, dt, g) {
  const C = HAZARD_CONFIG.coconut;
  hz.fireT = Math.max(0, hz.fireT - dt);
  for (let i = hz.shots.length - 1; i >= 0; i--) {
    const s = hz.shots[i];
    const px = s.x;
    s.x += s.vx * dt;
    s.age += dt;
    let used = s.age > C.life || s.x > g.camX + g.w + 80;
    for (let j = 0; j < hz.list.length && !used; j++) {
      const h = hz.list[j];
      if (h.dead) continue;
      const seg = s.x - px;
      const t = seg > 0 ? clamp((h.x - px) / seg, 0, 1) : 0;
      const cx = px + seg * t;
      const dx = h.x - cx;
      const dy = h.y - s.y;
      const rr = h.r + C.radius;
      if (dx * dx + dy * dy < rr * rr) {
        used = true;
        h.hp--;
        h.hitT = 0.14;
        if (h.hp <= 0) h.dead = true;
        hz.hitFx.push({ x: cx, y: s.y, kill: h.dead, hx: h.x, hy: h.y });
      }
    }
    if (used) {
      hz.shots[i] = hz.shots[hz.shots.length - 1];
      hz.shots.pop();
    }
  }
}

// g: { camX, w, run, player, bounds }. Fills hz.touchList (hazards touched this frame) and hz.nearList (near misses scored this frame).
export function updateHazards(hz, dt, g) {
  const C = HAZARD_CONFIG;
  hz.touchList.length = 0;
  hz.nearList.length = 0;
  hz.hitFx.length = 0;
  hz.time += dt;
  hz.d = clamp(hz.time / C.rampTime[hz.mode], 0, 1);

  while (hz.cursor <= g.camX + g.w + C.spawnMargin) {
    hz.cursor += spawnSlot(hz, hz.cursor, g.run, g.bounds);
  }

  updateShots(hz, dt, g);

  const p = g.player;
  const hitR = PLAYER_CONFIG.hitRadius;
  for (let i = hz.list.length - 1; i >= 0; i--) {
    const h = hz.list[i];
    if (h.dead) {
      hz.list[i] = hz.list[hz.list.length - 1];
      hz.list.pop();
      continue;
    }
    if (h.hitT > 0) h.hitT -= dt;
    if (h.kind === 'surfer') {
      h.t += dt;
      h.x += h.vx * dt;
      h.y = clamp(h.baseY + h.amp * Math.sin(h.t * h.hz * 6.2832 + h.phase), g.bounds.minY, g.bounds.maxY);
      h.vy = h.amp * h.hz * 6.2832 * Math.cos(h.t * h.hz * 6.2832 + h.phase);
    } else if (h.kind === 'shark') {
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      if (h.vy !== 0) {
        if (h.y < g.bounds.minY) { h.y = g.bounds.minY; h.vy = Math.abs(h.vy); }
        if (h.y > g.bounds.maxY) { h.y = g.bounds.maxY; h.vy = -Math.abs(h.vy); }
      }
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
