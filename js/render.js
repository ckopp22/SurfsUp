import { PLAYER_CONFIG } from './player.js';
import { camera } from './world.js';

export const OCEAN = {
  maxDpr: 2,
  colors: { deep: '#0b6e99', mid: '#1388b1', shallow: '#1aa7c9', sand: '#f2d49b', foam: '#ffffff' },
  bandSplits: [0.4, 0.7],   // fraction of water height where deep -> mid -> shallow begin
  sandFrac: 0.1,            // sand strip height as a fraction of screen height
  sandMin: 56,              // px of sand at least
  sandInset: 40,            // px of sand kept above the bottom safe-area inset (home indicator)
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
  return height - Math.max(OCEAN.sandMin, height * OCEAN.sandFrac, insets.bottom + OCEAN.sandInset);
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

}

// Everything drawn between these is in world coordinates (scrolled by the camera).
export function beginWorld(ctx) {
  ctx.save();
  ctx.translate(-camera.x, 0);
}
export function endWorld(ctx) {
  ctx.restore();
}

const WALL = {
  face: '#0a5a80', faceDeep: '#084a6a', faceAlpha: 0.88,
  lip: 46,            // px of lighter water rising into the top of the face
  lanes: 9,           // rows of speed streaks on the face
  cell: 200,          // px between streak slots along the wave
  streakAlpha: 0.15,
  foamStep: 10,       // px between crest foam segments
  foamWidth: 8,
  foamAmp: 4,
};
const hash = (n) => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); };

// The endless wave wall: a face rising from the crest (bottom) toward the ocean, with streaks and foam
// keyed to world position so they scroll past as the camera moves.
export function drawWall(ctx, field, t) {
  const W = WALL;
  const bot = field.crestY;
  const top = bot - field.faceDepth;

  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.07;
  ctx.fillRect(0, top - W.lip, width, W.lip);
  ctx.fillRect(0, top - W.lip * 0.5, width, W.lip * 0.5);
  ctx.globalAlpha = W.faceAlpha;
  ctx.fillStyle = W.face;
  ctx.fillRect(0, top, width, field.faceDepth);
  ctx.fillStyle = W.faceDeep;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(0, bot - field.faceDepth * 0.35, width, field.faceDepth * 0.35);

  // speed streaks
  const k0 = Math.floor((camera.x - 120) / W.cell);
  const k1 = Math.floor((camera.x + width + 120) / W.cell);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.globalAlpha = W.streakAlpha;
  ctx.beginPath();
  for (let lane = 0; lane < W.lanes; lane++) {
    const y = top + ((lane + 0.5) / W.lanes) * field.faceDepth;
    for (let k = k0; k <= k1; k++) {
      if (hash(k * 31 + lane * 7.3) > 0.6) continue;
      const x = k * W.cell + hash(k * 17 + lane) * W.cell - camera.x;
      const len = 50 + hash(k + lane * 3) * 90;
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y);
    }
  }
  ctx.stroke();

  // crest foam: wavy dashed line along the bottom of the face
  const s0 = Math.floor((camera.x - 20) / W.foamStep);
  const s1 = Math.ceil((camera.x + width + 20) / W.foamStep);
  const phaseK = Math.floor(t * 2.5);
  for (let layer = 0; layer < 2; layer++) {
    ctx.globalAlpha = layer === 0 ? 0.9 : 0.55;
    ctx.lineWidth = layer === 0 ? W.foamWidth : 3;
    const off = layer === 0 ? 0 : -16;
    const amp = layer === 0 ? W.foamAmp : W.foamAmp * 1.6;
    ctx.beginPath();
    for (let k = s0; k < s1; k++) {
      if (layer === 0 ? (k + phaseK) % 3 === 0 : (k + phaseK + 1) % 4 < 2) continue;
      const xa = k * W.foamStep;
      const xb = xa + W.foamStep;
      ctx.moveTo(xa - camera.x, bot + off + Math.sin(xa * 0.3 + t * 4 + layer) * amp);
      ctx.lineTo(xb - camera.x, bot + off + Math.sin(xb * 0.3 + t * 4 + layer) * amp);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function drawWake(ctx, wake) {
  const w = PLAYER_CONFIG.wake;
  ctx.fillStyle = OCEAN.colors.foam;
  for (const p of wake) {
    ctx.globalAlpha = p.alpha * (1 - p.age / w.life);
    ctx.beginPath();
    ctx.arc(p.x, p.y, w.startRadius * p.k + w.growth * p.age, 0, Math.PI * 2);
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
  ctx.globalAlpha = 1;
}

const HZ = {
  rock: '#56606b', rockLight: '#8793a0', foam: '#ffffff',
  shark: '#4a5d73', sharkDark: '#2f3e51',
  suit: '#123c52', skin: '#f1c9a0',
};

function drawSurferFigure(ctx, x, y, heading, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 21, 8, 0, 0, 6.2832);
  ctx.fill();
  ctx.fillStyle = HZ.suit;
  ctx.beginPath();
  ctx.roundRect(-7, -6, 13, 12, 4);
  ctx.fill();
  ctx.fillStyle = HZ.skin;
  ctx.beginPath();
  ctx.arc(5, 0, 4, 0, 6.2832);
  ctx.fill();
  ctx.restore();
}

// Rocks, sharks and other surfers (world coordinates).
export function drawHazards(ctx, list, t) {
  const left = camera.x - 90;
  const right = camera.x + width + 90;
  for (let i = 0; i < list.length; i++) {
    const h = list[i];
    if (h.x < left || h.x > right) continue;
    if (h.kind === 'rock') {
      ctx.strokeStyle = HZ.foam;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.size + 5 + Math.sin(t * 3 + h.phase) * 1.5, 0, 6.2832);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = HZ.rock;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.size, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = HZ.rockLight;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(h.x - h.size * 0.28, h.y - h.size * 0.28, h.size * 0.5, 0, 6.2832);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (h.kind === 'shark') {
      const L = h.size / 2;
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(h.heading !== undefined ? h.heading : Math.atan2(h.vy, h.vx));
      ctx.strokeStyle = HZ.foam;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(-L - 6, -10); ctx.lineTo(-L - 30, -16);
      ctx.moveTo(-L - 6, 10); ctx.lineTo(-L - 30, 16);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = HZ.shark;
      ctx.beginPath();
      ctx.ellipse(0, 0, L, 11, 0, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = HZ.sharkDark;
      ctx.beginPath();
      ctx.moveTo(-L + 4, 0); ctx.lineTo(-L - 12, -10 + Math.sin(t * 8 + h.phase) * 3); ctx.lineTo(-L - 12, 10 + Math.sin(t * 8 + h.phase) * 3);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(8, 0); ctx.lineTo(-8, -8); ctx.lineTo(-8, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      drawSurferFigure(ctx, h.x, h.y, Math.atan2(h.vy, h.vx), h.color);
    }
    if (h.hitT > 0) { // flash white when a coconut lands
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = Math.min(0.75, h.hitT * 6);
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.kind === 'shark' ? 24 : h.r + 6, 0, 6.2832);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (h.maxHp > 1 && h.hp < h.maxHp) { // remaining health pips once damaged
      const py = h.y - (h.kind === 'rock' ? h.size + 16 : 30);
      ctx.fillStyle = '#ffffff';
      for (let k = 0; k < h.maxHp; k++) {
        ctx.globalAlpha = k < h.hp ? 1 : 0.25;
        ctx.beginPath();
        ctx.arc(h.x + (k - (h.maxHp - 1) / 2) * 9, py, 3, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
}

// Coconuts in flight (world coordinates).
export function drawCoconuts(ctx, shots) {
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    ctx.fillStyle = '#6b4423';
    ctx.beginPath();
    ctx.arc(s.x, s.y, 7, 0, 6.2832);
    ctx.fill();
    ctx.fillStyle = '#9a6b3f';
    ctx.beginPath();
    ctx.arc(s.x - 2, s.y - 2, 3, 0, 6.2832);
    ctx.fill();
    ctx.fillStyle = '#2c1a0c';
    ctx.beginPath();
    ctx.arc(s.x + 2, s.y - 1, 1.2, 0, 6.2832);
    ctx.arc(s.x + 2, s.y + 2, 1.2, 0, 6.2832);
    ctx.fill();
  }
}

// Heads-up for sharks still off-screen to the right: a pulsing "!" marker at the shark's height, an arrow for
// which way it is swimming, and it grows and turns red as it gets closer (screen coordinates).
export function drawWarnings(ctx, list, warnDist, top, bottom, t) {
  ctx.textAlign = 'center';
  for (let i = 0; i < list.length; i++) {
    const h = list[i];
    if (h.kind !== 'shark' && !h.warnWall) continue;
    const off = h.x - (camera.x + width);
    if (off < 0 || off > warnDist) continue;
    const u = 1 - off / warnDist; // 0 far .. 1 about to appear
    const pulse = 0.65 + 0.3 * Math.sin(t * (8 + 14 * u));
    const x = width - 6;
    if (h.warnWall) {
      // a wall: a bar down the whole edge, you will have to shoot through
      ctx.globalAlpha = pulse * 0.55;
      ctx.fillStyle = '#ff5a3c';
      ctx.fillRect(width - 10, top - 20, 10, bottom - top + 40);
      ctx.globalAlpha = pulse;
      ctx.font = '800 26px -apple-system, system-ui, sans-serif';
      ctx.fillText('WALL!', width - 44, (top + bottom) / 2);
      continue;
    }
    const s = 14 + 10 * u;
    const y = h.y < top ? top : h.y > bottom ? bottom : h.y;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = u > 0.6 ? '#ff5a3c' : '#ffb020';
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s * 1.7, y);
    ctx.closePath();
    ctx.fill();
    if (Math.abs(h.vy) > 1) {
      // arrow: which way the shark is swimming across the face
      const dir = h.vy > 0 ? 1 : -1;
      const ay = y + dir * (s + 12);
      ctx.beginPath();
      ctx.moveTo(x - s * 0.8, ay + dir * 8);
      ctx.lineTo(x - s * 0.8 - 8, ay - dir * 4);
      ctx.lineTo(x - s * 0.8 + 8, ay - dir * 4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#3a1400';
    ctx.font = `800 ${Math.round(s)}px -apple-system, system-ui, sans-serif`;
    ctx.fillText('!', x - s * 0.6, y + s * 0.36);
  }
  ctx.globalAlpha = 1;
}

// Floating score text next to the rider (world coordinates).
export function drawPopups(ctx, list, p) {
  ctx.font = '800 20px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,40,60,0.7)';
  ctx.fillStyle = '#ffe08a';
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const u = t.age / t.life;
    ctx.globalAlpha = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
    const x = p.x + t.ox;
    const y = p.y + t.oy - u * 40;
    ctx.strokeText(t.text, x, y);
    ctx.fillText(t.text, x, y);
  }
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
