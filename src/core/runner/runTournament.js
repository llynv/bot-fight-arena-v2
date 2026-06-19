'use strict';

const { runRoundRobinTournament } = require('./tournament/roundRobin');
const { runSwissTournament } = require('./tournament/swiss');

async function runTournament(options = {}) {
  const mode = String(options.mode || 'round_robin');
  if (mode === 'swiss') return runSwissTournament(options);
  if (mode === 'round_robin') return runRoundRobinTournament(options);
  throw new Error(`Unsupported tournament mode: ${mode}`);
}

module.exports = { runTournament, runRoundRobinTournament, runSwissTournament };
