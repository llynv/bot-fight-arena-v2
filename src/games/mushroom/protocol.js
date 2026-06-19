'use strict';

const { parseMoveLine, moveToString } = require('./move');

// stdio protocol framing for Mushroom bots. A different game redefines these
// strings freely without touching the runner.
const protocol = {
  ready: { first: 'READY FIRST', second: 'READY SECOND', expect: 'OK' },

  initMessage(scenario) {
    return `INIT ${scenario.boardRows.join(' ')}`;
  },

  // remaining = [firstMs, secondMs]; the bot on turn sees its own clock first.
  turnMessage(_state, player, remaining) {
    const mine = Math.max(0, Math.floor(remaining[player]));
    const theirs = Math.max(0, Math.floor(remaining[1 - player]));
    return `TIME ${mine} ${theirs}`;
  },

  parseMove(line) {
    return parseMoveLine(line);
  },

  serializeMove(move) {
    return moveToString(move);
  },

  opponentMessage(move, elapsedMs) {
    return `OPP ${moveToString(move)} ${elapsedMs}`;
  }
};

module.exports = { protocol };
