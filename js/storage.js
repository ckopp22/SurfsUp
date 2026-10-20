const KEYS = { settings: 'surfsup.settings', scores: 'surfsup.highscores' };
const DEFAULT_SETTINGS = { sfx: true, music: true, joystick: true, mode: 'compete' };
const MAX_SCORES = 10;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) { /* storage unavailable (private mode, quota) */ }
}

let settings = { ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) };
if (settings.mode !== 'compete' && settings.mode !== 'fun') settings.mode = 'compete';

export function getSettings() {
  return settings;
}

export function saveSettings(patch) {
  settings = { ...settings, ...patch };
  write(KEYS.settings, settings);
  return settings;
}

export function getHighScores() {
  const list = read(KEYS.scores, []);
  return Array.isArray(list) ? list : [];
}

export function qualifiesForHighScore(score) {
  const list = getHighScores();
  return score > 0 && (list.length < MAX_SCORES || score > list[list.length - 1].score);
}

// mode: 'compete' or 'fun' (shown as C / F in the list). Scores saved before modes were tracked count as Compete.
export function addHighScore(score, mode) {
  const list = getHighScores();
  list.push({ score, date: new Date().toISOString().slice(0, 10), mode: mode === 'fun' ? 'fun' : 'compete' });
  list.sort((a, b) => b.score - a.score);
  list.length = Math.min(list.length, MAX_SCORES);
  write(KEYS.scores, list);
  return list;
}

export function clearHighScores() {
  write(KEYS.scores, []);
}
