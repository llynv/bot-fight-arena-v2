# Adding a New Game

The arena is a generic platform. The website, job lifecycle, tournaments, ELO,
analytics, and inspector are **game-agnostic**. A game is two plugins:

| Plugin | Location | Responsibility |
|--------|----------|----------------|
| **Judge** (server) | `src/games/<id>/index.js` | Rules + stdio protocol + scenario generation |
| **Renderer** (client) | `public/games/<id>/renderer.js` | How a game state is drawn in the inspector |

No harness files change. Adding a game is additive.

## Steps

### 1. Create the judge

```bash
cp -r src/games/_template src/games/<your-game>
```

Edit `src/games/<your-game>/index.js`:

- Set `id` (a stable slug) and `name`.
- `timing`: default `totalTimeMs`, `readyTimeoutMs`, `maxPlies`.
- `createScenario(seed)`: deterministic, serializable per-dataset input.
- `protocol`: the stdio framing — `ready` handshake, `initMessage`, `turnMessage`,
  `parseMove`, `serializeMove`, `opponentMessage`.
- `rules`: `createState`, `isLegal`, `applyMove` (returns next state), `isTerminal`,
  `score` (`{first, second}`), optional `moveTelemetry`.

Split into `board.js` / `rules.js` / `protocol.js` / `move.js` / `meta.js` like
`src/games/mushroom/` if it grows past ~200 lines.

The full contract with types is in `src/core/contracts.js`.

### 2. Register it

In `src/games/registry.js`:

```js
const yourGame = require('./your-game');
register(yourGame); // validated against the contract at load time
```

If the judge is malformed, `register` throws immediately with the reasons.

### 3. Create the renderer

```bash
cp -r public/games/_template public/games/<your-game>
```

Edit `public/games/<your-game>/renderer.js`:

- `id` MUST match the judge id.
- `meta.scoreNoun`: label for the score metric (e.g. `"cells"`, `"points"`).
- `renderBoard(game, turnCount, helpers)`: return innerHTML for the replay board.
  `game.scenario` is your scenario; `game.moves` is the move list;
  `helpers.ownerName(player)` maps a player index to a name.
- `formatMove(move)` and `describeMove(move)`: how a move reads in the timeline /
  detail panels.

The SPA loads `public/games/<id>/renderer.js` lazily by `job.gameId` — no
`index.html` edit needed. (`mushroom` is statically included so the default never
depends on async loading.)

### 4. Run it

`node server.js`, open the app. The **Game** picker appears automatically once a
second game is registered. Pick your game, upload C++ bots, fight.

## Protocol contract (what bots see)

The generic runner drives a 2-player sequential turn loop:

1. Handshake: each bot receives `protocol.ready.first`/`.second`, must reply
   `protocol.ready.expect`.
2. `protocol.initMessage(scenario)` is sent to both.
3. Each turn, the bot on move receives `protocol.turnMessage(...)`, replies with one
   line, which `protocol.parseMove` turns into a move. After a legal move the
   opponent receives `protocol.opponentMessage(...)`.
4. The game ends when `rules.isTerminal` returns true, on `maxPlies`, or on a fault
   (timeout, illegal move, crash, process-lifetime cap) — faults are classified by
   the harness, not the judge.

## Testing

- `npm run test:core` — proves the runner is game-agnostic (a fake "countdown" game
  + contract conformance). Add assertions for your judge's pure rules here.
- `npm run test:engine` — Mushroom end-to-end incl. the HTTP API.
- `npm test` — both.

For your game, the highest-value test is a conformance check plus a short
`runSingleGame` against two trivial bots, mirroring `scripts/test-core.js`.
