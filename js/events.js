// Tiny pub/sub so audio (Step 7) and UI can react to gameplay without game.js knowing about them.
export const EVENTS = {
  CARVE: 'carve',          // a hard carve is under way: { strength 0..1 } (spray/whoosh)
  NEAR_MISS: 'nearMiss',   // passed close to a hazard: { bonus } (flat +10)
  COCONUT: 'coconut',      // Fun mode: a coconut was thrown
  HAZARD_HIT: 'hazardHit', // a coconut damaged a hazard
  HAZARD_DESTROYED: 'hazardDestroyed', // a coconut destroyed a hazard
  WIPEOUT: 'wipeout',      // collision (both modes)
  RUN_OVER: 'runOver',     // wipeout animation finished: { score, distance } (Compete: show Game Over)
};

const handlers = {};

export function on(name, fn) {
  (handlers[name] || (handlers[name] = [])).push(fn);
}

export function emit(name, data) {
  const list = handlers[name];
  if (list) for (let i = 0; i < list.length; i++) list[i](data);
}
