# Generic Bot Arena — Boilerplate Refactor Plan

## Goal

Turn this single-game app (Mushroom Game) into a **reusable bot-fight platform**. The
website, job lifecycle, tournament engine, analytics, and inspector stay. Only a
**Judge** (game rules + protocol) and a **Renderer** (how to draw the game) change per
game. Adding a new game = drop two plugin folders and register an id. **No harness edits.**

## Scope (decided)

- **Game class:** 2-player sequential turn games (two bots alternate, per-bot time bank,
  one move/turn, terminal + score). Same shape as Mushroom.
- **Language:** plain JS (CommonJS, no build step). Contract enforced by JSDoc typedefs +
  runtime conformance checks.
- **Bot language:** C++ only. Compile path stays, but isolated as a "runtime adapter" so a
  future language is a localized change.

## Current coupling (audit)

`src/gameEngine.js` (1705 lines) mixes two concerns:

**Generic harness (keep, move to `src/core/`):**
`LineProcess`, `compileCpp` + portable-header rewrite, rng (`xmur3`/`mulberry32`/seed
helpers), `runWithConcurrency`, `runSingleGame` *loop skeleton*, `runMatch`, `runFight`,
`runRoundRobinTournament`, `runSwissTournament`, `makeSwissPairings`, ELO, `createAnalytics`/
`recordMatch`/`finalizeAnalytics`, pair matrix.

**Mushroom judge (extract to `src/games/mushroom/`):**
`R/C/N`, `generateBoard`, `buildState`/`cloneState`, `rectSum`, `sideHasNonZero`,
`isLegalMove`, `applyMove`, `scoreState`, `generateLegalMoves`, `parseMoveLine`/
`moveToString`, the protocol strings inlined in `runSingleGame` (`INIT <rows>`, `TIME a b`,
`OPP <move> <ms>`, pass-pass termination, 500-ply cap), cell-score fields in `summarizeGame`.

`server.js`: fully generic except the name `cellsDiff` leaks through the API.

`public/app.js` + `index.html`: board grid hardcodes `%17`, `*17`, `Array(170)`, `inRect`,
`formatMove`, `buildReplayState`, the word "cells", and Vietnamese copy.

## Target structure

```
src/
  core/                       # game-agnostic; no judge knowledge
    process/LineProcess.js
    runtime/compileCpp.js     # + portable header (C++ runtime adapter)
    runtime/index.js          # adapter registry: { cpp: {compile, exeName} }
    rng.js
    concurrency.js
    runner/runSingleGame.js   # drives judge.protocol + judge.rules hooks
    runner/runMatch.js
    runner/runFight.js
    runner/tournament/{roundRobin,swiss,pairings,elo}.js
    analytics/{create,record,finalize,pairMatrix}.js
    summarize.js
    contracts.js              # JSDoc typedefs: GameJudge, Scenario, Move, etc.
    conformance.js            # validateJudge(judge) — fail fast on bad plugin
  games/
    registry.js               # id -> judge module
    _template/                # copy-to-start skeleton judge
    mushroom/{index,board,rules,move,protocol,meta}.js
public/
  core/                       # generic SPA (upload, poll, standings, tournament, inspector shell)
  games/
    registry.js               # id -> renderer (window.ArenaGames)
    mushroom/renderer.js
server.js                     # + gameId param, GET /api/games
```

## The two contracts

### Server-side: `GameJudge`

```js
/**
 * @typedef {Object} GameJudge
 * @property {string} id
 * @property {string} name
 * @property {{ totalTimeMs:number, readyTimeoutMs:number, maxPlies:number }} timing
 * @property {(seed:string)=>Scenario} createScenario      // per-dataset input (serializable)
 * @property {GameProtocol} protocol
 * @property {GameRules} rules
 * @property {(result, scenario)=>object} [summarizeExtras] // game-specific summary fields
 */

/**
 * @typedef {Object} GameProtocol
 * @property {{ first:string, second:string, expect:string }} ready  // handshake lines + expected reply
 * @property {(scenario)=>string} initMessage                        // sent to both bots at start
 * @property {(state, player, remaining:[number,number])=>string} turnMessage
 * @property {(line:string)=>{ok:boolean, move:Move, reason:string}} parseMove
 * @property {(move:Move)=>string} serializeMove
 * @property {(move:Move, elapsedMs:number)=>string} opponentMessage // echoed to opponent
 */

/**
 * @typedef {Object} GameRules
 * @property {(scenario)=>State} createState
 * @property {(state, move:Move, player:0|1)=>boolean} isLegal
 * @property {(state, move:Move, player:0|1)=>State} applyMove        // returns next state
 * @property {(state, move:Move, prevState)=>boolean} isTerminal      // e.g. pass-pass
 * @property {(state)=>{first:number, second:number}} score
 * @property {(state, move:Move, player:0|1)=>object} [moveTelemetry] // extra per-turn fields
 */
```

The generic `runSingleGame` owns everything game-independent and calls only the hooks above:
ready handshake, time accounting, `READ_TIMEOUT`/`PROCESS_LIMIT`/`time_forfeit`/`invalid`
classification, memory sampling, `winner = 1 - turn` on fault, winner-by-score fallback. It
**must preserve the exact status codes** currently produced.

### Client-side: `GameRenderer` (registered as `window.ArenaGames[id]`)

```js
window.ArenaGames['mushroom'] = {
  meta: { cols: 17, rows: 10, scoreNoun: 'cells' },   // kills hardcoded 17/170 + "cells" labels
  buildReplayState(game, turnCount),                  // reconstruct display state from moves
  renderBoard(container, game, state, lastMove),      // paint one replay turn
  formatMove(move),                                   // "r1 c1 r2 c2"
  describeMove(move),                                 // "Rect area N cells"
};
```

Generic SPA loads `public/games/<job.gameId>/renderer.js` dynamically and asks it to paint.
All other panels (standings, tournament explorer, events, timing) are game-agnostic and use
`meta.scoreNoun` for labels.

## Generalization renames

- API/analytics `cellsDiff*` → `scoreMargin*` (judge-defined secondary metric =
  `score.first - score.second` mapped to A/B). Keep `cellsDiff` as a back-compat alias in
  export JSON so old dumps still parse.
- "cells" UI text → `renderer.meta.scoreNoun`.

## Phasing (each phase ships green; run tests between)

0. **Contract scaffold** — add `core/contracts.js`, `core/conformance.js`, `games/registry.js`.
   No behavior change.
1. **Extract core** — move generic code out of `gameEngine.js` into `src/core/*`.
   `gameEngine.js` becomes a thin re-export shim (keeps `server.js` working untouched).
2. **Extract Mushroom judge** — into `src/games/mushroom/`, implement `GameJudge`. Rewrite
   `runSingleGame` to consume judge hooks instead of inlined rules. Snapshot-test parity.
3. **Server wires gameId** — `gameId` field on `/api/start` + `/api/tournaments/start`
   (default `mushroom`); `GET /api/games` lists registered judges; pass judge into runners.
   Apply `scoreMargin` rename + alias.
4. **Frontend split** — generic SPA in `public/core/`; Mushroom board render → renderer
   plugin; dynamic load by `job.gameId`; replace `17`/`170`/"cells" via `meta`. Externalize
   VI strings (lightweight i18n map) — optional.
5. **Tests** — split `scripts/test-engine.js` into: (a) core harness test with a trivial fake
   judge, (b) Mushroom judge test (compiles real C++), (c) `validateJudge` conformance test
   every plugin must pass.
6. **Docs + template** — "Add a new game" guide; `games/_template/` + `public/games/_template/`.

## Add-a-new-game workflow (the payoff)

1. `cp -r src/games/_template src/games/<newgame>` → implement `createScenario`, `protocol`,
   `rules`.
2. `cp -r public/games/_template public/games/<newgame>` → implement `meta` + `renderBoard`.
3. Register id in both registries.
4. Done — upload, fight, tournaments, ELO, swiss, analytics, inspector all reused.

## Risks / decisions to honor during build

- **Immutability:** contract `applyMove` returns next state (per repo coding rules). Mushroom
  may keep internal array mutation *behind that boundary* for the legal-move generator hot
  path — document the deviation where it happens.
- **Edge-case parity:** the generic runner must reproduce every current status
  (`timeout`/`time_forfeit`/`process_limit`/`process_exit`/`invalid`/`finished`) and
  `winner` assignment. Capture a golden-output snapshot from current `gameEngine.js` before
  Phase 2 and diff against it.
- **Export schema break:** the `scoreMargin` rename touches server + frontend + export. Alias
  prevents breaking saved JSON.
- **Protocol assumption:** `ready.expect === 'OK'`, pass-pass end, and the `TIME a b` framing
  are now judge-owned — a new game redefines them freely without touching core.
```
