import { getSettings, saveSettings, getHighScores, clearHighScores } from './storage.js';
import { resizeCanvas, drawOcean, drawWater, drawShore, drawWaves, beginWorld, endWorld, drawWake, drawPlayer, drawJoystick, drawRideRings, drawEffects, drawSlipFlash, drawCatchZones } from './render.js';
import { blockZoomAndScroll, initInput, setInputEnabled, clearInput, getInputVector, getJoystick } from './input.js';
import { getPocket } from './waves.js';
import { camera } from './world.js';
import { on, EVENTS } from './events.js';
import { RIDE_CONFIG, toggleForgiving, isForgiving, sweetRadius, outerRadius, minCatchSpeed, catchRadius, catchTolerance, CATCH_CONFIG } from './ride.js';
import { game, resetGame, refreshBounds, updateGame, spawnWave } from './game.js';
import { isSoundOn, toggleSound } from './audio.js';

const TRANSITIONS = {
  BOOT: ['MENU'],
  MENU: ['SETTINGS', 'HIGH_SCORES', 'PLAYING'],
  SETTINGS: ['MENU'],
  HIGH_SCORES: ['MENU'],
  PLAYING: ['PAUSED', 'GAME_OVER'],
  GAME_OVER: ['MENU'],
  PAUSED: ['PLAYING', 'MENU'],
};
const SCREEN_OF = {
  MENU: 'menu', SETTINGS: 'settings', HIGH_SCORES: 'highscores', PLAYING: 'game', PAUSED: 'game', GAME_OVER: 'game',
};

const $ = (sel) => document.querySelector(sel);
const canvas = $('#canvas');
const ctx = canvas.getContext('2d');

let state = 'BOOT';
let oceanTime = 0;
let debugOn = false;
let tipShown = false;
let fps = 60;
let debugStamp = 0;
const pocketTmp = {};

// ---- routing ----
function setState(next) {
  if (!TRANSITIONS[state] || !TRANSITIONS[state].includes(next)) return;
  if (next === 'PLAYING' && state !== 'PAUSED') resetGame();
  state = next;
  if (state === 'MENU') camera.x = 0;
  setInputEnabled(state === 'PLAYING');
  document.querySelectorAll('.screen').forEach((el) => { el.hidden = el.id !== `screen-${SCREEN_OF[state]}`; });
  $('#pause-overlay').hidden = state !== 'PAUSED';
  $('#ride-over').hidden = state !== 'GAME_OVER';
  $('#pause-btn').hidden = state === 'GAME_OVER';
  if (state === 'HIGH_SCORES') renderScores();
  if (state === 'SETTINGS') renderSettings();
  renderTopBar();
}

// ---- top bar ----
function renderTopBar() {
  $('#sound-btn').classList.toggle('muted', !isSoundOn());
  const locked = state === 'PLAYING' || state === 'PAUSED' || state === 'GAME_OVER';
  const mode = getSettings().mode;
  document.querySelectorAll('[data-mode]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    b.disabled = locked;
  });
}

// ---- screens ----
function renderScores() {
  const list = getHighScores();
  const box = $('#score-list');
  if (!list.length) {
    box.innerHTML = '<p class="empty-note">No rides yet. Hit Play and catch a wave!</p>';
    return;
  }
  box.innerHTML = list.map((s, i) =>
    `<div class="score-row"><span class="score-rank">${i + 1}</span><span class="score-val">${Number(s.score) || 0}</span><span class="score-date">${String(s.date || '').replace(/[<>&]/g, '')}</span></div>`
  ).join('');
}

function renderSettings() {
  const s = getSettings();
  document.querySelectorAll('[data-setting]').forEach((b) => {
    b.setAttribute('aria-checked', String(!!s[b.dataset.setting]));
  });
}

// ---- confirm dialog ----
function confirmDialog(message, okLabel) {
  return new Promise((resolve) => {
    const box = $('#confirm');
    $('#confirm-msg').textContent = message;
    $('#confirm-ok').textContent = okLabel;
    box.hidden = false;
    const done = (result) => {
      box.hidden = true;
      $('#confirm-ok').onclick = $('#confirm-cancel').onclick = null;
      resolve(result);
    };
    $('#confirm-ok').onclick = () => done(true);
    $('#confirm-cancel').onclick = () => done(false);
  });
}

async function clearScoresFlow() {
  if (await confirmDialog('Clear all high scores? This can\'t be undone.', 'Clear')) {
    clearHighScores();
    if (state === 'HIGH_SCORES') renderScores();
  }
}

// ---- events ----
document.addEventListener('click', (e) => {
  const el = e.target.closest('button');
  if (!el) return;
  if (el.dataset.go) setState(el.dataset.go);
  else if (el.dataset.mode) { saveSettings({ mode: el.dataset.mode }); renderTopBar(); }
  else if (el.dataset.setting) {
    saveSettings({ [el.dataset.setting]: !getSettings()[el.dataset.setting] });
    renderSettings();
    renderTopBar();
  } else if (el.id === 'sound-btn') { toggleSound(); renderTopBar(); renderSettings(); }
  else if (el.id === 'pause-btn') setState('PAUSED');
  else if (el.dataset.action === 'resume') setState('PLAYING');
  else if (el.dataset.action === 'clear-scores') clearScoresFlow();
});

// ---- loop ----
function resize() { resizeCanvas(canvas); refreshBounds(); }

function toggleDebug() {
  debugOn = !debugOn;
  $('#debug').hidden = !debugOn;
}

function updateDebug(now) {
  if (!debugOn || now - debugStamp < 100) return;
  debugStamp = now;
  const p = game.player;
  const v = getInputVector();
  const r = game.ride;
  let txt =
    `fps   ${fps.toFixed(0)}   ${p.state}${isForgiving() ? '  [FORGIVING]' : ''}\nspeed ${p.speed.toFixed(1)}\nvel   ${p.vx.toFixed(1)}, ${p.vy.toFixed(1)}\ninput ${v.x.toFixed(2)}, ${v.y.toFixed(2)}\npos   ${p.x.toFixed(0)}, ${p.y.toFixed(0)}  cam ${camera.x.toFixed(0)}\n` +
    `catch ${game.dbg.catchSpeed.toFixed(0)} / ${minCatchSpeed().toFixed(0)}\npocket dist ${game.dbg.dist < 0 ? '-' : game.dbg.dist.toFixed(0)}  ${r ? r.zone : '-'}\n` +
    `ride  ${r ? r.time.toFixed(1) : '-'}s  sweet ${r ? r.sweetTime.toFixed(1) : '-'}s  best ${game.stats.best.toFixed(1)}s\nwaves ${game.waves.waves.length}`;
  game.waves.waves.forEach((w, i) => { txt += `\n #${i + 1} ${w.state}${w.isRideable ? ' (ride)' : ''}${w.ridden ? ' ridden' : ''}`; });
  const near = game.waves.getNearestRideable(p.x, p.y);
  if (near) {
    const pk = getPocket(near, pocketTmp);
    txt += `\npocket ${pk.x.toFixed(0)}, ${pk.y.toFixed(0)}\n  v ${pk.vx.toFixed(0)}, ${pk.vy.toFixed(0)}`;
  }
  $('#debug').textContent = txt;
}

let last = performance.now();
function frame(now) {
  const raw = (now - last) / 1000;
  const dt = Math.min(raw, 0.05);
  last = now;
  if (raw > 0) fps += (1 / raw - fps) * 0.1;

  const running = state !== 'PAUSED' && !document.hidden;
  if (running) oceanTime += dt;
  if (running && state === 'PLAYING') updateGame(dt);

  if (state === 'PLAYING' || state === 'PAUSED' || state === 'GAME_OVER') {
    drawWater(ctx, oceanTime);
    beginWorld(ctx);
    drawWaves(ctx, game.waves.waves, oceanTime);
    endWorld(ctx);
    drawShore(ctx, oceanTime, game.waves.wash);
    beginWorld(ctx);
    if (game.player.state === 'PADDLING') drawCatchZones(ctx, game.waves.waves, catchRadius(), catchTolerance(), CATCH_CONFIG.peelBias);
    drawWake(ctx, game.wake);
    if (game.ride && RIDE_CONFIG.showRings) drawRideRings(ctx, game.ride, sweetRadius(), outerRadius());
    drawPlayer(ctx, game.player);
    drawEffects(ctx, game.effects);
    endWorld(ctx);
    drawSlipFlash(ctx, game.fx.slip, oceanTime);
    const joy = getJoystick();
    if (joy) drawJoystick(ctx, joy);
  } else {
    drawOcean(ctx, oceanTime);
  }
  const wantTip = state === 'PLAYING' && game.player.state === 'PADDLING' && game.stats.catches === 0 &&
    game.waves.waves.some((w) => w.isRideable && !w.ridden);
  if (tipShown !== wantTip) { tipShown = wantTip; $('#tip').hidden = !wantTip; }
  updateDebug(now);
  requestAnimationFrame(frame);
}

on(EVENTS.RIDE_OVER, (d) => {
  if (state !== 'PLAYING') return;
  $('#ride-over-result').textContent = d.result === 'WIPEOUT' ? 'Wipeout!' : 'Ride complete!';
  $('#ride-over-time').textContent = `Ride time ${d.time.toFixed(1)}s · Sweet spot ${d.sweetTime.toFixed(1)}s`;
  setState('GAME_OVER');
});

function boot() {
  blockZoomAndScroll();
  initInput(canvas, { onDebugToggle: toggleDebug, onSpawnWave: () => { if (state === 'PLAYING') spawnWave(); }, onToggleForgiving: toggleForgiving });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (state === 'PLAYING') setState('PAUSED');
      clearInput();
    } else {
      last = performance.now();
    }
  });
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  new ResizeObserver(resize).observe(canvas);
  resize();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  setState('MENU');
  requestAnimationFrame(frame);
}

boot();
