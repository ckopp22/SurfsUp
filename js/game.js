import { createPlayer, updatePlayer, updateWake, computeBounds, clampPlayer, PLAYER_CONFIG } from './player.js';
import { createWaveManager } from './waves.js';
import { WORLD_CONFIG, snapCamera, updateCamera } from './world.js';
import { getInputVector } from './input.js';
import { getSize, getInsets, sandTop, OCEAN } from './render.js';
import { getSettings } from './storage.js';
import { emit, EVENTS } from './events.js';
import {
  checkCatch, decayHints, startRide, updateRide, findRespawn, CATCH_RESULT, RIDE_CONFIG, ZONE, catchInfo,
} from './ride.js';

export const PS = { PADDLING: 'PADDLING', RIDING: 'RIDING', WIPEOUT: 'WIPEOUT', RIDE_COMPLETE: 'RIDE_COMPLETE' };

export const game = {
  player: createPlayer(),
  wake: [],
  waves: createWaveManager(),
  field: { w: 0, h: 0, shoreY: 0, breakY0: 0, breakY1: 0 }, // reused each frame, no allocation
  bounds: { minX: 0, maxX: 0, minY: 0, shoreY: 0, shoreAmp: 0 },
  ride: null,                          // current ride while RIDING
  effects: [],                         // splashes and ripples
  fx: { slip: 0 },                     // 0..1 slip warning intensity
  stats: { best: 0, last: 0, lastSweet: 0, lastResult: '', catches: 0 },
  endT: 0,
  overSent: false,
  dbg: { catchSpeed: 0, dist: -1 },    // readout values for the nearest catchable pocket
};

const spot = { x: 0, y: 0 };

function refreshField() {
  const { w, h } = getSize();
  game.field.w = w;
  game.field.h = h;
  game.field.shoreY = sandTop();
  const minTop = getInsets().top + PLAYER_CONFIG.topUiHeight + 60;
  game.field.breakY0 = Math.max(minTop, h * WORLD_CONFIG.breakTopFrac);
  game.field.breakY1 = Math.max(game.field.breakY0 + 40, game.field.shoreY - WORLD_CONFIG.breakShoreGap);
}

export function spawnWave() {
  refreshField();
  game.waves.spawn(game.field);
}

export function refreshBounds() {
  game.bounds = computeBounds(getInsets(), sandTop(), OCEAN.shoreAmp);
  clampPlayer(game.player, game.bounds);
}

// ---- effects: kind 0 = ripple ring, 1 = splash ----
function addEffect(kind, x, y, size) {
  if (game.effects.length >= 24) game.effects.shift();
  game.effects.push({ kind, x, y, size, age: 0, life: kind === 0 ? 0.8 : 0.6 });
}

function updateEffects(dt) {
  const list = game.effects;
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].age += dt;
    if (list[i].age >= list[i].life) { list[i] = list[list.length - 1]; list.pop(); }
  }
}

// ---- lifecycle ----
export function resetGame() {
  refreshField();
  refreshBounds();
  const b = game.bounds;
  const { w } = getSize();
  game.player = createPlayer();
  game.player.x = Math.max(b.minX, w * WORLD_CONFIG.camTargetFrac);
  const breakY = game.field.breakY0 + (game.field.breakY1 - game.field.breakY0) * (game.player.x / WORLD_CONFIG.rideDistance);
  game.player.y = Math.max(b.minY, breakY - RIDE_CONFIG.respawnOcean * 0.6); // start in open water on the ocean side
  snapCamera(game.player.x, w);
  game.wake.length = 0;
  game.effects.length = 0;
  game.waves.reset();
  game.ride = null;
  game.fx.slip = 0;
  game.stats.best = game.stats.last = game.stats.lastSweet = 0;
  game.stats.lastResult = '';
  game.stats.catches = 0;
  game.endT = 0;
  game.overSent = false;
}

function tryCatch(dt) {
  const p = game.player;
  const list = game.waves.waves;
  let caught = null;
  let bestDist = Infinity;
  for (let i = 0; i < list.length; i++) {
    const w = list[i];
    if (!w.isRideable || w.ridden || caught) { w.hint *= Math.max(0, 1 - dt * 10); continue; }
    const res = checkCatch(p, w, dt);
    if (catchInfo.dist < bestDist) {
      bestDist = catchInfo.dist;
      game.dbg.catchSpeed = catchInfo.speed;
      game.dbg.dist = catchInfo.dist;
    }
    if (res === CATCH_RESULT.CAUGHT) caught = w;
    else if (res === CATCH_RESULT.MISSED) {
      addEffect(0, p.x, p.y, 34); // the wave passes under the surfer
      emit(EVENTS.MISS, { wave: w });
    }
  }
  if (bestDist === Infinity) { game.dbg.catchSpeed = 0; game.dbg.dist = -1; }
  if (caught) {
    game.ride = startRide(p, caught);
    p.state = PS.RIDING;
    game.stats.catches++;
    addEffect(1, p.x, p.y, 36);
    emit(EVENTS.CATCH, { wave: caught });
  }
}

function endRide(kind) {
  const r = game.ride;
  const p = game.player;
  r.wave.locked = false;
  game.stats.last = r.time;
  game.stats.lastSweet = r.sweetTime;
  game.stats.lastResult = kind;
  if (r.time > game.stats.best) game.stats.best = r.time;
  game.ride = null;
  p.state = kind;
  p.wipeT = 0;
  game.endT = 0;
  game.overSent = false;
  addEffect(1, p.x, p.y, kind === PS.WIPEOUT ? 52 : 44);
  emit(kind === PS.WIPEOUT ? EVENTS.WIPEOUT : EVENTS.RIDE_COMPLETE, { time: r.time, sweetTime: r.sweetTime });
}

function stepRide(dt) {
  const p = game.player;
  const r = game.ride;
  const status = updateRide(r, p, getInputVector(), dt, game.field.shoreY);
  if (r.slipped) { r.slipped = false; emit(EVENTS.SLIP, { zone: r.zone }); }
  game.fx.slip += ((r.zone === ZONE.SWEET ? 0 : 1) - game.fx.slip) * Math.min(1, dt * 8);
  game.dbg.catchSpeed = -(p.vx * r.wave.nx + p.vy * r.wave.ny);
  game.dbg.dist = r.dist;
  if (status === 'COMPLETE') endRide(PS.RIDE_COMPLETE);
  else if (status === 'WIPEOUT') endRide(PS.WIPEOUT);
}

function respawn() {
  const p = game.player;
  findRespawn(p.x, game.waves.waves, game.field, game.bounds, spot);
  p.x = spot.x;
  p.y = spot.y;
  p.vx = p.vy = p.speed = 0;
  p.heading = -Math.PI / 2;
  p.state = PS.PADDLING;
  p.crouch = p.lean = p.wipeT = 0;
  game.wake.length = 0;
  addEffect(1, p.x, p.y, 30);
}

function stepEnding(dt) {
  const p = game.player;
  const C = RIDE_CONFIG;
  game.endT += dt;
  const dur = p.state === PS.WIPEOUT ? C.wipeoutDuration : C.completeDuration;
  p.wipeT = Math.min(1, game.endT / dur);
  const k = Math.exp(-C.endDrag * dt);
  p.vx *= k;
  p.vy *= k;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  clampPlayer(p, game.bounds);
  p.speed = Math.hypot(p.vx, p.vy);
  game.fx.slip *= Math.max(0, 1 - dt * 8);

  if (getSettings().mode === 'fun') {
    if (game.endT >= dur + C.respawnDelay) respawn();
  } else if (!game.overSent && game.endT >= dur + C.overDelay) {
    game.overSent = true;
    emit(EVENTS.RIDE_OVER, { result: p.state, time: game.stats.last, sweetTime: game.stats.lastSweet });
  }
}

export function updateGame(dt) {
  refreshField();
  game.waves.update(dt, game.field);
  const p = game.player;

  if (p.state === PS.PADDLING) {
    updatePlayer(p, getInputVector(), dt, game.bounds);
    tryCatch(dt);
  } else if (p.state === PS.RIDING) {
    decayHints(game.waves.waves, dt);
    stepRide(dt);
  } else {
    decayHints(game.waves.waves, dt);
    stepEnding(dt);
  }

  const crouchTarget = p.state === PS.RIDING || p.state === PS.RIDE_COMPLETE ? 1 : 0;
  p.crouch += (crouchTarget - p.crouch) * Math.min(1, dt * 10);
  updateWake(game.wake, p, dt);
  updateEffects(dt);
  updateCamera(p, game.field.w, dt);
}
