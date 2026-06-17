'use strict';

const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const R = 10;
const C = 17;
const N = R * C;
const TOTAL_TIME_MS = 30000;
const READY_TIMEOUT_MS = 10000;
const PROCESS_TIME_LIMIT_GRACE_MS = 5000;
const PROCESS_TIME_LIMIT_MS = TOTAL_TIME_MS * 2 + READY_TIMEOUT_MS * 2 + PROCESS_TIME_LIMIT_GRACE_MS;

function clampPositiveInt(value, fallback, { min = 1, max = 600000 } = {}) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function deriveProcessTimeLimitMs(firstTimeLimitMs, secondTimeLimitMs, readyTimeoutMs) {
  return firstTimeLimitMs + secondTimeLimitMs + readyTimeoutMs * 2 + PROCESS_TIME_LIMIT_GRACE_MS;
}

function normalizeSingleGameTiming(options = {}) {
  const readyTimeoutMs = clampPositiveInt(options.readyTimeoutMs, READY_TIMEOUT_MS, { min: 100, max: 600000 });
  const firstTimeLimitMs = clampPositiveInt(options.timeLimitsMs?.first, TOTAL_TIME_MS, { min: 100, max: 600000 });
  const secondTimeLimitMs = clampPositiveInt(options.timeLimitsMs?.second, TOTAL_TIME_MS, { min: 100, max: 600000 });
  const derivedProcessTimeLimitMs = deriveProcessTimeLimitMs(firstTimeLimitMs, secondTimeLimitMs, readyTimeoutMs);
  const processTimeLimitMs = clampPositiveInt(options.processTimeLimitMs, derivedProcessTimeLimitMs, { min: 500, max: 1200000 });
  return { readyTimeoutMs, firstTimeLimitMs, secondTimeLimitMs, processTimeLimitMs };
}

function normalizeFightTiming(options = {}) {
  const botATimeLimitMs = clampPositiveInt(options.botATimeLimitMs, TOTAL_TIME_MS, { min: 100, max: 600000 });
  const botBTimeLimitMs = clampPositiveInt(options.botBTimeLimitMs, TOTAL_TIME_MS, { min: 100, max: 600000 });
  const readyTimeoutMs = clampPositiveInt(options.readyTimeoutMs, READY_TIMEOUT_MS, { min: 100, max: 600000 });
  const derivedProcessTimeLimitMs = deriveProcessTimeLimitMs(botATimeLimitMs, botBTimeLimitMs, readyTimeoutMs);
  const processTimeLimitMs = clampPositiveInt(options.processTimeLimitMs, derivedProcessTimeLimitMs, { min: 500, max: 1200000 });
  return { botATimeLimitMs, botBTimeLimitMs, readyTimeoutMs, processTimeLimitMs };
}

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function seed() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a) {
  return function rand() {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSeed(baseSeed, index) {
  const raw = `${baseSeed || crypto.randomBytes(8).toString('hex')}#${index}`;
  return raw;
}

function generateBoard(seedText) {
  const seedFn = xmur3(seedText);
  const rand = mulberry32(seedFn());
  const rows = [];
  for (let r = 0; r < R; r++) {
    let s = '';
    for (let c = 0; c < C; c++) {
      s += String(1 + Math.floor(rand() * 9));
    }
    rows.push(s);
  }
  return rows;
}

function buildState(rows) {
  const val = new Array(N).fill(0);
  const own = new Array(N).fill(-1);
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      val[r * C + c] = Number(rows[r][c]);
    }
  }
  return { val, own, lastPass: false };
}

function cloneState(s) {
  return { val: s.val.slice(), own: s.own.slice(), lastPass: s.lastPass };
}

function areaOf(m) {
  if (m.pass) return 0;
  return (m.r2 - m.r1 + 1) * (m.c2 - m.c1 + 1);
}

function scoreState(state) {
  let first = 0;
  let second = 0;
  for (const o of state.own) {
    if (o === 0) first++;
    else if (o === 1) second++;
  }
  return { first, second };
}

function rectSum(val, r1, c1, r2, c2) {
  let sum = 0;
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) sum += val[r * C + c];
  }
  return sum;
}

function sideHasNonZero(val, r1, c1, r2, c2, side) {
  if (side === 'top') {
    for (let c = c1; c <= c2; c++) if (val[r1 * C + c] !== 0) return true;
  } else if (side === 'bottom') {
    for (let c = c1; c <= c2; c++) if (val[r2 * C + c] !== 0) return true;
  } else if (side === 'left') {
    for (let r = r1; r <= r2; r++) if (val[r * C + c1] !== 0) return true;
  } else if (side === 'right') {
    for (let r = r1; r <= r2; r++) if (val[r * C + c2] !== 0) return true;
  }
  return false;
}

function isLegalMove(state, m) {
  if (m.pass) return true;
  if (!Number.isInteger(m.r1) || !Number.isInteger(m.c1) || !Number.isInteger(m.r2) || !Number.isInteger(m.c2)) return false;
  if (m.r1 < 0 || m.r2 >= R || m.c1 < 0 || m.c2 >= C || m.r1 > m.r2 || m.c1 > m.c2) return false;
  if (rectSum(state.val, m.r1, m.c1, m.r2, m.c2) !== 10) return false;
  return sideHasNonZero(state.val, m.r1, m.c1, m.r2, m.c2, 'top') &&
    sideHasNonZero(state.val, m.r1, m.c1, m.r2, m.c2, 'bottom') &&
    sideHasNonZero(state.val, m.r1, m.c1, m.r2, m.c2, 'left') &&
    sideHasNonZero(state.val, m.r1, m.c1, m.r2, m.c2, 'right');
}

function applyMove(state, m, player) {
  if (m.pass) {
    state.lastPass = true;
    return;
  }
  for (let r = m.r1; r <= m.r2; r++) {
    for (let c = m.c1; c <= m.c2; c++) {
      const k = r * C + c;
      state.val[k] = 0;
      state.own[k] = player;
    }
  }
  state.lastPass = false;
}

function generateLegalMoves(state) {
  const moves = [];
  for (let r1 = 0; r1 < R; r1++) {
    for (let r2 = r1; r2 < R; r2++) {
      for (let c1 = 0; c1 < C; c1++) {
        for (let c2 = c1; c2 < C; c2++) {
          const m = { r1, c1, r2, c2, pass: false };
          if (isLegalMove(state, m)) moves.push(m);
        }
      }
    }
  }
  return moves;
}

function parseMoveLine(line) {
  const parts = String(line || '').trim().split(/\s+/).map(Number);
  if (parts.length < 4 || parts.some(x => !Number.isFinite(x))) {
    return { ok: false, move: null, reason: `Cannot parse move line: ${JSON.stringify(line)}` };
  }
  const [r1, c1, r2, c2] = parts;
  const pass = r1 === -1 && c1 === -1 && r2 === -1 && c2 === -1;
  return { ok: true, move: { r1, c1, r2, c2, pass }, reason: '' };
}

function moveToString(m) {
  if (m.pass) return '-1 -1 -1 -1';
  return `${m.r1} ${m.c1} ${m.r2} ${m.c2}`;
}

function parseRssKb(stdout) {
  const value = Number(String(stdout || '').trim().split(/\s+/)[0]);
  return Number.isFinite(value) && value > 0 ? value : null;
}


const PORTABLE_BITS_HEADER = `
// Auto-generated by bot-fight-arena.
// macOS clang++ does not ship GNU's <bits/stdc++.h>, so uploaded bots that use it
// are compiled through this portable replacement header.
#include <algorithm>
#include <array>
#include <atomic>
#include <bitset>
#include <cassert>
#include <cctype>
#include <cerrno>
#include <cfloat>
#include <chrono>
#include <climits>
#include <cmath>
#include <complex>
#include <condition_variable>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <exception>
#include <fstream>
#include <functional>
#include <future>
#include <iomanip>
#include <initializer_list>
#include <iostream>
#include <iterator>
#include <limits>
#include <list>
#include <map>
#include <memory>
#include <mutex>
#include <numeric>
#include <optional>
#include <ostream>
#include <queue>
#include <random>
#include <regex>
#include <set>
#include <sstream>
#include <stack>
#include <stdexcept>
#include <string>
#include <thread>
#include <tuple>
#include <type_traits>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>
`;

function makePortableCppSource(sourcePath) {
  const original = fs.readFileSync(sourcePath, 'utf8');
  const normalized = original.replace(
    /^\s*#\s*include\s*[<\"]bits\/stdc\+\+\.h[>\"]\s*$/gm,
    PORTABLE_BITS_HEADER.trim()
  );
  if (normalized === original) return sourcePath;

  const portablePath = `${sourcePath}.portable.cpp`;
  fs.writeFileSync(portablePath, normalized);
  return portablePath;
}

function compilerCandidates(preferred) {
  const out = [];
  const add = c => {
    if (c && !out.includes(c)) out.push(c);
  };
  add(preferred);
  add(process.env.CXX);
  // Homebrew GCC on macOS is normally exposed with a versioned name.
  add('g++-15');
  add('g++-14');
  add('g++-13');
  add('g++-12');
  add('g++-11');
  add('clang++');
  add('g++');
  add('c++');
  return out;
}

function compileWith(compiler, args, options) {
  return new Promise((resolve, reject) => {
    execFile(compiler, args, { timeout: options.timeoutMs || 10000, maxBuffer: 1024 * 1024 * 8 }, (err, stdout, stderr) => {
      if (err) reject({ compiler, stdout, stderr, err });
      else resolve({ compiler, stdout, stderr });
    });
  });
}

async function compileCpp(sourcePath, outputPath, options = {}) {
  const flags = options.flags || ['-std=c++17', '-O2', '-pipe'];
  const portableSourcePath = makePortableCppSource(sourcePath);
  const args = [...flags, portableSourcePath, '-o', outputPath];
  const errors = [];

  for (const compiler of compilerCandidates(options.compiler)) {
    try {
      const result = await compileWith(compiler, args, options);
      fs.chmodSync(outputPath, 0o755);
      return { ...result, outputPath };
    } catch (e) {
      const text = e.stderr || e.stdout || e.err?.message || String(e);
      errors.push(`--- ${compiler} ---\n${text}`);
      // If a compiler executable is missing, continue. If it exists but failed
      // due to source errors, trying the next compiler is still useful on macOS
      // because GNU extensions may compile with Homebrew GCC but not clang++.
    }
  }

  throw new Error(`Compile failed for ${path.basename(sourcePath)}\n${errors.join('\n')}`);
}

class LineProcess {
  constructor(exePath, label, options = {}) {
    this.exePath = exePath;
    this.label = label;
    this.proc = null;
    this.buffer = '';
    this.lines = [];
    this.waiters = [];
    this.stderr = '';
    this.exited = false;
    this.exitCode = null;
    this.pid = null;
    this.lastRssKb = null;
    this.maxRssKb = null;
    this.memoryTimer = null;
    this.memorySampleInFlight = false;
    this.processTimer = null;
    this.processTimeLimitMs = clampPositiveInt(options.processTimeLimitMs, PROCESS_TIME_LIMIT_MS, { min: 500, max: 1200000 });
    this.processExitReason = '';
  }

  start() {
    this.proc = spawn(this.exePath, [], { cwd: path.dirname(this.exePath), stdio: ['pipe', 'pipe', 'pipe'] });
    this.pid = this.proc.pid;
    this.proc.stdout.setEncoding('utf8');
    this.proc.stderr.setEncoding('utf8');
    this.proc.stdout.on('data', chunk => this._onData(chunk));
    this.proc.stderr.on('data', chunk => {
      this.stderr += chunk;
      if (this.stderr.length > 20000) this.stderr = this.stderr.slice(-20000);
    });
    this.proc.on('exit', (code, signal) => {
      this.exited = true;
      this.exitCode = code;
      this._stopMemorySampler();
      this._stopProcessTimer();
      const message = this.processExitReason || `${this.label} exited${signal ? ` from ${signal}` : ` with code ${code}`}`;
      const err = new Error(message);
      err.code = this.processExitReason ? 'PROCESS_LIMIT' : 'PROCESS_EXIT';
      this._flushWaiters(err);
    });
    this.proc.on('error', err => this._flushWaiters(err));
    this.sampleMemory();
    this.memoryTimer = setInterval(() => this.sampleMemory(), 250);
    this.memoryTimer.unref?.();
    this.processTimer = setTimeout(() => {
      this.processExitReason = `${this.label} exceeded process lifetime limit of ${this.processTimeLimitMs}ms`;
      try { this.proc?.kill('SIGKILL'); } catch (_) {}
    }, this.processTimeLimitMs);
    this.processTimer.unref?.();
  }

  _stopMemorySampler() {
    if (this.memoryTimer) clearInterval(this.memoryTimer);
    this.memoryTimer = null;
  }

  _stopProcessTimer() {
    if (this.processTimer) clearTimeout(this.processTimer);
    this.processTimer = null;
  }

  _recordMemory(rssKb) {
    if (!Number.isFinite(rssKb) || rssKb <= 0) return;
    this.lastRssKb = rssKb;
    this.maxRssKb = Math.max(this.maxRssKb || 0, rssKb);
  }

  sampleMemory() {
    if (!this.pid || this.exited || this.memorySampleInFlight) return Promise.resolve(null);
    this.memorySampleInFlight = true;
    return new Promise(resolve => {
      execFile('ps', ['-o', 'rss=', '-p', String(this.pid)], { timeout: 1000 }, (err, stdout) => {
        this.memorySampleInFlight = false;
        if (err) return resolve(null);
        const rssKb = parseRssKb(stdout);
        this._recordMemory(rssKb);
        resolve(rssKb);
      });
    });
  }

  memorySnapshot() {
    return {
      rssKb: this.lastRssKb,
      maxRssKb: this.maxRssKb
    };
  }

  _onData(chunk) {
    this.buffer += chunk;
    let idx;
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, idx).replace(/\r$/, '');
      this.buffer = this.buffer.slice(idx + 1);
      this.lines.push(line);
    }
    this._serveWaiters();
  }

  _serveWaiters() {
    while (this.waiters.length && this.lines.length) {
      const waiter = this.waiters.shift();
      clearTimeout(waiter.timer);
      waiter.resolve(this.lines.shift());
    }
  }

  _flushWaiters(err) {
    while (this.waiters.length) {
      const waiter = this.waiters.shift();
      clearTimeout(waiter.timer);
      waiter.reject(err);
    }
  }

  send(line) {
    if (!this.proc || !this.proc.stdin.writable) throw new Error(`${this.label} stdin is not writable`);
    this.proc.stdin.write(`${line}\n`);
  }

  readLine(timeoutMs) {
    if (this.lines.length) return Promise.resolve(this.lines.shift());
    if (this.exited) return Promise.reject(new Error(`${this.label} already exited with code ${this.exitCode}`));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex(w => w.resolve === resolve);
        if (idx !== -1) this.waiters.splice(idx, 1);
        const err = new Error(`${this.label} timed out after ${timeoutMs}ms`);
        err.code = 'READ_TIMEOUT';
        reject(err);
      }, timeoutMs);
      this.waiters.push({ resolve, reject, timer });
    });
  }

  stop(graceMs = 50) {
    this._stopMemorySampler();
    this._stopProcessTimer();
    try { this.send('FINISH'); } catch (_) {}
    if (this.exited) return;
    setTimeout(() => {
      try { this.proc?.kill('SIGTERM'); } catch (_) {}
    }, graceMs).unref?.();
  }
}

async function runSingleGame({ botFirstExe, botSecondExe, boardRows, datasetIndex = 0, gameIndex = 0, labels = {}, onEvent = null, timeLimitsMs = null, readyTimeoutMs = READY_TIMEOUT_MS, processTimeLimitMs = null }) {
  const timing = normalizeSingleGameTiming({ timeLimitsMs, readyTimeoutMs, processTimeLimitMs });
  const first = new LineProcess(botFirstExe, labels.first || 'FIRST', { processTimeLimitMs: timing.processTimeLimitMs });
  const second = new LineProcess(botSecondExe, labels.second || 'SECOND', { processTimeLimitMs: timing.processTimeLimitMs });
  const state = buildState(boardRows);
  const remaining = [timing.firstTimeLimitMs, timing.secondTimeLimitMs];
  const bot = [first, second];
  const log = [];
  const moves = [];
  const startedAt = Date.now();
  let turn = 0;
  let status = 'ok';
  let reason = '';
  let winner = null;

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

  const waitForReady = async (proc, readyLine, role, roleIndex) => {
    proc.start();
    await proc.sampleMemory();
    proc.send(readyLine);
    try {
      const line = await proc.readLine(timing.readyTimeoutMs);
      if (line.trim() !== 'OK') {
        throw new Error(`${role} did not answer OK, got ${JSON.stringify(line)}`);
      }
      return line;
    } catch (err) {
      throw await makeReadyFailure(proc, role, roleIndex, err);
    }
  };

  try {
    await waitForReady(first, 'READY FIRST', labels.first || 'FIRST', 0);
    await waitForReady(second, 'READY SECOND', labels.second || 'SECOND', 1);

    const initLine = `INIT ${boardRows.join(' ')}`;
    first.send(initLine);
    second.send(initLine);
    log.push(initLine);

    for (let ply = 0; ply < 500; ply++) {
      const p = bot[turn];
      const opp = bot[1 - turn];
      const role = turn === 0 ? 'FIRST' : 'SECOND';
      const timeoutMs = Math.max(50, remaining[turn] + 300);

      const before = process.hrtime.bigint();
      p.send(`TIME ${Math.max(0, Math.floor(remaining[turn]))} ${Math.max(0, Math.floor(remaining[1 - turn]))}`);
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

      const parsed = parseMoveLine(line);
      if (!parsed.ok) {
        status = 'invalid';
        reason = `${role} invalid output: ${parsed.reason}`;
        winner = 1 - turn;
        break;
      }
      const m = parsed.move;
      if (!isLegalMove(state, m)) {
        status = 'invalid';
        reason = `${role} illegal move: ${moveToString(m)}`;
        winner = 1 - turn;
        break;
      }

      const wasLastPass = state.lastPass;
      applyMove(state, m, turn);
      const score = scoreState(state);
      first.sampleMemory();
      second.sampleMemory();
      const memoryFirst = first.memorySnapshot();
      const memorySecond = second.memorySnapshot();
      const moveRecord = {
        ply,
        role,
        player: turn,
        move: { r1: m.r1, c1: m.c1, r2: m.r2, c2: m.c2, pass: m.pass },
        elapsedMs: Math.max(0, Math.round(elapsed)),
        remainingFirstMs: Math.max(0, Math.round(remaining[0])),
        remainingSecondMs: Math.max(0, Math.round(remaining[1])),
        scoreFirst: score.first,
        scoreSecond: score.second,
        legalAfter: generateLegalMoves(state).length,
        memoryFirstKb: memoryFirst.rssKb,
        memorySecondKb: memorySecond.rssKb,
        maxMemoryFirstKb: memoryFirst.maxRssKb,
        maxMemorySecondKb: memorySecond.maxRssKb
      };
      moves.push(moveRecord);
      log.push(`${role} ${moveToString(m)} ${moveRecord.elapsedMs}`);
      emit({ type: 'move', move: moveRecord });

      opp.send(`OPP ${moveToString(m)} ${moveRecord.elapsedMs}`);

      if (m.pass && wasLastPass) {
        status = 'finished';
        break;
      }
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

  const finalScore = scoreState(state);
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
    boardRows,
    moves,
    log: log.join('\n'),
    stderr: {
      first: first.stderr,
      second: second.stderr
    }
  };
}

async function runFight({ botAExe, botBExe, datasetCount, playBothSides = true, seedBase = '', botATimeLimitMs = TOTAL_TIME_MS, botBTimeLimitMs = TOTAL_TIME_MS, readyTimeoutMs = READY_TIMEOUT_MS, processTimeLimitMs = null, onEvent = null, onGameResult = null }) {
  const count = Math.max(1, Math.min(1000, Number(datasetCount) || 20));
  const realSeed = String(seedBase || '').trim();
  const timing = normalizeFightTiming({ botATimeLimitMs, botBTimeLimitMs, readyTimeoutMs, processTimeLimitMs });
  const datasets = [];
  for (let i = 0; i < count; i++) {
    const seed = makeSeed(realSeed, i);
    datasets.push({ index: i, seed, rows: generateBoard(seed) });
  }

  const results = [];
  const summary = {
    seedBase: realSeed || '(per-dataset random)',
    datasetCount: count,
    playBothSides: !!playBothSides,
    botATimeLimitMs: timing.botATimeLimitMs,
    botBTimeLimitMs: timing.botBTimeLimitMs,
    readyTimeoutMs: timing.readyTimeoutMs,
    processTimeLimitMs: timing.processTimeLimitMs,
    gamesTotal: count * (playBothSides ? 2 : 1),
    gamesDone: 0,
    botA: { wins: 0, losses: 0, draws: 0, totalScore: 0 },
    botB: { wins: 0, losses: 0, draws: 0, totalScore: 0 },
    statusCounts: {}
  };

  for (const ds of datasets) {
    const pairings = playBothSides
      ? [
          { aRole: 0, botFirstExe: botAExe, botSecondExe: botBExe, labels: { first: 'Bot A', second: 'Bot B' } },
          { aRole: 1, botFirstExe: botBExe, botSecondExe: botAExe, labels: { first: 'Bot B', second: 'Bot A' } }
        ]
      : [{ aRole: 0, botFirstExe: botAExe, botSecondExe: botBExe, labels: { first: 'Bot A', second: 'Bot B' } }];

    for (let k = 0; k < pairings.length; k++) {
      const pairing = pairings[k];
      const gameIndex = results.length;
      onEvent?.({ type: 'game_start', datasetIndex: ds.index, gameIndex, seed: ds.seed, aRole: pairing.aRole });
      const res = await runSingleGame({
        botFirstExe: pairing.botFirstExe,
        botSecondExe: pairing.botSecondExe,
        boardRows: ds.rows,
        datasetIndex: ds.index,
        gameIndex,
        labels: pairing.labels,
        onEvent,
        timeLimitsMs: pairing.aRole === 0
          ? { first: timing.botATimeLimitMs, second: timing.botBTimeLimitMs }
          : { first: timing.botBTimeLimitMs, second: timing.botATimeLimitMs },
        readyTimeoutMs: timing.readyTimeoutMs,
        processTimeLimitMs: timing.processTimeLimitMs
      });
      res.seed = ds.seed;
      res.aRole = pairing.aRole;
      res.botAScore = pairing.aRole === 0 ? res.finalScore.first : res.finalScore.second;
      res.botBScore = pairing.aRole === 0 ? res.finalScore.second : res.finalScore.first;
      const botAWinnerIndex = pairing.aRole === 0 ? 0 : 1;
      const botBWinnerIndex = 1 - botAWinnerIndex;
      res.botAWon = res.winner === botAWinnerIndex;
      res.botBWon = res.winner === botBWinnerIndex;
      res.draw = res.winner === -1;
      results.push(res);
      onGameResult?.(res);

      summary.gamesDone++;
      summary.statusCounts[res.status] = (summary.statusCounts[res.status] || 0) + 1;
      summary.botA.totalScore += res.botAScore;
      summary.botB.totalScore += res.botBScore;
      if (res.draw) {
        summary.botA.draws++;
        summary.botB.draws++;
      } else if (res.botAWon) {
        summary.botA.wins++;
        summary.botB.losses++;
      } else {
        summary.botB.wins++;
        summary.botA.losses++;
      }
      onEvent?.({ type: 'game_done', game: summarizeGame(res), summary: { ...summary } });
    }
  }

  return { summary, datasets, results };
}

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

module.exports = {
  R,
  C,
  TOTAL_TIME_MS,
  READY_TIMEOUT_MS,
  PROCESS_TIME_LIMIT_MS,
  generateBoard,
  generateLegalMoves,
  isLegalMove,
  applyMove,
  scoreState,
  compileCpp,
  runSingleGame,
  runFight,
  summarizeGame
};
