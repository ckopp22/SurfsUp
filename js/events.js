// Tiny pub/sub so audio (Step 7) and UI can react to gameplay without game.js knowing about them.
export const EVENTS = {
  CARVE: 'carve',          // a hard carve is under way: { strength 0..1 } (spray/whoosh)
  NEAR_MISS: 'nearMiss',   // passed close to a hazard: { bonus } (flat +10)
  HIT: 'hit',              // Fun mode bump
  WIPEOUT: 'wipeout',      // Compete collision
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
