# Surf's Up — Master Design Document (MDD)

**Version:** 2.0 (endless carving runner)
**Build tool:** Claude Code in VS Code
**Hosting:** GitHub Pages (commit + push to deploy)
**Platforms:** Any modern browser, installable PWA on iPhone home screen (primary target), desktop with keyboard

---

## 1. Overview

Surf's Up is a top-down endless-runner surfing game. The rider is already riding the face of a huge wave that never ends. The camera follows them along the wave while they carve up and down the face like a snowboarder, dodging rocks, sharks and other surfers. The run keeps getting faster and busier; the goal is to go as far as possible.

**Design pillars**
1. **Simple.** One screen, one control scheme, one goal.
2. **Feels like an app.** On iPhone it must be indistinguishable from a native app: safe-area aware, no zoom, no rubber-band scrolling, no text selection.
3. **Readable.** Flat, simple graphics. No asset pipeline required; everything can be drawn with Canvas shapes.

---

## 2. Technical Requirements

### 2.1 Stack
- Plain HTML, CSS, JavaScript (ES modules). No build step, no framework.
- Rendering: single `<canvas>` for gameplay; DOM/CSS for menus and HUD buttons.
- Audio: Web Audio API (generated tones/noise for sound effects) plus one looping music track (audio file or simple generated loop).
- Storage: `localStorage` for settings and high scores.
- Offline: Service worker caching all app files.

### 2.2 File Structure
```
/ (repo root, served by GitHub Pages)
├── index.html
├── manifest.webmanifest
├── sw.js
├── css/style.css
├── js/
│   ├── main.js          (boot, screen routing, game loop)
│   ├── game.js          (run state, update, scoring)
│   ├── player.js        (rider entity, bounds, spray)
│   ├── ride.js          (carve physics, run speed, difficulty)
│   ├── waves.js         (wave wall geometry)
│   ├── hazards.js       (rocks, sharks, other surfers)
│   ├── world.js         (camera)
│   ├── events.js        (hooks for audio/UI)
│   ├── input.js         (keyboard + floating joystick)
│   ├── render.js        (canvas drawing)
│   ├── audio.js         (sfx + music + toggles)
│   └── storage.js       (settings, high scores)
├── audio/               (optional music file)
└── icons/               (180x180 apple-touch-icon, 192, 512, maskable 512)
```

### 2.3 GitHub Pages Rules
- All paths **relative** (e.g. `./js/main.js`), never root-absolute (`/js/main.js`), because the site lives at `username.github.io/repo-name/`.
- `manifest.webmanifest`: `start_url` and `scope` set to `./`.
- Service worker registered with a relative path; cache name includes a version string that is bumped on each deploy.
- Deploy: commit to `main`, push, Pages set to serve from `main` / root.

---

## 3. iPhone App Behavior (Critical)

### 3.1 Head tags
```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Surf's Up">
<meta name="theme-color" content="#1aa7c9">
<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">
<link rel="manifest" href="./manifest.webmanifest">
```

### 3.2 Safe areas
- Game canvas fills the **entire** screen edge to edge (ocean color extends under the notch/home indicator).
- All interactive UI (sound toggle, mode toggle, buttons, HUD score) is inset using `env(safe-area-inset-top/right/bottom/left)`.
- Use `100dvh` (with `100vh` fallback) for full-height layout. Handle orientation/resize events by resizing the canvas.
- Target portrait. If landscape, either support it with the same safe-area logic or show a "rotate to portrait" message (decision: support both if trivial, otherwise lock to portrait in manifest with `"orientation": "portrait"`).

### 3.3 Disable zoom, scrolling, and selection
```css
html, body {
  margin: 0; height: 100%; overflow: hidden;
  overscroll-behavior: none;
  position: fixed; width: 100%;
  touch-action: none;
  -webkit-user-select: none; user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}
```
- JS: `preventDefault()` on `touchmove` (non-passive listener), on `gesturestart` / `gesturechange` / `gestureend` (blocks pinch), and on `dblclick`/double-tap zoom.
- Screens (menu, high scores, settings) never scroll. If content could overflow (e.g. high score list), keep the list short enough to fit or make only that inner container scrollable with `overflow-y: auto; touch-action: pan-y; overscroll-behavior: contain`.
- Buttons use `touch-action: manipulation` and minimum 44x44pt tap targets.

### 3.4 PWA install
- Manifest: `name: "Surf's Up"`, `short_name: "Surf's Up"`, `display: "standalone"`, `background_color` and `theme_color` matching ocean blue, icons 192/512 plus maskable.
- Optional: a small, dismissible "Add to Home Screen" hint on first visit in iOS Safari (Share → Add to Home Screen), hidden when already running standalone (`navigator.standalone` / `display-mode: standalone`).

---

## 4. Screens and Navigation

All screens share a persistent top bar (safe-area inset):
- **Top left:** Sound/Music toggle (see 7).
- **Top right:** Mode toggle **Compete | Fun** (see 5).

### 4.1 Main Menu
- Title "Surf's Up" with simple animated ocean background (gentle scrolling waves).
- Three large buttons stacked in the center: **Play**, **High Scores**, **Settings**.
- Mode toggle selection persists and applies to the next Play.

### 4.2 Game Screen
- Full-screen canvas.
- HUD (safe-area inset): current score (top center), mode indicator, small pause button (below top bar or in the corner opposite the toggles). Pause overlay: Resume, Quit to Menu.
- The sound/music toggle remains in the top left during gameplay. The Compete/Fun toggle is **locked (greyed out) during gameplay** to prevent mid-run mode changes; Quit to Menu to change it.

### 4.3 Game Over (Compete only)
- Shows final score, "New High Score!" if applicable, buttons: **Play Again**, **Menu**.

### 4.4 High Scores
- List of top 10 scores for **Compete** mode (date shown). Fun mode has no score table (optionally show "Best ride" stat).
- Back button. Clear Scores button with confirm prompt.

### 4.5 Settings
- Sound effects on/off
- Music on/off
- Controls: show floating joystick on touch devices (on/off, default on)
- Reset high scores (with confirm)
- Back button
- (Optional, later) Joystick side/size

---

## 5. Game Modes

| | **Compete** | **Fun** |
|---|---|---|
| Goal | Highest score (distance plus near-miss bonuses) | Ride as long as you like |
| End condition | The first collision ends the run | Never ends; quit via pause menu |
| Collisions | Wipeout, then Game Over | Bump: brief slowdown, no penalty |
| High scores | Saved | Not saved |
| Difficulty ramp | Full | Gentle (slower ramp, fewer hazards) |

---

## 6. Gameplay

### 6.1 Perspective and World
- Top-down 2D view, portrait orientation. The sand strip is at the bottom of the screen.
- **The wave wall:** the crest runs along the bottom, just above the sand. The wave face rises from it toward the ocean and fills about 70-75% of the screen height (capped so the rider stays below the top bar). The face never ends and never changes shape.
- **The camera** scrolls horizontally and is locked to the rider (the rider sits about 30% from the left). Ripples, foam and face streaks scroll past in world coordinates to give a sense of speed. There is no vertical scrolling.

### 6.2 Rider and Carving (snowboard feel)
- The rider moves forward along the wave automatically. **Forward speed** starts at a moderate value and ramps up with time (see 6.5).
- Steering is only up/down the face. The rider has a **board angle** (heading) relative to the wave direction. Steering turns the board with weight and momentum: the turn builds up gradually, holding it makes a long arc, and releasing lets the board straighten out.
- Across-face speed comes from forward speed and board angle (the faster you go, the quicker a given angle crosses the face).
- The board points along the path, banks into turns, and throws spray from its tail in proportion to how hard it is carving.
- The rider is kept inside the face; at the edges the board straightens out.

### 6.3 Controls
- **Keyboard:** W/S and Up/Down arrows steer. Left/right are ignored.
- **Touch:** the floating joystick (touch anywhere in the lower ~70% of the screen); only its vertical component steers, scaled by how far it is pushed. Safe-area and multi-touch rules as before.

### 6.4 Hazards
- **Rocks:** stationary; spawn ahead of the rider and scroll toward them. Sizes vary; clusters form gates and gaps.
- **Sharks:** move across the face diagonally as they approach, so they must be led, not just avoided.
- **Other surfers:** ride the same direction at a slower, varying speed and weave gently; the rider overtakes them.
- Hazards spawn off-screen to the right. The spawner always leaves a passable path (a gap wide enough for the rider at the current speed).

### 6.5 Difficulty
- Forward speed ramps with time up to a cap; spawn density ramps; harder hazards (sharks, clusters) unlock over time. Fun mode uses a gentler curve.

### 6.6 Scoring
- Score is distance (meters) plus a flat **+10 for every near miss** (passing close to a hazard without touching it). Shown at the top center during play.

### 6.7 Collisions
- **Compete:** a collision is a wipeout (tumble animation, ~1 s), then Game Over with the final score and "New High Score!" if it qualifies.
- **Fun:** a collision bumps the rider, slows them briefly, and the run continues.

---

## 7. Audio

### 7.1 Toggle (top left, all screens)
- A single speaker icon button in the top-left safe-area corner.
- Tap cycles: **All On → Music Off (SFX only) → All Off → All On**, or tap = mute all / unmute all with fine control in Settings. (Default: simple tap toggles all sound on/off; individual toggles live in Settings.)
- State persists in `localStorage`.
- iOS audio rule: the `AudioContext` must be created/resumed **from a user gesture** (first tap on Play or the toggle). Handle gracefully with no errors if audio is blocked.

### 7.2 Sounds
- **Music:** one mellow looping surf-style track (generated or a short file). Quiet by default, loops seamlessly.
- **SFX (generated with Web Audio, no files required):** paddle splash (soft noise burst while moving), wave rumble (low filtered noise as a wave approaches), catch whoosh, score tick (subtle, optional), slipping warning blip, wipeout splash, UI tap.
- Pause audio when the page is hidden (`visibilitychange`) and when paused.

---

## 8. Graphics and Style

- **Flat, simple shapes.** No sprites required.
- **Palette:**
  - Deep ocean: `#0b6e99`
  - Shallow water: `#1aa7c9`
  - Wave face (darker band): `#0a5a80`
  - Foam: `#ffffff`
  - Sand: `#f2d49b`
  - Surfer/board accents: warm orange or yellow so the player stands out
- Water background is two or three subtle bands with slow animated ripple lines.
- Wave: lighter swell band → darker face → white foam line on the crest. Pocket marked by a brighter foam burst at the peel point.
- UI: rounded buttons, large type, high contrast, a clean sans-serif system font stack (`-apple-system, system-ui, sans-serif`).
- Subtle visual aids to teach the game: faint ring around the pocket sweet spot while riding (hidden once the player has ridden successfully a couple of times, or kept subtle).
- Maintain 60fps. Cap devicePixelRatio at 2 for canvas performance.

---

## 9. Game State Machine

```
BOOT → MENU ⇄ SETTINGS
         ⇄ HIGH_SCORES
         → PLAYING ⇄ PAUSED
                → (Compete) GAME_OVER → PLAYING | MENU
                → (Fun) quit → MENU
```
Within PLAYING, the rider sub-state: `RIDING → WIPEOUT → (Fun: RIDING | Compete: GAME_OVER)`.

---

## 10. Data Model (localStorage)

```json
{
  "surfsup.settings": { "sfx": true, "music": true, "joystick": true, "mode": "compete" },
  "surfsup.highscores": [ { "score": 1240, "date": "2026-10-19" } ]
}
```
- Keep top 10 Compete scores, sorted descending.
- All reads/writes wrapped in try/catch (storage may be unavailable in private browsing).

---

## 11. Build Plan for Claude Code

Build in small steps, running locally between steps (e.g. `npx serve` or VS Code Live Server) and testing on an iPhone via the deployed Pages URL.

1. **Scaffold:** `index.html`, CSS (iOS rules from section 3), manifest, service worker, icons, canvas fills the screen.
2. **Menu & navigation:** Main menu, High Scores, Settings, toggles, state persistence.
3. **Input & rider basics:** keyboard + floating joystick, spray/wake, camera.
4. **Runner core (done):** start already riding the endless wave, auto-scrolling camera, snowboard carve physics, time-based speed ramp, distance HUD, pause/quit.
5. **Hazards:** rocks, sharks, other surfers, spawner with guaranteed gaps, difficulty ramp.
6. **Collisions & scoring:** wipeout, near-miss bonuses, Compete Game Over and high scores, Fun-mode bumps.
7. **Audio:** Web Audio SFX, music loop, toggle behavior, iOS unlock.
8. **PWA & polish:** install hint, icon set, pause on visibility change, performance pass.
9. **Deploy:** Commit, push, enable GitHub Pages, test the live URL and Add to Home Screen on iPhone.

---

## 12. Acceptance Checklist

**iPhone / PWA**
- [ ] Installs to home screen and launches full-screen with no Safari UI
- [ ] Content respects notch, Dynamic Island, and home indicator (nothing tappable is covered)
- [ ] Pinch zoom and double-tap zoom do nothing
- [ ] Page never scrolls or rubber-bands
- [ ] No text selection or long-press callouts
- [ ] Works offline after first load

**Gameplay**
- [ ] The run starts already riding; the camera follows and the wave scrolls endlessly
- [ ] W/S, arrow keys and the joystick's vertical axis steer; carving has momentum and the board banks and sprays
- [ ] Speed and hazard density ramp up over time
- [ ] Rocks, sharks and other surfers appear; there is always a passable gap
- [ ] Compete: a collision ends the run and offers a saved high score; Fun: collisions only bump

**UI**
- [ ] Sound toggle top left on every screen; Compete/Fun toggle top right on menu screens (locked during play)
- [ ] Main menu with Play, High Scores, Settings
- [ ] Settings and high scores persist after relaunch

---

## 13. Future Ideas (Out of Scope for v1)
- Multiple surfers/board skins
- Trick bonuses while riding
- Obstacles (rocks, other surfers, sharks in a hard mode)
- Daily challenge seed
- Online leaderboard
