'use strict';

// Backward-compatible facade.
//
// The arena is now split into a game-agnostic core (src/core/*) and per-game
// plugins (src/games/*). This module preserves the original Mushroom-flavored API
// — board rows in, results out — by binding the Mushroom judge to the generic
// runners. server.js and scripts/test-engine.js keep importing from here unchanged.
// New, multi-game code should prefer src/games/registry.js + src/core/* directly.

const mushroom = require('./games/mushroom');
const { compileCpp } = require('./core/runtime');
const { runSingleGame: coreRunSingleGame } = require('./core/runner/runSingleGame');
const { runMatch: coreRunMatch } = require('./core/runner/runMatch');
const { runFight: coreRunFight } = require('./core/runner/runFight');
const { runTournament: coreRunTournament, runRoundRobinTournament: coreRR, runSwissTournament: coreSwiss } = require('./core/runner/runTournament');
const { summarizeGame } = require('./core/summarize');
const { classifyMatchScore, buildPairMatrix, createAnalytics, finalizeAnalytics, recordMatch } = require('./core/analytics');
const { makeSwissPairings } = require('./core/runner/tournament/pairings');
const { generateBoard, generateLegalMoves, isLegalMove, applyMove, scoreState, R, C } = (() => {
  const board = require('./games/mushroom/board');
  const rules = require('./games/mushroom/rules');
  return {
    generateBoard: board.generateBoard,
    R: board.R,
    C: board.C,
    generateLegalMoves: rules.generateLegalMoves,
    isLegalMove: rules.isLegalMove,
    applyMove: rules.applyMove,
    scoreState: rules.scoreState
  };
})();

// Legacy constants (Mushroom defaults). PROCESS_TIME_LIMIT_MS mirrors the previous
// 2*clock + 2*ready + grace derivation.
const TOTAL_TIME_MS = mushroom.timing.totalTimeMs;
const READY_TIMEOUT_MS = mushroom.timing.readyTimeoutMs;
const PROCESS_TIME_LIMIT_MS = TOTAL_TIME_MS * 2 + READY_TIMEOUT_MS * 2 + 5000;

// --- judge-injecting wrappers that keep the old board-rows signatures ---

async function runSingleGame(opts = {}) {
  const scenario = opts.scenario || { boardRows: opts.boardRows };
  const res = await coreRunSingleGame({ ...opts, judge: mushroom, scenario });
  if (res && res.boardRows === undefined && res.scenario?.boardRows) res.boardRows = res.scenario.boardRows;
  return res;
}

async function runMatch(opts = {}) {
  const dataset = opts.dataset && !opts.dataset.scenario
    ? { ...opts.dataset, scenario: { boardRows: opts.dataset.boardRows } }
    : opts.dataset;
  return coreRunMatch({ ...opts, judge: mushroom, dataset });
}

function runFight(opts = {}) {
  return coreRunFight({ ...opts, judge: mushroom });
}

function runTournament(opts = {}) {
  return coreRunTournament({ ...opts, judge: mushroom });
}

function runRoundRobinTournament(opts = {}) {
  return coreRR({ ...opts, judge: mushroom });
}

function runSwissTournament(opts = {}) {
  return coreSwiss({ ...opts, judge: mushroom });
}

module.exports = {
  R,
  C,
  TOTAL_TIME_MS,
  READY_TIMEOUT_MS,
  PROCESS_TIME_LIMIT_MS,
  generateBoard,
  generateLegalMoves,
  isLegalMove,
  applyMove,
  scoreState,
  compileCpp,
  classifyMatchScore,
  buildPairMatrix,
  createAnalytics,
  finalizeAnalytics,
  makeSwissPairings,
  recordMatch,
  runSingleGame,
  runMatch,
  runFight,
  runTournament,
  runRoundRobinTournament,
  runSwissTournament,
  summarizeGame
};
