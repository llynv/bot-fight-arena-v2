# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
node server.js          # start server (default port 5001, auto-increments on conflict)
npm run dev             # start with nodemon (auto-restart on changes)
npm test                # run core + engine integration tests (compiles real C++ bots)
npm run test:core       # game-agnostic harness test (fake game + contract conformance)
npm run test:engine     # Mushroom end-to-end incl. HTTP API
```

No build step — plain Node.js CommonJS. Requires `g++` or `clang++` on PATH for bot compilation.

## Architecture

**Bot Fight Arena** is a generic local web app that compiles uploaded C++ bots and fights them across **pluggable games**. The website, job lifecycle, tournaments, ELO, analytics, and inspector are game-agnostic; each game is a server **judge** + client **renderer** plugin. The shipped game is Mushroom (10×17 grid, rectangle-claiming puzzle).

> **Adding a game:** see `docs/ADDING_A_GAME.md`. Drop `src/games/<id>/` (judge) + `public/games/<id>/renderer.js` (renderer), register the id in `src/games/registry.js`. No harness edits.

### Data flow

```
Browser (public/) → POST /api/start or /api/tournaments/start
    → server.js creates a Job (in-memory Map) with a unique hex ID
    → async background task: compileCpp() → runFight() or runTournament()
    → Browser polls GET /api/jobs/:id every second
    → GET /api/jobs/:id/games/:gameIndex/detail for game replays
```

### Key files

| Path | Role |
|------|------|
| `server.js` | Express API, job lifecycle, upload (multer), progress via `addEvent()`; dispatches by `gameId` to the registry |
| `src/core/` | Game-agnostic harness: `process/LineProcess`, `runtime/` (C++ compile adapter), `runner/` (single game, match, fight, tournament/swiss+round-robin), `analytics/`, `rng`, `timing`, `summarize`, `contracts`, `conformance` |
| `src/games/<id>/` | A game **judge**: rules + stdio protocol + scenario generation (Mushroom is the reference) |
| `src/games/registry.js` | Registers + validates judges; `getJudge(id)`, `listGames()` |
| `src/gameEngine.js` | **Back-compat shim** — binds the Mushroom judge to core runners, preserves the original board-rows API for `scripts/test-engine.js` |
| `public/app.js` | Generic SPA — UI state, polling, rendering; delegates board drawing to `window.ArenaGames[gameId]` |
| `public/games/<id>/renderer.js` | A game **renderer**: `renderBoard`, `formatMove`, `describeMove`, `meta.scoreNoun` |
| `public/index.html` + `public/style.css` | Static shell |

### Game protocol (generic, 2-player sequential turn)

The judge defines the framing; the core runner drives it. Mushroom's instance:
1. Handshake: bot receives `READY FIRST`/`READY SECOND`, replies `OK`.
2. `INIT <board rows>` sent to both.
3. Each turn: bot receives `TIME <self> <opp>`, prints a move `r1 c1 r2 c2` (or `-1 -1 -1 -1` to pass); opponent gets `OPP <move> <ms>`.
4. Legal move = rectangle summing to 10 with a non-zero cell on each side; two passes in a row end the game.

Faults (timeout, illegal move, crash, process-lifetime cap) are classified by the harness, not the judge.

### Job model

Jobs live in memory (`jobs` Map in `server.js`) and on disk under `jobs/<hexId>/`. Each job has:
- `status`: `queued → compiling → running → done | error`
- `progress`: phase + counters streamed via `addEvent()`
- `games[]`: summarized game results (no log/moves)
- `fullResults`: full game data including move history (for replays)
- `matches[]` / `simulations[]`: tournament-only structures

### Tournament modes

- **round_robin**: every bot pair plays `simulationCount` times; ELO tracked
- **swiss**: bracket-style rounds; pairing via `makeSwissPairings()` (score-based with opponent-avoidance)

### C++ portability

`makePortableCppSource()` rewrites `#include <bits/stdc++.h>` to an explicit header list before compilation, enabling macOS builds of Linux-targeted bots.

### Core runner entry points (`src/core/`)

All take a `judge` (from `src/games/registry.js`) and use `scenario` (the judge's
per-dataset input) instead of hard-coded board rows.

| Export | Purpose |
|--------|---------|
| `runtime.compileCpp(src, out, opts)` | Compile a .cpp file, auto-selects compiler candidate |
| `runner/runSingleGame(opts)` | Drive one game via `judge.protocol` + `judge.rules` |
| `runner/runFight(opts)` | Run N games between two bots (1-vs-1 mode) |
| `runner/runTournament(opts)` | Dispatch to round-robin or swiss runner |
| `summarize.summarizeGame(result)` | Strip log/moves for polling-safe summary |
| `analytics.{createAnalytics, finalizeAnalytics}` | Build per-bot stats after tournament |

`src/gameEngine.js` still re-exports the Mushroom-bound versions of these for the
legacy test. The `cellsDiff*` fields in match/analytics data are the generic
per-match score margin; the UI labels them with each game's `scoreNoun`.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **bot-fight-arena-v2** (1115 symbols, 1762 relationships, 77 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/bot-fight-arena-v2/context` | Codebase overview, check index freshness |
| `gitnexus://repo/bot-fight-arena-v2/clusters` | All functional areas |
| `gitnexus://repo/bot-fight-arena-v2/processes` | All execution flows |
| `gitnexus://repo/bot-fight-arena-v2/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
