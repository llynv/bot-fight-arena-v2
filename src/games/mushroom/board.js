'use strict';

const { xmur3, mulberry32 } = require('../../core/rng');

// Mushroom Game board geometry and scenario generation.
const R = 10;
const C = 17;
const N = R * C;

// Deterministic digit grid (1..9) from a seed. This IS the per-dataset scenario.
function generateBoard(seedText) {
  const seedFn = xmur3(seedText);
  const rand = mulberry32(seedFn());
  const rows = [];
  for (let r = 0; r < R; r++) {
    let s = '';
    for (let c = 0; c < C; c++) {
      s += String(1 + Math.floor(rand() * 9));
    }
    rows.push(s);
  }
  return rows;
}

function buildState(rows) {
  const val = new Array(N).fill(0);
  const own = new Array(N).fill(-1);
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      val[r * C + c] = Number(rows[r][c]);
    }
  }
  return { val, own, lastPass: false };
}

function cloneState(s) {
  return { val: s.val.slice(), own: s.own.slice(), lastPass: s.lastPass };
}

module.exports = { R, C, N, generateBoard, buildState, cloneState };
