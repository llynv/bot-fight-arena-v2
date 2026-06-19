'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// GAME PLUGIN TEMPLATE (server-side judge)
//
// Copy this folder to src/games/<your-game>/ and fill in the rules + protocol.
// Then register it in src/games/registry.js:
//     const yourGame = require('./your-game');
//     register(yourGame);
// And add a matching client renderer at public/games/<your-game>/renderer.js.
//
// The harness (process management, time bank, fault handling, tournaments, ELO,
// analytics, inspector) is game-agnostic and needs no changes.
//
// This example implements a trivial "Countdown" game so the file is runnable as a
// reference. Replace every piece with your real game.
// See src/core/contracts.js for the full typedefs.
// ─────────────────────────────────────────────────────────────────────────────

/** @type {import('../../core/contracts').GameJudge} */
const judge = {
  id: '_template',
  name: 'Template Game',

  // Surfaced to clients via GET /api/games. `scoreNoun` labels the score metric.
  display: { scoreNoun: 'points' },

  // Default budgets; the UI lets users override per job.
  timing: {
    totalTimeMs: 10000,   // per-bot clock for one game
    readyTimeoutMs: 5000, // handshake reply deadline
    maxPlies: 200         // hard cap on turns
  },

  // Build the per-dataset input from a seed. Must be deterministic + serializable.
  createScenario(seed) {
    // Derive from `seed` so results are reproducible. Example: fixed start value.
    return { start: 21 };
  },

  // How the harness talks to bots over stdio.
  protocol: {
    // Sent to each role at startup; both must reply exactly `expect`.
    ready: { first: 'READY FIRST', second: 'READY SECOND', expect: 'OK' },

    // Sent to both bots once, after the handshake.
    initMessage(scenario) {
      return `INIT ${scenario.start}`;
    },

    // Sent to the bot whose turn it is. remaining = [firstMs, secondMs].
    turnMessage(_state, player, remaining) {
      return `TIME ${Math.floor(remaining[player])} ${Math.floor(remaining[1 - player])}`;
    },

    // Parse one line of bot output into a move object.
    parseMove(line) {
      const step = Number(String(line).trim());
      if (!Number.isFinite(step)) return { ok: false, move: null, reason: `unparseable: ${line}` };
      return { ok: true, move: { step }, reason: '' };
    },

    // For logs and the opponent echo.
    serializeMove(move) {
      return String(move.step);
    },

    // Echoed to the opponent after a legal move.
    opponentMessage(move, elapsedMs) {
      return `OPP ${move.step} ${elapsedMs}`;
    }
  },

  // Pure game rules.
  rules: {
    createState(scenario) {
      return { remaining: scenario.start, lastMover: -1 };
    },
    isLegal(state, move) {
      return move.step >= 1 && move.step <= 3 && move.step <= state.remaining;
    },
    applyMove(state, move, player) {
      state.remaining -= move.step;
      state.lastMover = player;
      return state; // return the next state (in-place mutation is allowed here)
    },
    // True when `move` ends the game. `prevMove` is the previous ply's move (or null).
    isTerminal(state /*, move, prevMove */) {
      return state.remaining <= 0;
    },
    // Per-player score. Higher wins; equal is a draw.
    score(state) {
      return { first: state.lastMover === 0 ? 1 : 0, second: state.lastMover === 1 ? 1 : 0 };
    },
    // Optional: extra per-turn fields shown in the inspector timeline.
    moveTelemetry(state) {
      return { remaining: state.remaining };
    }
  }
};

module.exports = judge;
