'use strict';

const { runMatch } = require('../runMatch');
const { runWithConcurrency } = require('../../concurrency');
const { createAnalytics, recordMatch, finalizeAnalytics, updateElo } = require('../../analytics');
const { DEFAULT_TOTAL_TIME_MS, DEFAULT_READY_TIMEOUT_MS } = require('../../timing');
const {
  buildDatasetsForSimulation,
  buildSimulationStandings,
  buildRoundSummary,
  initSimulationState,
  registerSimulationPlacement,
  makeSwissPairings
} = require('./pairings');

async function runSwissTournament({
  judge,
  bots,
  simulationCount = 1,
  swissRounds = 20,
  seedBase = '',
  playBothSides = true,
  botTimeLimitMs = DEFAULT_TOTAL_TIME_MS,
  readyTimeoutMs = DEFAULT_READY_TIMEOUT_MS,
  processTimeLimitMs = null,
  initialElo = 1500,
  eloKFactor = 24,
  pairingMethod = 'score_then_random',
  avoidRepeatOpponents = true,
  maxConcurrentGames = 1,
  onEvent = null
}) {
  const analytics = createAnalytics(bots, { mode: 'swiss' });
  const allGames = [];
  const allMatches = [];
  const simulations = [];
  onEvent?.({ type: 'tournament_start', mode: 'swiss', botCount: bots.length, simulationCount, swissRounds });

  for (let simIndex = 0; simIndex < simulationCount; simIndex++) {
    const simSeed = `${seedBase || 'random'}::sim${simIndex}`;
    onEvent?.({ type: 'simulation_start', simulationIndex: simIndex, seed: simSeed, mode: 'swiss' });
    const simState = initSimulationState(bots, initialElo);
    const matchIds = [];
    const roundSummaries = [];

    for (let roundIndex = 0; roundIndex < swissRounds; roundIndex++) {
      const pairingSeed = `${simSeed}::round${roundIndex}`;
      const pairing = makeSwissPairings(bots, simState, { avoidRepeatOpponents, seed: pairingSeed, pairingMethod });
      onEvent?.({ type: 'round_start', simulationIndex: simIndex, roundIndex, pairCount: pairing.pairs.length, byeBotId: pairing.bye?.botId || null });
      const roundMatches = [];

      if (pairing.bye) {
        const state = simState[pairing.bye.botId];
        state.score += 1;
        state.byeCount++;
      }

      const datasets = buildDatasetsForSimulation({ judge, seedBase: pairingSeed, simulationIndex: simIndex, pairs: pairing.pairs, roundIndex });
      const gamesPerMatch = playBothSides ? 2 : 1;
      const roundBaseGameIndex = allGames.length;
      const roundResults = await runWithConcurrency(datasets, maxConcurrentGames, async (data, matchIndex) => {
        data.repeatPairing = pairing.pairs[matchIndex].repeatPairing;
        return runMatch({
          judge,
          simulationIndex: simIndex,
          roundIndex,
          matchIndex,
          botA: data.botA,
          botB: data.botB,
          dataset: data,
          playBothSides,
          botTimeLimitMs,
          readyTimeoutMs,
          processTimeLimitMs,
          emitEvent: onEvent,
          gameIndexStart: roundBaseGameIndex + matchIndex * gamesPerMatch
        });
      });

      for (let matchIndex = 0; matchIndex < roundResults.length; matchIndex++) {
        const { match, games } = roundResults[matchIndex];
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
      const roundStandings = buildSimulationStandings(simState, bots);
      roundSummaries.push(buildRoundSummary({ roundIndex, label: `Round ${roundIndex + 1}`, byeBotId: pairing.bye?.botId || null, matches: roundMatches, standings: roundStandings }));
      onEvent?.({ type: 'round_done', simulationIndex: simIndex, roundIndex, pairCount: pairing.pairs.length });
    }

    const standings = buildSimulationStandings(simState, bots);
    registerSimulationPlacement(analytics, standings);
    const simulation = {
      simulationIndex: simIndex,
      mode: 'swiss',
      seed: simSeed,
      rounds: swissRounds,
      roundSummaries,
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
  onEvent?.({ type: 'tournament_done', mode: 'swiss', totalMatches: allMatches.length, totalGames: allGames.length });
  return { mode: 'swiss', bots, simulations, matches: allMatches, games: allGames, analytics: analytics.standings, analyticsFull: analytics, pairMatrix: analytics.pairMatrix };
}

module.exports = { runSwissTournament };
