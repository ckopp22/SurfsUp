import { getSettings, saveSettings } from './storage.js';

// Master sound toggle: if anything is on, tap turns all off; otherwise all on.
// Web Audio (SFX, music, iOS unlock) arrives in Step 7.
export function isSoundOn() {
  const s = getSettings();
  return s.sfx || s.music;
}

export function toggleSound() {
  const on = !isSoundOn();
  saveSettings({ sfx: on, music: on });
  return on;
}
