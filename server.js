'use strict';

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { compileCpp } = require('./src/core/runtime');
const { runFight } = require('./src/core/runner/runFight');
const { runTournament } = require('./src/core/runner/runTournament');
const { summarizeGame } = require('./src/core/summarize');
const { getJudge, listGames, DEFAULT_GAME_ID } = require('./src/games/registry');

// Default clock used to seed form defaults / clamps. Per-job timing comes from the
// selected game's judge.
const TOTAL_TIME_MS = getJudge(DEFAULT_GAME_ID).timing.totalTimeMs;

const app = express();
const PORT = Number(process.env.PORT || 5001);
const ROOT = __dirname;
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const JOB_DIR = path.join(ROOT, 'jobs');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(JOB_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: {
    files: 4,
    fileSize: 1024 * 1024 * 10
  },
  fileFilter: (_req, file, cb) => {
    const lowerName = file.originalname.toLowerCase();
    if ((file.fieldname === 'botA' || file.fieldname === 'botB') && !lowerName.endsWith('.cpp')) {
      cb(new Error('Only .cpp files are accepted.'));
    } else if ((file.fieldname === 'botAData' || file.fieldname === 'botBData') && lowerName !== 'data.bin') {
      cb(new Error('Only data.bin files are accepted for bot data.'));
    } else if (!['botA', 'botB', 'botAData', 'botBData'].includes(file.fieldname)) {
      cb(new Error('Unexpected upload field.'));
    } else {
      cb(null, true);
    }
  }
});

const tournamentUpload = multer({
  dest: UPLOAD_DIR,
  limits: {
    files: 256,
    fileSize: 1024 * 1024 * 10
  },
  fileFilter: (_req, file, cb) => {
    const lowerName = file.originalname.toLowerCase();
    if (file.fieldname === 'bots') {
      if (!lowerName.endsWith('.cpp')) return cb(new Error('Only .cpp files are accepted.'));
      return cb(null, true);
    }
    if (/^botData_\d+$/.test(file.fieldname)) {
      if (lowerName !== 'data.bin') return cb(new Error('Only data.bin files are accepted for tournament bot data.'));
      return cb(null, true);
    }
    cb(null, true);
  }
});

const jobs = new Map();

function nowIso() {
  return new Date().toISOString();
}

function publicJob(job) {
  return {
    id: job.id,
    gameId: job.gameId || DEFAULT_GAME_ID,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    status: job.status,
    error: job.error,
    progress: job.progress,
    settings: job.settings,
    bots: (job.bots || []).map(bot => ({
      botId: bot.botId,
      name: bot.name,
      tag: bot.tag || '',
      sourceName: bot.sourceName,
      compileStatus: bot.compileStatus,
      compileError: bot.compileError || ''
    })),
    compileLogs: job.compileLogs,
    summary: job.summary,
    matches: job.matches || [],
    simulations: job.simulations || [],
    pairMatrix: job.pairMatrix || null,
    games: job.games.map(g => ({ ...g, log: undefined, stderr: undefined }))
  };
}

function safeName(name) {
  return String(name || 'bot.cpp').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 80);
}

function clampInt(value, fallback, min, max) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function makeJob() {
  const id = crypto.randomBytes(8).toString('hex');
  const dir = path.join(JOB_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  const job = {
    id,
    dir,
    gameId: DEFAULT_GAME_ID,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    status: 'queued',
    error: '',
    progress: { done: 0, total: 0, current: '', phase: 'queued', simulationIndex: null, roundIndex: null, matchIndex: null, gameIndex: null },
    settings: {},
    bots: [],
    compileLogs: [],
    summary: null,
    matches: [],
    simulations: [],
    pairMatrix: null,
    games: [],
    fullResults: [],
    events: []
  };
  jobs.set(id, job);
  return job;
}

function rebuildTournamentSummary(job) {
  const mode = job.settings?.mode || 'round_robin';
  const botCount = job.settings?.botCount || 0;
  const bots = job.fullResults?.bots || [];
  const matches = job.matches || [];
  const games = job.games || [];
  const pairMatrix = job.pairMatrix || {};

  const botMap = {};
  for (const b of bots) {
    botMap[b.botId] = { botId: b.botId, name: b.name, tag: b.tag || '', matchWins: 0, matchDraws: 0, matchLosses: 0, gameWins: 0, gameLosses: 0, score: 0, played: 0, elo: b.elo || job.settings?.initialElo || 1500 };
  }
  for (const m of matches) {
    const a = botMap[m.botAId]; const b = botMap[m.botBId];
    if (!a || !b) continue;
    a.played += 1; b.played += 1;
    if (m.classificationA === 'win') { a.matchWins += 1; b.matchLosses += 1; a.score += 1; }
    else if (m.classificationA === 'draw') { a.matchDraws += 1; b.matchDraws += 1; a.score += 0.5; b.score += 0.5; }
    else { a.matchLosses += 1; b.matchWins += 1; b.score += 1; }
  }
  for (const g of games) {
    const a = botMap[g.botAId]; const b = botMap[g.botBId];
    if (!a || !b) continue;
    if (g.botAWon) { a.gameWins += 1; b.gameLosses += 1; }
    else if (g.draw) { a.gameWins += 0.5; b.gameLosses += 0.5; }
    else { a.gameLosses += 1; b.gameWins += 1; }
  }
  const standings = Object.values(botMap).sort((a, b) => {
    const sDiff = b.score - a.score;
    if (sDiff) return sDiff;
    const gDiff = b.gameWins - a.gameWins;
    if (gDiff) return gDiff;
    return (a.matchWins + a.matchDraws) - (b.matchWins + b.matchDraws);
  });
  job.summary = {
    mode,
    bots: standings,
    standings,
    analytics: {},
    simulations: job.simulations || [],
    recentMatches: matches.slice(-200),
    pairMatrix
  };
}

function addEvent(job, ev) {
  const event = { time: nowIso(), ...ev };
  job.events.push(event);
  if (job.events.length > 5000) job.events.shift();
  job.updatedAt = nowIso();
  if (ev.type === 'tournament_start') {
    job.progress.phase = 'tournament';
    job.progress.current = `${ev.mode} tournament starting`;
    job.progress.simulationIndex = null;
    job.progress.roundIndex = null;
    job.progress.matchIndex = null;
    job.progress.gameIndex = null;
    job.fullResults = { bots: job.fullResults?.bots || [], matches: [], simulations: [], games: [], analytics: null, pairMatrix: null };
  }
  if (ev.type === 'simulation_start') {
    job.progress.phase = 'simulation';
    job.progress.simulationIndex = ev.simulationIndex;
    job.progress.roundIndex = null;
    job.progress.matchIndex = null;
    job.progress.gameIndex = null;
    job.progress.current = `Simulation ${ev.simulationIndex + 1}`;
  }
  if (ev.type === 'round_start') {
    job.progress.phase = 'round';
    job.progress.simulationIndex = ev.simulationIndex;
    job.progress.roundIndex = ev.roundIndex;
    job.progress.matchIndex = null;
    job.progress.gameIndex = null;
    job.progress.current = `Simulation ${ev.simulationIndex + 1}, round ${ev.roundIndex + 1}`;
  }
  if (ev.type === 'match_start') {
    job.progress.phase = 'match';
    job.progress.simulationIndex = ev.simulationIndex;
    job.progress.roundIndex = ev.roundIndex ?? null;
    job.progress.matchIndex = ev.matchIndex;
    job.progress.gameIndex = null;
    job.progress.current = `Simulation ${ev.simulationIndex + 1}, ${ev.roundIndex === null || ev.roundIndex === undefined ? 'round-robin' : `round ${ev.roundIndex + 1}`}, match ${ev.matchIndex + 1}`;
  }
  if (ev.type === 'game_start') {
    job.progress.phase = 'game';
    job.progress.simulationIndex = ev.simulationIndex ?? null;
    job.progress.roundIndex = ev.roundIndex ?? null;
    job.progress.matchIndex = ev.matchIndex ?? null;
    job.progress.gameIndex = ev.gameIndex;
    job.progress.current = `Dataset ${ev.datasetIndex + 1}, game ${ev.gameIndex + 1}`;
  }
  if (ev.type === 'game_done') {
    job.games.push(ev.game);
    if (Array.isArray(job.fullResults?.games)) job.fullResults.games.push(ev.game);
    if (ev.summary) {
      job.summary = ev.summary;
      job.progress.done = ev.summary.gamesDone;
      job.progress.total = ev.summary.gamesTotal;
    } else {
      job.progress.done = Math.min(job.progress.total, job.games.length);
      if (isTournamentMode(job)) rebuildTournamentSummary(job);
    }
  }
  if (ev.type === 'match_done') {
    if (ev.match) {
      job.matches.push(ev.match);
      if (Array.isArray(job.fullResults?.matches)) job.fullResults.matches.push(ev.match);
    }
    if (ev.games?.length) {
      const seen = new Set(job.games.map(game => game.gameIndex));
      for (const game of ev.games) {
        if (!seen.has(game.gameIndex)) {
          job.games.push(game);
          if (Array.isArray(job.fullResults?.games)) job.fullResults.games.push(game);
        }
      }
      job.progress.done = Math.min(job.progress.total, job.games.length);
    }
    if (job.settings?.mode && ['round_robin', 'swiss'].includes(job.settings.mode)) {
      rebuildTournamentSummary(job);
    }
  }
  if (ev.type === 'simulation_done') {
    job.progress.phase = 'simulation_done';
    job.progress.simulationIndex = ev.simulationIndex;
    job.progress.roundIndex = null;
    job.progress.matchIndex = null;
    job.progress.gameIndex = null;
    job.progress.current = `Simulation ${ev.simulationIndex + 1} done`;
    if (isTournamentMode(job) && ev.standings) {
      job.simulations.push({ simulationIndex: ev.simulationIndex, seed: ev.seed, mode: job.settings.mode, winnerBotId: ev.winnerBotId, nonOkCount: ev.nonOkCount, topBots: (ev.standings || []).slice(0, 5) });
    }
  }
  if (ev.type === 'tournament_done') {
    job.progress.phase = 'done';
    job.progress.current = 'Tournament finished';
    job.progress.simulationIndex = null;
    job.progress.roundIndex = null;
    job.progress.matchIndex = null;
    job.progress.gameIndex = null;
  }
}

function readBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 'true' || value === 'on' || value === '1') return true;
  if (value === false || value === 'false' || value === 'off' || value === '0') return false;
  return fallback;
}

function estimatedTournamentGameCount({ mode, botCount, simulationCount, swissRounds, playBothSides }) {
  const gamesPerMatch = playBothSides ? 2 : 1;
  if (mode === 'swiss') return Math.max(1, simulationCount * Math.floor(botCount / 2) * swissRounds * gamesPerMatch);
  return Math.max(1, simulationCount * ((botCount * (botCount - 1)) / 2) * gamesPerMatch);
}

function isTournamentMode(job) {
  const mode = job?.settings?.mode;
  return mode === 'round_robin' || mode === 'swiss';
}

function findFullGame(job, idx) {
  if (Array.isArray(job.fullResults)) return job.fullResults.find(g => g.gameIndex === idx);
  if (Array.isArray(job.fullResults?.games)) return job.fullResults.games.find(g => g.gameIndex === idx);
  return null;
}

function tournamentPollingSummary(result, settings) {
  return {
    mode: settings.mode,
    bots: result.analytics,
    standings: result.analytics,
    analytics: result.analyticsFull.global,
    simulations: result.simulations.map(sim => ({
      simulationIndex: sim.simulationIndex,
      seed: sim.seed,
      mode: sim.mode,
      winnerBotId: sim.winnerBotId,
      nonOkCount: sim.nonOkCount,
      topBots: sim.standings.slice(0, 5),
      roundSummaries: sim.roundSummaries || []
    })),
    recentMatches: result.matches.slice(-200).map(match => ({
      matchId: match.matchId,
      simulationIndex: match.simulationIndex,
      roundIndex: match.roundIndex,
      matchIndex: match.matchIndex,
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
      gameIds: match.gameIds,
      games: match.games
    })),
    pairMatrix: result.pairMatrix
  };
}

app.use(express.static(path.join(ROOT, 'public')));
app.use(express.json());

app.post('/api/start', upload.fields([{ name: 'botA', maxCount: 1 }, { name: 'botB', maxCount: 1 }, { name: 'botAData', maxCount: 1 }, { name: 'botBData', maxCount: 1 }]), async (req, res) => {
  const files = req.files || {};
  if (!files.botA?.[0] || !files.botB?.[0]) {
    return res.status(400).json({ error: 'Upload both botA and botB .cpp files.' });
  }
  const botAData = files.botAData?.[0] || null;
  const botBData = files.botBData?.[0] || null;

  let judge;
  try {
    judge = getJudge(req.body.gameId);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const judgeTotalTimeMs = judge.timing.totalTimeMs;

  const datasetCount = clampInt(req.body.datasetCount, 30, 1, 1000);
  const botATimeLimitMs = clampInt(req.body.botATimeLimitMs, judgeTotalTimeMs, 1000, 600000);
  const botBTimeLimitMs = clampInt(req.body.botBTimeLimitMs, judgeTotalTimeMs, 1000, 600000);
  const playBothSides = req.body.playBothSides === 'true' || req.body.playBothSides === 'on' || req.body.playBothSides === true;
  const seedBase = String(req.body.seedBase || '').trim();

  const job = makeJob();
  job.gameId = judge.id;
  job.settings = {
    gameId: judge.id,
    datasetCount,
    botATimeLimitMs,
    botBTimeLimitMs,
    playBothSides,
    seedBase: seedBase || '(per-dataset random)',
    botAName: files.botA[0].originalname,
    botBName: files.botB[0].originalname,
    botADataName: botAData ? botAData.originalname : '',
    botBDataName: botBData ? botBData.originalname : ''
  };
  job.progress.total = datasetCount * (playBothSides ? 2 : 1);
  job.progress.current = 'Compiling bots';

  res.json({ jobId: job.id });

  (async () => {
    try {
      job.status = 'compiling';
      const botASrc = path.join(job.dir, `A_${safeName(files.botA[0].originalname)}`);
      const botBSrc = path.join(job.dir, `B_${safeName(files.botB[0].originalname)}`);
      const botADir = path.join(job.dir, 'botA');
      const botBDir = path.join(job.dir, 'botB');
      fs.mkdirSync(botADir, { recursive: true });
      fs.mkdirSync(botBDir, { recursive: true });
      fs.copyFileSync(files.botA[0].path, botASrc);
      fs.copyFileSync(files.botB[0].path, botBSrc);
      if (botAData) fs.copyFileSync(botAData.path, path.join(botADir, 'data.bin'));
      if (botBData) fs.copyFileSync(botBData.path, path.join(botBDir, 'data.bin'));
      for (const file of [files.botA[0], files.botB[0], botAData, botBData]) {
        try { if (file) fs.unlinkSync(file.path); } catch (_) {}
      }

      const botAExe = path.join(botADir, 'bot');
      const botBExe = path.join(botBDir, 'bot');
      const aLog = await compileCpp(botASrc, botAExe, { timeoutMs: 45000 });
      job.compileLogs.push({ bot: 'A', stderr: aLog.stderr || '', stdout: aLog.stdout || '' });
      const bLog = await compileCpp(botBSrc, botBExe, { timeoutMs: 45000 });
      job.compileLogs.push({ bot: 'B', stderr: bLog.stderr || '', stdout: bLog.stdout || '' });

      job.status = 'running';
      job.progress.current = 'Running games';
      const fight = await runFight({
        judge,
        botAExe,
        botBExe,
        datasetCount,
        botATimeLimitMs,
        botBTimeLimitMs,
        playBothSides,
        seedBase,
        onEvent: ev => addEvent(job, ev),
        onGameResult: result => {
          job.fullResults.push(result);
        }
      });
      job.summary = fight.summary;
      job.games = fight.results.map(summarizeGame);
      job.fullResults = fight.results;
      job.status = 'done';
      job.progress.done = job.progress.total;
      job.progress.current = 'Finished';
      job.updatedAt = nowIso();
    } catch (e) {
      job.status = 'error';
      job.error = e.stack || e.message;
      job.progress.current = 'Error';
      job.updatedAt = nowIso();
    }
  })();
});

app.post('/api/tournaments/start', tournamentUpload.any(), async (req, res) => {
  const uploaded = req.files || [];
  const files = uploaded.filter(file => file.fieldname === 'bots');
  const dataFiles = new Map(uploaded.filter(file => /^botData_\d+$/.test(file.fieldname)).map(file => [Number(file.fieldname.replace('botData_', '')), file]));
  if (files.length < 2) {
    return res.status(400).json({ error: 'Upload at least 2 bot .cpp files.' });
  }

  let judge;
  try {
    judge = getJudge(req.body.gameId);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const mode = String(req.body.mode || 'round_robin');
  if (!['round_robin', 'swiss'].includes(mode)) {
    return res.status(400).json({ error: 'Tournament mode must be round_robin or swiss.' });
  }

  const simulationCount = clampInt(req.body.simulationCount, 20, 1, 500);
  // Spec: default numRounds = min(N-1, 20); cap to N-1 so Swiss never forces a rematch.
  const maxMeaningfulRounds = Math.max(1, files.length - 1);
  const requestedRounds = clampInt(req.body.swissRounds, Math.min(maxMeaningfulRounds, 20), 1, 100);
  const swissRounds = mode === 'swiss' ? Math.min(requestedRounds, maxMeaningfulRounds) : requestedRounds;
  const botTimeLimitMs = clampInt(req.body.botTimeLimitMs, 10000, 1000, 600000);
  const playBothSides = readBool(req.body.playBothSides, true);
  const maxConcurrentGames = clampInt(req.body.maxConcurrentGames, 1, 1, 64);
  const stopOnCompileError = readBool(req.body.stopOnCompileError, true);
  const avoidRepeatOpponents = readBool(req.body.avoidRepeatOpponents, true);
  const initialElo = clampInt(req.body.initialElo, 1500, 1, 5000);
  const eloKFactor = clampInt(req.body.eloKFactor, 24, 1, 256);
  const pairingMethod = String(req.body.pairingMethod || 'score_then_random');
  const seedBase = String(req.body.seedBase || '').trim();
  const botNamesInput = Array.isArray(req.body.botNames) ? req.body.botNames : (req.body.botNames ? [req.body.botNames] : []);
  const botTagsInput = Array.isArray(req.body.botTags) ? req.body.botTags : (req.body.botTags ? [req.body.botTags] : []);

  const job = makeJob();
  job.gameId = judge.id;
  job.settings = {
    gameId: judge.id,
    mode,
    botCount: files.length,
    botNames: files.map((file, idx) => String(botNamesInput[idx] || path.basename(file.originalname, path.extname(file.originalname)))),
    simulationCount,
    swissRounds,
    pairingMethod,
    seedBase: seedBase || '(per-match random)',
    botTimeLimitMs,
    playBothSides,
    maxConcurrentGames,
    stopOnCompileError,
    initialElo,
    eloKFactor,
    avoidRepeatOpponents
  };
  job.progress.total = estimatedTournamentGameCount({ mode, botCount: files.length, simulationCount, swissRounds, playBothSides });
  job.progress.current = 'Compiling bots';
  job.progress.phase = 'compiling';

  res.json({ jobId: job.id });

  (async () => {
    try {
      job.status = 'compiling';
      const bots = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const botId = `bot-${i + 1}`;
        const name = String(botNamesInput[i] || path.basename(file.originalname, path.extname(file.originalname)) || `Bot ${i + 1}`);
        const tag = String(botTagsInput[i] || '');
        const sourceName = safeName(file.originalname);
        const srcPath = path.join(job.dir, `${botId}_${sourceName}`);
        const botDir = path.join(job.dir, botId);
        const exePath = path.join(botDir, 'bot');
        const dataFile = dataFiles.get(i) || null;
        fs.mkdirSync(botDir, { recursive: true });
        fs.copyFileSync(file.path, srcPath);
        if (dataFile) fs.copyFileSync(dataFile.path, path.join(botDir, 'data.bin'));
        const bot = {
          botId,
          name,
          tag,
          sourceName: file.originalname,
          sourcePath: srcPath,
          exePath,
          dataFileName: dataFile ? dataFile.originalname : '',
          compileStatus: 'pending',
          compileError: ''
        };
        try {
          const compileLog = await compileCpp(srcPath, exePath, { timeoutMs: 45000 });
          bot.compileStatus = 'ok';
          job.compileLogs.push({ bot: name, stderr: compileLog.stderr || '', stdout: compileLog.stdout || '' });
          bots.push(bot);
        } catch (err) {
          bot.compileStatus = 'error';
          bot.compileError = err.stack || err.message;
          job.compileLogs.push({ bot: name, stderr: bot.compileError, stdout: '' });
          if (stopOnCompileError) throw err;
        } finally {
          job.bots.push(bot);
          try { fs.unlinkSync(file.path); } catch (_) {}
          try { if (dataFile) fs.unlinkSync(dataFile.path); } catch (_) {}
        }
      }

      const readyBots = job.bots.filter(bot => bot.compileStatus === 'ok');
      if (readyBots.length < 2) throw new Error('Need at least 2 compiled bots to run tournament.');

      job.fullResults = { bots: readyBots, matches: [], games: [] };
      job.status = 'running';
      job.progress.current = 'Running tournament';
      job.progress.phase = 'simulation';

      const result = await runTournament({
        judge,
        mode,
        bots: readyBots,
        simulationCount,
        swissRounds,
        seedBase,
        playBothSides,
        botTimeLimitMs,
        initialElo,
        eloKFactor,
        avoidRepeatOpponents,
        maxConcurrentGames,
        pairingMethod,
        onEvent: ev => addEvent(job, ev)
      });

      job.matches = result.matches.slice(-200).map(match => ({
        matchId: match.matchId,
        simulationIndex: match.simulationIndex,
        roundIndex: match.roundIndex,
        matchIndex: match.matchIndex,
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
        gameIds: match.gameIds,
        games: match.games
      }));
      job.games = result.games.map(summarizeGame);
      job.simulations = result.simulations.map(sim => ({
        simulationIndex: sim.simulationIndex,
        seed: sim.seed,
        mode: sim.mode,
        winnerBotId: sim.winnerBotId,
        nonOkCount: sim.nonOkCount,
        topBots: sim.standings.slice(0, 5)
      }));
      job.pairMatrix = result.pairMatrix;
      job.summary = tournamentPollingSummary(result, job.settings);
      job.fullResults = {
        bots: readyBots,
        simulations: result.simulations,
        matches: result.matches,
        games: result.games,
        analytics: result.analyticsFull,
        pairMatrix: result.pairMatrix
      };
      job.status = 'done';
      job.progress.done = job.progress.total;
      job.progress.current = 'Finished';
      job.progress.phase = 'done';
      job.updatedAt = nowIso();
    } catch (e) {
      job.status = 'error';
      job.error = e.stack || e.message;
      job.progress.current = 'Error';
      job.updatedAt = nowIso();
    }
  })();
});

app.get('/api/games', (_req, res) => {
  res.json({ games: listGames(), defaultGameId: DEFAULT_GAME_ID });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(publicJob(job));
});

app.get('/api/jobs/:id/events', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const from = Math.max(0, Number(req.query.from || 0));
  res.json({ next: job.events.length, events: job.events.slice(from) });
});

app.get('/api/jobs/:id/games/:gameIndex/log', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const idx = Number(req.params.gameIndex);
  const full = findFullGame(job, idx);
  if (!full) return res.status(404).json({ error: 'Game log not found yet' });
  if (typeof full.log !== 'string') return res.status(404).json({ error: 'Game log still loading' });
  res.type('text/plain').send(full.log);
});

app.get('/api/jobs/:id/games/:gameIndex/detail', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const idx = Number(req.params.gameIndex);
  const full = findFullGame(job, idx);
  if (!full) return res.status(404).json({ error: 'Game detail not found yet' });
  if (!Array.isArray(full.moves)) return res.status(404).json({ error: 'Game result still loading' });
  res.json({
    ...summarizeGame(full),
    gameId: job.gameId || DEFAULT_GAME_ID,
    scenario: full.scenario || (full.boardRows ? { boardRows: full.boardRows } : null),
    boardRows: full.boardRows || full.scenario?.boardRows,
    moves: full.moves,
    log: full.log,
    stderr: full.stderr,
    memory: full.memory,
    remaining: full.remaining
  });
});

app.get('/api/jobs/:id/simulations/:simulationIndex', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!isTournamentMode(job)) return res.status(400).json({ error: 'Simulation detail only available for tournament jobs.' });
  const simIndex = Number(req.params.simulationIndex);
  const simulations = job.fullResults?.simulations?.length ? job.fullResults.simulations : job.simulations || [];
  const simulation = simulations.find(sim => sim.simulationIndex === simIndex);
  if (!simulation) return res.status(404).json({ error: 'Simulation not found' });
  const matches = (job.fullResults?.matches?.length ? job.fullResults.matches : job.matches || []).filter(match => match.simulationIndex === simIndex);
  res.json({
    simulation,
    matches
  });
});

app.get('/api/jobs/:id/matches', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!isTournamentMode(job)) return res.status(400).json({ error: 'Match explorer only available for tournament jobs.' });
  const simulationIndex = req.query.simulationIndex === undefined ? null : Number(req.query.simulationIndex);
  const rowId = String(req.query.rowId || '');
  const colId = String(req.query.colId || '');
  const query = String(req.query.query || '').trim().toLowerCase();
  const sortKey = String(req.query.sortKey || 'simulationIndex');
  const sortDir = String(req.query.sortDir || 'desc') === 'asc' ? 1 : -1;
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.max(1, Math.min(200, Number(req.query.pageSize || 50)));
  let matches = (job.fullResults?.matches?.length ? job.fullResults.matches : job.matches || []).slice();
  if (simulationIndex !== null && Number.isFinite(simulationIndex)) matches = matches.filter(match => match.simulationIndex === simulationIndex);
  if (rowId && colId) matches = matches.filter(match => (match.botAId === rowId && match.botBId === colId) || (match.botAId === colId && match.botBId === rowId));
  if (query) {
    matches = matches.filter(match => {
      const hay = `${match.botAName} ${match.botBName} ${match.datasetSeed}`.toLowerCase();
      return hay.includes(query);
    });
  }
  matches.sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv)) * sortDir;
    return (Number(av) - Number(bv)) * sortDir;
  });
  const total = matches.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const items = matches.slice((safePage - 1) * pageSize, safePage * pageSize);
  res.json({ items, total, page: safePage, pageSize, totalPages });
});

app.get('/api/jobs/:id/pairs/:rowId/:colId', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!isTournamentMode(job)) return res.status(400).json({ error: 'Pair history only available for tournament jobs.' });
  const rowId = String(req.params.rowId);
  const colId = String(req.params.colId);
  const matches = (job.fullResults?.matches?.length ? job.fullResults.matches : job.matches || []).filter(match => (match.botAId === rowId && match.botBId === colId) || (match.botAId === colId && match.botBId === rowId));
  res.json({ rowId, colId, matches });
});

app.get('/api/jobs/:id/export.json', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const payload = Array.isArray(job.fullResults)
    ? {
        job: publicJob(job),
        fullResults: job.fullResults || []
      }
    : {
        job: publicJob(job),
        settings: job.settings,
        bots: job.fullResults?.bots || job.bots || [],
        analytics: job.fullResults?.analytics || {},
        pairMatrix: job.fullResults?.pairMatrix || job.pairMatrix || {},
        simulations: job.fullResults?.simulations || job.simulations || [],
        matches: job.fullResults?.matches || job.matches || [],
        games: job.fullResults?.games || job.games || []
      };
  res.setHeader('Content-Disposition', `attachment; filename="fight-${job.id}.json"`);
  res.json(payload);
});

function listen(port) {
  const server = app.listen(port, () => {
    console.log(`Bot Fight Arena running at http://localhost:${port}`);
  });
  server.on('error', err => {
    if (err.code !== 'EADDRINUSE') throw err;
    console.warn(`Port ${port} is busy, trying ${port + 1}...`);
    listen(port + 1);
  });
}

listen(PORT);
