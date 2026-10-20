import { getSettings, saveSettings, getHighScores, clearHighScores, addHighScore, qualifiesForHighScore } from './storage.js';
import { resizeCanvas, drawOcean, drawWater, drawWall, drawShore, beginWorld, endWorld, drawWake, drawPlayer, drawJoystick, drawEffects, drawHazards, drawWarnings, drawPopups } from './render.js';
import { blockZoomAndScroll, initInput, setInputEnabled, clearInput, getInputVector, getJoystick } from './input.js';
import { camera } from './world.js';
import { on, EVENTS } from './events.js';
import { game, resetGame, refreshBounds, updateGame, scoreValue, distanceMeters, spawnHazard } from './game.js';
import { HAZARD_CONFIG } from './hazards.js';
import { isSoundOn, toggleSound, unlockAudio, refreshAudio, setAudioHidden, setAudioPaused, updateAudio, sfxTap, sfxGameOver } from './audio.js';
import { RIDE_CONFIG } from './ride.js';

const TRANSITIONS = {
  BOOT: ['MENU'],
  MENU: ['SETTINGS', 'HIGH_SCORES', 'PLAYING'],
  SETTINGS: ['MENU'],
  HIGH_SCORES: ['MENU'],
  PLAYING: ['PAUSED', 'GAME_OVER'],
  GAME_OVER: ['MENU', 'PLAYING'],
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
let hudText = '';
let fps = 60;
let debugStamp = 0;

// ---- routing ----
function setState(next) {
  if (!TRANSITIONS[state] || !TRANSITIONS[state].includes(next)) return;
  if (next === 'PLAYING' && state !== 'PAUSED') resetGame();
  state = next;
  setAudioPaused(state === 'PAUSED');
  if (state === 'MENU') camera.x = 0;
  setInputEnabled(state === 'PLAYING');
  document.querySelectorAll('.screen').forEach((el) => { el.hidden = el.id !== `screen-${SCREEN_OF[state]}`; });
  $('#pause-overlay').hidden = state !== 'PAUSED';
  $('#ride-over').hidden = state !== 'GAME_OVER';
  $('#pause-btn').hidden = state === 'GAME_OVER';
  $('#hud').hidden = state === 'MENU' || state === 'SETTINGS' || state === 'HIGH_SCORES';
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
    box.innerHTML = '<p class="empty-note">No runs yet. Hit Play and start carving!</p>';
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
  unlockAudio();
  sfxTap();
  if (el.dataset.go) setState(el.dataset.go);
  else if (el.dataset.mode) { saveSettings({ mode: el.dataset.mode }); renderTopBar(); }
  else if (el.dataset.setting) {
    saveSettings({ [el.dataset.setting]: !getSettings()[el.dataset.setting] });
    refreshAudio();
    renderSettings();
    renderTopBar();
  } else if (el.id === 'sound-btn') { toggleSound(); renderTopBar(); renderSettings(); }
  else if (el.id === 'pause-btn') setState('PAUSED');
  else if (el.dataset.action === 'resume') setState('PLAYING');
  else if (el.dataset.action === 'clear-scores') clearScoresFlow();
  else if (el.dataset.action === 'dismiss-hint') dismissHint();
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
  const run = game.run;
  const v = getInputVector();
  $('#debug').textContent =
    `fps   ${fps.toFixed(0)}   ${p.state}\n` +
    `speed ${run.speed.toFixed(0)} px/s   time ${run.time.toFixed(1)}s\n` +
    `dist  ${distanceMeters().toFixed(0)} m   score ${scoreValue()}   near ${game.score.nearMisses}\n` +
    `angle ${(run.phi * 57.3).toFixed(0)}°  turn ${run.omega.toFixed(2)}  carve ${p.carve.toFixed(2)}\n` +
    `input ${v.x.toFixed(2)}, ${v.y.toFixed(2)}\n` +
    `pos   ${p.x.toFixed(0)}, ${p.y.toFixed(0)}  cam ${camera.x.toFixed(0)}\n` +
    `diff  ${game.hz.d.toFixed(2)}  hazards ${game.hz.list.length}  touches ${game.hz.hits}`;
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
  updateAudio(state === 'PLAYING' && game.player.state === 'RIDING', game.player.carve, game.run.speed / RIDE_CONFIG.maxSpeed);

  if (state === 'PLAYING' || state === 'PAUSED' || state === 'GAME_OVER') {
    drawWater(ctx, oceanTime);
    drawWall(ctx, game.field, oceanTime);
    drawShore(ctx, oceanTime, 0.3 + 0.1 * Math.sin(oceanTime * 0.9));
    beginWorld(ctx);
    drawHazards(ctx, game.hz.list, oceanTime);
    drawWake(ctx, game.wake);
    drawPlayer(ctx, game.player);
    drawEffects(ctx, game.effects);
    drawPopups(ctx, game.popups, game.player);
    endWorld(ctx);
    drawWarnings(ctx, game.hz.list, HAZARD_CONFIG.shark.warnDist, game.bounds.minY, game.bounds.maxY, oceanTime);
    const joy = getJoystick();
    if (joy) drawJoystick(ctx, joy);
    const text = String(scoreValue());
    if (text !== hudText) { hudText = text; $('#hud').textContent = text; }
  } else {
    drawOcean(ctx, oceanTime);
  }
  updateDebug(now);
  requestAnimationFrame(frame);
}

on(EVENTS.RUN_OVER, (d) => {
  if (state !== 'PLAYING') return;
  let newHigh = false;
  if (d.mode === 'compete' && d.score > 0) {
    newHigh = qualifiesForHighScore(d.score);
    addHighScore(d.score);
  }
  $('#ride-over-score').textContent = String(d.score);
  $('#ride-over-time').textContent = `${Math.floor(d.distance)} m · ${d.nearMisses} near miss${d.nearMisses === 1 ? '' : 'es'}`;
  $('#new-high').hidden = !newHigh;
  sfxGameOver(newHigh);
  setState('GAME_OVER');
});

// ---- "Add to Home Screen" hint (iOS Safari only, until dismissed) ----
const HINT_KEY = 'surfsup.hint';
function showHint() {
  try {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    if (ios && !standalone && !localStorage.getItem(HINT_KEY)) $('#a2hs').hidden = false;
  } catch (e) { /* ignore */ }
}
function dismissHint() {
  $('#a2hs').hidden = true;
  try { localStorage.setItem(HINT_KEY, '1'); } catch (e) { /* ignore */ }
}

function boot() {
  blockZoomAndScroll();
  ['touchend', 'keydown'].forEach((n) => window.addEventListener(n, unlockAudio, { passive: true }));
  showHint();
  initInput(canvas, { onDebugToggle: toggleDebug, onSpawnWave: () => { if (state === 'PLAYING') spawnHazard(); } });
  document.addEventListener('visibilitychange', () => {
    setAudioHidden(document.hidden);
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
