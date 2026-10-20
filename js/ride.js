import { PLAYER_CONFIG } from './player.js';
import { WORLD_CONFIG, beachEdgeY, wedgeStart } from './world.js';

// Catching a wave. The crest holds its line while the pocket sweeps along it, so a catch means being on the
// crest line, near the pocket, and paddling toward shore fast enough while the pocket passes.
export const CATCH_CONFIG = {
  crestTolerance: 40,      // px: max distance from the crest line
  pocketCatchRadius: 70,   // px: max distance from the pocket, measured along the crest
  minCatchSpeedFrac: 0.55, // fraction of PLAYER_CONFIG.maxSpeed needed toward shore (direction of wave travel)
  windowDuration: 0.8,     // s the catch window stays open once the pocket reaches the surfer
  snapDuration: 0.25,      // s to ease the surfer onto the wave face
  faceBand: 40,            // px behind the crest (ocean side) the rider can move within
  startFaceOffset: 20,     // px behind the crest where the rider settles after the catch
  peelBias: 1,             // catch direction = toward shore + this x down-the-line (1 = toward the bottom right at 45°, 0 = straight down)
  hintRange: 2,            // catchable glow shows within this multiple of the tolerances
};

// Riding the pocket.
export const RIDE_CONFIG = {
  sweetRadius: 50,         // px from the pocket: full-rate zone
  outerRadius: 90,         // px from the pocket: slipping zone
  graceTime: 0.4,          // s allowed OUT before a wipeout
  maxLateralSpeed: 150,    // px/s along the crest at full input
  lateralAccel: 260,       // px/s² toward the input speed
  lateralDrag: 140,        // px/s² slowdown with no lateral input
  faceSpeed: 70,           // px/s up/down the face
  beachContact: 30,        // px from the sand edge that completes the ride
  wipeoutDuration: 1.0,    // s tumble
  completeDuration: 0.8,   // s slide onto the foam
  endDrag: 3,              // 1/s velocity decay during the ride-end animation
  respawnDelay: 0.6,       // s pause after the animation before the Fun respawn
  overDelay: 0.4,          // s pause after the animation before the Compete overlay
  respawnOcean: 110,       // px above the break line where the Fun respawn appears
  respawnSafeDist: 90,     // px kept clear of any active crest at respawn
  respawnBeachGap: 150,    // px kept clear of the beach wedge at respawn
  showRings: true,         // draw the sweet/outer rings around the pocket while riding
  forgivingScale: 2,       // debug "G" mode multiplies the catch window and all radii by this
};

export const ZONE = { SWEET: 'SWEET_SPOT', OUTER: 'OUTER_ZONE', OUT: 'OUT' };

let forgiving = false;
export const toggleForgiving = () => (forgiving = !forgiving);
export const isForgiving = () => forgiving;
const scale = () => (forgiving ? RIDE_CONFIG.forgivingScale : 1);
export const catchRadius = () => CATCH_CONFIG.pocketCatchRadius * scale();
export const catchTolerance = () => CATCH_CONFIG.crestTolerance * scale();
export const minCatchSpeed = () => CATCH_CONFIG.minCatchSpeedFrac * PLAYER_CONFIG.maxSpeed;
export const sweetRadius = () => RIDE_CONFIG.sweetRadius * scale();
export const outerRadius = () => RIDE_CONFIG.outerRadius * scale();

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const tmp = { a: 0, d: 0 };
const tmpXY = { x: 0, y: 0 };

// World point -> crest frame: a = distance along the crest from its take-off end, d = distance toward the ocean.
export function toCrest(w, x, y, out) {
  const rx = x - (w.cx - (w.px * w.L) / 2);
  const ry = y - (w.cy - (w.py * w.L) / 2);
  out.a = rx * w.px + ry * w.py;
  out.d = rx * w.nx + ry * w.ny;
  return out;
}

export function fromCrest(w, a, b, out) {
  out.x = w.cx - (w.px * w.L) / 2 + w.px * a + w.nx * b;
  out.y = w.cy - (w.py * w.L) / 2 + w.py * a + w.ny * b;
  return out;
}

// ---- catching ----
const catchStates = new WeakMap();
export const catchInfo = { speed: 0, dist: 0 }; // last values computed, for the debug readout

export const CATCH_RESULT = { NONE: 0, CAUGHT: 1, MISSED: 2 };

export function checkCatch(p, w, dt) {
  const C = CATCH_CONFIG;
  const f = scale();
  toCrest(w, p.x, p.y, tmp);
  const da = tmp.a - w.s;
  // speed along the catch direction: toward shore and down the line (toward the bottom right)
  const dx = -w.nx + C.peelBias * w.px;
  const dy = -w.ny + C.peelBias * w.py;
  const speed = (p.vx * dx + p.vy * dy) / Math.hypot(dx, dy);
  const speedOK = speed >= minCatchSpeed();
  const crestOK = Math.abs(tmp.d) <= C.crestTolerance * f;
  const radiusOK = Math.abs(da) <= C.pocketCatchRadius * f;
  catchInfo.speed = speed;
  catchInfo.dist = Math.hypot(da, tmp.d);

  // glow hint on the pocket when the surfer is close and fast enough
  const near = speedOK && Math.abs(da) <= C.pocketCatchRadius * f * C.hintRange && Math.abs(tmp.d) <= C.crestTolerance * f * C.hintRange;
  w.hint += ((near ? 1 : 0) - w.hint) * Math.min(1, dt * 10);

  let st = catchStates.get(w);
  if (!st) { st = { open: false, t: 0, blocked: false }; catchStates.set(w, st); }
  if (!(crestOK && radiusOK)) { st.open = false; st.blocked = false; return CATCH_RESULT.NONE; }
  if (!st.open) {
    if (st.blocked) return CATCH_RESULT.NONE;
    st.open = true;
    st.t = 0;
  }
  st.t += dt;
  if (speedOK) { st.open = false; return CATCH_RESULT.CAUGHT; }
  if (st.t >= C.windowDuration * f) { st.open = false; st.blocked = true; return CATCH_RESULT.MISSED; }
  return CATCH_RESULT.NONE;
}

export function decayHints(waves, dt) {
  for (let i = 0; i < waves.length; i++) waves[i].hint *= Math.max(0, 1 - dt * 10);
}

// ---- riding ----
export function startRide(p, w) {
  toCrest(w, p.x, p.y, tmp);
  const b0 = clamp(tmp.d, -CATCH_CONFIG.crestTolerance * scale(), CATCH_CONFIG.faceBand);
  w.locked = true; // the wave can't be removed while ridden
  w.ridden = true; // and can't be caught again
  return {
    wave: w,
    a: clamp(tmp.a, 0, w.L), b: b0, b0,
    va: p.vx * w.px + p.vy * w.py,
    snapT: 0,
    time: 0, sweetTime: 0,
    zone: ZONE.SWEET, outT: 0, dist: 0, slipped: false,
    px: 0, py: 0, // pocket world position (for the rings)
    lean: 0,
  };
}

// Returns '' while the ride continues, else 'COMPLETE' or 'WIPEOUT'.
export function updateRide(r, p, input, dt, shoreY) {
  const w = r.wave;
  const C = RIDE_CONFIG;
  const K = CATCH_CONFIG;

  // lateral = along the crest, face = toward the ocean (up the face)
  const lat = input.x * w.px + input.y * w.py;
  const face = input.x * w.nx + input.y * w.ny;
  r.lean += (clamp(face, -1, 1) - r.lean) * Math.min(1, dt * 8);

  const target = lat * C.maxLateralSpeed;
  const rate = Math.abs(lat) > 0.05 ? C.lateralAccel : C.lateralDrag;
  r.va += clamp(target - r.va, -rate * dt, rate * dt);
  r.a += r.va * dt;
  if (r.a < 0) { r.a = 0; r.va = 0; }
  if (r.a > w.L) { r.a = w.L; r.va = 0; }

  if (r.snapT < K.snapDuration) {
    r.snapT = Math.min(K.snapDuration, r.snapT + dt);
    const e = 1 - Math.pow(1 - r.snapT / K.snapDuration, 3);
    r.b = r.b0 + (K.startFaceOffset - r.b0) * e;
  } else {
    r.b = clamp(r.b + face * C.faceSpeed * dt, 0, K.faceBand);
  }

  const px0 = p.x, py0 = p.y;
  fromCrest(w, r.a, r.b, tmpXY);
  p.x = tmpXY.x;
  p.y = tmpXY.y;
  if (dt > 0) { p.vx = (p.x - px0) / dt; p.vy = (p.y - py0) / dt; }
  p.speed = Math.hypot(p.vx, p.vy);

  // board follows the crest, leaning toward the way the rider is moving on the face
  const want = Math.atan2(w.py, w.px) - r.lean * 0.45;
  const diff = ((want - p.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  p.heading += clamp(diff, -PLAYER_CONFIG.boardTurnRate * dt, PLAYER_CONFIG.boardTurnRate * dt);
  p.lean = r.lean;

  // zone relative to the pocket
  fromCrest(w, w.s, 0, tmpXY);
  r.px = tmpXY.x;
  r.py = tmpXY.y;
  r.dist = Math.hypot(r.a - w.s, r.b);
  const prev = r.zone;
  r.zone = r.dist <= sweetRadius() ? ZONE.SWEET : r.dist <= outerRadius() ? ZONE.OUTER : ZONE.OUT;
  if (r.zone !== ZONE.SWEET && prev === ZONE.SWEET) r.slipped = true;
  r.time += dt;
  if (r.zone === ZONE.SWEET) r.sweetTime += dt;
  r.outT = r.zone === ZONE.OUT ? r.outT + dt : 0;

  if (w.state === 'CLOSING' || w.state === 'DEAD' || beachEdgeY(p.x, shoreY) - p.y < C.beachContact) return 'COMPLETE';
  if (r.outT > C.graceTime) return 'WIPEOUT';
  return '';
}

// Fun-mode respawn: open water on the ocean side of the break, clear of any active crest and the beach.
export function findRespawn(x, waves, field, bounds, out) {
  const W = WORLD_CONFIG.rideDistance;
  const C = RIDE_CONFIG;
  const rx = clamp(x, bounds.minX, Math.min(bounds.maxX, wedgeStart() - C.respawnBeachGap));
  let y = field.breakY0 + (field.breakY1 - field.breakY0) * (rx / W) - C.respawnOcean;
  for (let i = 0; i < waves.length; i++) {
    const w = waves[i];
    if (w.state === 'DEAD') continue;
    const crestY = w.cy - (w.py * w.L) / 2 + ((rx - (w.cx - (w.px * w.L) / 2)) / w.px) * w.py;
    if (Math.abs(y - crestY) < C.respawnSafeDist) y = crestY - C.respawnSafeDist;
  }
  out.x = rx;
  out.y = clamp(y, bounds.minY, bounds.shoreY - 60);
  return out;
}
