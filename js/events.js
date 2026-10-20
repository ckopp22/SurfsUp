// Tiny pub/sub so audio (Step 7) and UI can react to gameplay without game.js knowing about them.
export const EVENTS = {
  CATCH: 'catch',
  MISS: 'miss',              // wave passed under the surfer
  SLIP: 'slip',              // surfer drifted out of the sweet spot
  WIPEOUT: 'wipeout',
  RIDE_COMPLETE: 'rideComplete',
  RIDE_OVER: 'rideOver',     // end-of-ride animation finished (Compete: show Game Over)
};

const handlers = {};

export function on(name, fn) {
  (handlers[name] || (handlers[name] = [])).push(fn);
}

export function emit(name, data) {
  const list = handlers[name];
  if (list) for (let i = 0; i < list.length; i++) list[i](data);
}
