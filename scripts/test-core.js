'use strict';

// Proves the core harness is game-agnostic: a fake "countdown" game with a totally
// different stdio protocol than Mushroom runs through the same runner, plus
// contract-conformance checks. No Mushroom code is imported here on purpose.

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { compileCpp } = require('../src/core/runtime');
const { runSingleGame } = require('../src/core/runner/runSingleGame');
const { validateJudge } = require('../src/core/conformance');
const mushroom = require('../src/games/mushroom');

(async () => {
  // 1) Conformance: the shipped judge passes; a broken object fails with reasons.
  assert.strictEqual(validateJudge(mushroom).ok, true, 'mushroom judge should satisfy the contract');
  const broken = validateJudge({ id: 'broken' });
  assert.strictEqual(broken.ok, false, 'a judge missing rules/protocol should fail validation');
  assert.ok(broken.errors.length > 0, 'failed validation should list reasons');

  // 2) A fake game with its own protocol, driven by the generic runner.
  //    Countdown: state.remaining starts at N; each turn a bot subtracts 1..3;
  //    the bot that drives remaining to <= 0 wins. Nothing board-shaped here.
  const countdownJudge = {
    id: 'countdown',
    name: 'Countdown',
    timing: { totalTimeMs: 5000, readyTimeoutMs: 2000, maxPlies: 50 },
    createScenario() { return { start: 5 }; },
    protocol: {
      ready: { first: 'HELLO FIRST', second: 'HELLO SECOND', expect: 'HI' },
      initMessage(scenario) { return `BEGIN ${scenario.start}`; },
      turnMessage() { return 'GO'; },
      parseMove(line) {
        const step = Number(String(line).trim());
        if (!Number.isFinite(step)) return { ok: false, move: null, reason: `bad: ${line}` };
        return { ok: true, move: { step }, reason: '' };
      },
      serializeMove(move) { return String(move.step); },
      opponentMessage(move) { return `OPP ${move.step}`; }
    },
    rules: {
      createState(scenario) { return { remaining: scenario.start, lastMover: -1 }; },
      isLegal(_state, move) { return move.step >= 1 && move.step <= 3; },
      applyMove(state, move, player) { state.remaining -= move.step; state.lastMover = player; return state; },
      isTerminal(state) { return state.remaining <= 0; },
      score(state) {
        return { first: state.lastMover === 0 ? 1 : 0, second: state.lastMover === 1 ? 1 : 0 };
      }
    }
  };

  const dir = path.join(__dirname, '..', 'jobs', 'core-test');
  const botDirA = path.join(dir, 'botA');
  const botDirB = path.join(dir, 'botB');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(botDirA, { recursive: true });
  fs.mkdirSync(botDirB, { recursive: true });
  const src = path.join(dir, 'countdown_bot.cpp');
  // Bot speaks the countdown protocol: HI on hello, "1" each GO, exit on FINISH.
  fs.writeFileSync(src, `
#include <iostream>
#include <string>
int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    if (line.rfind("HELLO", 0) == 0) std::cout << "HI" << std::endl;
    else if (line == "GO") std::cout << "1" << std::endl;
    else if (line == "FINISH") return 0;
  }
  return 0;
}
`);
  const exeA = path.join(botDirA, 'bot');
  const exeB = path.join(botDirB, 'bot');
  await compileCpp(src, exeA);
  await compileCpp(src, exeB);

  const res = await runSingleGame({
    judge: countdownJudge,
    botFirstExe: exeA,
    botSecondExe: exeB,
    scenario: countdownJudge.createScenario(),
    labels: { first: 'A', second: 'B' },
    timeLimitsMs: { first: 5000, second: 5000 },
    readyTimeoutMs: 2000
  });

  assert.strictEqual(res.status, 'finished', `countdown game should finish (got ${res.status}: ${res.reason})`);
  // start 5, both subtract 1: moves by 0,1,0,1,0 -> remaining 0 on FIRST's 3rd move.
  assert.strictEqual(res.moves.length, 5, 'countdown from 5 with step 1 should take 5 plies');
  assert.strictEqual(res.winner, 0, 'the bot that reaches 0 (FIRST) should win');
  assert.strictEqual(res.finalScore.first, 1, 'winner score.first should be 1');

  console.log('test-core OK: generic runner drove a non-Mushroom game + conformance passed');
})();
