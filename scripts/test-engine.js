'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { compileCpp, generateBoard, runSingleGame, runFight, summarizeGame, TOTAL_TIME_MS, READY_TIMEOUT_MS, PROCESS_TIME_LIMIT_MS } = require('../src/gameEngine');

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

  assert.strictEqual(TOTAL_TIME_MS, 30000, 'protocol TIME budget should be 30,000ms');
  assert.strictEqual(READY_TIMEOUT_MS, 10000, 'READY timeout should match statement');
  assert.ok(PROCESS_TIME_LIMIT_MS > TOTAL_TIME_MS * 2, 'process lifetime limit should exceed the combined bot clocks');
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
  console.log(dataRes.log);
})();
