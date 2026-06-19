# Swiss / Round-Robin Analyzer Design

## Goal

Upgrade `bot-fight-arena-v2` from 2-bot duel tool into local tournament/analyzer tool supporting:

- `duel`
- `round_robin`
- `swiss`

while keeping existing low-level game execution, telemetry, replay, and export behavior.

## Chosen Approach

Use match-centric refactor.

- keep `runSingleGame()` as lowest primitive
- add `runMatch()` on top of 1 dataset
- add `runTournament()` plus `runRoundRobinTournament()` and `runSwissTournament()`
- keep old `/api/start` duel path intact
- add `/api/tournaments/start` for multi-bot tournaments
- flatten all tournament output into `games[]`, `matches[]`, `simulations[]`, `analytics`

## Architecture

Layers:

1. Compile layer
2. Game layer
3. Match layer
4. Tournament layer
5. Analytics layer
6. Server/job orchestration layer
7. Polling UI layer

Data flow:

`upload -> compile bots -> build simulation pairings -> generate dataset per match -> runMatch -> runSingleGame -> record games -> record match -> update analytics -> update polling summary -> inspect/export`

## Domain Model

### Game

One bot-FIRST vs bot-SECOND run on one board.

Contains:

- board rows
- seed
- role mapping
- raw protocol log
- stderr
- memory
- remaining clocks
- moves
- game status
- scores

### Match

One bot pair on one dataset.

Default `playBothSides=true`:

- game 1: A first, B second
- game 2: B first, A second

Match score from A perspective:

- game win = `1`
- game draw = `0.5`
- game loss = `0`

Classification:

- `scoreA >= 1.5` -> `win`
- `scoreA === 1` -> `draw`
- `scoreA <= 0.5` -> `loss`

### Simulation

One complete tournament run.

- round-robin: all unordered pairs
- swiss: `swissRounds` rounds, avoid repeats if possible

### Tournament Job

One job may contain many simulations.

## API

Keep existing endpoints:

- `POST /api/start`
- `GET /api/jobs/:id`
- `GET /api/jobs/:id/events?from=n`
- `GET /api/jobs/:id/games/:gameIndex/detail`
- `GET /api/jobs/:id/games/:gameIndex/log`
- `GET /api/jobs/:id/export.json`

Add:

- `POST /api/tournaments/start`

Tournament payload uses multipart form with:

- `mode`
- `bots[]`
- `botNames[]`
- `botTags[]`
- `simulationCount`
- `seedBase`
- `botTimeLimitMs`
- `playBothSides`
- `maxConcurrentGames`
- `stopOnCompileError`
- `swissRounds`
- `pairingMethod`
- `initialElo`
- `eloKFactor`
- `avoidRepeatOpponents`

Multi-bot v1 excludes per-bot `data.bin`. Existing duel path keeps old `data.bin` support.

## Engine Functions

Public additions in `src/gameEngine.js`:

- `runMatch()`
- `runTournament()`
- `runRoundRobinTournament()`
- `runSwissTournament()`
- `createAnalytics()`
- `recordMatch()`
- `finalizeAnalytics()`
- `buildPairMatrix()`
- `makeSwissPairings()`
- `updateElo()`
- `buildDatasetsForSimulation()`

Keep:

- `compileCpp()`
- `runSingleGame()`
- `runFight()` for backward compatibility

## Swiss Rules

Per round:

- sort by score desc
- then elo desc
- then deterministic random tiebreak
- pair adjacent valid opponents
- if adjacent invalid due repeat, scan downward
- if none valid, allow repeat and mark `repeatPairing`

Odd bot count:

- assign one bye
- prefer lowest-ranked bot with no previous bye
- bye gives `+1` match point
- no game, no Elo update

## Elo

Use normalized match score.

If `playBothSides=true`:

- `actualA = scoreA / 2`

Else:

- `actualA = scoreA`

Expected score:

`expectedA = 1 / (1 + 10 ^ ((eloB - eloA) / 400))`

Update:

- `eloA += K * (actualA - expectedA)`
- `eloB += K * ((1 - actualA) - (1 - expectedA))`

## Analytics

Need:

- global counters
- per-bot match/game/role/non-ok stats
- elo distribution stats
- cells diff distribution stats
- pair matrix
- simulation placements

Derived metrics:

- match win/draw/loss %
- game win/draw/loss %
- avg match score
- avg/median/p10/p90 cells diff
- first-side win %
- second-side win %
- non-ok rate
- power score
- safety score
- stability score

## UI v1

Minimal but useful.

Add:

- mode selector
- multi-bot upload area
- tournament settings panel
- tournament summary cards
- standings table
- simulation list
- match list
- basic pair matrix

Keep:

- existing polling model
- compile logs panel
- events panel
- game inspector

## Execution Strategy

Implement in slices:

1. engine primitives + tests
2. round-robin + tests
3. swiss + tests
4. analytics + export + tests
5. server endpoint + job summaries
6. UI minimal tournament mode
7. README update

## Constraints

- no DB
- no websocket
- no sandbox changes
- polling remains
- heavy payload stays out of `/api/jobs/:id`
- `maxConcurrentGames` stored but v1 executes sequentially for safety

## Risks

- `src/gameEngine.js` and `public/app.js` already large
- analytics can double-count if mirrored incorrectly
- swiss edge cases need explicit tests
- old duel inspector compatibility must remain intact

## Success Criteria

Tool can answer:

- which bot has highest match win probability
- which bot has lowest match loss probability
- which bot is stable across simulations
- which bot is risky but powerful
- which bot underperforms vs specific opponents
- which bot is stronger as FIRST vs SECOND
