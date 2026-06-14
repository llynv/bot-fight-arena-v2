'use strict';

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { compileCpp, runFight, summarizeGame } = require('./src/gameEngine');

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

const jobs = new Map();

function nowIso() {
  return new Date().toISOString();
}

function publicJob(job) {
  return {
    id: job.id,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    status: job.status,
    error: job.error,
    progress: job.progress,
    settings: job.settings,
    compileLogs: job.compileLogs,
    summary: job.summary,
    games: job.games.map(g => ({ ...g, log: undefined, stderr: undefined }))
  };
}

function safeName(name) {
  return String(name || 'bot.cpp').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 80);
}

function makeJob() {
  const id = crypto.randomBytes(8).toString('hex');
  const dir = path.join(JOB_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  const job = {
    id,
    dir,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    status: 'queued',
    error: '',
    progress: { done: 0, total: 0, current: '' },
    settings: {},
    compileLogs: [],
    summary: null,
    games: [],
    fullResults: [],
    events: []
  };
  jobs.set(id, job);
  return job;
}

function addEvent(job, ev) {
  const event = { time: nowIso(), ...ev };
  job.events.push(event);
  if (job.events.length > 5000) job.events.shift();
  job.updatedAt = nowIso();
  if (ev.type === 'game_start') {
    job.progress.current = `Dataset ${ev.datasetIndex + 1}, game ${ev.gameIndex + 1}`;
  }
  if (ev.type === 'game_done') {
    job.games.push(ev.game);
    job.summary = ev.summary;
    job.progress.done = ev.summary.gamesDone;
    job.progress.total = ev.summary.gamesTotal;
  }
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

  const datasetCount = Math.max(20, Math.min(1000, Number(req.body.datasetCount || 20)));
  const playBothSides = req.body.playBothSides === 'true' || req.body.playBothSides === 'on' || req.body.playBothSides === true;
  const seedBase = String(req.body.seedBase || '').trim();

  const job = makeJob();
  job.settings = {
    datasetCount,
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
        botAExe,
        botBExe,
        datasetCount,
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
  const full = job.fullResults?.find(g => g.gameIndex === idx);
  if (!full) return res.status(404).json({ error: 'Game log not found yet' });
  res.type('text/plain').send(full.log);
});

app.get('/api/jobs/:id/games/:gameIndex/detail', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const idx = Number(req.params.gameIndex);
  const full = job.fullResults?.find(g => g.gameIndex === idx);
  if (!full) return res.status(404).json({ error: 'Game detail not found yet' });
  res.json({
    ...summarizeGame(full),
    boardRows: full.boardRows,
    moves: full.moves,
    log: full.log,
    stderr: full.stderr,
    memory: full.memory,
    remaining: full.remaining
  });
});

app.get('/api/jobs/:id/export.json', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const payload = {
    job: publicJob(job),
    fullResults: job.fullResults || []
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
