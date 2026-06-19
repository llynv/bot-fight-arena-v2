'use strict';

const { R, C } = require('./board');

// Display hints surfaced to clients via GET /api/games. The client renderer owns
// actual drawing; this just lets generic UI label things correctly.
const display = {
  scoreNoun: 'cells',
  cols: C,
  rows: R,
  boardLabel: `${R}×${C}`
};

module.exports = { display };
