'use strict';

// Strips a raw game result down to a polling-safe summary (no log / move list).
// Game-agnostic: works off score, memory, and remaining-time fields the runner
// always produces.
function summarizeGame(res) {
  const moveTimes = res.moves.map(m => Number(m.elapsedMs || 0));
  const totalMoveMs = moveTimes.reduce((sum, ms) => sum + ms, 0);
  const maxMoveMs = moveTimes.reduce((max, ms) => Math.max(max, ms), 0);
  const avgMoveMs = moveTimes.length ? Math.round(totalMoveMs / moveTimes.length) : 0;
  const firstMaxRssKb = res.memory?.firstMaxRssKb ?? null;
  const secondMaxRssKb = res.memory?.secondMaxRssKb ?? null;
  const botAMaxRssKb = res.aRole === 1 ? secondMaxRssKb : firstMaxRssKb;
  const botBMaxRssKb = res.aRole === 1 ? firstMaxRssKb : secondMaxRssKb;
  const firstRemainingMs = Math.max(0, Math.round(res.remaining?.[0] ?? 0));
  const secondRemainingMs = Math.max(0, Math.round(res.remaining?.[1] ?? 0));
  const botARemainingMs = res.aRole === 1 ? secondRemainingMs : firstRemainingMs;
  const botBRemainingMs = res.aRole === 1 ? firstRemainingMs : secondRemainingMs;

  return {
    datasetIndex: res.datasetIndex,
    gameIndex: res.gameIndex,
    seed: res.seed,
    aRole: res.aRole,
    status: res.status,
    reason: res.reason,
    botAScore: res.botAScore,
    botBScore: res.botBScore,
    botAWon: res.botAWon,
    botBWon: res.botBWon,
    draw: res.draw,
    firstScore: res.finalScore.first,
    secondScore: res.finalScore.second,
    diffFirstMinusSecond: res.diffFirstMinusSecond,
    moves: res.moves.length,
    elapsedMs: res.elapsedMs,
    avgMoveMs,
    maxMoveMs,
    firstMaxRssKb,
    secondMaxRssKb,
    botAMaxRssKb,
    botBMaxRssKb,
    botARemainingMs,
    botBRemainingMs
  };
}

module.exports = { summarizeGame };
