'use strict';

const crypto = require('crypto');
const { makeRandomFromSeed, shuffleInPlace } = require('../../rng');

// Tournament bookkeeping helpers: dataset seeding, standings, Swiss pairing.
// Game-agnostic — scenarios come from `judge.createScenario`.

function makeTournamentDatasetSeed(seedBase, simulationIndex, roundIndex, matchIndex) {
  const root = String(seedBase || crypto.randomBytes(8).toString('hex'));
  return `${root}::sim${simulationIndex}::round${roundIndex === null || roundIndex === undefined ? 'rr' : roundIndex}::match${matchIndex}`;
}

function buildDatasetsForSimulation({ judge, seedBase = '', simulationIndex = 0, pairs = [], roundIndex = null }) {
  return pairs.map((pair, idx) => {
    const seed = makeTournamentDatasetSeed(seedBase, simulationIndex, roundIndex, idx);
    return {
      ...pair,
      datasetIndex: idx,
      datasetSeed: seed,
      scenario: judge.createScenario(seed)
    };
  });
}

function buildSimulationStandings(stateMap, botList) {
  const rows = botList.map(bot => {
    const row = stateMap[bot.botId];
    return {
      botId: bot.botId,
      name: bot.name,
      score: row.score,
      elo: row.elo,
      matchWins: row.matchWins,
      matchDraws: row.matchDraws,
      matchLosses: row.matchLosses,
      byeCount: row.byeCount
    };
  });
  rows.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.elo !== b.elo) return b.elo - a.elo;
    return a.name.localeCompare(b.name);
  });
  rows.forEach((row, idx) => {
    row.rank = idx + 1;
  });
  return rows;
}

function buildRoundSummary({ roundIndex = null, label = '', byeBotId = null, matches = [], standings = [] }) {
  return {
    roundIndex,
    label,
    byeBotId,
    pairCount: matches.length,
    matches: matches.map(match => ({
      matchId: match.matchId,
      matchIndex: match.matchIndex,
      simulationIndex: match.simulationIndex,
      roundIndex: match.roundIndex,
      botAId: match.botAId,
      botBId: match.botBId,
      botAName: match.botAName,
      botBName: match.botBName,
      datasetSeed: match.datasetSeed,
      scoreA: match.scoreA,
      scoreB: match.scoreB,
      classificationA: match.classificationA,
      classificationB: match.classificationB,
      cellsDiffA: match.cellsDiffA,
      nonOkCount: match.nonOkCount,
      repeatPairing: !!match.repeatPairing,
      gameIds: match.gameIds,
      games: match.games
    })),
    topBots: standings.slice(0, 5)
  };
}

function initSimulationState(botList, initialElo) {
  const out = {};
  for (const bot of botList) {
    out[bot.botId] = {
      botId: bot.botId,
      score: 0,
      elo: initialElo,
      opponents: new Set(),
      byeCount: 0,
      matchWins: 0,
      matchDraws: 0,
      matchLosses: 0
    };
  }
  return out;
}

function registerSimulationPlacement(analytics, standings) {
  for (const row of standings) {
    const bot = analytics.bots[row.botId];
    bot.eloCurrent = row.elo;
    bot.eloSamples.push(row.elo);
    bot.placements.push(row.rank);
    const matchesThisSim = (row.matchWins || 0) + (row.matchDraws || 0) + (row.matchLosses || 0);
    if (matchesThisSim > 0) bot.winRateSamples.push(row.matchWins / matchesThisSim);
  }
}

function makeSwissPairings(botList, simState, options = {}) {
  const rand = makeRandomFromSeed(options.seed || 'swiss');
  const mode = String(options.pairingMethod || 'score_then_random');
  const sorted = botList.slice();
  if (mode === 'random_swiss') {
    shuffleInPlace(sorted, rand);
  } else {
    sorted.sort((a, b) => {
      const sa = simState[a.botId];
      const sb = simState[b.botId];
      if (sa.score !== sb.score) return sb.score - sa.score;
      if (mode === 'score_then_elo' && sa.elo !== sb.elo) return sb.elo - sa.elo;
      return rand() < 0.5 ? -1 : 1;
    });
  }

  const available = sorted.slice();
  const pairs = [];
  let bye = null;
  if (available.length % 2 === 1) {
    for (let i = available.length - 1; i >= 0; i--) {
      const candidate = available[i];
      if (simState[candidate.botId].byeCount === 0) {
        bye = candidate;
        available.splice(i, 1);
        break;
      }
    }
    if (!bye) bye = available.pop();
  }

  const tryBuildNoRepeatPairs = (list) => {
    if (!list.length) return [];
    const [first, ...rest] = list;
    for (let i = 0; i < rest.length; i++) {
      const candidate = rest[i];
      if (simState[first.botId].opponents.has(candidate.botId)) continue;
      const next = rest.slice(0, i).concat(rest.slice(i + 1));
      const child = tryBuildNoRepeatPairs(next);
      if (child) return [{ botA: first, botB: candidate, repeatPairing: false }, ...child];
    }
    return null;
  };

  const noRepeatPairs = options.avoidRepeatOpponents ? tryBuildNoRepeatPairs(available) : null;
  if (noRepeatPairs) {
    pairs.push(...noRepeatPairs);
  } else {
    while (available.length) {
      const first = available.shift();
      let chosenIndex = -1;
      let repeatPairing = false;
      for (let i = 0; i < available.length; i++) {
        const candidate = available[i];
        if (!options.avoidRepeatOpponents || !simState[first.botId].opponents.has(candidate.botId)) {
          chosenIndex = i;
          break;
        }
      }
      if (chosenIndex === -1) {
        chosenIndex = 0;
        repeatPairing = true;
      }
      const second = available.splice(chosenIndex, 1)[0];
      pairs.push({ botA: first, botB: second, repeatPairing });
    }
  }

  return { pairs, bye };
}

module.exports = {
  makeTournamentDatasetSeed,
  buildDatasetsForSimulation,
  buildSimulationStandings,
  buildRoundSummary,
  initSimulationState,
  registerSimulationPlacement,
  makeSwissPairings
};
