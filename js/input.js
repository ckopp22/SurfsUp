export const INPUT = {
  doubleTapMs: 350,
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

// Keyboard + floating joystick arrive in Step 3.
