import { getSettings, saveSettings } from './storage.js';
import { on, EVENTS } from './events.js';

// Sounds are generated with Web Audio (no files). The context is created from a user gesture (iOS rule).
export const AUDIO_CONFIG = {
  sfx: 0.7,        // sound effects volume
  music: 0.22,     // music volume
  water: 0.04,     // constant quiet water sound while riding (0.04 + a little more with speed)
  waterSpeed: 0.03, // extra water volume at top speed
  swoosh: 0.8,     // carve swoosh sample volume at a full hard carve
  swooshAt: 0.5,   // how far up/down the key or joystick must be pushed (0..1) to play a swoosh
  swooshRelease: 0.2, // push below this lets the next press play again
  swooshGap: 0.2,  // s minimum between swooshes
  bpm: 96,         // music tempo
  arpChance: 0.8,  // chance each eighth note plays an arpeggio note
};

let ctx = null;
let sfxGain = null;
let musicGain = null;
let waterGain = null;
let waterFilter = null;
const swoosh = { up: null, down: null }; // decoded samples: swoosh 1 = carving up, swoosh 2 = carving down
let lastDir = 0;
let lastSwoosh = -1;
let noiseBuf = null;
let hidden = false;
let pausedByGame = false;

// Master sound toggle: if anything is on, tap turns all off; otherwise all on.
export function isSoundOn() {
  const s = getSettings();
  return s.sfx || s.music;
}

export function toggleSound() {
  const on = !isSoundOn();
  saveSettings({ sfx: on, music: on });
  refreshAudio();
  return on;
}

// ---- setup ----
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      sfxGain = ctx.createGain();
      musicGain = ctx.createGain();
      sfxGain.connect(ctx.destination);
      musicGain.connect(ctx.destination);

      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

      // constant quiet water sound while riding
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      waterFilter = ctx.createBiquadFilter();
      waterFilter.type = 'lowpass';
      waterFilter.frequency.value = 700;
      waterGain = ctx.createGain();
      waterGain.gain.value = 0;
      src.connect(waterFilter).connect(waterGain).connect(sfxGain);
      src.start();
      loadSwooshes();
      startMusic();
    }
    if (ctx.state === 'suspended' && !hidden && !pausedByGame) ctx.resume();
    refreshAudio();
  } catch (e) { /* audio blocked: stay silent */ }
}

function loadSample(url) {
  return fetch(url)
    .then((r) => r.arrayBuffer())
    .then((buf) => new Promise((resolve, reject) => ctx.decodeAudioData(buf, resolve, reject)));
}

function loadSwooshes() {
  loadSample('./audio/swoosh-up.mp3').then((b) => { swoosh.up = b; }).catch(() => {});
  loadSample('./audio/swoosh-down.mp3').then((b) => { swoosh.down = b; }).catch(() => {});
}

function playSwoosh(buffer, strength, speedFrac) {
  if (!ctx || !buffer) return;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = 0.9 + 0.3 * speedFrac; // faster rides sound a bit higher and snappier
  const g = ctx.createGain();
  g.gain.value = AUDIO_CONFIG.swoosh * (0.5 + 0.5 * strength);
  src.connect(g).connect(sfxGain);
  src.start();
}

// Apply the SFX/music settings to the gains.
export function refreshAudio() {
  if (!ctx) return;
  const s = getSettings();
  sfxGain.gain.setTargetAtTime(s.sfx ? AUDIO_CONFIG.sfx : 0, ctx.currentTime, 0.02);
  musicGain.gain.setTargetAtTime(s.music ? AUDIO_CONFIG.music : 0, ctx.currentTime, 0.05);
}

function applySuspend() {
  if (!ctx) return;
  try {
    if (hidden || pausedByGame) ctx.suspend(); else ctx.resume();
  } catch (e) { /* ignore */ }
}
export function setAudioHidden(flag) { hidden = flag; applySuspend(); }
export function setAudioPaused(flag) { pausedByGame = flag; applySuspend(); }

// ---- building blocks ----
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function tone(freq, dur, type, vol, slideTo, when) {
  if (!ctx) return;
  const t = when === undefined ? ctx.currentTime : when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfxGain);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noiseBurst(dur, f0, f1, vol, type) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type || 'lowpass';
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(sfxGain);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

// ---- sound effects ----
export function sfxTap() { tone(520, 0.06, 'triangle', 0.25, 700); }
function sfxNearMiss() { tone(880, 0.09, 'triangle', 0.35); tone(1320, 0.14, 'triangle', 0.35, undefined, ctx ? ctx.currentTime + 0.07 : 0); }
function sfxWipeout() { noiseBurst(0.9, 2400, 180, 0.75); tone(130, 0.5, 'sine', 0.8, 45); }
export function sfxGameOver(newHigh) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const notes = newHigh ? [60, 64, 67, 72] : [64, 60, 57];
  notes.forEach((n, i) => tone(midi(n), 0.3, 'triangle', 0.35, undefined, t + 0.12 * i));
}

on(EVENTS.NEAR_MISS, sfxNearMiss);
on(EVENTS.WIPEOUT, sfxWipeout);

// Called every frame. steer = the up/down input (-1 up .. +1 down). Swooshes play on the press only, not when the board straightens out.
export function updateAudio(playing, steer, speedFrac) {
  if (!ctx || !waterGain) return;
  const t = ctx.currentTime;
  waterGain.gain.setTargetAtTime(playing ? AUDIO_CONFIG.water + AUDIO_CONFIG.waterSpeed * speedFrac : 0, t, 0.1);
  waterFilter.frequency.setTargetAtTime(500 + 500 * speedFrac, t, 0.2);

  // a swoosh when up/down is pressed: swoosh 1 for up, swoosh 2 for down
  const mag = Math.abs(steer);
  if (!playing || mag < AUDIO_CONFIG.swooshRelease) { lastDir = 0; return; }
  const dir = steer > 0 ? 1 : -1;
  if (mag >= AUDIO_CONFIG.swooshAt && dir !== lastDir && t - lastSwoosh > AUDIO_CONFIG.swooshGap) {
    playSwoosh(dir > 0 ? swoosh.down : swoosh.up, Math.min(1, mag), speedFrac);
    lastSwoosh = t;
    lastDir = dir;
  }
}

// ---- music: a mellow generated loop (pad, bass and a gentle arpeggio) ----
const CHORDS = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 66]]; // Am7 Fmaj7 Cmaj7 G6
const ARP = [0, 2, 1, 3, 2, 3, 1, 2];
let musicStep = 0;
let musicNext = 0;

function musicNote(freq, when, dur, vol, type) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(vol, when + Math.min(0.4, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g).connect(musicGain);
  o.start(when);
  o.stop(when + dur + 0.05);
}

function scheduleMusic() {
  if (!ctx || ctx.state !== 'running') return;
  const eighth = 60 / AUDIO_CONFIG.bpm / 2;
  if (musicNext < ctx.currentTime) musicNext = ctx.currentTime + 0.05;
  while (musicNext < ctx.currentTime + 0.4) {
    const bar = Math.floor(musicStep / 8) % CHORDS.length;
    const chord = CHORDS[bar];
    const inBar = musicStep % 8;
    if (inBar === 0) {
      chord.forEach((n) => musicNote(midi(n), musicNext, eighth * 8, 0.12, 'triangle'));
      musicNote(midi(chord[0] - 12), musicNext, eighth * 4, 0.3, 'sine');
      musicNote(midi(chord[0] - 12), musicNext + eighth * 4, eighth * 4, 0.22, 'sine');
    }
    if (Math.random() < AUDIO_CONFIG.arpChance) musicNote(midi(chord[ARP[inBar]] + 12), musicNext, eighth * 1.6, 0.1, 'sine');
    musicNext += eighth;
    musicStep++;
  }
}

function startMusic() {
  musicStep = 0;
  musicNext = ctx.currentTime + 0.1;
  setInterval(scheduleMusic, 100);
}
