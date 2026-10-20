import { PLAYER_CONFIG } from './player.js';
import { camera, WORLD_CONFIG, wedgeStart, beachEdgeY } from './world.js';

export const OCEAN = {
  maxDpr: 2,
  colors: { deep: '#0b6e99', mid: '#1388b1', shallow: '#1aa7c9', sand: '#f2d49b', foam: '#ffffff' },
  bandSplits: [0.4, 0.7],   // fraction of water height where deep -> mid -> shallow begin
  sandFrac: 0.1,            // sand strip height as a fraction of screen height
  sandMin: 80,              // px, so it clears the home indicator
  lineCount: 9,
  lineSpeed: 12,            // px/s drift toward the beach
  lineAmp: 5,
  lineWavelength: 140,
  lineDrift: 18,            // px/s horizontal phase shift
  lineAlpha: 0.22,
  shoreAmp: 4,
  washWidth: 22,            // px, max thickness of the shore wash band
};

const COLORS = {
  board: '#ffb020', boardStripe: '#ffd166', suit: '#123c52', skin: '#f1c9a0',
};

let dpr = 1;
let width = 0;
let height = 0;
let insets = { top: 0, right: 0, bottom: 0, left: 0 };
let probe = null;

export function getSize() {
  return { w: width, h: height };
}

export function getInsets() {
  return insets;
}

function readInsets() {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(probe);
  }
  const s = getComputedStyle(probe);
  insets = {
    top: parseFloat(s.paddingTop) || 0,
    right: parseFloat(s.paddingRight) || 0,
    bottom: parseFloat(s.paddingBottom) || 0,
    left: parseFloat(s.paddingLeft) || 0,
  };
}

export function resizeCanvas(canvas) {
  dpr = Math.min(window.devicePixelRatio || 1, OCEAN.maxDpr);
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  readInsets();
}

export function sandTop() {
  return height - Math.max(OCEAN.sandMin, height * OCEAN.sandFrac);
}

export function drawWater(ctx, t) {
  const c = OCEAN.colors;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const waterH = sandTop();

  // flat bands
  const [s1, s2] = OCEAN.bandSplits;
  ctx.fillStyle = c.deep;
  ctx.fillRect(0, 0, width, waterH * s1 + 1);
  ctx.fillStyle = c.mid;
  ctx.fillRect(0, waterH * s1, width, waterH * (s2 - s1) + 1);
  ctx.fillStyle = c.shallow;
  ctx.fillRect(0, waterH * s2, width, waterH - waterH * s2 + 1);

  // scrolling ripple lines
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  const k = (Math.PI * 2) / OCEAN.lineWavelength;
  for (let i = 0; i < OCEAN.lineCount; i++) {
    const frac = (i / OCEAN.lineCount + (t * OCEAN.lineSpeed) / waterH) % 1;
    const y = frac * waterH;
    ctx.strokeStyle = `rgba(255,255,255,${OCEAN.lineAlpha * Math.sin(Math.PI * frac)})`;
    ctx.beginPath();
    const phase = t * OCEAN.lineDrift * k + i * 1.7;
    for (let x = 0; x <= width + 8; x += 8) {
      const yy = y + Math.sin((x + camera.x) * k + phase) * OCEAN.lineAmp;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }

}

export function drawOcean(ctx, t) {
  drawWater(ctx, t);
  drawShore(ctx, t, 0);
}

// Sand strip, shoreline foam, and the wash that creeps up the sand when waves arrive (wash 0..1).
export function drawShore(ctx, t, wash) {
  const c = OCEAN.colors;
  const waterH = sandTop();
  const k = (Math.PI * 2) / OCEAN.lineWavelength;
  const edge = (x) => waterH + Math.sin((x + camera.x) * k * 0.6 + t * 0.8) * OCEAN.shoreAmp;
  ctx.fillStyle = c.sand;
  ctx.beginPath();
  ctx.moveTo(0, height);
  for (let x = 0; x <= width + 8; x += 8) ctx.lineTo(x, edge(x));
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 0; x <= width + 8; x += 8) {
    if (x === 0) ctx.moveTo(x, edge(x)); else ctx.lineTo(x, edge(x));
  }
  ctx.stroke();

  if (wash > 0.01) {
    ctx.globalAlpha = 0.5 * wash;
    ctx.lineWidth = 6 + OCEAN.washWidth * wash;
    ctx.beginPath();
    const off = (OCEAN.washWidth * wash) / 2 + 3;
    for (let x = 0; x <= width + 8; x += 8) {
      const y = edge(x) + off + Math.sin((x + camera.x) * k * 1.3 - t * 2) * 2;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // sand wedge that curves up and closes the water at the beach end of the break
  const x0 = wedgeStart();
  if (camera.x + width > x0) {
    const from = Math.max(x0, camera.x - 10);
    const to = camera.x + width + 10;
    ctx.fillStyle = c.sand;
    ctx.beginPath();
    ctx.moveTo(from - camera.x, height);
    for (let x = from; ; x += 8) {
      const xx = x < to ? x : to;
      ctx.lineTo(xx - camera.x, beachEdgeY(xx, waterH));
      if (xx >= to) break;
    }
    ctx.lineTo(to - camera.x, height);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = from; ; x += 8) {
      const xx = x < to ? x : to;
      if (xx === from) ctx.moveTo(xx - camera.x, beachEdgeY(xx, waterH)); else ctx.lineTo(xx - camera.x, beachEdgeY(xx, waterH));
      if (xx >= to) break;
    }
    ctx.stroke();
  }
}

// Everything drawn between these is in world coordinates (scrolled by the camera).
export function beginWorld(ctx) {
  ctx.save();
  ctx.translate(-camera.x, 0);
}
export function endWorld(ctx) {
  ctx.restore();
}

const WAVE_STYLE = {
  face: '#0a5a80', foam: '#ffffff', swell: '#ffffff',
  swellWidth: 64,    // px half-width of the warning band
  swellAlpha: 0.13,
  faceWidth: 84,     // px, max depth of the dark face
  faceAlpha: 0.85,
  foamWidth: 8,
  closeFoamWidth: 32,
  foamStep: 10,      // px between path points
  foamAmp: 4,      // px wobble of the foam line
  trailLen: 280,     // px of fading foam blobs behind the pocket
  trailStep: 22,
  trailRadius: 11,
  pocketRadius: 22,
  pocketHalo: 38,
  hint: '#ffe08a',   // catchable glow
  cullMargin: 60,    // px beyond the screen edges still drawn
};
const clampN = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Band between offsets dIn..dOut (along the ocean-side normal) from crest distance s0 to s1.
function strip(ctx, w, ax, ay, s0, s1, dIn, dOut) {
  const x0 = ax + w.px * s0, y0 = ay + w.py * s0;
  const x1 = ax + w.px * s1, y1 = ay + w.py * s1;
  ctx.beginPath();
  ctx.moveTo(x0 + w.nx * dIn, y0 + w.ny * dIn);
  ctx.lineTo(x1 + w.nx * dIn, y1 + w.ny * dIn);
  ctx.lineTo(x1 + w.nx * dOut, y1 + w.ny * dOut);
  ctx.lineTo(x0 + w.nx * dOut, y0 + w.ny * dOut);
  ctx.closePath();
  ctx.fill();
}

// Wavy foam made of short segments keyed to absolute crest position, so it stays put while the camera scrolls.
function foamSegs(ctx, w, ax, ay, s0, s1, off, amp, t, mod, gap, phaseK) {
  const step = WAVE_STYLE.foamStep;
  const k0 = Math.floor(s0 / step);
  const k1 = Math.ceil(s1 / step);
  ctx.beginPath();
  for (let k = k0; k < k1; k++) {
    if ((k + phaseK) % mod < gap) continue;
    const sa = Math.max(s0, k * step);
    const sb = Math.min(s1, (k + 1) * step);
    const oa = off + Math.sin(sa * 0.3 + t * 4 + w.phase) * amp;
    const ob = off + Math.sin(sb * 0.3 + t * 4 + w.phase) * amp;
    ctx.moveTo(ax + w.px * sa + w.nx * oa, ay + w.py * sa + w.ny * oa);
    ctx.lineTo(ax + w.px * sb + w.nx * ob, ay + w.py * sb + w.ny * ob);
  }
  ctx.stroke();
}

function drawWave(ctx, w, t) {
  const S = WAVE_STYLE;
  const ax = w.cx - (w.px * w.L) / 2;
  const ay = w.cy - (w.py * w.L) / 2;
  const fade = w.fade;
  const closing = w.state === 'CLOSING';

  // only the stretch of crest near the camera is drawn
  const sLo = clampN((camera.x - S.cullMargin - ax) / w.px, 0, w.L);
  const sHi = clampN((camera.x + width + S.cullMargin - ax) / w.px, 0, w.L);

  if (sHi > sLo) {
    // SWELL: faint lighter band across the crest
    const sa = S.swellAlpha * w.swellAlpha * (1 - 0.5 * w.build) * fade;
    if (sa > 0.002) {
      ctx.globalAlpha = sa;
      ctx.fillStyle = S.swell;
      strip(ctx, w, ax, ay, sLo, sHi, -S.swellWidth, S.swellWidth);
    }

    if (w.build > 0) {
      // dark face on the ocean side: tall where unbroken, low where the pocket has passed
      const fw = S.faceWidth * w.build * (1 - w.flat);
      ctx.fillStyle = S.face;
      if (fw > 1) {
        const sP = closing ? w.L : w.s;
        if (sHi > sP) {
          ctx.globalAlpha = S.faceAlpha * fade;
          strip(ctx, w, ax, ay, Math.max(sLo, sP), sHi, 0, fw);
        }
        if (sP > sLo) {
          ctx.globalAlpha = S.faceAlpha * 0.6 * fade;
          strip(ctx, w, ax, ay, sLo, Math.min(sHi, sP), 0, fw * 0.55);
        }
      }

      ctx.strokeStyle = S.foam;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // unbroken section: smooth thin lip, no foam
      if (!closing && sHi > w.s) {
        ctx.globalAlpha = 0.55 * w.build * fade;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        const s0 = Math.max(sLo, w.s);
        ctx.moveTo(ax + w.px * s0, ay + w.py * s0);
        ctx.lineTo(ax + w.px * sHi, ay + w.py * sHi);
        ctx.stroke();
      }

      // broken section: wavy foam (whole crest while closing)
      const endS = Math.min(sHi, closing ? w.L : w.s);
      if (endS - sLo > 1) {
        const phaseK = Math.floor(t * 2.5);
        ctx.globalAlpha = 0.9 * fade;
        ctx.lineWidth = S.foamWidth + (S.closeFoamWidth - S.foamWidth) * w.flat;
        foamSegs(ctx, w, ax, ay, sLo, endS, 0, S.foamAmp, t, 3, 1, phaseK);
        ctx.globalAlpha = 0.6 * fade;
        ctx.lineWidth = 3;
        foamSegs(ctx, w, ax, ay, sLo, endS, 14 + 8 * w.flat, S.foamAmp * 1.6, t + 1.3, 4, 2, phaseK + 1);
      }

      // fading foam blobs trailing the pocket
      if (!closing && w.s > 2) {
        ctx.fillStyle = S.foam;
        const len = Math.min(S.trailLen, w.s);
        for (let d = S.trailStep; d < len; d += S.trailStep) {
          const f = 1 - d / S.trailLen;
          const sd = w.s - d;
          if (sd < sLo || sd > sHi) continue;
          const wob = Math.sin(sd * 0.5 + t * 3 + w.phase) * 4;
          ctx.globalAlpha = 0.5 * f * fade;
          ctx.beginPath();
          ctx.arc(ax + w.px * sd + w.nx * wob, ay + w.py * sd + w.ny * wob, 2 + S.trailRadius * f, 0, 6.2832);
          ctx.fill();
        }
      }
    }
  }

  // pocket burst
  if (w.pocketScale > 0.02) {
    const px = ax + w.px * w.s;
    const py = ay + w.py * w.s;
    if (px > camera.x - 60 && px < camera.x + width + 60) {
      const pulse = w.pocketScale * (1 + 0.12 * Math.sin(t * 9));
      ctx.fillStyle = S.foam;
      ctx.globalAlpha = 0.3 * w.pocketScale * fade;
      ctx.beginPath();
      ctx.arc(px, py, S.pocketHalo * pulse, 0, 6.2832);
      ctx.fill();
      if (w.hint > 0.02) {
        ctx.fillStyle = S.hint;
        ctx.globalAlpha = 0.55 * w.hint * fade * (0.8 + 0.2 * Math.sin(t * 10));
        ctx.beginPath();
        ctx.arc(px, py, S.pocketHalo * 1.3, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = S.foam;
      }
      ctx.globalAlpha = 0.95 * fade;
      ctx.beginPath();
      ctx.arc(px, py, S.pocketRadius * pulse, 0, 6.2832);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

export function drawWaves(ctx, waves, t) {
  for (let i = 0; i < waves.length; i++) drawWave(ctx, waves[i], t);
}

export function drawWake(ctx, wake) {
  const w = PLAYER_CONFIG.wake;
  ctx.fillStyle = OCEAN.colors.foam;
  for (const p of wake) {
    ctx.globalAlpha = p.alpha * (1 - p.age / w.life);
    ctx.beginPath();
    ctx.arc(p.x, p.y, w.startRadius + w.growth * p.age, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawPlayer(ctx, p) {
  const L = PLAYER_CONFIG.boardLength;
  const W = PLAYER_CONFIG.boardWidth;
  const c = p.crouch;
  const wiping = p.state === 'WIPEOUT';
  ctx.save();
  ctx.translate(p.x, p.y);
  if (wiping) {
    ctx.rotate(p.heading + p.wipeT * 12.57);                                  // board spins...
    ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.cos(p.wipeT * 9.4)));            // ...and flips
  } else {
    ctx.rotate(p.heading); // +x is the nose
    ctx.scale(1, 1 - 0.1 * Math.abs(p.lean));
  }

  // board
  ctx.fillStyle = COLORS.board;
  ctx.beginPath();
  ctx.ellipse(0, 0, L / 2, W / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.boardStripe;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-L / 2 + 5, 0);
  ctx.lineTo(L / 2 - 5, 0);
  ctx.stroke();

  if (!wiping) {
    // surfer: lies on the board paddling, crouches wider and shorter when riding
    const bodyL = 16 - 4 * c;
    const bodyW = 10 + 5 * c;
    ctx.fillStyle = COLORS.suit;
    ctx.beginPath();
    ctx.roundRect(-1 - bodyL / 2, -bodyW / 2, bodyL, bodyW, 4);
    ctx.fill();
    ctx.strokeStyle = COLORS.suit;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(4, -5 - 2 * c); ctx.lineTo(10 - 2 * c, -8 - 3 * c);
    ctx.moveTo(4, 5 + 2 * c); ctx.lineTo(10 - 2 * c, 8 + 3 * c);
    ctx.stroke();
    ctx.fillStyle = COLORS.skin;
    ctx.beginPath();
    ctx.arc(10 - 5 * c, 0, 4.5 - 0.5 * c, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (wiping) {
    // the surfer pops off the board
    ctx.fillStyle = COLORS.skin;
    ctx.beginPath();
    ctx.arc(p.x + 8 + 18 * p.wipeT, p.y - 10 * Math.sin(p.wipeT * Math.PI), 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Sweet-spot and outer rings around the pocket while riding.
const RING_COL = { SWEET_SPOT: 'rgba(255,255,255,0.7)', OUTER_ZONE: '#ffb020', OUT: '#ff5a3c' };
export function drawRideRings(ctx, r, sweet, outer) {
  ctx.lineWidth = 2;
  ctx.strokeStyle = RING_COL[r.zone];
  ctx.globalAlpha = r.zone === 'SWEET_SPOT' ? 0.5 : 0.9;
  ctx.beginPath();
  ctx.arc(r.px, r.py, sweet, 0, 6.2832);
  ctx.stroke();
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(r.px, r.py, outer, 0, 6.2832);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// Splashes (kind 1) and ripple rings (kind 0).
export function drawEffects(ctx, list) {
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 2;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const u = e.age / e.life;
    ctx.globalAlpha = 0.7 * (1 - u);
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.size * (0.3 + 0.9 * u), 0, 6.2832);
    ctx.stroke();
    if (e.kind === 1) {
      const rr = e.size * (0.2 + 1.1 * u);
      const dot = 3.2 * (1 - u) + 0.8;
      for (let k = 0; k < 8; k++) {
        const a = k * 0.7854 + 0.3;
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr, dot, 0, 6.2832);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
}

// Target box on the crest at each catchable pocket: be inside it, paddling toward shore.
export function drawCatchZones(ctx, waves, radius, tol, bias) {
  for (let i = 0; i < waves.length; i++) {
    const w = waves[i];
    if (!w.isRideable || w.ridden) continue;
    ctx.save();
    ctx.translate(w.cx - (w.px * w.L) / 2 + w.px * w.s, w.cy - (w.py * w.L) / 2 + w.py * w.s);
    ctx.rotate(Math.atan2(w.py, w.px));
    ctx.fillStyle = WAVE_STYLE.hint;
    ctx.strokeStyle = WAVE_STYLE.hint;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.1 + 0.2 * w.hint;
    ctx.beginPath();
    ctx.roundRect(-radius, -tol, radius * 2, tol * 2, 10);
    ctx.fill();
    ctx.globalAlpha = 0.4 + 0.5 * w.hint;
    ctx.stroke();
    // arrow showing the paddle direction: toward shore and down the line
    const len = Math.hypot(bias, 1);
    const ax = bias / len, ay = 1 / len; // in the crest frame (x along the crest, y toward shore)
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.5 + 0.4 * w.hint;
    ctx.beginPath();
    ctx.moveTo(-ax * 18, -ay * 18);
    ctx.lineTo(ax * 18, ay * 18);
    ctx.moveTo(ax * 18 - (ax * 0.7 - ay * 0.7) * 9, ay * 18 - (ay * 0.7 + ax * 0.7) * 9);
    ctx.lineTo(ax * 18, ay * 18);
    ctx.lineTo(ax * 18 - (ax * 0.7 + ay * 0.7) * 9, ay * 18 - (ay * 0.7 - ax * 0.7) * 9);
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// Pulsing screen-edge warning while slipping out of the sweet spot.
export function drawSlipFlash(ctx, level, t) {
  if (level < 0.02) return;
  ctx.globalAlpha = 0.5 * level * (0.55 + 0.45 * Math.sin(t * 14));
  ctx.strokeStyle = '#ff7a3d';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, width - 14, height - 14);
  ctx.globalAlpha = 1;
}

export function drawJoystick(ctx, j) {
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(j.bx, j.by, j.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.arc(j.kx, j.ky, j.knobRadius, 0, Math.PI * 2);
  ctx.fill();
}
