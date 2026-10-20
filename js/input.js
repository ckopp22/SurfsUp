import { getSettings } from './storage.js';
import { getSize, getInsets } from './render.js';

export const INPUT = {
  doubleTapMs: 350,
  joystick: {
    regionTop: 0.3,     // joystick can spawn below this fraction of screen height
    maxRadius: 50,      // px
    deadZone: 0.12,     // fraction of maxRadius
    knobRadius: 22,     // px (drawing only)
  },
  debugTap: { count: 3, windowMs: 600, halfWidth: 90, height: 60 }, // triple-tap top center
};

// Blocks pinch zoom, double-tap zoom, and touch scrolling. Elements with
// the .scrollable class are allowed to scroll internally.
export function blockZoomAndScroll() {
  const stop = (e) => e.preventDefault();
  const opts = { passive: false };

  document.addEventListener('touchmove', (e) => {
    if (e.target.closest && e.target.closest('.scrollable')) return;
    e.preventDefault();
  }, opts);

  ['gesturestart', 'gesturechange', 'gestureend'].forEach((name) => document.addEventListener(name, stop, opts));
  document.addEventListener('dblclick', stop, opts);

  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    const onButton = e.target.closest && e.target.closest('button');
    if (!onButton && now - lastTouchEnd < INPUT.doubleTapMs) e.preventDefault();
    lastTouchEnd = now;
  }, opts);

  document.addEventListener('contextmenu', stop);
}

// ---- keyboard ----
const KEY_DIR = {
  w: 'up', arrowup: 'up', s: 'down', arrowdown: 'down',
  a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right',
};
const keys = new Set();
let enabled = false;

function hasDir(dir) {
  for (const k of keys) if (KEY_DIR[k] === dir) return true;
  return false;
}

function keyboardVector() {
  let x = (hasDir('right') ? 1 : 0) - (hasDir('left') ? 1 : 0);
  let y = (hasDir('down') ? 1 : 0) - (hasDir('up') ? 1 : 0);
  if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
  return { x, y };
}

// ---- floating joystick ----
const joy = { id: null, bx: 0, by: 0, dx: 0, dy: 0 };

function joystickVector() {
  if (joy.id === null) return { x: 0, y: 0 };
  const J = INPUT.joystick;
  const dist = Math.hypot(joy.dx, joy.dy);
  if (dist === 0) return { x: 0, y: 0 };
  const raw = Math.min(dist / J.maxRadius, 1);
  const out = raw < J.deadZone ? 0 : (raw - J.deadZone) / (1 - J.deadZone);
  return { x: (joy.dx / dist) * out, y: (joy.dy / dist) * out };
}

export function getJoystick() {
  if (joy.id === null || !getSettings().joystick) return null;
  return { bx: joy.bx, by: joy.by, kx: joy.bx + joy.dx, ky: joy.by + joy.dy, radius: INPUT.joystick.maxRadius, knobRadius: INPUT.joystick.knobRadius };
}

// Returns {x, y} with magnitude 0..1. Keyboard wins if both are active.
export function getInputVector() {
  const k = keyboardVector();
  if (k.x || k.y) return k;
  return getSettings().joystick ? joystickVector() : { x: 0, y: 0 };
}

export function clearInput() {
  keys.clear();
  joy.id = null;
  joy.dx = joy.dy = 0;
}

export function setInputEnabled(on) {
  enabled = on;
  if (!on) clearInput();
}

export function initInput(canvas, { onDebugToggle, onSpawnWave = () => {}, onToggleForgiving = () => {} }) {
  const J = INPUT.joystick;
  const D = INPUT.debugTap;
  let taps = [];

  window.addEventListener('keydown', (e) => {
    if (e.key === '`') { onDebugToggle(); return; }
    const k = e.key.toLowerCase();
    if (k === 'n') { if (!e.repeat) onSpawnWave(); return; }
    if (k === 'g') { if (!e.repeat) onToggleForgiving(); return; }
    if (!KEY_DIR[k]) return;
    if (enabled) e.preventDefault();
    keys.add(k);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', clearInput);

  canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

  canvas.addEventListener('pointerdown', (e) => {
    const { w, h } = getSize();
    const ins = getInsets();

    // triple-tap top center toggles the debug readout
    if (e.clientY < ins.top + D.height && Math.abs(e.clientX - w / 2) < D.halfWidth) {
      const now = performance.now();
      taps = taps.filter((t) => now - t < D.windowMs);
      taps.push(now);
      if (taps.length >= D.count) { taps = []; onDebugToggle(); }
      return;
    }

    if (!enabled || joy.id !== null || !getSettings().joystick) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.clientY < h * J.regionTop) return;

    joy.id = e.pointerId;
    joy.bx = e.clientX;
    joy.by = Math.min(e.clientY, h - ins.bottom - J.maxRadius); // keep the whole stick above the home-indicator inset
    joy.dx = joy.dy = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joy.id) return;
    let dx = e.clientX - joy.bx;
    let dy = e.clientY - joy.by;
    const dist = Math.hypot(dx, dy);
    if (dist > J.maxRadius) { dx = (dx / dist) * J.maxRadius; dy = (dy / dist) * J.maxRadius; }
    joy.dx = dx;
    joy.dy = dy;
    e.preventDefault();
  });

  const release = (e) => {
    if (e.pointerId !== joy.id) return;
    joy.id = null;
    joy.dx = joy.dy = 0;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
}
