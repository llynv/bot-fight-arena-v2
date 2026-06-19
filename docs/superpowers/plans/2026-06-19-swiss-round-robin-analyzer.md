# Swiss / Round-Robin Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tournament modes (`round_robin`, `swiss`) with reusable match/game engine, analytics, export, minimal UI, while preserving existing duel mode and inspector endpoints.

**Architecture:** Keep `runSingleGame()` as primitive. Add `runMatch()` and tournament runners on top. Store flattened `games`, `matches`, `simulations`, `analytics` in job/full export. Extend UI with mode-aware polling views while preserving old duel views and game inspector.

**Tech Stack:** Node.js, Express, multer, vanilla JS, existing local C++ execution engine.

---

### Task 1: Add Tournament Engine Primitives

**Files:**
- Modify: `src/gameEngine.js`
- Test: `scripts/test-engine.js`

- [ ] Add `classifyMatchScore`, `runMatch`, dataset-seed helper, tournament export helpers.
- [ ] Keep `runSingleGame` contract stable.
- [ ] Add tests for match score buckets `2, 1.5, 1, 0.5, 0`.
- [ ] Add tests for one-dataset role-swap behavior.

### Task 2: Add Round-Robin + Swiss Runners

**Files:**
- Modify: `src/gameEngine.js`
- Test: `scripts/test-engine.js`

- [ ] Add `runRoundRobinTournament`, `runSwissTournament`, `runTournament`.
- [ ] Add seeded pair ordering for round-robin.
- [ ] Add swiss pairing and bye handling.
- [ ] Add tests for pair counts, round counts, opponent-repeat avoidance.

### Task 3: Add Analytics + Pair Matrix

**Files:**
- Modify: `src/gameEngine.js`
- Test: `scripts/test-engine.js`

- [ ] Add analytics accumulator and finalizer.
- [ ] Add Elo update.
- [ ] Add pair matrix mirrored stats.
- [ ] Add tests for symmetry, non-ok counting, standings metrics presence.

### Task 4: Add Tournament Server Endpoint

**Files:**
- Modify: `server.js`
- Test: `scripts/test-engine.js`

- [ ] Add multipart parser path for `/api/tournaments/start`.
- [ ] Add bot registry/job setup for tournaments.
- [ ] Add lightweight job summary for polling.
- [ ] Add export shape for tournaments.
- [ ] Keep existing job/game endpoints compatible.

### Task 5: Add Tournament UI Minimal View

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/style.css`

- [ ] Add mode selector + tournament setup fields.
- [ ] Add multi-bot upload support.
- [ ] Add tournament summary cards.
- [ ] Add standings table, simulation list, match list, basic pair matrix.
- [ ] Reuse existing game inspector via flattened `gameIndex`.

### Task 6: Update README

**Files:**
- Modify: `README.md`

- [ ] Add short docs for duel, round-robin, swiss.
- [ ] Explain simulation count, swiss rounds, match win/draw/loss percentages.

### Task 7: Verify End-to-End

**Files:**
- Test: `scripts/test-engine.js`

- [ ] Run `node scripts/test-engine.js`
- [ ] Verify old duel path still works.
- [ ] Verify tournament data reaches export and game detail endpoints.
