// The run: automatic forward speed that ramps with time, and snowboard-style carving across the face.
export const RIDE_CONFIG = {
  // forward speed (px/s along the wave)
  startSpeed: 170,     // at the start of a run
  speedRamp: 3,        // px/s gained per second of riding
  maxSpeed: 420,       // cap
  metersPerPx: 0.025,  // distance shown to the player (40 px = 1 m)

  // carving
  maxAngle: 0.9,       // rad (~50°): steepest board angle off the wave direction
  turnRate: 1.8,       // rad/s the board turns at full steering
  carveInertia: 0.14,  // s the turn takes to build/release (higher = heavier board, wider arcs)
  straightenRate: 1.2, // rad/s the board returns to straight with no steering
  maxAcross: 520,      // px/s cap on speed across the face
  hardCarve: 1.6,      // rad/s of turning that counts as a full hard carve (banking, spray)
  edgeDamp: 12,        // 1/s how quickly the board straightens when it meets the edge of the face

  // collisions
  wipeoutDuration: 1.0, // s tumble after a Compete collision
  wipeDrag: 2.5,        // 1/s how fast the rider and the scroll slow down during the wipeout
  overDelay: 0.5,       // s after the tumble before the Game Over screen
  bumpSpeed: 0.35,      // Fun: forward speed multiplier right after a bump
  bumpRecover: 1.2,     // Fun: 1/s speed recovery after a bump
  invulnTime: 1.2,      // Fun: s of invulnerability (blinking) after a bump
  bumpNudge: 0.35,      // Fun: rad the board is shoved away from what it hit
};

// Score = distance in meters + a flat bonus for every near miss (passing close to a hazard without touching it).
export const SCORE_CONFIG = {
  nearMissDist: 30,    // px of clear space (edge to edge) that still counts as a near miss
  nearMissPoints: 10,  // points for every near miss
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function createRun() {
  return {
    time: 0,
    speed: RIDE_CONFIG.startSpeed, // forward speed
    startX: 0,
    speedMul: 1, // < 1 after a Fun-mode bump, recovers to 1
    phi: 0,   // board angle off the wave direction; positive = down the screen (toward shore)
    omega: 0, // turn rate
  };
}

export const runSpeed = (time) => Math.min(RIDE_CONFIG.maxSpeed, RIDE_CONFIG.startSpeed + RIDE_CONFIG.speedRamp * time);
export const runDistance = (run, p) => Math.max(0, (p.x - run.startX) * RIDE_CONFIG.metersPerPx);

// input.y: -1 (up the face, toward the ocean) .. +1 (down, toward shore)
export function updateRide(run, p, input, dt, bounds) {
  const C = RIDE_CONFIG;
  run.time += dt;
  run.speedMul += (1 - run.speedMul) * Math.min(1, C.bumpRecover * dt);
  run.speed = runSpeed(run.time) * run.speedMul;

  // snowboard carve: steering sets a target turn rate which the board follows with inertia
  const steer = clamp(input.y, -1, 1);
  const target = Math.abs(steer) > 0.04
    ? steer * C.turnRate
    : -clamp(run.phi * 3, -C.straightenRate, C.straightenRate);
  run.omega += (target - run.omega) * (1 - Math.exp(-dt / C.carveInertia));
  run.phi += run.omega * dt;
  if (run.phi > C.maxAngle) { run.phi = C.maxAngle; run.omega = Math.min(run.omega, 0); }
  if (run.phi < -C.maxAngle) { run.phi = -C.maxAngle; run.omega = Math.max(run.omega, 0); }

  const vy = clamp(run.speed * Math.tan(run.phi), -C.maxAcross, C.maxAcross);
  p.x += run.speed * dt;
  p.y += vy * dt;

  // edges of the face: the board straightens out instead of riding off it
  let atEdge = false;
  if (p.y < bounds.minY) { p.y = bounds.minY; atEdge = true; if (run.phi < 0) { run.phi *= Math.exp(-C.edgeDamp * dt); run.omega = 0; } }
  if (p.y > bounds.maxY) { p.y = bounds.maxY; atEdge = true; if (run.phi > 0) { run.phi *= Math.exp(-C.edgeDamp * dt); run.omega = 0; } }

  p.vx = run.speed;
  p.vy = atEdge ? 0 : vy;
  p.speed = Math.hypot(p.vx, p.vy);
  p.heading = Math.atan2(p.vy, p.vx);
  p.lean = clamp(run.phi / C.maxAngle, -1, 1);
  p.carve += (clamp(Math.abs(run.omega) / C.hardCarve, 0, 1) - p.carve) * Math.min(1, dt * 10);
}
