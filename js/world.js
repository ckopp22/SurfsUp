// The break: one long point break. x = 0 is the take-off end, x = rideDistance is the beach.
export const WORLD_CONFIG = {
  rideDistance: 3000,   // px, width of the world / length of the ride
  wedgeLength: 320,     // px at the beach end where the sand curves up and closes the water
  camTargetFrac: 0.35,  // where the surfer sits on screen (fraction of screen width from the left)
  camLookahead: 0.35,   // s of surfer velocity added to the camera target
  camSmooth: 5,         // 1/s camera follow stiffness
  breakTopFrac: 0.28,   // break line height at x = 0 (fraction of screen height)
  breakShoreGap: 100,   // px the break line ends above the shoreline at x = rideDistance
};

export const camera = { x: 0 };

export function wedgeStart() {
  return WORLD_CONFIG.rideDistance - WORLD_CONFIG.wedgeLength;
}

// Top edge of the sand at world x (a flat shoreline until the wedge, then curving up to the top).
export function beachEdgeY(x, shoreY) {
  const x0 = wedgeStart();
  if (x <= x0) return shoreY;
  const u = Math.min((x - x0) / WORLD_CONFIG.wedgeLength, 1);
  return shoreY * (1 - u * u);
}

// Furthest x at which the beach edge is still at or below yLimit.
export function wedgeMaxX(shoreY, yLimit) {
  if (yLimit >= shoreY) return WORLD_CONFIG.rideDistance;
  return wedgeStart() + WORLD_CONFIG.wedgeLength * Math.sqrt(1 - Math.max(yLimit, 0) / shoreY);
}

function clampCam(x, screenW) {
  return Math.max(0, Math.min(x, WORLD_CONFIG.rideDistance - screenW));
}

export function snapCamera(playerX, screenW) {
  camera.x = clampCam(playerX - screenW * WORLD_CONFIG.camTargetFrac, screenW);
}

export function updateCamera(p, screenW, dt) {
  const C = WORLD_CONFIG;
  const target = clampCam(p.x + p.vx * C.camLookahead - screenW * C.camTargetFrac, screenW);
  camera.x += (target - camera.x) * (1 - Math.exp(-C.camSmooth * dt));
  camera.x = clampCam(camera.x, screenW);
}
