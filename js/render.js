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
};

let dpr = 1;
let width = 0;
let height = 0;

export function getSize() {
  return { w: width, h: height };
}

export function resizeCanvas(canvas) {
  dpr = Math.min(window.devicePixelRatio || 1, OCEAN.maxDpr);
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
}

export function sandTop() {
  return height - Math.max(OCEAN.sandMin, height * OCEAN.sandFrac);
}

export function drawOcean(ctx, t) {
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
      const yy = y + Math.sin(x * k + phase) * OCEAN.lineAmp;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }

  // sand strip with foamy shoreline
  const edge = (x) => waterH + Math.sin(x * k * 0.6 + t * 0.8) * OCEAN.shoreAmp;
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
}
