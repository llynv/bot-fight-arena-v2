'use strict';

const { assertValidJudge } = require('../core/conformance');
const mushroom = require('./mushroom');

// Every game plugin is validated against the contract at load time, so a broken
// plugin fails loudly here instead of mid-tournament.
const judges = {};

function register(judge) {
  assertValidJudge(judge);
  judges[judge.id] = judge;
  return judge;
}

register(mushroom);

const DEFAULT_GAME_ID = 'mushroom';

function getJudge(gameId) {
  const id = gameId || DEFAULT_GAME_ID;
  const judge = judges[id];
  if (!judge) throw new Error(`Unknown game id: ${id}`);
  return judge;
}

function listGames() {
  return Object.values(judges).map(j => ({
    id: j.id,
    name: j.name,
    display: j.display || {},
    timing: j.timing
  }));
}

module.exports = { register, getJudge, listGames, DEFAULT_GAME_ID };
