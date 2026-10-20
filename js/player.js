import { beachEdgeY, wedgeMaxX } from './world.js';

// All feel-tuning for the surfer lives here.
export const PLAYER_CONFIG = {
  maxSpeed: 140,        // px/s at full input
  acceleration: 220,    // px/s² pushed along the input direction
  drag: 130,            // px/s² slowdown with no input (glide length) or when above the target speed
  turnBleed: 3,         // 1/s: speed lost per second at a full 180° reversal (scales with turn angle)
  turnDeadAngle: 0.35,  // rad (~20°): turns smaller than this cost no speed
  boardTurnRate: 9,     // rad/s: how fast the board swings to face the direction of travel
  headingMinSpeed: 6,   // px/s: below this the board holds its heading
  boardLength: 48,      // px
  boardWidth: 18,       // px
  clampRadius: 24,      // px: keep the board this far inside the play bounds
  topUiHeight: 60,      // px below the safe-area top reserved for the top bar
  sideMargin: 4,        // px extra gap from the take-off end of the world
  wake: {
    maxParticles: 40,
    life: 0.7,          // s
    minSpeed: 15,       // px/s: no wake below this
    emitPerSec: 40,     // particles/s at max speed (scaled by speed)
    startRadius: 3,     // px
    growth: 8,          // px/s radius growth
    maxAlpha: 0.55,
    jitter: 0.35,       // lateral spread as a fraction of board width
  },
};

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createPlayer() {
  return {
    x: 0, y: 0, vx: 0, vy: 0, heading: -Math.PI / 2, speed: 0,
    state: 'PADDLING', // PADDLING | RIDING | WIPEOUT | RIDE_COMPLETE
    crouch: 0,         // 0..1 riding pose
    lean: 0,           // -1..1 board tilt on the face
    wipeT: 0,          // 0..1 progress of the ride-end animation
  };
}

// World-space bounds: x runs 0..rideDistance, y is screen y (no vertical scroll).
export function computeBounds(insets, shoreY, shoreAmp) {
  const c = PLAYER_CONFIG;
  const r = c.clampRadius;
  const minY = insets.top + c.topUiHeight + r;
  return {
    minX: c.sideMargin + r,
    maxX: wedgeMaxX(shoreY, minY + shoreAmp + 2 * r), // where the rising beach meets the top of the play area
    minY,
    shoreY,
    shoreAmp,
  };
}

export function clampPlayer(p, b) {
  const maxY = beachEdgeY(p.x, b.shoreY) - b.shoreAmp - PLAYER_CONFIG.clampRadius;
  if (p.x < b.minX) { p.x = b.minX; if (p.vx < 0) p.vx = 0; }
  if (p.x > b.maxX) { p.x = b.maxX; if (p.vx > 0) p.vx = 0; }
  if (p.y < b.minY) { p.y = b.minY; if (p.vy < 0) p.vy = 0; }
  if (p.y > maxY) { p.y = maxY; if (p.vy > 0) p.vy = 0; }
}

export function updatePlayer(p, input, dt, bounds) {
  const c = PLAYER_CONFIG;
  const mag = Math.min(Math.hypot(input.x, input.y), 1);
  let speed = Math.hypot(p.vx, p.vy);

  if (mag > 0.001) {
    const len = Math.hypot(input.x, input.y);
    const dx = input.x / len;
    const dy = input.y / len;

    // Sharp turns bleed speed.
    if (speed > 1) {
      const cos = clamp((p.vx * dx + p.vy * dy) / speed, -1, 1);
      const excess = Math.max(0, Math.acos(cos) - c.turnDeadAngle) / (Math.PI - c.turnDeadAngle);
      const keep = Math.max(0, 1 - c.turnBleed * excess * dt);
      p.vx *= keep;
      p.vy *= keep;
      speed *= keep;
    }

    // Accelerate toward the input, never past the input-scaled target speed.
    const pre = speed;
    p.vx += dx * c.acceleration * dt;
    p.vy += dy * c.acceleration * dt;
    speed = Math.hypot(p.vx, p.vy);
    const target = mag * c.maxSpeed;
    if (speed > target) {
      const ns = Math.max(target, Math.min(speed, pre) - c.drag * dt);
      p.vx *= ns / speed;
      p.vy *= ns / speed;
      speed = ns;
    }
  } else if (speed > 0) {
    const ns = Math.max(0, speed - c.drag * dt);
    const k = speed > 0 ? ns / speed : 0;
    p.vx *= k;
    p.vy *= k;
    speed = ns;
  }
  p.speed = speed;

  // Board swings toward the direction of travel.
  if (speed > c.headingMinSpeed) {
    const diff = ((Math.atan2(p.vy, p.vx) - p.heading + Math.PI * 3) % TAU) - Math.PI;
    const step = clamp(diff, -c.boardTurnRate * dt, c.boardTurnRate * dt);
    p.heading += step;
  }

  p.x += p.vx * dt;
  p.y += p.vy * dt;
  clampPlayer(p, bounds);
  p.speed = Math.hypot(p.vx, p.vy);
}

// ---- wake ----
let emitAcc = 0;

export function updateWake(wake, p, dt) {
  const w = PLAYER_CONFIG.wake;
  for (let i = wake.length - 1; i >= 0; i--) {
    wake[i].age += dt;
    if (wake[i].age >= w.life) { wake[i] = wake[wake.length - 1]; wake.pop(); }
  }
  if (p.speed < w.minSpeed) { emitAcc = 0; return; }
  const frac = p.speed / PLAYER_CONFIG.maxSpeed;
  emitAcc += w.emitPerSec * frac * dt;
  const cos = Math.cos(p.heading);
  const sin = Math.sin(p.heading);
  const half = PLAYER_CONFIG.boardLength / 2;
  while (emitAcc >= 1) {
    emitAcc -= 1;
    if (wake.length >= w.maxParticles) break;
    const lat = (Math.random() - 0.5) * PLAYER_CONFIG.boardWidth * w.jitter * 2;
    wake.push({
      x: p.x - cos * half - sin * lat,
      y: p.y - sin * half + cos * lat,
      age: 0,
      alpha: w.maxAlpha * Math.min(frac, 1),
    });
  }
}
