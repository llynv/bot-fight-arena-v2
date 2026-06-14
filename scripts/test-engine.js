'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { compileCpp, generateBoard, runSingleGame, runFight, summarizeGame, TOTAL_TIME_MS, READY_TIMEOUT_MS, PROCESS_TIME_LIMIT_MS } = require('../src/gameEngine');

(async () => {
  const root = path.join(__dirname, '..');
  assert.strictEqual(TOTAL_TIME_MS, 30000, 'protocol TIME budget should be 30,000ms');
  assert.strictEqual(READY_TIMEOUT_MS, 3000, 'READY timeout should match statement');
  assert.strictEqual(PROCESS_TIME_LIMIT_MS, 30000, 'process hard limit should match language time limit');
  const src = path.join(root, 'sample-bots', 'sample_first_legal.cpp');
  const exeA = path.join(root, 'jobs', 'sampleA');
  const exeB = path.join(root, 'jobs', 'sampleB');
  fs.mkdirSync(path.dirname(exeA), { recursive: true });
  await compileCpp(src, exeA);
  await compileCpp(src, exeB);
  const rows = generateBoard('test-seed');
  const res = await runSingleGame({ botFirstExe: exeA, botSecondExe: exeB, boardRows: rows });
  const summary = summarizeGame({
    ...res,
    seed: 'test-seed#0',
    aRole: 0,
    botAScore: res.finalScore.first,
    botBScore: res.finalScore.second,
    botAWon: res.finalScore.first > res.finalScore.second,
    botBWon: res.finalScore.second > res.finalScore.first,
    draw: res.finalScore.first === res.finalScore.second
  });

  assert.ok(res.memory, 'runSingleGame should expose memory telemetry');
  assert.ok(Number.isFinite(res.memory.firstMaxRssKb) || res.memory.firstMaxRssKb === null, 'firstMaxRssKb should be numeric or null');
  assert.ok(Number.isFinite(res.memory.secondMaxRssKb) || res.memory.secondMaxRssKb === null, 'secondMaxRssKb should be numeric or null');
  assert.ok(res.moves.length > 0, 'sample game should produce moves');
  assert.ok('memoryFirstKb' in res.moves[0], 'move records should include first memory snapshots');
  assert.ok('memorySecondKb' in res.moves[0], 'move records should include second memory snapshots');
  assert.ok('maxMoveMs' in summary, 'summaries should expose max turn time');
  assert.ok('botAMaxRssKb' in summary, 'summaries should expose Bot A peak RSS');
  assert.ok('botARemainingMs' in summary, 'summaries should expose Bot A remaining time');
  assert.ok('botBRemainingMs' in summary, 'summaries should expose Bot B remaining time');

  const dataDir = path.join(root, 'jobs', 'data-reader');
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  const dataSrc = path.join(dataDir, 'data_reader.cpp');
  const dataExe = path.join(dataDir, 'bot');
  fs.writeFileSync(path.join(dataDir, 'data.bin'), 'ok');
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
  await compileCpp(dataSrc, dataExe);
  const dataRes = await runSingleGame({ botFirstExe: dataExe, botSecondExe: dataExe, boardRows: rows });
  assert.strictEqual(dataRes.status, 'finished', 'bots should read data.bin from executable directory');
  const cappedFight = await runFight({ botAExe: dataExe, botBExe: dataExe, datasetCount: 51, playBothSides: false, seedBase: 'cap-test' });
  assert.strictEqual(cappedFight.summary.datasetCount, 51, 'runFight should allow dataset counts above 50');
  assert.strictEqual(cappedFight.results.length, 51, 'runFight should not cap datasets at 50');

  const fight = await runFight({ botAExe: exeA, botBExe: exeB, datasetCount: 2, playBothSides: true, seedBase: '' });
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
  console.log(res.log);
})();
