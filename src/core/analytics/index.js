'use strict';

// Game-agnostic tournament analytics. Operates purely on match/game result shapes
// produced by the runner. NOTE: the field name `cellsDiff` is the generic
// per-match score margin (score.first - score.second mapped to A/B); the UI labels
// it with each game's own `scoreNoun`. Nothing here knows what a board is.

function gamePointsForBot(gameWon, draw) {
  if (draw) return 0.5;
  return gameWon ? 1 : 0;
}

function classifyMatchScore(score, maxScore) {
  if (maxScore <= 1) {
    if (score >= 1) return 'win';
    if (score === 0.5) return 'draw';
    return 'loss';
  }
  if (score >= 1.5) return 'win';
  if (score === 1) return 'draw';
  return 'loss';
}

function nonOkStatus(status) {
  return !['finished', 'ok'].includes(String(status || ''));
}

function deriveCrashCountFromStatus(status) {
  return ['process_exit', 'error', 'process_limit'].includes(String(status || '')) ? 1 : 0;
}

function quantile(sortedValues, q) {
  if (!sortedValues.length) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const idx = (sortedValues.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedValues[lo];
  const weight = idx - lo;
  return sortedValues[lo] * (1 - weight) + sortedValues[hi] * weight;
}

function mean(values) {
  return values.length ? values.reduce((sum, x) => sum + x, 0) / values.length : 0;
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, x) => sum + (x - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function createBotAnalytics(bot) {
  return {
    botId: bot.botId,
    name: bot.name,
    matchesPlayed: 0,
    matchWins: 0,
    matchDraws: 0,
    matchLosses: 0,
    matchScoreTotal: 0,
    gamesPlayed: 0,
    gameWins: 0,
    gameDraws: 0,
    gameLosses: 0,
    gameWinsAsFirst: 0,
    gameDrawsAsFirst: 0,
    gameLossesAsFirst: 0,
    gameWinsAsSecond: 0,
    gameDrawsAsSecond: 0,
    gameLossesAsSecond: 0,
    firstScoreTotal: 0,
    secondScoreTotal: 0,
    cellsDiffSamples: [],
    cellsDiffTotal: 0,
    sweptCount: 0,
    sweptAgainstCount: 0,
    formResults: [],
    matchScoreDist: {}, // match.score bucket (e.g. '2.0','1.5','1.0','0.5','0.0') -> count
    gameScoreSamples: [], // per-game raw score (capped) for histogram
    timeoutCount: 0,
    invalidCount: 0,
    crashCount: 0,
    processExitCount: 0,
    processLimitCount: 0,
    nonOkCount: 0,
    eloCurrent: 0,
    eloSamples: [],
    eloMin: 0,
    eloMax: 0,
    placements: [],
    winRateSamples: [],
    opponents: {}
  };
}

function createAnalytics(botList, options = {}) {
  const bots = {};
  const pairMatrix = {};
  for (const bot of botList) {
    bots[bot.botId] = createBotAnalytics(bot);
    pairMatrix[bot.botId] = {};
  }
  return {
    global: {
      totalSimulations: 0,
      totalMatches: 0,
      totalGames: 0,
      finishedGames: 0,
      nonOkGames: 0,
      timeoutCount: 0,
      invalidCount: 0,
      processExitCount: 0,
      processLimitCount: 0,
      crashCount: 0,
      totalMoveMs: 0,
      totalMoveCount: 0,
      avgMoveMs: 0,
      maxMemoryKb: 0,
      slowestGameMs: 0,
      elapsedWallMs: 0
    },
    bots,
    pairMatrix,
    options
  };
}

function ensureOpponentBucket(botStats, opponentId) {
  if (!botStats.opponents[opponentId]) {
    botStats.opponents[opponentId] = {
      matches: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      scoreTotal: 0,
      cellsDiffTotal: 0,
      nonOk: 0
    };
  }
  return botStats.opponents[opponentId];
}

function ensurePairCell(pairMatrix, fromId, toId) {
  if (!pairMatrix[fromId][toId]) {
    pairMatrix[fromId][toId] = {
      matches: 0,
      aWins: 0,
      draws: 0,
      aLosses: 0,
      aScoreTotal: 0,
      aCellsDiffTotal: 0,
      sampleCount: 0,
      nonOk: 0
    };
  }
  return pairMatrix[fromId][toId];
}

function recordGameForBot(botStats, opponentId, gameWon, draw, asFirst, score, status, game) {
  botStats.gamesPlayed++;
  if (draw) botStats.gameDraws++;
  else if (gameWon) botStats.gameWins++;
  else botStats.gameLosses++;

  if (botStats.gameScoreSamples.length < 2000) botStats.gameScoreSamples.push(score);

  if (asFirst) {
    botStats.firstScoreTotal += score;
    if (draw) botStats.gameDrawsAsFirst++;
    else if (gameWon) botStats.gameWinsAsFirst++;
    else botStats.gameLossesAsFirst++;
  } else {
    botStats.secondScoreTotal += score;
    if (draw) botStats.gameDrawsAsSecond++;
    else if (gameWon) botStats.gameWinsAsSecond++;
    else botStats.gameLossesAsSecond++;
  }

  if (nonOkStatus(status)) botStats.nonOkCount++;
  if (status === 'invalid') botStats.invalidCount++;
  if (status === 'process_exit') botStats.processExitCount++;
  if (status === 'process_limit') botStats.processLimitCount++;
  if (status === 'timeout' || status === 'time_forfeit') botStats.timeoutCount++;
  botStats.crashCount += deriveCrashCountFromStatus(status);

  const opp = ensureOpponentBucket(botStats, opponentId);
  if (nonOkStatus(status)) opp.nonOk++;

  const maxMemory = Math.max(
    Number(game.memory?.firstMaxRssKb || 0),
    Number(game.memory?.secondMaxRssKb || 0),
    Number(game.botAMaxRssKb || 0),
    Number(game.botBMaxRssKb || 0)
  );
  return maxMemory;
}

function recordMatch(analytics, match, games, botMap, maxMatchScore) {
  const global = analytics.global;
  const botA = analytics.bots[match.botAId];
  const botB = analytics.bots[match.botBId];
  global.totalMatches++;
  if (!match.bye) {
    botA.matchesPlayed++;
    botB.matchesPlayed++;
    botA.matchScoreTotal += match.scoreA;
    botB.matchScoreTotal += match.scoreB;
    botA.cellsDiffSamples.push(match.cellsDiffA);
    botB.cellsDiffSamples.push(match.cellsDiffB);
    botA.cellsDiffTotal += match.cellsDiffA;
    botB.cellsDiffTotal += match.cellsDiffB;

    const oppA = ensureOpponentBucket(botA, match.botBId);
    const oppB = ensureOpponentBucket(botB, match.botAId);
    oppA.matches++;
    oppB.matches++;
    oppA.scoreTotal += match.scoreA;
    oppB.scoreTotal += match.scoreB;
    oppA.cellsDiffTotal += match.cellsDiffA;
    oppB.cellsDiffTotal += match.cellsDiffB;

    if (match.classificationA === 'win') {
      botA.matchWins++;
      botB.matchLosses++;
      oppA.wins++;
      oppB.losses++;
      botA.formResults.push('W');
      botB.formResults.push('L');
    } else if (match.classificationA === 'draw') {
      botA.matchDraws++;
      botB.matchDraws++;
      oppA.draws++;
      oppB.draws++;
      botA.formResults.push('D');
      botB.formResults.push('D');
    } else {
      botA.matchLosses++;
      botB.matchWins++;
      oppA.losses++;
      oppB.wins++;
      botA.formResults.push('L');
      botB.formResults.push('W');
    }

    // sweep tracking: won/lost both sides of a play-both-sides match
    if (match.scoreA >= maxMatchScore) botA.sweptCount++;
    if (match.scoreA <= 0) botA.sweptAgainstCount++;
    if (match.scoreB >= maxMatchScore) botB.sweptCount++;
    if (match.scoreB <= 0) botB.sweptAgainstCount++;

    // match-point distribution buckets (e.g. 2.0/1.5/1.0/0.5/0.0)
    const bucketA = (Math.round(match.scoreA * 2) / 2).toFixed(1);
    const bucketB = (Math.round(match.scoreB * 2) / 2).toFixed(1);
    botA.matchScoreDist[bucketA] = (botA.matchScoreDist[bucketA] || 0) + 1;
    botB.matchScoreDist[bucketB] = (botB.matchScoreDist[bucketB] || 0) + 1;

    const cellA = ensurePairCell(analytics.pairMatrix, match.botAId, match.botBId);
    const cellB = ensurePairCell(analytics.pairMatrix, match.botBId, match.botAId);
    cellA.matches++;
    cellB.matches++;
    cellA.sampleCount++;
    cellB.sampleCount++;
    cellA.aScoreTotal += match.scoreA;
    cellB.aScoreTotal += match.scoreB;
    cellA.aCellsDiffTotal += match.cellsDiffA;
    cellB.aCellsDiffTotal += match.cellsDiffB;
    if (match.classificationA === 'win') {
      cellA.aWins++;
      cellB.aLosses++;
    } else if (match.classificationA === 'draw') {
      cellA.draws++;
      cellB.draws++;
    } else {
      cellA.aLosses++;
      cellB.aWins++;
    }
    if (match.nonOkCount) {
      cellA.nonOk += match.nonOkCount;
      cellB.nonOk += match.nonOkCount;
    }
  }

  for (const game of games) {
    global.totalGames++;
    if (!nonOkStatus(game.status)) global.finishedGames++;
    else global.nonOkGames++;
    if (game.status === 'invalid') global.invalidCount++;
    if (game.status === 'process_exit') global.processExitCount++;
    if (game.status === 'process_limit') global.processLimitCount++;
    if (game.status === 'timeout' || game.status === 'time_forfeit') global.timeoutCount++;
    global.crashCount += deriveCrashCountFromStatus(game.status);
    global.slowestGameMs = Math.max(global.slowestGameMs, Number(game.elapsedMs || 0));

    for (const move of game.moves || []) {
      global.totalMoveMs += Number(move.elapsedMs || 0);
      global.totalMoveCount++;
    }

    const maxMemory = Math.max(
      Number(game.memory?.firstMaxRssKb || 0),
      Number(game.memory?.secondMaxRssKb || 0),
      Number(game.botAMaxRssKb || 0),
      Number(game.botBMaxRssKb || 0)
    );
    global.maxMemoryKb = Math.max(global.maxMemoryKb, maxMemory);

    const aAsFirst = game.aRole === 0;
    recordGameForBot(botA, game.botBId, !!game.botAWon, !!game.draw, aAsFirst, Number(game.botAScore || 0), game.status, game);
    recordGameForBot(botB, game.botAId, !!game.botBWon, !!game.draw, !aAsFirst, Number(game.botBScore || 0), game.status, game);
  }

  global.avgMoveMs = global.totalMoveCount ? Math.round(global.totalMoveMs / global.totalMoveCount) : 0;

  for (const botStats of [botA, botB]) {
    botStats.powerScore = botStats.matchesPlayed ? botStats.matchScoreTotal / (botStats.matchesPlayed * maxMatchScore) : 0;
  }
}

function finalizeAnalytics(analytics) {
  const standings = Object.values(analytics.bots).map(bot => {
    const matchesPlayed = bot.matchesPlayed || 0;
    const gamesPlayed = bot.gamesPlayed || 0;
    const cells = bot.cellsDiffSamples.slice().sort((a, b) => a - b);
    const matchWinPct = matchesPlayed ? bot.matchWins / matchesPlayed : 0;
    const matchDrawPct = matchesPlayed ? bot.matchDraws / matchesPlayed : 0;
    const matchLossPct = matchesPlayed ? bot.matchLosses / matchesPlayed : 0;
    const gameWinPct = gamesPlayed ? bot.gameWins / gamesPlayed : 0;
    const gameDrawPct = gamesPlayed ? bot.gameDraws / gamesPlayed : 0;
    const gameLossPct = gamesPlayed ? bot.gameLosses / gamesPlayed : 0;
    const avgMatchScore = matchesPlayed ? bot.matchScoreTotal / matchesPlayed : 0;
    const avgCellsDiff = cells.length ? bot.cellsDiffTotal / cells.length : 0;
    const firstGames = bot.gameWinsAsFirst + bot.gameDrawsAsFirst + bot.gameLossesAsFirst;
    const secondGames = bot.gameWinsAsSecond + bot.gameDrawsAsSecond + bot.gameLossesAsSecond;
    const firstWinPct = firstGames ? bot.gameWinsAsFirst / firstGames : 0;
    const secondWinPct = secondGames ? bot.gameWinsAsSecond / secondGames : 0;
    const nonOkRate = gamesPlayed ? bot.nonOkCount / gamesPlayed : 0;
    const powerScore = avgMatchScore;
    const safetyScore = 1 - matchLossPct;
    const stabilityScore = matchWinPct - matchLossPct - nonOkRate * 2;
    return {
      ...bot,
      matchWinPct,
      matchDrawPct,
      matchLossPct,
      gameWinPct,
      gameDrawPct,
      gameLossPct,
      avgMatchScore,
      avgCellsDiff,
      medianCellsDiff: cells.length ? quantile(cells, 0.5) : 0,
      p10CellsDiff: cells.length ? quantile(cells, 0.1) : 0,
      p90CellsDiff: cells.length ? quantile(cells, 0.9) : 0,
      firstWinPct,
      secondWinPct,
      firstScoreAvg: firstGames ? bot.firstScoreTotal / firstGames : 0,
      secondScoreAvg: secondGames ? bot.secondScoreTotal / secondGames : 0,
      marginStdDev: stdDev(bot.cellsDiffSamples),
      expPtsPerMatch: avgMatchScore,
      sweptPct: matchesPlayed ? bot.sweptCount / matchesPlayed : 0,
      sweptAgainstPct: matchesPlayed ? bot.sweptAgainstCount / matchesPlayed : 0,
      form: bot.formResults.slice(-6),
      nonOkRate,
      powerScore,
      safetyScore,
      stabilityScore,
      eloAverage: bot.eloSamples.length ? mean(bot.eloSamples) : bot.eloCurrent,
      eloMin: bot.eloSamples.length ? Math.min(...bot.eloSamples) : bot.eloCurrent,
      eloMax: bot.eloSamples.length ? Math.max(...bot.eloSamples) : bot.eloCurrent,
      eloStdDev: stdDev(bot.eloSamples),
      winRateStdDev: stdDev(bot.winRateSamples),
      avgFinalRank: bot.placements.length ? mean(bot.placements) : 0,
      top3RatePct: bot.placements.length ? bot.placements.filter(r => r <= 3).length / bot.placements.length : 0
    };
  });

  standings.sort((a, b) => {
    if (a.matchLossPct !== b.matchLossPct) return a.matchLossPct - b.matchLossPct;
    if (a.matchWinPct !== b.matchWinPct) return b.matchWinPct - a.matchWinPct;
    if (a.avgMatchScore !== b.avgMatchScore) return b.avgMatchScore - a.avgMatchScore;
    if (a.avgCellsDiff !== b.avgCellsDiff) return b.avgCellsDiff - a.avgCellsDiff;
    return a.nonOkRate - b.nonOkRate;
  });

  standings.forEach((row, index) => {
    row.rank = index + 1;
    row.badges = [];
  });

  if (standings.length) {
    standings[0].badges.push('Best overall');
    const lowestLoss = Math.min(...standings.map(x => x.matchLossPct));
    const highestWin = Math.max(...standings.map(x => x.matchWinPct));
    for (const row of standings) {
      if (row.matchLossPct === lowestLoss) row.badges.push('Lowest loss');
      if (row.matchWinPct === highestWin) row.badges.push('Highest winrate');
      if (row.matchWinPct >= 0.5 && row.matchLossPct >= 0.25) row.badges.push('Risky high power');
      if (row.stabilityScore >= 0.25 && row.nonOkRate === 0) row.badges.push('Stable');
      if (row.nonOkRate > 0) row.badges.push('Timeout risk');
    }
  }

  analytics.standings = standings;
  return analytics;
}

function buildPairMatrix(analytics) {
  return analytics.pairMatrix;
}

function updateElo(eloA, eloB, actualA, kFactor) {
  const expectedA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
  const expectedB = 1 - expectedA;
  return {
    eloA: eloA + kFactor * (actualA - expectedA),
    eloB: eloB + kFactor * ((1 - actualA) - expectedB)
  };
}

module.exports = {
  gamePointsForBot,
  classifyMatchScore,
  nonOkStatus,
  deriveCrashCountFromStatus,
  quantile,
  mean,
  stdDev,
  createBotAnalytics,
  createAnalytics,
  ensureOpponentBucket,
  ensurePairCell,
  recordGameForBot,
  recordMatch,
  finalizeAnalytics,
  buildPairMatrix,
  updateElo
};
