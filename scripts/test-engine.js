'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { compileCpp, generateBoard, runSingleGame, summarizeGame } = require('../src/gameEngine');

(async () => {
  const root = path.join(__dirname, '..');
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
  console.log(res.log);
})();
