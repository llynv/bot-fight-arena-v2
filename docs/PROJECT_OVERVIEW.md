# Bot Fight Arena — Project Overview

## What Is This

A **local web app** where you upload C++ bots, compile them, and pit them against each other in the **Mushroom Game** — a 10×17 grid puzzle where two players take turns claiming rectangles whose cells sum to 10. No external services; runs entirely on your machine via a Node.js Express server.

The app supports three competitive modes:

| Mode | Description |
|------|-------------|
| **Duel** | 2 bots, N datasets, optional role-swap |
| **Round Robin** | N bots, every pair plays every simulation |
| **Swiss** | N bots, bracket pairing with ELO tracking |

---

## Full UI Feature Inventory

### 1. Setup Form

**Mode switcher** — a dropdown toggles between Duel, Round Robin, and Swiss. The form fields swap completely based on mode.

**Duel fields:**
- Drag-and-drop (click) file boxes for Bot A `.cpp` and Bot B `.cpp`
- Optional `data.bin` upload for each bot
- Dataset count (1–1000)
- Per-bot time limits in milliseconds
- Seed base text field (empty = random per dataset)
- "Play both sides" toggle — runs each dataset twice with roles swapped

**Tournament fields:**
- Multi-file upload for N bots (all `.cpp` at once)
- **Bot roster table** — after upload, an editable table appears with: file name, display name input, tag input, per-bot `data.bin` upload
- Simulation count
- Swiss rounds (Swiss only)
- Shared bot time limit
- Seed base
- Pairing method dropdown (Swiss only): `score_then_random`, `score_then_elo`, `random_swiss`
- Initial ELO & K-factor (Swiss only)
- Max parallel games
- Play both sides toggle
- Avoid repeat opponents toggle (Swiss only)
- Stop on compile error toggle

**Hero stats panel** — 4 live stats that update as you type: Board size (static 10×17), Bot clocks, Process cap (auto-derived), Dataset count.

---

### 2. Progress Bar & Status

Appears after clicking **Start Fight**:
- Status text: `RUNNING · Compiling bots · 0/30`
- Animated gradient progress bar
- **Export JSON** button — downloads full game data once job completes

---

### 3. Summary Metrics (Duel Mode)

A 4-column metric grid shows high-level results:
- Win/draw/loss counts for each bot
- Total games played
- Additional diagnostics (timeouts, illegal moves, crashes) in a secondary grid

---

### 4. Standings Panel

**Duel mode:** Two side-by-side stat cards — one per bot — showing wins, draws, losses, win rate as a percentage.

**Tournament mode:**
- A sortable table with columns: Rank, Name, Tag, Played, Wins, Draws, Losses, Win%, Score, ELO, Game Wins, Game Losses, Avg Score
- Sortable by any column (click header)
- A **horizontal bar chart** (CSS-rendered, no library) visualizing each bot's win rate / score

---

### 5. Dataset Results Grid (Duel Mode)

Games grouped by dataset. Each dataset block shows:
- Dataset header with seed
- Game chips side-by-side (when play-both-sides is on): Bot A FIRST + Bot B FIRST
- Each chip is a colored button: gold (A wins), green (B wins), yellow (draw)
- Click any chip → opens that game in the Game Inspector

---

### 6. Tournament Views (Tournament Mode)

A two-column panel layout with multiple sub-panels:

**Simulation Explorer** (left column):
- Scrollable list of completed simulations
- Each entry shows: sim index, seed, winner bot name, non-ok count, top 5 bots
- Click a simulation → loads its detail and filters the match explorer

**Match Explorer** (right column):
- Paginated match list (50/page) with search by bot name or seed
- Sort by: Simulation, Round, Score A, Cells diff, Non-ok count
- Active filter pills (show when filtered by simulation or bot pair)
- Pagination controls (prev/next/page X of Y)
- Click a match row → auto-opens the last game of that match in the inspector

**Simulation Detail panel:**
- Round-by-round summary table for Swiss
- Per-round standings with match results
- Clickable game rows

**Pair Matrix panel:**
- NxN grid of all bot head-to-head records
- Cell colors: win/draw/loss relative to row bot
- Click a cell → loads head-to-head history in the pair detail panel

**Head-to-Head Detail panel:**
- List of all matches between two selected bots across all simulations
- Win/draw/loss for each match

---

### 7. Game Inspector

The deepest view — opens when you click any game chip or match row.

**Game list sidebar:**
- Scrollable list of all completed games
- Each row: game index, botA vs botB, FIRST/SECOND label, outcome pill (Win A / Win B / Draw), status badge (OK, timeout, illegal, crash)

**Board replay:**
- 10×17 interactive grid rendered as CSS cells
- Each cell shows its numeric value (0–9)
- Claimed cells are colored: gold (Bot A) or green (Bot B), zeroed out
- The move being applied on the current turn is highlighted with a dashed border

**Turn controls:**
- Prev / Next turn buttons
- Range slider (scrub through all turns)
- Turn label: "Turn N — Bot X (FIRST/SECOND)"

**Turn detail:**
- Move coordinates shown as `[r1,c1] → [r2,c2]`
- Move validity status
- Score delta per turn (cells claimed)

**Turn timeline:**
- Mini row of colored turn chips showing the full game history
- Active turn highlighted
- Click any chip to jump to that turn

**Log panels:**
- **Raw protocol log** — full stdin/stdout exchange between arbiter and both bots
- **Bot stderr** — captured stderr from both bot processes

---

### 8. Compile Logs & Live Events

A collapsible section at the bottom:
- **Compile logs** — stdout/stderr from each bot's compilation attempt, per bot
- **Live events stream** — real-time JSON events as they arrive: `game_start`, `game_done`, `match_done`, `simulation_done`, `tournament_done`

---

## Visual Design (Current)

- **Dark mode only**, near-black background (`#070a12`)
- Gold/amber primary accent (`#e0b15f`) — used for Bot A, buttons, highlights
- Muted green secondary (`#91b39d`) — used for Bot B
- Glassmorphism-style cards with `backdrop-filter: blur`
- Gradient radial spots in hero section
- Rounded corners throughout (16–24px radius)
- No third-party UI library — all CSS custom properties + vanilla HTML/CSS/JS

---

## Technical Constraints for Redesign

- Pure vanilla JS (no framework, no build step) — all in `public/app.js`
- DOM is server-rendered via `index.html` and mutated by JS
- `app.js` selects elements by `id` — IDs must not change unless corresponding JS updates are made
- CSS lives in `public/style.css` — the only stylesheet
- The board grid renders 170 cells (10×17) dynamically via JS
- Charts are CSS-only (no canvas/SVG library)
- The app is a single page — all sections are hidden/shown via `.hidden` class toggling
