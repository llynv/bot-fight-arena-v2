'use strict';

const { runSingleGame } = require('./runSingleGame');
const { summarizeGame } = require('../summarize');
const { gamePointsForBot, classifyMatchScore, nonOkStatus } = require('../analytics');
const { DEFAULT_READY_TIMEOUT_MS, DEFAULT_TOTAL_TIME_MS } = require('../timing');

// One match = up to two games (role swap) on the same scenario. Game-agnostic;
// `dataset.scenario` is whatever the judge produced.
async function runMatch({
  judge,
  simulationIndex,
  roundIndex = null,
  matchIndex = 0,
  botA,
  botB,
  dataset,
  playBothSides = true,
  botTimeLimitMs = DEFAULT_TOTAL_TIME_MS,
  readyTimeoutMs = DEFAULT_READY_TIMEOUT_MS,
  processTimeLimitMs = null,
  emitEvent = null,
  gameIndexStart = 0
}) {
  const matchId = `sim${simulationIndex}-round${roundIndex === null || roundIndex === undefined ? 'rr' : roundIndex}-match${matchIndex}`;
  emitEvent?.({ type: 'match_start', simulationIndex, roundIndex, matchIndex, matchId, botAId: botA.botId, botBId: botB.botId, datasetSeed: dataset.datasetSeed });

  const games = [];
  const pairings = playBothSides
    ? [
        { aRole: 0, first: botA, second: botB },
        { aRole: 1, first: botB, second: botA }
      ]
    : [{ aRole: 0, first: botA, second: botB }];

  for (let i = 0; i < pairings.length; i++) {
    const pairing = pairings[i];
    const globalGameIndex = gameIndexStart + i;
    emitEvent?.({ type: 'game_start', simulationIndex, roundIndex, matchIndex, gameIndex: globalGameIndex, datasetIndex: dataset.datasetIndex, seed: dataset.datasetSeed, aRole: pairing.aRole, botAId: botA.botId, botBId: botB.botId });
    const raw = await runSingleGame({
      judge,
      botFirstExe: pairing.first.exePath,
      botSecondExe: pairing.second.exePath,
      scenario: dataset.scenario,
      datasetIndex: dataset.datasetIndex,
      gameIndex: globalGameIndex,
      labels: { first: pairing.first.name, second: pairing.second.name },
      onEvent: emitEvent,
      timeLimitsMs: { first: botTimeLimitMs, second: botTimeLimitMs },
      readyTimeoutMs,
      processTimeLimitMs
    });

    raw.gameId = `game-${globalGameIndex}`;
    raw.matchId = matchId;
    raw.simulationIndex = simulationIndex;
    raw.roundIndex = roundIndex;
    raw.matchIndex = matchIndex;
    raw.datasetSeed = dataset.datasetSeed;
    raw.boardRows = dataset.scenario?.boardRows;
    raw.botAId = botA.botId;
    raw.botBId = botB.botId;
    raw.firstBotId = pairing.first.botId;
    raw.secondBotId = pairing.second.botId;
    raw.aRole = pairing.aRole;
    raw.seed = dataset.datasetSeed;
    raw.botAScore = pairing.aRole === 0 ? raw.finalScore.first : raw.finalScore.second;
    raw.botBScore = pairing.aRole === 0 ? raw.finalScore.second : raw.finalScore.first;
    const botAWinnerIndex = pairing.aRole === 0 ? 0 : 1;
    const botBWinnerIndex = 1 - botAWinnerIndex;
    raw.botAWon = raw.winner === botAWinnerIndex;
    raw.botBWon = raw.winner === botBWinnerIndex;
    raw.draw = raw.winner === -1;
    emitEvent?.({ type: 'game_done', simulationIndex, roundIndex, matchIndex, gameIndex: globalGameIndex, game: summarizeGame(raw) });
    games.push(raw);
  }

  const maxScore = playBothSides ? 2 : 1;
  const scoreA = games.reduce((sum, game) => sum + gamePointsForBot(game.botAWon, game.draw), 0);
  const scoreB = maxScore - scoreA;
  const cellsDiffA = games.reduce((sum, game) => sum + (Number(game.botAScore || 0) - Number(game.botBScore || 0)), 0);
  const match = {
    matchId,
    matchIndex,
    simulationIndex,
    roundIndex,
    pairingIndex: matchIndex,
    botAId: botA.botId,
    botBId: botB.botId,
    botAName: botA.name,
    botBName: botB.name,
    datasetIndex: dataset.datasetIndex,
    datasetSeed: dataset.datasetSeed,
    boardRows: dataset.scenario?.boardRows,
    scenario: dataset.scenario,
    gameIds: games.map(game => game.gameId),
    games: games.map(summarizeGame),
    scoreA,
    scoreB,
    classificationA: classifyMatchScore(scoreA, maxScore),
    classificationB: classifyMatchScore(scoreB, maxScore),
    cellsDiffA,
    cellsDiffB: -cellsDiffA,
    nonOkCount: games.filter(game => nonOkStatus(game.status)).length,
    repeatPairing: !!dataset.repeatPairing,
    bye: false,
    status: games.every(game => !nonOkStatus(game.status)) ? 'finished' : 'partial'
  };

  emitEvent?.({ type: 'match_done', simulationIndex, roundIndex, matchIndex, matchId, botAId: botA.botId, botBId: botB.botId, scoreA, scoreB, classificationA: match.classificationA, nonOkCount: match.nonOkCount, match, games: match.games });

  return { match, games };
}

module.exports = { runMatch };
