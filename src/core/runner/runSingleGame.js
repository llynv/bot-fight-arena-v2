'use strict';

const { LineProcess } = require('../process/LineProcess');
const { normalizeSingleGameTiming } = require('../timing');

// Generic 2-player sequential-turn driver. Owns the handshake, time accounting,
// fault classification, memory sampling, and winner resolution. All game-specific
// behavior is delegated to `judge` (protocol + rules). No board knowledge here.
async function runSingleGame({
  judge,
  botFirstExe,
  botSecondExe,
  scenario,
  datasetIndex = 0,
  gameIndex = 0,
  labels = {},
  onEvent = null,
  timeLimitsMs = null,
  readyTimeoutMs = null,
  processTimeLimitMs = null
}) {
  if (!judge) throw new Error('runSingleGame requires a judge');
  const timing = normalizeSingleGameTiming(
    { timeLimitsMs, readyTimeoutMs, processTimeLimitMs },
    judge.timing
  );
  const first = new LineProcess(botFirstExe, labels.first || 'FIRST', { processTimeLimitMs: timing.processTimeLimitMs });
  const second = new LineProcess(botSecondExe, labels.second || 'SECOND', { processTimeLimitMs: timing.processTimeLimitMs });
  let state = judge.rules.createState(scenario);
  const remaining = [timing.firstTimeLimitMs, timing.secondTimeLimitMs];
  const bot = [first, second];
  const maxPlies = judge.timing?.maxPlies || 500;
  const log = [];
  const moves = [];
  const startedAt = Date.now();
  let status = 'ok';
  let reason = '';
  let winner = null;
  let prevMove = null;

  const emit = (ev) => {
    if (onEvent) onEvent({ datasetIndex, gameIndex, ...ev });
  };

  const readyFailureDetail = async (proc, role, err) => {
    await proc.sampleMemory();
    const rssKb = proc.lastRssKb;
    const maxRssKb = proc.maxRssKb;
    const stderrTail = proc.stderr ? proc.stderr.slice(-160) : '';
    const detail = [
      `${role} startup failed`,
      `pid=${proc.pid || 'n/a'}`,
      `rss=${Number.isFinite(rssKb) ? `${rssKb}KiB` : 'n/a'}`,
      `maxRss=${Number.isFinite(maxRssKb) ? `${maxRssKb}KiB` : 'n/a'}`
    ];
    if (stderrTail) detail.push(`stderr=${JSON.stringify(stderrTail)}`);
    if (err?.message) detail.push(`cause=${err.message}`);
    return detail.join(' · ');
  };

  const makeReadyFailure = async (proc, role, roleIndex, err) => {
    const failure = new Error(await readyFailureDetail(proc, role, err));
    failure.code = err?.code || 'READY_FAILED';
    failure.role = role;
    failure.roleIndex = roleIndex;
    return failure;
  };

  const waitForReady = async (proc, readyLine, expect, role, roleIndex) => {
    proc.start();
    await proc.sampleMemory();
    proc.send(readyLine);
    try {
      const line = await proc.readLine(timing.readyTimeoutMs);
      if (line.trim() !== expect) {
        throw new Error(`${role} did not answer ${expect}, got ${JSON.stringify(line)}`);
      }
      return line;
    } catch (err) {
      throw await makeReadyFailure(proc, role, roleIndex, err);
    }
  };

  try {
    const ready = judge.protocol.ready;
    await waitForReady(first, ready.first, ready.expect, labels.first || 'FIRST', 0);
    await waitForReady(second, ready.second, ready.expect, labels.second || 'SECOND', 1);

    const initLine = judge.protocol.initMessage(scenario);
    first.send(initLine);
    second.send(initLine);
    log.push(initLine);

    let turn = 0;
    for (let ply = 0; ply < maxPlies; ply++) {
      const p = bot[turn];
      const opp = bot[1 - turn];
      const role = turn === 0 ? 'FIRST' : 'SECOND';
      const timeoutMs = Math.max(50, remaining[turn] + 300);

      const before = process.hrtime.bigint();
      p.send(judge.protocol.turnMessage(state, turn, remaining));
      let line;
      try {
        line = await p.readLine(timeoutMs);
      } catch (e) {
        if (e?.code === 'READ_TIMEOUT') {
          status = 'timeout';
          reason = `${role} timeout: ${e.message}`;
        } else if (e?.code === 'PROCESS_LIMIT') {
          status = 'process_limit';
          reason = `${role} process limit: ${e.message}`;
        } else {
          status = 'process_exit';
          reason = `${role} process exit: ${e.message}`;
        }
        winner = 1 - turn;
        break;
      }
      const elapsed = Number(process.hrtime.bigint() - before) / 1e6;
      remaining[turn] -= elapsed;

      if (remaining[turn] < -50) {
        status = 'time_forfeit';
        reason = `${role} exceeded total time by ${Math.round(-remaining[turn])}ms`;
        winner = 1 - turn;
        break;
      }

      const parsed = judge.protocol.parseMove(line);
      if (!parsed.ok) {
        status = 'invalid';
        reason = `${role} invalid output: ${parsed.reason}`;
        winner = 1 - turn;
        break;
      }
      const m = parsed.move;
      if (!judge.rules.isLegal(state, m, turn)) {
        status = 'invalid';
        reason = `${role} illegal move: ${judge.protocol.serializeMove(m)}`;
        winner = 1 - turn;
        break;
      }

      state = judge.rules.applyMove(state, m, turn);
      const score = judge.rules.score(state);
      first.sampleMemory();
      second.sampleMemory();
      const memoryFirst = first.memorySnapshot();
      const memorySecond = second.memorySnapshot();
      const moveStr = judge.protocol.serializeMove(m);
      const elapsedMs = Math.max(0, Math.round(elapsed));
      const moveRecord = {
        ply,
        role,
        player: turn,
        move: m,
        elapsedMs,
        remainingFirstMs: Math.max(0, Math.round(remaining[0])),
        remainingSecondMs: Math.max(0, Math.round(remaining[1])),
        scoreFirst: score.first,
        scoreSecond: score.second,
        memoryFirstKb: memoryFirst.rssKb,
        memorySecondKb: memorySecond.rssKb,
        maxMemoryFirstKb: memoryFirst.maxRssKb,
        maxMemorySecondKb: memorySecond.maxRssKb,
        ...(judge.rules.moveTelemetry ? judge.rules.moveTelemetry(state, m, turn) : {})
      };
      moves.push(moveRecord);
      log.push(`${role} ${moveStr} ${elapsedMs}`);
      emit({ type: 'move', move: moveRecord });

      opp.send(judge.protocol.opponentMessage(m, elapsedMs));

      if (judge.rules.isTerminal(state, m, prevMove)) {
        status = 'finished';
        break;
      }
      prevMove = m;
      turn = 1 - turn;
    }
  } catch (e) {
    if (e?.code === 'READ_TIMEOUT' && Number.isInteger(e?.roleIndex)) {
      status = 'timeout';
      reason = `${e.role} timeout: ${e.message}`;
      winner = 1 - e.roleIndex;
    } else if (e?.code === 'PROCESS_LIMIT' && Number.isInteger(e?.roleIndex)) {
      status = 'process_limit';
      reason = `${e.role} process limit: ${e.message}`;
      winner = 1 - e.roleIndex;
    } else {
      status = 'error';
      reason = e.message;
    }
  } finally {
    await Promise.allSettled([first.sampleMemory(), second.sampleMemory()]);
    try { first.stop(); } catch (_) {}
    try { second.stop(); } catch (_) {}
  }

  const finalScore = judge.rules.score(state);
  if (winner === null) {
    if (finalScore.first > finalScore.second) winner = 0;
    else if (finalScore.second > finalScore.first) winner = 1;
    else winner = -1;
  }

  log.push('FINISH');
  log.push(`SCOREFIRST ${finalScore.first}`);
  log.push(`SCORESECOND ${finalScore.second}`);

  return {
    datasetIndex,
    gameIndex,
    status,
    reason,
    winner,
    finalScore,
    diffFirstMinusSecond: finalScore.first - finalScore.second,
    elapsedMs: Date.now() - startedAt,
    remaining,
    memory: {
      firstMaxRssKb: first.maxRssKb,
      secondMaxRssKb: second.maxRssKb,
      firstLastRssKb: first.lastRssKb,
      secondLastRssKb: second.lastRssKb
    },
    scenario,
    moves,
    log: log.join('\n'),
    stderr: {
      first: first.stderr,
      second: second.stderr
    }
  };
}

module.exports = { runSingleGame };
