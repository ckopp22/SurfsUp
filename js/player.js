// The rider entity, its play-area bounds, and the spray it throws.
export const PLAYER_CONFIG = {
  boardLength: 48,   // px
  boardWidth: 18,    // px
  hitRadius: 14,     // px, collision radius used by hazards
  margin: 18,        // px kept between the rider and the edges of the face
  topUiHeight: 60,   // px below the safe-area top reserved for the top bar
  wake: {
    maxParticles: 60,
    life: 0.6,       // s
    minSpeed: 40,    // px/s: no spray below this
    refSpeed: 300,   // px/s at which spray reaches full strength
    emitPerSec: 70,  // particles/s at full speed (scaled up by carving)
    startRadius: 3,  // px
    growth: 9,       // px/s radius growth
    maxAlpha: 0.6,
    jitter: 0.35,    // lateral spread as a fraction of board width (grows when carving)
  },
};

export function createPlayer() {
  return {
    x: 0, y: 0, vx: 0, vy: 0, heading: 0, speed: 0,
    state: 'RIDING', // RIDING | WIPEOUT
    crouch: 1,       // 0..1 riding pose
    lean: 0,         // -1..1 board bank
    wipeT: 0,        // 0..1 progress of the wipeout animation
    carve: 0,        // 0..1 how hard the rider is carving right now
    invuln: 0,       // s of invulnerability left (Fun mode, after a bump)
  };
}

// Vertical limits of the play area (the face of the wave).
export function computeBounds(field) {
  const m = PLAYER_CONFIG.margin;
  return { minY: field.crestY - field.faceDepth + m, maxY: field.crestY - m };
}

// ---- spray ----
let emitAcc = 0;

export function updateWake(wake, p, dt) {
  const w = PLAYER_CONFIG.wake;
  for (let i = wake.length - 1; i >= 0; i--) {
    wake[i].age += dt;
    if (wake[i].age >= w.life) { wake[i] = wake[wake.length - 1]; wake.pop(); }
  }
  if (p.speed < w.minSpeed || p.state !== 'RIDING') { emitAcc = 0; return; }
  const frac = Math.min(p.speed / w.refSpeed, 1);
  emitAcc += w.emitPerSec * frac * (0.35 + 0.65 * p.carve) * dt;
  const cos = Math.cos(p.heading);
  const sin = Math.sin(p.heading);
  const half = PLAYER_CONFIG.boardLength / 2;
  const spread = PLAYER_CONFIG.boardWidth * w.jitter * (1 + 2 * p.carve);
  while (emitAcc >= 1) {
    emitAcc -= 1;
    if (wake.length >= w.maxParticles) break;
    const lat = (Math.random() - 0.5) * 2 * spread;
    wake.push({
      x: p.x - cos * half - sin * lat,
      y: p.y - sin * half + cos * lat,
      age: 0,
      alpha: w.maxAlpha * frac,
      k: 1 + p.carve * 0.8, // bigger droplets when carving hard
    });
  }
}
