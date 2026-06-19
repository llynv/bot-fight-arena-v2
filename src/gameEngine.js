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

function makeRandomFromSeed(seedText) {
  const seedFn = xmur3(String(seedText || 'seed'));
  return mulberry32(seedFn());
}

function shuffleInPlace(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  const concurrency = Math.max(1, Math.min(items.length || 1, Number(limit) || 1));
  let nextIndex = 0;

  async function runner() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await worker(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => runner()));
  return results;
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
    } else if (match.classificationA === 'draw') {
      botA.matchDraws++;
      botB.matchDraws++;
      oppA.draws++;
      oppB.draws++;
    } else {
      botA.matchLosses++;
      botB.matchWins++;
      oppA.losses++;
      oppB.wins++;
    }

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

function makeTournamentDatasetSeed(seedBase, simulationIndex, roundIndex, matchIndex) {
  const root = String(seedBase || crypto.randomBytes(8).toString('hex'));
  return `${root}::sim${simulationIndex}::round${roundIndex === null || roundIndex === undefined ? 'rr' : roundIndex}::match${matchIndex}`;
}

function buildDatasetsForSimulation({ seedBase = '', simulationIndex = 0, pairs = [], roundIndex = null }) {
  return pairs.map((pair, idx) => {
    const seed = makeTournamentDatasetSeed(seedBase, simulationIndex, roundIndex, idx);
    return {
      ...pair,
      datasetIndex: idx,
      datasetSeed: seed,
      boardRows: generateBoard(seed)
    };
  });
}

function buildSimulationStandings(stateMap, botList) {
  const rows = botList.map(bot => {
    const row = stateMap[bot.botId];
    return {
      botId: bot.botId,
      name: bot.name,
      score: row.score,
      elo: row.elo,
      matchWins: row.matchWins,
      matchDraws: row.matchDraws,
      matchLosses: row.matchLosses,
      byeCount: row.byeCount
    };
  });
  rows.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.elo !== b.elo) return b.elo - a.elo;
    return a.name.localeCompare(b.name);
  });
  rows.forEach((row, idx) => {
    row.rank = idx + 1;
  });
  return rows;
}

function buildRoundSummary({ roundIndex = null, label = '', byeBotId = null, matches = [], standings = [] }) {
  return {
    roundIndex,
    label,
    byeBotId,
    pairCount: matches.length,
    matches: matches.map(match => ({
      matchId: match.matchId,
      matchIndex: match.matchIndex,
      simulationIndex: match.simulationIndex,
      roundIndex: match.roundIndex,
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
      repeatPairing: !!match.repeatPairing,
      gameIds: match.gameIds,
      games: match.games
    })),
    topBots: standings.slice(0, 5)
  };
}

function initSimulationState(botList, initialElo) {
  const out = {};
  for (const bot of botList) {
    out[bot.botId] = {
      botId: bot.botId,
      score: 0,
      elo: initialElo,
      opponents: new Set(),
      byeCount: 0,
      matchWins: 0,
      matchDraws: 0,
      matchLosses: 0
    };
  }
  return out;
}

function registerSimulationPlacement(analytics, standings) {
  for (const row of standings) {
    const bot = analytics.bots[row.botId];
    bot.eloCurrent = row.elo;
    bot.eloSamples.push(row.elo);
    bot.placements.push(row.rank);
    const matchesThisSim = (row.matchWins || 0) + (row.matchDraws || 0) + (row.matchLosses || 0);
    if (matchesThisSim > 0) bot.winRateSamples.push(row.matchWins / matchesThisSim);
  }
}

function makeSwissPairings(botList, simState, options = {}) {
  const rand = makeRandomFromSeed(options.seed || 'swiss');
  const mode = String(options.pairingMethod || 'score_then_random');
  const sorted = botList.slice();
  if (mode === 'random_swiss') {
    shuffleInPlace(sorted, rand);
  } else {
    sorted.sort((a, b) => {
      const sa = simState[a.botId];
      const sb = simState[b.botId];
      if (sa.score !== sb.score) return sb.score - sa.score;
      if (mode === 'score_then_elo' && sa.elo !== sb.elo) return sb.elo - sa.elo;
      return rand() < 0.5 ? -1 : 1;
    });
  }

  const available = sorted.slice();
  const pairs = [];
  let bye = null;
  if (available.length % 2 === 1) {
    for (let i = available.length - 1; i >= 0; i--) {
      const candidate = available[i];
      if (simState[candidate.botId].byeCount === 0) {
        bye = candidate;
        available.splice(i, 1);
        break;
      }
    }
    if (!bye) bye = available.pop();
  }

  const tryBuildNoRepeatPairs = (list) => {
    if (!list.length) return [];
    const [first, ...rest] = list;
    for (let i = 0; i < rest.length; i++) {
      const candidate = rest[i];
      if (simState[first.botId].opponents.has(candidate.botId)) continue;
      const next = rest.slice(0, i).concat(rest.slice(i + 1));
      const child = tryBuildNoRepeatPairs(next);
      if (child) return [{ botA: first, botB: candidate, repeatPairing: false }, ...child];
    }
    return null;
  };

  const noRepeatPairs = options.avoidRepeatOpponents ? tryBuildNoRepeatPairs(available) : null;
  if (noRepeatPairs) {
    pairs.push(...noRepeatPairs);
  } else {
    while (available.length) {
      const first = available.shift();
      let chosenIndex = -1;
      let repeatPairing = false;
      for (let i = 0; i < available.length; i++) {
        const candidate = available[i];
        if (!options.avoidRepeatOpponents || !simState[first.botId].opponents.has(candidate.botId)) {
          chosenIndex = i;
          break;
        }
      }
      if (chosenIndex === -1) {
        chosenIndex = 0;
        repeatPairing = true;
      }
      const second = available.splice(chosenIndex, 1)[0];
      pairs.push({ botA: first, botB: second, repeatPairing });
    }
  }

  return { pairs, bye };
}

async function runMatch({ simulationIndex, roundIndex = null, matchIndex = 0, botA, botB, dataset, playBothSides = true, botTimeLimitMs = TOTAL_TIME_MS, readyTimeoutMs = READY_TIMEOUT_MS, processTimeLimitMs = null, emitEvent = null, gameIndexStart = 0 }) {
  const matchId = `sim${simulationIndex}-round${roundIndex === null || roundIndex === undefined ? 'rr' : roundIndex}-match${matchIndex}`;
  emitEvent?.({ type: 'match_start', simulationIndex, roundIndex, matchIndex, matchId, botAId: botA.botId, botBId: botB.botId, datasetSeed: dataset.datasetSeed });

  const games = [];
  const pairings = playBothSides
    ? [
        { aRole: 0, first: botA, second: botB },
        { aRole: 1, first: botB, second: botA }
      ]
    : [{ aRole: 0, first: botA, second: botB }];

  for (let i = 0; i < pairings.length; i++) {
    const pairing = pairings[i];
    const globalGameIndex = gameIndexStart + i;
    emitEvent?.({ type: 'game_start', simulationIndex, roundIndex, matchIndex, gameIndex: globalGameIndex, datasetIndex: dataset.datasetIndex, seed: dataset.datasetSeed, aRole: pairing.aRole, botAId: botA.botId, botBId: botB.botId });
    const raw = await runSingleGame({
      botFirstExe: pairing.first.exePath,
      botSecondExe: pairing.second.exePath,
      boardRows: dataset.boardRows,
      datasetIndex: dataset.datasetIndex,
      gameIndex: globalGameIndex,
      labels: { first: pairing.first.name, second: pairing.second.name },
      onEvent: emitEvent,
      timeLimitsMs: { first: botTimeLimitMs, second: botTimeLimitMs },
      readyTimeoutMs,
      processTimeLimitMs
    });

    raw.gameId = `game-${globalGameIndex}`;
    raw.matchId = matchId;
    raw.simulationIndex = simulationIndex;
    raw.roundIndex = roundIndex;
    raw.matchIndex = matchIndex;
    raw.datasetSeed = dataset.datasetSeed;
    raw.boardRows = dataset.boardRows;
    raw.botAId = botA.botId;
    raw.botBId = botB.botId;
    raw.firstBotId = pairing.first.botId;
    raw.secondBotId = pairing.second.botId;
    raw.aRole = pairing.aRole;
    raw.seed = dataset.datasetSeed;
    raw.botAScore = pairing.aRole === 0 ? raw.finalScore.first : raw.finalScore.second;
    raw.botBScore = pairing.aRole === 0 ? raw.finalScore.second : raw.finalScore.first;
    const botAWinnerIndex = pairing.aRole === 0 ? 0 : 1;
    const botBWinnerIndex = 1 - botAWinnerIndex;
    raw.botAWon = raw.winner === botAWinnerIndex;
    raw.botBWon = raw.winner === botBWinnerIndex;
    raw.draw = raw.winner === -1;
    emitEvent?.({ type: 'game_done', simulationIndex, roundIndex, matchIndex, gameIndex: globalGameIndex, game: summarizeGame(raw) });
    games.push(raw);
  }

  const maxScore = playBothSides ? 2 : 1;
  const scoreA = games.reduce((sum, game) => sum + gamePointsForBot(game.botAWon, game.draw), 0);
  const scoreB = maxScore - scoreA;
  const cellsDiffA = games.reduce((sum, game) => sum + (Number(game.botAScore || 0) - Number(game.botBScore || 0)), 0);
  const match = {
    matchId,
    matchIndex,
    simulationIndex,
    roundIndex,
    pairingIndex: matchIndex,
    botAId: botA.botId,
    botBId: botB.botId,
    botAName: botA.name,
    botBName: botB.name,
    datasetIndex: dataset.datasetIndex,
    datasetSeed: dataset.datasetSeed,
    boardRows: dataset.boardRows,
    gameIds: games.map(game => game.gameId),
    games: games.map(summarizeGame),
    scoreA,
    scoreB,
    classificationA: classifyMatchScore(scoreA, maxScore),
    classificationB: classifyMatchScore(scoreB, maxScore),
    cellsDiffA,
    cellsDiffB: -cellsDiffA,
    nonOkCount: games.filter(game => nonOkStatus(game.status)).length,
    repeatPairing: !!dataset.repeatPairing,
    bye: false,
    status: games.every(game => !nonOkStatus(game.status)) ? 'finished' : 'partial'
  };

  emitEvent?.({ type: 'match_done', simulationIndex, roundIndex, matchIndex, matchId, botAId: botA.botId, botBId: botB.botId, scoreA, scoreB, classificationA: match.classificationA, nonOkCount: match.nonOkCount, match, games: match.games });

  return { match, games };
}

async function runRoundRobinTournament({ bots, simulationCount = 1, seedBase = '', playBothSides = true, botTimeLimitMs = TOTAL_TIME_MS, readyTimeoutMs = READY_TIMEOUT_MS, processTimeLimitMs = null, initialElo = 1500, eloKFactor = 24, maxConcurrentGames = 1, onEvent = null }) {
  const analytics = createAnalytics(bots, { mode: 'round_robin' });
  const allGames = [];
  const allMatches = [];
  const simulations = [];
  onEvent?.({ type: 'tournament_start', mode: 'round_robin', botCount: bots.length, simulationCount });

  for (let simIndex = 0; simIndex < simulationCount; simIndex++) {
    const simSeed = `${seedBase || 'random'}::sim${simIndex}`;
    onEvent?.({ type: 'simulation_start', simulationIndex: simIndex, seed: simSeed, mode: 'round_robin' });
    const simState = initSimulationState(bots, initialElo);
    const pairs = [];
    for (let i = 0; i < bots.length; i++) {
      for (let j = i + 1; j < bots.length; j++) pairs.push({ botA: bots[i], botB: bots[j] });
    }
    shuffleInPlace(pairs, makeRandomFromSeed(simSeed));
    const datasets = buildDatasetsForSimulation({ seedBase: simSeed, simulationIndex: simIndex, pairs, roundIndex: null });
    const matchIds = [];
    const roundMatches = [];

    const gamesPerMatch = playBothSides ? 2 : 1;
    const simulationBaseGameIndex = allGames.length;
    const simulationResults = await runWithConcurrency(datasets, maxConcurrentGames, async (data, matchIndex) => {
      return runMatch({
        simulationIndex: simIndex,
        roundIndex: null,
        matchIndex,
        botA: data.botA,
        botB: data.botB,
        dataset: data,
        playBothSides,
        botTimeLimitMs,
        readyTimeoutMs,
        processTimeLimitMs,
        emitEvent: onEvent,
        gameIndexStart: simulationBaseGameIndex + matchIndex * gamesPerMatch
      });
    });

    for (let matchIndex = 0; matchIndex < simulationResults.length; matchIndex++) {
      const { match, games } = simulationResults[matchIndex];
      allGames.push(...games);
      allMatches.push(match);
      roundMatches.push(match);
      matchIds.push(match.matchId);
      recordMatch(analytics, match, games, null, playBothSides ? 2 : 1);

      const actualA = playBothSides ? match.scoreA / 2 : match.scoreA;
      const elo = updateElo(simState[match.botAId].elo, simState[match.botBId].elo, actualA, eloKFactor);
      simState[match.botAId].elo = elo.eloA;
      simState[match.botBId].elo = elo.eloB;
      simState[match.botAId].opponents.add(match.botBId);
      simState[match.botBId].opponents.add(match.botAId);
      if (match.classificationA === 'win') {
        simState[match.botAId].score += 1;
        simState[match.botAId].matchWins++;
        simState[match.botBId].matchLosses++;
      } else if (match.classificationA === 'draw') {
        simState[match.botAId].score += 0.5;
        simState[match.botBId].score += 0.5;
        simState[match.botAId].matchDraws++;
        simState[match.botBId].matchDraws++;
      } else {
        simState[match.botBId].score += 1;
        simState[match.botBId].matchWins++;
        simState[match.botAId].matchLosses++;
      }
    }

    const standings = buildSimulationStandings(simState, bots);
    registerSimulationPlacement(analytics, standings);
    const simulation = {
      simulationIndex: simIndex,
      mode: 'round_robin',
      seed: simSeed,
      rounds: 1,
      roundSummaries: [buildRoundSummary({ roundIndex: null, label: 'Round-robin pair set', byeBotId: null, matches: roundMatches, standings })],
      matchIds,
      standings,
      winnerBotId: standings[0]?.botId || null,
      nonOkCount: allMatches.filter(match => match.simulationIndex === simIndex).reduce((sum, match) => sum + match.nonOkCount, 0),
      elapsedMs: allMatches.filter(match => match.simulationIndex === simIndex).length
    };
    simulations.push(simulation);
    onEvent?.({ type: 'simulation_done', simulationIndex: simIndex, seed: simSeed, winnerBotId: simulation.winnerBotId, nonOkCount: simulation.nonOkCount });
  }

  analytics.global.totalSimulations = simulationCount;
  finalizeAnalytics(analytics);
  analytics.global.elapsedWallMs = allGames.reduce((sum, game) => sum + Number(game.elapsedMs || 0), 0);
  onEvent?.({ type: 'tournament_done', mode: 'round_robin', totalMatches: allMatches.length, totalGames: allGames.length });
  return { mode: 'round_robin', bots, simulations, matches: allMatches, games: allGames, analytics: analytics.standings, analyticsFull: analytics, pairMatrix: analytics.pairMatrix };
}

async function runSwissTournament({ bots, simulationCount = 1, swissRounds = 20, seedBase = '', playBothSides = true, botTimeLimitMs = TOTAL_TIME_MS, readyTimeoutMs = READY_TIMEOUT_MS, processTimeLimitMs = null, initialElo = 1500, eloKFactor = 24, pairingMethod = 'score_then_random', avoidRepeatOpponents = true, maxConcurrentGames = 1, onEvent = null }) {
  const analytics = createAnalytics(bots, { mode: 'swiss' });
  const allGames = [];
  const allMatches = [];
  const simulations = [];
  onEvent?.({ type: 'tournament_start', mode: 'swiss', botCount: bots.length, simulationCount, swissRounds });

  for (let simIndex = 0; simIndex < simulationCount; simIndex++) {
    const simSeed = `${seedBase || 'random'}::sim${simIndex}`;
    onEvent?.({ type: 'simulation_start', simulationIndex: simIndex, seed: simSeed, mode: 'swiss' });
    const simState = initSimulationState(bots, initialElo);
    const matchIds = [];
    const roundSummaries = [];

    for (let roundIndex = 0; roundIndex < swissRounds; roundIndex++) {
      const pairingSeed = `${simSeed}::round${roundIndex}`;
      const pairing = makeSwissPairings(bots, simState, { avoidRepeatOpponents, seed: pairingSeed, pairingMethod });
      onEvent?.({ type: 'round_start', simulationIndex: simIndex, roundIndex, pairCount: pairing.pairs.length, byeBotId: pairing.bye?.botId || null });
      const roundMatches = [];

      if (pairing.bye) {
        const state = simState[pairing.bye.botId];
        state.score += 1;
        state.byeCount++;
      }

      const datasets = buildDatasetsForSimulation({ seedBase: pairingSeed, simulationIndex: simIndex, pairs: pairing.pairs, roundIndex });
      const gamesPerMatch = playBothSides ? 2 : 1;
      const roundBaseGameIndex = allGames.length;
      const roundResults = await runWithConcurrency(datasets, maxConcurrentGames, async (data, matchIndex) => {
        data.repeatPairing = pairing.pairs[matchIndex].repeatPairing;
        return runMatch({
          simulationIndex: simIndex,
          roundIndex,
          matchIndex,
          botA: data.botA,
          botB: data.botB,
          dataset: data,
          playBothSides,
          botTimeLimitMs,
          readyTimeoutMs,
          processTimeLimitMs,
          emitEvent: onEvent,
          gameIndexStart: roundBaseGameIndex + matchIndex * gamesPerMatch
        });
      });

      for (let matchIndex = 0; matchIndex < roundResults.length; matchIndex++) {
        const { match, games } = roundResults[matchIndex];
        allGames.push(...games);
        allMatches.push(match);
        roundMatches.push(match);
        matchIds.push(match.matchId);
        recordMatch(analytics, match, games, null, playBothSides ? 2 : 1);

        const actualA = playBothSides ? match.scoreA / 2 : match.scoreA;
        const elo = updateElo(simState[match.botAId].elo, simState[match.botBId].elo, actualA, eloKFactor);
        simState[match.botAId].elo = elo.eloA;
        simState[match.botBId].elo = elo.eloB;
        simState[match.botAId].opponents.add(match.botBId);
        simState[match.botBId].opponents.add(match.botAId);

        if (match.classificationA === 'win') {
          simState[match.botAId].score += 1;
          simState[match.botAId].matchWins++;
          simState[match.botBId].matchLosses++;
        } else if (match.classificationA === 'draw') {
          simState[match.botAId].score += 0.5;
          simState[match.botBId].score += 0.5;
          simState[match.botAId].matchDraws++;
          simState[match.botBId].matchDraws++;
        } else {
          simState[match.botBId].score += 1;
          simState[match.botBId].matchWins++;
          simState[match.botAId].matchLosses++;
        }
      }
      const roundStandings = buildSimulationStandings(simState, bots);
      roundSummaries.push(buildRoundSummary({ roundIndex, label: `Round ${roundIndex + 1}`, byeBotId: pairing.bye?.botId || null, matches: roundMatches, standings: roundStandings }));
      onEvent?.({ type: 'round_done', simulationIndex: simIndex, roundIndex, pairCount: pairing.pairs.length });
    }

    const standings = buildSimulationStandings(simState, bots);
    registerSimulationPlacement(analytics, standings);
    const simulation = {
      simulationIndex: simIndex,
      mode: 'swiss',
      seed: simSeed,
      rounds: swissRounds,
      roundSummaries,
      matchIds,
      standings,
      winnerBotId: standings[0]?.botId || null,
      nonOkCount: allMatches.filter(match => match.simulationIndex === simIndex).reduce((sum, match) => sum + match.nonOkCount, 0),
      elapsedMs: allMatches.filter(match => match.simulationIndex === simIndex).length
    };
    simulations.push(simulation);
    onEvent?.({ type: 'simulation_done', simulationIndex: simIndex, seed: simSeed, winnerBotId: simulation.winnerBotId, nonOkCount: simulation.nonOkCount });
  }

  analytics.global.totalSimulations = simulationCount;
  finalizeAnalytics(analytics);
  analytics.global.elapsedWallMs = allGames.reduce((sum, game) => sum + Number(game.elapsedMs || 0), 0);
  onEvent?.({ type: 'tournament_done', mode: 'swiss', totalMatches: allMatches.length, totalGames: allGames.length });
  return { mode: 'swiss', bots, simulations, matches: allMatches, games: allGames, analytics: analytics.standings, analyticsFull: analytics, pairMatrix: analytics.pairMatrix };
}

async function runTournament(options = {}) {
  const mode = String(options.mode || 'round_robin');
  if (mode === 'swiss') return runSwissTournament(options);
  if (mode === 'round_robin') return runRoundRobinTournament(options);
  throw new Error(`Unsupported tournament mode: ${mode}`);
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
  classifyMatchScore,
  buildPairMatrix,
  createAnalytics,
  finalizeAnalytics,
  makeSwissPairings,
  recordMatch,
  runSingleGame,
  runMatch,
  runFight,
  runTournament,
  runRoundRobinTournament,
  runSwissTournament,
  summarizeGame
};
