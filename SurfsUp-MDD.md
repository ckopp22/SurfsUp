# Surf's Up — Master Design Document (MDD)

**Version:** 1.1 (scrolling-camera point break)
**Build tool:** Claude Code in VS Code
**Hosting:** GitHub Pages (commit + push to deploy)
**Platforms:** Any modern browser, installable PWA on iPhone home screen (primary target), desktop with keyboard

---

## 1. Overview

Surf's Up is a simple top-down surfing game. The player paddles a surfer around in the ocean, times a paddle into an incoming wave, then stays in the pocket by matching its speed as the wave peels left to right along the break while the camera follows. The ride ends when the surfer reaches the beach at the end of the break. The longer the player stays in the pocket, the higher the score.

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
│   ├── game.js          (state, update, scoring)
│   ├── player.js        (surfer movement)
│   ├── waves.js         (wave spawning and behavior)
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
| Goal | Highest score from your ride | Free paddle and surf |
| Score shown | Yes, accumulates while in a wave | Yes, shown for fun, not saved |
| End condition | Run ends when your ride ends (see 6.5) | Never ends; quit via pause menu |
| High scores | Saved | Not saved |
| Wave frequency | Steady set schedule, slightly increasing | Gentle, frequent, forgiving |
| Wipeouts | Ends the run | Surfer pops up where they fell, no penalty |
| After a ride | Game Over | Stay in the world; paddle back out toward the ocean (left/up) and catch the next wave |

**Open decision (default chosen):** Compete is one heat of **90 seconds**. The run ends when the player's first ride ends, or at 90s if the player never rides a wave (score 0). This prevents stalling. Adjust if a "multiple rides in a heat" version is preferred (then score would add across rides and the heat timer would be the only end condition).

---

## 6. Gameplay

### 6.1 Perspective and World
- Top-down 2D view, portrait orientation.
- **The break:** the world is one long point break, `rideDistance` px wide (default ~3000, tune in config) and one screen tall. x = 0 is the ocean/take-off end; x = `rideDistance` is the beach end. The wave always peels **left to right**.
- **Shore/beach is at the bottom** of the screen; open ocean is at the top. Waves spawn at the top and travel toward the bottom (toward the beach).
- The player stays within the water area (clamped to the world and the visible play area vertically; cannot go onto the sand — sand strip at the bottom is a hard boundary, shown as a simple tan band). At the right end of the break the sand curves up and closes the water, so the surfer cannot go past it.
- **Camera:** scrolls horizontally only, following the surfer's x (target about 35% from the left of the screen, with a little lookahead in the direction of travel, smoothed) and clamped to the world. No vertical scroll. Ripple lines, wave visuals and shoreline foam are drawn in world coordinates, so they scroll past as the camera moves; the sand strip and ocean bands stay fixed to the screen vertically.

### 6.2 Player (Surfer on Board)
- Drawn as a simple board shape (rounded rectangle/ellipse) with a small surfer figure (circle head, simple body) that rotates toward movement direction.
- **Movement model:** velocity-based with acceleration and drag.
  - Input vector (from keyboard or joystick) has magnitude 0 to 1.
  - Holding input in one direction builds speed gradually toward a max (slow at first, faster the longer you keep going the same way). Suggested: acceleration ~ 220 px/s², max paddle speed ~ 140 px/s, drag when no input so the board glides to a stop.
  - Changing direction sharply bleeds speed (turning is slower than going straight), reinforcing "go fast or slow based on how much you move in one direction."
  - Joystick magnitude scales the target speed (small push = slow paddle, full push = max paddle).
- Tuning constants live in one config object at the top of `player.js` for easy adjustment.

### 6.3 Controls
- **Keyboard (desktop):** W/A/S/D (arrow keys also supported). Diagonals supported and normalized.
- **Touch (mobile):** **Floating joystick.** Touching anywhere in the lower ~70% of the screen (outside UI buttons) spawns a joystick base at the touch point; dragging moves the stick knob; lifting removes it. Max stick radius ~50px. Multi-touch is ignored beyond the first touch. Joystick must respect safe areas (do not spawn under home indicator zone; offset spawn upward if the touch is within the bottom inset).
- No other buttons are required for gameplay. Catching and staying in a wave is done only through movement.

### 6.4 Waves

**Wave anatomy.** A wave is a long crest line that runs along the whole break (the world width) at a slight angle and travels slowly toward the beach. It has a **peel point**: the section of the crest that is currently breaking (the "pocket"), which moves laterally along the crest at a set peel speed (always left to right). The ride happens in the pocket.

**Lifecycle**
1. **Swell (warning):** A faint swell line appears at the top of the screen and moves down. Slight visual rise (lighter band, small foam hint) signals that a wave is coming. Gives the player a few seconds to position.
2. **Building:** The crest becomes more defined (white foam line on top, darker face behind it). The pocket starts forming at one end and moves along the crest in the peel direction.
3. **Breaking / rideable:** Wave travels down toward shore at **wave speed** while the pocket moves laterally at **peel speed**. The pocket's position and the combined wave motion define the target the player must match.
4. **Closing out:** Near the beach the wave collapses into foam and fades; any rider still in it finishes the ride (ride ends, see 6.5).

**Suggested starting values** (tune in `waves.js` config):
- Wave speed toward shore: 60 px/s
- Peel speed along the crest: 90 px/s (varies per wave: 70–120)
- Wave spawn interval: Compete 6–9s; Fun 4–6s
- Crest length: the full break (`rideDistance`), angle of 15–30° from horizontal (the end nearer the beach is the right end)
- Rideable lifetime: `rideDistance / peel speed` (e.g. 3000 / 100 = about 30s)

### 6.5 Catching a Wave
- **Catch window:** When the crest line passes through the surfer's position, the surfer is "in position" for a brief window (~0.6s) if they are within the pocket zone near the peel point.
- **To catch it, the player must be paddling toward shore (downward) at or above a minimum catch speed (~70% of max paddle speed) when the crest reaches them.** Too slow, and the wave passes under the surfer (they bob up and over, no catch). Too early or outside the pocket zone, same result.
- Visual/audio feedback: small splash and a "whoosh" when successfully caught; board tilts and surfer crouches (simple pose change).

### 6.6 Riding a Wave
- Once caught, the surfer is **in the wave** and is carried toward shore at wave speed automatically.
- The player controls lateral movement (and a little vertical position on the face) with the same WASD/joystick controls.
- The pocket moves laterally at the peel speed. The player must **match that lateral speed** to stay in the pocket:
  - Define a **sweet-spot zone** around the pocket center (e.g. radius ~50px).
  - Inside the sweet spot: scoring runs at full rate.
  - In the **outer zone** (~50–90px): the surfer is slipping. Scoring continues at a reduced rate and a warning flash/sound plays.
  - Beyond the outer zone, **or** too far ahead of the pocket (onto the unbroken shoulder): **wipeout.**
- Falling behind lets the wave close out over the player (foam). Going too far ahead puts the player on the flat shoulder where the wave stops carrying them.
- The wave carries the player toward the beach. The ride ends naturally when the surfer reaches the end of the break (distance-based: the beach at x = `rideDistance`), or if the wave reaches the beach/foam line first (a "ride complete" is not a wipeout and keeps the score).

### 6.7 Wipeouts and Ride End
- **Wipeout:** simple tumble animation (board flips, splash), brief 1s pause.
- **Compete:** a wipeout or a completed ride ends the run → Game Over with the score accumulated.
- **Fun:** after a wipeout or completed ride, the surfer pops up on the board where they are (no penalty) and the score resets to 0 for the next ride (best ride shown in the HUD). The world keeps running: the surfer can paddle back out toward the ocean end (camera follows in both directions) and catch the next wave, which spawns on the Fun schedule. Number of simultaneous waves and spawn timing to be tuned in Step 4b.

### 6.8 Scoring
- Score accumulates only while in a wave.
- Base rate: **10 points per second** in the sweet spot, **4 points per second** in the outer zone.
- **Streak multiplier:** continuous time in the sweet spot raises a multiplier: ×1 → ×2 (after 3s) → ×3 (after 6s) → ×4 (after 10s). Dropping into the outer zone drops the multiplier by one step. Wipeout or ride end stops scoring.
- Score displayed as whole numbers in the HUD, with a small multiplier indicator beside it.
- Optional: speed-match bonus later (not in v1).

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
Within PLAYING, the surfer sub-state: `PADDLING → RIDING → WIPEOUT/RIDE_COMPLETE → (Fun: PADDLING | Compete: GAME_OVER)`.

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

1. **Scaffold:** `index.html`, CSS (iOS rules from section 3), manifest, empty service worker, icons placeholder, canvas fills the screen with safe-area-aware layout.
2. **Menu & navigation:** Main menu, High Scores, Settings screens, top-left sound toggle, top-right Compete/Fun toggle, state persistence.
3. **Player & controls:** Surfer movement with WASD and floating joystick, acceleration/drag model, water bounds.
4. **Waves:** Spawning, swell → building → breaking → close-out, pocket peel motion, visuals.
4b. **Scrolling break:** World coordinates, horizontal-follow camera, full-length left-to-right wave, sand wedge at the beach end, world-space ripples/foam, joystick and bounds working with the camera.
5. **Catch & ride:** Catch window logic, riding state, sweet-spot/outer-zone logic, wipeout/ride-complete.
6. **Scoring & modes:** Score accumulation, multiplier, Compete heat/game over, Fun respawn behavior, high score saving.
7. **Audio:** Web Audio SFX, music loop, toggle behavior, iOS unlock.
8. **PWA & polish:** Service worker caching, install hint, icon set, pause on visibility change, performance pass.
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
- [ ] WASD and arrow keys move the surfer; speed builds when moving in one direction
- [ ] Floating joystick appears under the thumb and scales speed with distance
- [ ] Camera follows the surfer along the break; the ride ends at the beach at the end of the break
- [ ] A wave can be caught only when paddling fast enough toward shore at the right moment
- [ ] Staying in the pocket by matching peel speed scores points; slipping reduces scoring; falling out wipes out
- [ ] Compete ends the run and offers a saved high score; Fun lets the player surf freely with no game over

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
