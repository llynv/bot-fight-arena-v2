'use strict';

const { runMatch } = require('../runMatch');
const { runWithConcurrency } = require('../../concurrency');
const { makeRandomFromSeed, shuffleInPlace } = require('../../rng');
const { createAnalytics, recordMatch, finalizeAnalytics, updateElo } = require('../../analytics');
const { DEFAULT_TOTAL_TIME_MS, DEFAULT_READY_TIMEOUT_MS } = require('../../timing');
const {
  buildDatasetsForSimulation,
  buildSimulationStandings,
  buildRoundSummary,
  initSimulationState,
  registerSimulationPlacement
} = require('./pairings');

async function runRoundRobinTournament({
  judge,
  bots,
  simulationCount = 1,
  seedBase = '',
  playBothSides = true,
  botTimeLimitMs = DEFAULT_TOTAL_TIME_MS,
  readyTimeoutMs = DEFAULT_READY_TIMEOUT_MS,
  processTimeLimitMs = null,
  initialElo = 1500,
  eloKFactor = 24,
  maxConcurrentGames = 1,
  onEvent = null
}) {
  const analytics = createAnalytics(bots, { mode: 'round_robin' });
  const allGames = [];
  const allMatches = [];
  const simulations = [];
  onEvent?.({ type: 'tournament_start', mode: 'round_robin', botCount: bots.length, simulationCount });

  for (let simIndex = 0; simIndex < simulationCount; simIndex++) {
    const simSeed = `${seedBase || 'random'}::sim${simIndex}`;
    onEvent?.({ type: 'simulation_start', simulationIndex: simIndex, seed: simSeed, mode: 'round_robin' });
    const simState = initSimulationState(bots, initialElo);
    const pairs = [];
    for (let i = 0; i < bots.length; i++) {
      for (let j = i + 1; j < bots.length; j++) pairs.push({ botA: bots[i], botB: bots[j] });
    }
    shuffleInPlace(pairs, makeRandomFromSeed(simSeed));
    const datasets = buildDatasetsForSimulation({ judge, seedBase: simSeed, simulationIndex: simIndex, pairs, roundIndex: null });
    const matchIds = [];
    const roundMatches = [];

    const gamesPerMatch = playBothSides ? 2 : 1;
    const simulationBaseGameIndex = allGames.length;
    const simulationResults = await runWithConcurrency(datasets, maxConcurrentGames, async (data, matchIndex) => {
      return runMatch({
        judge,
        simulationIndex: simIndex,
        roundIndex: null,
        matchIndex,
        botA: data.botA,
        botB: data.botB,
        dataset: data,
        playBothSides,
        botTimeLimitMs,
        readyTimeoutMs,
        processTimeLimitMs,
        emitEvent: onEvent,
        gameIndexStart: simulationBaseGameIndex + matchIndex * gamesPerMatch
      });
    });

    for (let matchIndex = 0; matchIndex < simulationResults.length; matchIndex++) {
      const { match, games } = simulationResults[matchIndex];
      allGames.push(...games);
      allMatches.push(match);
      roundMatches.push(match);
      matchIds.push(match.matchId);
      recordMatch(analytics, match, games, null, playBothSides ? 2 : 1);

      const actualA = playBothSides ? match.scoreA / 2 : match.scoreA;
      const elo = updateElo(simState[match.botAId].elo, simState[match.botBId].elo, actualA, eloKFactor);
      simState[match.botAId].elo = elo.eloA;
      simState[match.botBId].elo = elo.eloB;
      simState[match.botAId].opponents.add(match.botBId);
      simState[match.botBId].opponents.add(match.botAId);
      if (match.classificationA === 'win') {
        simState[match.botAId].score += 1;
        simState[match.botAId].matchWins++;
        simState[match.botBId].matchLosses++;
      } else if (match.classificationA === 'draw') {
        simState[match.botAId].score += 0.5;
        simState[match.botBId].score += 0.5;
        simState[match.botAId].matchDraws++;
        simState[match.botBId].matchDraws++;
      } else {
        simState[match.botBId].score += 1;
        simState[match.botBId].matchWins++;
        simState[match.botAId].matchLosses++;
      }
    }

    const standings = buildSimulationStandings(simState, bots);
    registerSimulationPlacement(analytics, standings);
    const simulation = {
      simulationIndex: simIndex,
      mode: 'round_robin',
      seed: simSeed,
      rounds: 1,
      roundSummaries: [buildRoundSummary({ roundIndex: null, label: 'Round-robin pair set', byeBotId: null, matches: roundMatches, standings })],
      matchIds,
      standings,
      winnerBotId: standings[0]?.botId || null,
      nonOkCount: allMatches.filter(match => match.simulationIndex === simIndex).reduce((sum, match) => sum + match.nonOkCount, 0),
      elapsedMs: allMatches.filter(match => match.simulationIndex === simIndex).length
    };
    simulations.push(simulation);
    onEvent?.({ type: 'simulation_done', simulationIndex: simIndex, seed: simSeed, winnerBotId: simulation.winnerBotId, nonOkCount: simulation.nonOkCount });
  }

  analytics.global.totalSimulations = simulationCount;
  finalizeAnalytics(analytics);
  analytics.global.elapsedWallMs = allGames.reduce((sum, game) => sum + Number(game.elapsedMs || 0), 0);
  onEvent?.({ type: 'tournament_done', mode: 'round_robin', totalMatches: allMatches.length, totalGames: allGames.length });
  return { mode: 'round_robin', bots, simulations, matches: allMatches, games: allGames, analytics: analytics.standings, analyticsFull: analytics, pairMatrix: analytics.pairMatrix };
}

module.exports = { runRoundRobinTournament };
