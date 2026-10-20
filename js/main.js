import { getSettings, saveSettings, getHighScores, clearHighScores } from './storage.js';
import { resizeCanvas, drawOcean } from './render.js';
import { blockZoomAndScroll } from './input.js';
import { isSoundOn, toggleSound } from './audio.js';

const TRANSITIONS = {
  BOOT: ['MENU'],
  MENU: ['SETTINGS', 'HIGH_SCORES', 'PLAYING'],
  SETTINGS: ['MENU'],
  HIGH_SCORES: ['MENU'],
  PLAYING: ['PAUSED'],
  PAUSED: ['PLAYING', 'MENU'],
};
const SCREEN_OF = {
  MENU: 'menu', SETTINGS: 'settings', HIGH_SCORES: 'highscores', PLAYING: 'game', PAUSED: 'game',
};

const $ = (sel) => document.querySelector(sel);
const canvas = $('#canvas');
const ctx = canvas.getContext('2d');

let state = 'BOOT';
let oceanTime = 0;

// ---- routing ----
function setState(next) {
  if (!TRANSITIONS[state] || !TRANSITIONS[state].includes(next)) return;
  state = next;
  document.querySelectorAll('.screen').forEach((el) => { el.hidden = el.id !== `screen-${SCREEN_OF[state]}`; });
  $('#pause-overlay').hidden = state !== 'PAUSED';
  if (state === 'HIGH_SCORES') renderScores();
  if (state === 'SETTINGS') renderSettings();
  renderTopBar();
}

// ---- top bar ----
function renderTopBar() {
  $('#sound-btn').classList.toggle('muted', !isSoundOn());
  const locked = state === 'PLAYING' || state === 'PAUSED';
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
function resize() { resizeCanvas(canvas); }

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (state !== 'PAUSED') oceanTime += dt;
  drawOcean(ctx, oceanTime);
  requestAnimationFrame(frame);
}

function boot() {
  blockZoomAndScroll();
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
