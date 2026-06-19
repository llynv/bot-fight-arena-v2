'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { compileCpp, classifyMatchScore, generateBoard, runSingleGame, runFight, runMatch, runTournament, summarizeGame, TOTAL_TIME_MS, READY_TIMEOUT_MS, PROCESS_TIME_LIMIT_MS } = require('../src/gameEngine');

(async () => {
  const root = path.join(__dirname, '..');

  async function runWithReadyRetry(options, attempts = 6) {
    let last;
    for (let i = 0; i < attempts; i++) {
      last = await runSingleGame(options);
      await new Promise(resolve => setTimeout(resolve, 100));
      if (!(last.status === 'error' && /timed out after/.test(last.reason) && last.moves.length === 0)) return last;
    }
    return last;
  }

  let botCounter = 0;

  async function compileBot(root, name, source, extraFiles = {}) {
    botCounter++;
    const dir = path.join(root, 'jobs', `test-bot-${botCounter}-${name}`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const botDir = path.join(dir, 'bot');
    fs.mkdirSync(botDir, { recursive: true });
    const srcPath = path.join(dir, `${name}.cpp`);
    const exePath = path.join(botDir, 'bot');
    fs.writeFileSync(srcPath, source);
    for (const [fileName, content] of Object.entries(extraFiles)) {
      fs.writeFileSync(path.join(botDir, fileName), content);
    }
    await compileCpp(srcPath, exePath);
    return { botId: `bot-${botCounter}`, name, exePath };
  }

  function pairKey(a, b) {
    return [a, b].sort().join('::');
  }

  assert.strictEqual(TOTAL_TIME_MS, 30000, 'protocol TIME budget should be 30,000ms');
  assert.strictEqual(READY_TIMEOUT_MS, 10000, 'READY timeout should match statement');
  assert.ok(PROCESS_TIME_LIMIT_MS > TOTAL_TIME_MS * 2, 'process lifetime limit should exceed the combined bot clocks');
  assert.strictEqual(classifyMatchScore(2, 2), 'win');
  assert.strictEqual(classifyMatchScore(1.5, 2), 'win');
  assert.strictEqual(classifyMatchScore(1, 2), 'draw');
  assert.strictEqual(classifyMatchScore(0.5, 2), 'loss');
  assert.strictEqual(classifyMatchScore(0, 2), 'loss');
  const rows = generateBoard('test-seed');

  const dataDir = path.join(root, 'jobs', 'data-reader');
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  const dataSrc = path.join(dataDir, 'data_reader.cpp');
  const dataBotADir = path.join(dataDir, 'botA');
  const dataBotBDir = path.join(dataDir, 'botB');
  fs.mkdirSync(dataBotADir, { recursive: true });
  fs.mkdirSync(dataBotBDir, { recursive: true });
  const dataExeA = path.join(dataBotADir, 'bot');
  const dataExeB = path.join(dataBotBDir, 'bot');
  fs.writeFileSync(path.join(dataBotADir, 'data.bin'), 'ok');
  fs.writeFileSync(path.join(dataBotBDir, 'data.bin'), 'ok');
  fs.writeFileSync(dataSrc, `
#include <fstream>
#include <iostream>
#include <iterator>
#include <string>
int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    if (line.rfind("READY", 0) == 0) {
      std::ifstream f("data.bin", std::ios::binary);
      std::string data((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
      std::cout << (data == "ok" ? "OK" : "DATA_MISSING") << std::endl;
    } else if (line.rfind("TIME", 0) == 0) {
      std::cout << "-1 -1 -1 -1" << std::endl;
    } else if (line == "FINISH") {
      return 0;
    }
  }
  return 0;
}
`);
  await compileCpp(dataSrc, dataExeA);
  await compileCpp(dataSrc, dataExeB);
  const dataRes = await runWithReadyRetry({ botFirstExe: dataExeA, botSecondExe: dataExeB, boardRows: rows, readyTimeoutMs: 10000 });
  assert.strictEqual(dataRes.status, 'finished', 'bots should read data.bin from executable directory');
  const summary = summarizeGame({
    ...dataRes,
    seed: 'test-seed#0',
    aRole: 0,
    botAScore: dataRes.finalScore.first,
    botBScore: dataRes.finalScore.second,
    botAWon: dataRes.finalScore.first > dataRes.finalScore.second,
    botBWon: dataRes.finalScore.second > dataRes.finalScore.first,
    draw: dataRes.finalScore.first === dataRes.finalScore.second
  });
  assert.ok(dataRes.memory, 'runSingleGame should expose memory telemetry');
  assert.ok(Number.isFinite(dataRes.memory.firstMaxRssKb) || dataRes.memory.firstMaxRssKb === null, 'firstMaxRssKb should be numeric or null');
  assert.ok(Number.isFinite(dataRes.memory.secondMaxRssKb) || dataRes.memory.secondMaxRssKb === null, 'secondMaxRssKb should be numeric or null');
  assert.ok(dataRes.moves.length > 0, 'data reader game should produce moves');
  assert.ok('memoryFirstKb' in dataRes.moves[0], 'move records should include first memory snapshots');
  assert.ok('memorySecondKb' in dataRes.moves[0], 'move records should include second memory snapshots');
  assert.ok('maxMoveMs' in summary, 'summaries should expose max turn time');
  assert.ok('botAMaxRssKb' in summary, 'summaries should expose Bot A peak RSS');
  assert.ok('botARemainingMs' in summary, 'summaries should expose Bot A remaining time');
  assert.ok('botBRemainingMs' in summary, 'summaries should expose Bot B remaining time');

  const timeoutDir = path.join(root, 'jobs', 'timeout-regression');
  fs.rmSync(timeoutDir, { recursive: true, force: true });
  fs.mkdirSync(timeoutDir, { recursive: true });
  const timeoutSrc = path.join(timeoutDir, 'timeout_bot.cpp');
  const timeoutBotADir = path.join(timeoutDir, 'botA');
  const timeoutBotBDir = path.join(timeoutDir, 'botB');
  fs.mkdirSync(timeoutBotADir, { recursive: true });
  fs.mkdirSync(timeoutBotBDir, { recursive: true });
  const timeoutExeA = path.join(timeoutBotADir, 'bot');
  const timeoutExeB = path.join(timeoutBotBDir, 'bot');
  fs.writeFileSync(timeoutSrc, `
#include <chrono>
#include <iostream>
#include <string>
#include <thread>
int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    if (line.rfind("READY", 0) == 0) {
      std::cout << "OK" << std::endl;
    } else if (line.rfind("TIME", 0) == 0) {
      std::this_thread::sleep_for(std::chrono::milliseconds(700));
      std::cout << "-1 -1 -1 -1" << std::endl;
    } else if (line == "FINISH") {
      return 0;
    }
  }
  return 0;
 }
 `);
  await compileCpp(timeoutSrc, timeoutExeA);
  await compileCpp(timeoutSrc, timeoutExeB);
  const timeoutRes = await runSingleGame({
    botFirstExe: timeoutExeA,
    botSecondExe: dataExeB,
    boardRows: rows,
    labels: { first: 'Bot A', second: 'Bot B' },
    timeLimitsMs: { first: 100, second: 100 },
    readyTimeoutMs: 1000
  });
  assert.strictEqual(timeoutRes.status, 'timeout', 'turn timeout should report timeout status');
  assert.strictEqual(timeoutRes.winner, 1, 'timed out bot should lose the game');

  const timeoutFight = await runFight({
    botAExe: timeoutExeA,
    botBExe: dataExeB,
    datasetCount: 1,
    playBothSides: false,
    seedBase: 'timeout-summary',
    botATimeLimitMs: 100,
    botBTimeLimitMs: 100,
    readyTimeoutMs: 1000
  });
  assert.strictEqual(timeoutFight.results[0].status, 'timeout', 'fight result should preserve timeout status');
  assert.strictEqual(timeoutFight.summary.botA.losses, 1, 'timed out Bot A should be counted as a loss');
  assert.strictEqual(timeoutFight.summary.botB.wins, 1, 'opponent should get the win on timeout');
  assert.strictEqual(timeoutFight.summary.botA.draws, 0, 'timeout should not be counted as a draw');

  const readyTimeoutSrc = path.join(timeoutDir, 'ready_timeout_bot.cpp');
  const readyTimeoutBotDir = path.join(timeoutDir, 'botReadyTimeout');
  fs.mkdirSync(readyTimeoutBotDir, { recursive: true });
  const readyTimeoutExe = path.join(readyTimeoutBotDir, 'bot');
  fs.writeFileSync(readyTimeoutSrc, `
#include <chrono>
#include <iostream>
#include <string>
#include <thread>
int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    if (line.rfind("READY", 0) == 0) {
      std::this_thread::sleep_for(std::chrono::milliseconds(700));
      std::cout << "OK" << std::endl;
    } else if (line == "FINISH") {
      return 0;
    }
  }
  return 0;
 }
 `);
  await compileCpp(readyTimeoutSrc, readyTimeoutExe);
  const readyTimeoutRes = await runSingleGame({
    botFirstExe: readyTimeoutExe,
    botSecondExe: dataExeB,
    boardRows: rows,
    labels: { first: 'Bot A', second: 'Bot B' },
    readyTimeoutMs: 200
  });
  assert.strictEqual(readyTimeoutRes.status, 'timeout', 'READY timeout should be treated as a timeout result');
  assert.strictEqual(readyTimeoutRes.winner, 1, 'bot timing out during READY should lose');

  const fixtureSourceDir = path.join(root, 'jobs', '01a9922e89d877b8');
  const fixtureASrc = path.join(fixtureSourceDir, 'A_linh_13115.cpp');
  const fixtureBSrc = path.join(fixtureSourceDir, 'B_khang_13476.cpp');
  await new Promise(resolve => setTimeout(resolve, 500));
  const fixtureAExeExisting = path.join(fixtureSourceDir, 'botA', 'bot');
  const fixtureBExeExisting = path.join(fixtureSourceDir, 'botB', 'bot');
  if (fs.existsSync(fixtureAExeExisting) && fs.existsSync(fixtureBExeExisting)) {
    const fixtureRows = generateBoard('seed-5');
    const fixtureRes = await runWithReadyRetry({
      botFirstExe: fixtureAExeExisting,
      botSecondExe: fixtureBExeExisting,
      boardRows: fixtureRows,
      labels: { first: 'Bot A', second: 'Bot B' },
      readyTimeoutMs: 10000
    });
    assert.strictEqual(fixtureRes.status, 'finished', 'reported timeout fixture should finish once the process lifetime cap matches the real game lifetime');
  } else if (fs.existsSync(fixtureASrc) && fs.existsSync(fixtureBSrc)) {
    const fixtureDir = path.join(root, 'jobs', 'long-clock-regression');
    const fixtureBotADir = path.join(fixtureDir, 'botA');
    const fixtureBotBDir = path.join(fixtureDir, 'botB');
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    fs.mkdirSync(fixtureBotADir, { recursive: true });
    fs.mkdirSync(fixtureBotBDir, { recursive: true });
    const fixtureAExe = path.join(fixtureBotADir, 'bot');
    const fixtureBExe = path.join(fixtureBotBDir, 'bot');
    await compileCpp(fixtureASrc, fixtureAExe);
    await compileCpp(fixtureBSrc, fixtureBExe);
    const fixtureRows = generateBoard('seed-5');
    const fixtureRes = await runWithReadyRetry({
      botFirstExe: fixtureAExe,
      botSecondExe: fixtureBExe,
      boardRows: fixtureRows,
      labels: { first: 'Bot A', second: 'Bot B' },
      readyTimeoutMs: 10000
    });
    assert.strictEqual(fixtureRes.status, 'finished', 'reported timeout fixture should finish once the process lifetime cap matches the real game lifetime');
  }

  const cappedFight = await runFight({ botAExe: dataExeA, botBExe: dataExeB, datasetCount: 3, playBothSides: false, seedBase: 'cap-test', readyTimeoutMs: 10000 });
  assert.strictEqual(cappedFight.summary.datasetCount, 3, 'runFight should honor the configured dataset count');
  assert.strictEqual(cappedFight.results.length, 3, 'runFight should produce one result per dataset when role swap is disabled');

  const fight = await runFight({ botAExe: dataExeA, botBExe: dataExeB, datasetCount: 2, playBothSides: true, seedBase: '', readyTimeoutMs: 10000 });
  const datasetSeeds = new Map();
  for (const game of fight.results) {
    if (!datasetSeeds.has(game.datasetIndex)) datasetSeeds.set(game.datasetIndex, new Set());
    datasetSeeds.get(game.datasetIndex).add(game.seed);
  }
  assert.strictEqual(datasetSeeds.get(0).size, 1, 'role-swap games in same dataset should share one seed');
  assert.strictEqual(datasetSeeds.get(1).size, 1, 'role-swap games in same dataset should share one seed');
  const seed0 = [...datasetSeeds.get(0)][0].split('#')[0];
  const seed1 = [...datasetSeeds.get(1)][0].split('#')[0];
  assert.notStrictEqual(seed0, seed1, 'random mode should use a different random seed per dataset');

  const passBotSource = `
#include <iostream>
#include <string>
int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    if (line.rfind("READY", 0) == 0) std::cout << "OK" << std::endl;
    else if (line.rfind("TIME", 0) == 0) std::cout << "-1 -1 -1 -1" << std::endl;
    else if (line == "FINISH") return 0;
  }
  return 0;
}
`;

  const passA = await compileBot(root, 'passA', passBotSource);
  const passB = await compileBot(root, 'passB', passBotSource);
  const passC = await compileBot(root, 'passC', passBotSource);
  const passD = await compileBot(root, 'passD', passBotSource);
  const passE = await compileBot(root, 'passE', passBotSource);
  const passF = await compileBot(root, 'passF', passBotSource);

  const matchResult = await runMatch({
    simulationIndex: 0,
    roundIndex: 0,
    matchIndex: 0,
    botA: passA,
    botB: passB,
    dataset: { datasetIndex: 0, datasetSeed: 'match-seed', boardRows: rows },
    playBothSides: true,
    botTimeLimitMs: 10000,
    gameIndexStart: 0
  });
  assert.strictEqual(matchResult.match.scoreA, 1, 'role-swap pass-vs-pass match should draw');
  assert.strictEqual(matchResult.match.classificationA, 'draw', 'score 1 match should classify as draw');
  assert.strictEqual(matchResult.games.length, 2, 'role-swap match should create two games');

  const rr = await runTournament({
    mode: 'round_robin',
    bots: [passA, passB, passC],
    simulationCount: 1,
    seedBase: 'rr-seed',
    playBothSides: true,
    botTimeLimitMs: 10000,
    maxConcurrentGames: 2
  });
  assert.strictEqual(rr.matches.length, 3, '3 bots round-robin should produce 3 matches per simulation');
  assert.strictEqual(rr.games.length, 6, 'role-swap round-robin should produce 2 games per match');

  // Multi-simulation aggregate analytics (Monte Carlo stats).
  const multiSim = await runTournament({
    mode: 'round_robin',
    bots: [passA, passB, passC],
    simulationCount: 3,
    seedBase: 'multi-seed',
    playBothSides: true,
    botTimeLimitMs: 10000,
    maxConcurrentGames: 2
  });
  assert.strictEqual(multiSim.simulations.length, 3, 'multi-sim should run 3 simulations');
  assert.strictEqual(multiSim.matches.length, 9, '3 simulations × 3 matches = 9 matches');
  for (const row of multiSim.analytics) {
    assert.ok(Number.isFinite(row.winRateStdDev), 'winRateStdDev should be a finite number');
    assert.ok(Number.isFinite(row.eloStdDev), 'eloStdDev should be a finite number');
    assert.ok(row.avgFinalRank >= 1 && row.avgFinalRank <= 3, 'avgFinalRank should fall within the rank range');
    assert.ok(row.top3RatePct >= 0 && row.top3RatePct <= 1, 'top3RatePct should be a ratio between 0 and 1');
    assert.strictEqual(row.matchWinPct + row.matchDrawPct + row.matchLossPct > 0.999, true, 'match rate components should sum to ~1');
  }

  const swiss = await runTournament({
    mode: 'swiss',
    bots: [passA, passB, passC, passD, passE, passF],
    simulationCount: 1,
    swissRounds: 3,
    seedBase: 'swiss-seed',
    playBothSides: true,
    botTimeLimitMs: 10000,
    avoidRepeatOpponents: true
  });
  assert.strictEqual(swiss.simulations.length, 1, 'swiss should return one simulation');
  for (const row of swiss.analytics) {
    assert.strictEqual(row.matchesPlayed, 3, '6-bot 3-round swiss should give each bot 3 matches');
  }
  const swissPairs = new Set();
  for (const match of swiss.matches) {
    const key = pairKey(match.botAId, match.botBId);
    assert.ok(!swissPairs.has(key), 'swiss should avoid repeated opponents when possible');
    swissPairs.add(key);
  }

  for (const row of swiss.analytics) {
    for (const [oppId, cell] of Object.entries(row.opponents)) {
      const reverse = swiss.analytics.find(x => x.botId === oppId).opponents[row.botId];
      assert.strictEqual(cell.matches, reverse.matches, 'opponent summaries should mirror by match count');
    }
  }
  for (const match of swiss.matches) {
    const ab = swiss.pairMatrix[match.botAId][match.botBId];
    const ba = swiss.pairMatrix[match.botBId][match.botAId];
    assert.strictEqual(ab.matches, ba.matches, 'pair matrix should be symmetric by sample count');
  }

  const swissElo = await runTournament({
    mode: 'swiss',
    bots: [passA, passB, passC, passD],
    simulationCount: 1,
    swissRounds: 2,
    seedBase: 'swiss-elo-seed',
    playBothSides: true,
    botTimeLimitMs: 10000,
    pairingMethod: 'score_then_elo',
    avoidRepeatOpponents: true
  });
  assert.strictEqual(swissElo.simulations.length, 1, 'score_then_elo swiss should run');

  const swissRandom = await runTournament({
    mode: 'swiss',
    bots: [passA, passB, passC, passD],
    simulationCount: 1,
    swissRounds: 2,
    seedBase: 'swiss-random-seed',
    playBothSides: true,
    botTimeLimitMs: 10000,
    pairingMethod: 'random_swiss',
    avoidRepeatOpponents: true
  });
  assert.strictEqual(swissRandom.simulations.length, 1, 'random_swiss should run');

  const timeoutTournament = await runTournament({
    mode: 'round_robin',
    bots: [
      { botId: 'timeoutBot', name: 'timeoutBot', exePath: timeoutExeA },
      passA
    ],
    simulationCount: 1,
    seedBase: 'timeout-tournament',
    playBothSides: false,
    botTimeLimitMs: 100,
    readyTimeoutMs: 1000
  });
  const timeoutBotStats = timeoutTournament.analytics.find(x => x.botId === 'timeoutBot');
  assert.ok(timeoutBotStats.nonOkCount > 0, 'non-ok games should count into tournament analytics');
  assert.ok(timeoutBotStats.matchLosses >= 1, 'timed out bot should lose match analytics');

  const port = 5617;
  const serverProc = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server start timeout')), 10000);
    serverProc.stdout.on('data', chunk => {
      if (String(chunk).includes(`http://localhost:${port}`)) {
        clearTimeout(timer);
        resolve();
      }
    });
    serverProc.on('exit', code => reject(new Error(`server exited early ${code}`)));
  });

  try {
    const form = new FormData();
    const uiBot1 = fs.readFileSync(path.join(root, 'sample-bots', 'sample_first_legal.cpp'));
    const uiBot2 = fs.readFileSync(path.join(root, 'sample-bots', 'sample_first_legal.cpp'));
    form.append('mode', 'round_robin');
    form.append('simulationCount', '1');
    form.append('playBothSides', 'true');
    form.append('botTimeLimitMs', '10000');
    form.append('bots', new Blob([uiBot1]), 'ui-a.cpp');
    form.append('bots', new Blob([uiBot2]), 'ui-b.cpp');
    form.append('botNames', 'UI A');
    form.append('botNames', 'UI B');
    form.append('botTags', '');
    form.append('botTags', '');
    const startRes = await fetch(`http://localhost:${port}/api/tournaments/start`, { method: 'POST', body: form });
    const startJson = await startRes.json();
    assert.ok(startRes.ok, 'tournament start endpoint should succeed');
    assert.ok(startJson.jobId, 'tournament start should return jobId');

    let job;
    for (let i = 0; i < 80; i++) {
      const jobRes = await fetch(`http://localhost:${port}/api/jobs/${startJson.jobId}`);
      job = await jobRes.json();
      if (job.status === 'done') break;
      if (job.status === 'error') throw new Error(job.error || 'job failed');
      await new Promise(resolve => setTimeout(resolve, 250));
    }

    assert.strictEqual(job.status, 'done', 'tournament job should finish through HTTP API');
    assert.ok(job.summary.analytics.totalMatches >= 1, 'poll payload should include tournament analytics');
    assert.ok((job.games || []).length >= 1, 'poll payload should include flat game summaries');
    assert.ok(typeof job.progress.phase === 'string', 'poll payload should expose progress phase');

    const detailRes = await fetch(`http://localhost:${port}/api/jobs/${startJson.jobId}/games/0/detail`);
    const detail = await detailRes.json();
    assert.ok(detailRes.ok, 'existing game detail endpoint should still work for tournament games');
    assert.ok(Array.isArray(detail.moves), 'game detail should expose move list');

    const simDetailRes = await fetch(`http://localhost:${port}/api/jobs/${startJson.jobId}/simulations/0`);
    const simDetail = await simDetailRes.json();
    assert.ok(simDetailRes.ok, 'simulation detail endpoint should succeed');
    assert.ok(Array.isArray(simDetail.matches), 'simulation detail endpoint should include full match list');

    const matchExplorerRes = await fetch(`http://localhost:${port}/api/jobs/${startJson.jobId}/matches?simulationIndex=0&page=1&pageSize=20&sortKey=simulationIndex&sortDir=desc`);
    const matchExplorer = await matchExplorerRes.json();
    assert.ok(matchExplorerRes.ok, 'match explorer endpoint should succeed');
    assert.ok(Array.isArray(matchExplorer.items), 'match explorer should return paged items');

    const firstMatch = matchExplorer.items[0];
    const pairRes = await fetch(`http://localhost:${port}/api/jobs/${startJson.jobId}/pairs/${encodeURIComponent(firstMatch.botAId)}/${encodeURIComponent(firstMatch.botBId)}`);
    const pairJson = await pairRes.json();
    assert.ok(pairRes.ok, 'pair history endpoint should succeed');
    assert.ok(Array.isArray(pairJson.matches), 'pair history should include matches array');

    const exportRes = await fetch(`http://localhost:${port}/api/jobs/${startJson.jobId}/export.json`);
    const exported = await exportRes.json();
    assert.ok(exportRes.ok, 'export endpoint should succeed for tournament jobs');
    assert.ok(exported.analytics, 'export should include analytics');
    assert.ok(Array.isArray(exported.simulations), 'export should include simulations');
    assert.ok(Array.isArray(exported.simulations[0]?.roundSummaries), 'export simulations should include round snapshots');
    assert.ok(Array.isArray(exported.matches), 'export should include matches');
    assert.ok(Array.isArray(exported.games), 'export should include games');

    const dataTournamentForm = new FormData();
    const dataReaderSource = fs.readFileSync(dataSrc);
    dataTournamentForm.append('mode', 'round_robin');
    dataTournamentForm.append('simulationCount', '1');
    dataTournamentForm.append('playBothSides', 'false');
    dataTournamentForm.append('botTimeLimitMs', '10000');
    dataTournamentForm.append('bots', new Blob([dataReaderSource]), 'data-a.cpp');
    dataTournamentForm.append('bots', new Blob([dataReaderSource]), 'data-b.cpp');
    dataTournamentForm.append('botNames', 'Data A');
    dataTournamentForm.append('botNames', 'Data B');
    dataTournamentForm.append('botTags', '');
    dataTournamentForm.append('botTags', '');
    dataTournamentForm.append('botData_0', new Blob(['ok']), 'data.bin');
    dataTournamentForm.append('botData_1', new Blob(['ok']), 'data.bin');
    const dataStartRes = await fetch(`http://localhost:${port}/api/tournaments/start`, { method: 'POST', body: dataTournamentForm });
    const dataStartJson = await dataStartRes.json();
    assert.ok(dataStartRes.ok, 'tournament endpoint should accept per-bot data.bin');
    let dataJob;
    for (let i = 0; i < 80; i++) {
      const jobRes = await fetch(`http://localhost:${port}/api/jobs/${dataStartJson.jobId}`);
      dataJob = await jobRes.json();
      if (dataJob.status === 'done') break;
      if (dataJob.status === 'error') throw new Error(dataJob.error || 'data job failed');
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.strictEqual(dataJob.status, 'done', 'tournament data.bin job should finish');
  } finally {
    serverProc.kill('SIGTERM');
  }

  console.log(dataRes.log);
})();
