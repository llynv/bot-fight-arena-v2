'use strict';

const { generateBoard, buildState } = require('./board');
const { isLegalMove, applyMove, scoreState, generateLegalMoves } = require('./rules');
const { protocol } = require('./protocol');
const { display } = require('./meta');

/** @type {import('../../core/contracts').GameJudge} */
const judge = {
  id: 'mushroom',
  name: 'Mushroom Game',
  display,
  timing: {
    totalTimeMs: 30000,
    readyTimeoutMs: 10000,
    maxPlies: 500
  },
  createScenario(seed) {
    return { boardRows: generateBoard(seed) };
  },
  protocol,
  rules: {
    createState(scenario) {
      return buildState(scenario.boardRows);
    },
    isLegal(state, move) {
      return isLegalMove(state, move);
    },
    applyMove(state, move, player) {
      return applyMove(state, move, player);
    },
    // Game ends when a pass immediately follows another pass.
    isTerminal(_state, move, prevMove) {
      return !!(move.pass && prevMove && prevMove.pass);
    },
    score(state) {
      return scoreState(state);
    },
    moveTelemetry(state) {
      return { legalAfter: generateLegalMoves(state).length };
    }
  }
};

module.exports = judge;
