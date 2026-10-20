import { createPlayer, updateWake, computeBounds, PLAYER_CONFIG } from './player.js';
import { waveGeometry } from './waves.js';
import { WORLD_CONFIG, camera, snapCamera, updateCamera } from './world.js';
import { getInputVector } from './input.js';
import { getSize, getInsets, sandTop } from './render.js';
import { createRun, updateRide, runDistance, RIDE_CONFIG, SCORE_CONFIG } from './ride.js';
import { HAZARD_CONFIG, createHazards, resetHazards, updateHazards, spawnNow, fireCoconut } from './hazards.js';
import { emit, EVENTS } from './events.js';

export const game = {
  player: createPlayer(),
  wake: [],
  effects: [],                                                  // splashes and ripples
  popups: [],                                                   // floating "+10 NEAR MISS" text
  field: { w: 0, h: 0, shoreY: 0, crestY: 0, faceDepth: 0 },    // reused each frame, no allocation
  bounds: { minY: 0, maxY: 0 },
  run: createRun(),
  hz: createHazards(),                                          // rocks, sharks, other surfers
  hazardView: { camX: 0, w: 0, run: null, player: null, bounds: null }, // reused arguments for the hazard update
  mode: 'compete',
  score: { bonus: 0, nearMisses: 0 },
  endT: 0,
  overSent: false,
};

function refreshField() {
  const { w, h } = getSize();
  const f = game.field;
  f.w = w;
  f.h = h;
  f.shoreY = sandTop();
  waveGeometry(f, getInsets().top + PLAYER_CONFIG.topUiHeight + PLAYER_CONFIG.margin);
  game.bounds = computeBounds(f);
}

export function refreshBounds() {
  refreshField();
  const p = game.player;
  p.y = Math.max(game.bounds.minY, Math.min(game.bounds.maxY, p.y));
}

// ---- effects: kind 0 = ripple ring, 1 = splash ----
export function addEffect(kind, x, y, size) {
  if (game.effects.length >= 24) game.effects.shift();
  game.effects.push({ kind, x, y, size, age: 0, life: kind === 0 ? 0.8 : 0.6 });
}

// floating text anchored next to the rider
function addPopup(text) {
  if (game.popups.length >= 6) game.popups.shift();
  game.popups.push({ text, ox: 34, oy: -30, age: 0, life: 1.1 });
}

function updateFloating(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].age += dt;
    if (list[i].age >= list[i].life) { list[i] = list[list.length - 1]; list.pop(); }
  }
}

export const distanceMeters = () => runDistance(game.run, game.player);
export const scoreValue = () => Math.floor(distanceMeters()) + game.score.bonus;

// ---- lifecycle ----
export function resetGame() {
  refreshField();
  const { w } = getSize();
  game.player = createPlayer();
  game.player.x = w * WORLD_CONFIG.camTargetFrac;
  game.player.y = game.field.crestY - game.field.faceDepth * 0.5; // start mid-face
  game.run = createRun();
  game.run.startX = game.player.x;
  game.player.vx = game.run.speed;
  game.player.speed = game.run.speed;
  snapCamera(game.player.x, w);
  game.wake.length = 0;
  game.effects.length = 0;
  game.popups.length = 0;
  resetHazards(game.hz, camera.x + w + HAZARD_CONFIG.spawnMargin, game.run.speed, game.bounds);
  game.mode = game.hz.mode;
  game.run.maxSpeed = game.mode === 'fun' ? RIDE_CONFIG.funMaxSpeed : RIDE_CONFIG.maxSpeed;
  game.player.vx = game.run.speed;
  game.score.bonus = 0;
  game.score.nearMisses = 0;
  game.endT = 0;
  game.overSent = false;
}

function hazardView() {
  const v = game.hazardView;
  v.camX = camera.x;
  v.w = game.field.w;
  v.run = game.run;
  v.player = game.player;
  v.bounds = game.bounds;
  return v;
}

// Fun mode: throw a coconut straight ahead along the rider's row.
export function shootCoconut() {
  const p = game.player;
  if (p.state !== 'RIDING' || game.mode !== 'fun') return;
  if (fireCoconut(game.hz, p)) emit(EVENTS.COCONUT, {});
}

// Debug: drop a hazard just off the right edge.
export function spawnHazard() {
  refreshField();
  spawnNow(game.hz, hazardView());
}

// ---- collisions ----
function wipeout() {
  const p = game.player;
  p.state = 'WIPEOUT';
  p.wipeT = 0;
  game.endT = 0;
  game.overSent = false;
  addEffect(1, p.x, p.y, 52);
  emit(EVENTS.WIPEOUT, {});
}

function awardNearMiss() {
  const bonus = SCORE_CONFIG.nearMissPoints;
  game.score.bonus += bonus;
  game.score.nearMisses++;
  addPopup(`+${bonus}`);
  emit(EVENTS.NEAR_MISS, { bonus });
}

function handleHazardEvents() {
  const p = game.player;
  if (p.state !== 'RIDING') return;
  const hz = game.hz;
  for (let i = 0; i < hz.touchList.length; i++) {
    wipeout(); // touching anything ends the run, in both modes
    return;
  }
  for (let i = 0; i < hz.nearList.length; i++) awardNearMiss();
}

function stepWipeout(dt) {
  const p = game.player;
  const C = RIDE_CONFIG;
  game.endT += dt;
  p.wipeT = Math.min(1, game.endT / C.wipeoutDuration);
  const k = Math.exp(-C.wipeDrag * dt);
  game.run.speed *= k;
  p.vx *= k;
  p.vy *= k;
  p.x += p.vx * dt;
  p.y = Math.max(game.bounds.minY, Math.min(game.bounds.maxY, p.y + p.vy * dt));
  p.speed = Math.hypot(p.vx, p.vy);
  p.carve *= Math.max(0, 1 - dt * 8);
  if (!game.overSent && game.endT >= C.wipeoutDuration + C.overDelay) {
    game.overSent = true;
    emit(EVENTS.RUN_OVER, { score: scoreValue(), distance: distanceMeters(), nearMisses: game.score.nearMisses, mode: game.mode });
  }
}

export function updateGame(dt) {
  refreshField();
  const p = game.player;
  if (p.state === 'RIDING') updateRide(game.run, p, getInputVector(), dt, game.bounds);
  else stepWipeout(dt);
  updateCamera(p.x, game.field.w);
  updateHazards(game.hz, dt, hazardView());
  handleHazardEvents();
  for (let i = 0; i < game.hz.hitFx.length; i++) {
    const f = game.hz.hitFx[i];
    addEffect(1, f.kill ? f.hx : f.x, f.kill ? f.hy : f.y, f.kill ? 38 : 14);
    emit(f.kill ? EVENTS.HAZARD_DESTROYED : EVENTS.HAZARD_HIT, {});
  }
  updateWake(game.wake, p, dt);
  updateFloating(game.effects, dt);
  updateFloating(game.popups, dt);
}
