'use strict';

const { runSingleGame } = require('./runSingleGame');
const { summarizeGame } = require('../summarize');
const { makeSeed } = require('../rng');
const { normalizeFightTiming, DEFAULT_TOTAL_TIME_MS, DEFAULT_READY_TIMEOUT_MS } = require('../timing');

// 1-vs-1 mode: N datasets, optional role swap. Game-agnostic — scenarios from
// `judge.createScenario`.
async function runFight({
  judge,
  botAExe,
  botBExe,
  datasetCount,
  playBothSides = true,
  seedBase = '',
  botATimeLimitMs = DEFAULT_TOTAL_TIME_MS,
  botBTimeLimitMs = DEFAULT_TOTAL_TIME_MS,
  readyTimeoutMs = DEFAULT_READY_TIMEOUT_MS,
  processTimeLimitMs = null,
  onEvent = null,
  onGameResult = null
}) {
  if (!judge) throw new Error('runFight requires a judge');
  const count = Math.max(1, Math.min(1000, Number(datasetCount) || 20));
  const realSeed = String(seedBase || '').trim();
  const timing = normalizeFightTiming({ botATimeLimitMs, botBTimeLimitMs, readyTimeoutMs, processTimeLimitMs }, judge.timing);
  const datasets = [];
  for (let i = 0; i < count; i++) {
    const seed = makeSeed(realSeed, i);
    datasets.push({ index: i, seed, scenario: judge.createScenario(seed) });
  }

  const results = [];
  const summary = {
    seedBase: realSeed || '(per-dataset random)',
    datasetCount: count,
    playBothSides: !!playBothSides,
    botATimeLimitMs: timing.botATimeLimitMs,
    botBTimeLimitMs: timing.botBTimeLimitMs,
    readyTimeoutMs: timing.readyTimeoutMs,
    processTimeLimitMs: timing.processTimeLimitMs,
    gamesTotal: count * (playBothSides ? 2 : 1),
    gamesDone: 0,
    botA: { wins: 0, losses: 0, draws: 0, totalScore: 0 },
    botB: { wins: 0, losses: 0, draws: 0, totalScore: 0 },
    statusCounts: {}
  };

  for (const ds of datasets) {
    const pairings = playBothSides
      ? [
          { aRole: 0, botFirstExe: botAExe, botSecondExe: botBExe, labels: { first: 'Bot A', second: 'Bot B' } },
          { aRole: 1, botFirstExe: botBExe, botSecondExe: botAExe, labels: { first: 'Bot B', second: 'Bot A' } }
        ]
      : [{ aRole: 0, botFirstExe: botAExe, botSecondExe: botBExe, labels: { first: 'Bot A', second: 'Bot B' } }];

    for (let k = 0; k < pairings.length; k++) {
      const pairing = pairings[k];
      const gameIndex = results.length;
      onEvent?.({ type: 'game_start', datasetIndex: ds.index, gameIndex, seed: ds.seed, aRole: pairing.aRole });
      const res = await runSingleGame({
        judge,
        botFirstExe: pairing.botFirstExe,
        botSecondExe: pairing.botSecondExe,
        scenario: ds.scenario,
        datasetIndex: ds.index,
        gameIndex,
        labels: pairing.labels,
        onEvent,
        timeLimitsMs: pairing.aRole === 0
          ? { first: timing.botATimeLimitMs, second: timing.botBTimeLimitMs }
          : { first: timing.botBTimeLimitMs, second: timing.botATimeLimitMs },
        readyTimeoutMs: timing.readyTimeoutMs,
        processTimeLimitMs: timing.processTimeLimitMs
      });
      res.seed = ds.seed;
      res.aRole = pairing.aRole;
      res.botAScore = pairing.aRole === 0 ? res.finalScore.first : res.finalScore.second;
      res.botBScore = pairing.aRole === 0 ? res.finalScore.second : res.finalScore.first;
      const botAWinnerIndex = pairing.aRole === 0 ? 0 : 1;
      const botBWinnerIndex = 1 - botAWinnerIndex;
      res.botAWon = res.winner === botAWinnerIndex;
      res.botBWon = res.winner === botBWinnerIndex;
      res.draw = res.winner === -1;
      results.push(res);
      onGameResult?.(res);

      summary.gamesDone++;
      summary.statusCounts[res.status] = (summary.statusCounts[res.status] || 0) + 1;
      summary.botA.totalScore += res.botAScore;
      summary.botB.totalScore += res.botBScore;
      if (res.draw) {
        summary.botA.draws++;
        summary.botB.draws++;
      } else if (res.botAWon) {
        summary.botA.wins++;
        summary.botB.losses++;
      } else {
        summary.botB.wins++;
        summary.botA.losses++;
      }
      onEvent?.({ type: 'game_done', game: summarizeGame(res), summary: { ...summary } });
    }
  }

  return { summary, datasets, results };
}

module.exports = { runFight };
