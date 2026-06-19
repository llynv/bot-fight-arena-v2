'use strict';

const { R, C } = require('./board');

// A legal move claims a rectangle whose cell values sum to 10, with at least one
// non-zero cell on every side. Claimed cells zero out and take the player's owner.

function areaOf(m) {
  if (m.pass) return 0;
  return (m.r2 - m.r1 + 1) * (m.c2 - m.c1 + 1);
}

function scoreState(state) {
  let first = 0;
  let second = 0;
  for (const o of state.own) {
    if (o === 0) first++;
    else if (o === 1) second++;
  }
  return { first, second };
}

function rectSum(val, r1, c1, r2, c2) {
  let sum = 0;
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) sum += val[r * C + c];
  }
  return sum;
}

function sideHasNonZero(val, r1, c1, r2, c2, side) {
  if (side === 'top') {
    for (let c = c1; c <= c2; c++) if (val[r1 * C + c] !== 0) return true;
  } else if (side === 'bottom') {
    for (let c = c1; c <= c2; c++) if (val[r2 * C + c] !== 0) return true;
  } else if (side === 'left') {
    for (let r = r1; r <= r2; r++) if (val[r * C + c1] !== 0) return true;
  } else if (side === 'right') {
    for (let r = r1; r <= r2; r++) if (val[r * C + c2] !== 0) return true;
  }
  return false;
}

function isLegalMove(state, m) {
  if (m.pass) return true;
  if (!Number.isInteger(m.r1) || !Number.isInteger(m.c1) || !Number.isInteger(m.r2) || !Number.isInteger(m.c2)) return false;
  if (m.r1 < 0 || m.r2 >= R || m.c1 < 0 || m.c2 >= C || m.r1 > m.r2 || m.c1 > m.c2) return false;
  if (rectSum(state.val, m.r1, m.c1, m.r2, m.c2) !== 10) return false;
  return sideHasNonZero(state.val, m.r1, m.c1, m.r2, m.c2, 'top') &&
    sideHasNonZero(state.val, m.r1, m.c1, m.r2, m.c2, 'bottom') &&
    sideHasNonZero(state.val, m.r1, m.c1, m.r2, m.c2, 'left') &&
    sideHasNonZero(state.val, m.r1, m.c1, m.r2, m.c2, 'right');
}

// Mutates state in place and returns it. The contract asks for "next state"; for
// this hot path (one shared state advanced ply-by-ply, plus a brute-force legal
// move generator) in-place mutation is the deliberate, documented exception to
// the repo's immutability default.
function applyMove(state, m, player) {
  if (m.pass) {
    state.lastPass = true;
    return state;
  }
  for (let r = m.r1; r <= m.r2; r++) {
    for (let c = m.c1; c <= m.c2; c++) {
      const k = r * C + c;
      state.val[k] = 0;
      state.own[k] = player;
    }
  }
  state.lastPass = false;
  return state;
}

function generateLegalMoves(state) {
  const moves = [];
  for (let r1 = 0; r1 < R; r1++) {
    for (let r2 = r1; r2 < R; r2++) {
      for (let c1 = 0; c1 < C; c1++) {
        for (let c2 = c1; c2 < C; c2++) {
          const m = { r1, c1, r2, c2, pass: false };
          if (isLegalMove(state, m)) moves.push(m);
        }
      }
    }
  }
  return moves;
}

module.exports = { areaOf, scoreState, rectSum, sideHasNonZero, isLegalMove, applyMove, generateLegalMoves };
