'use strict';

const { spawn, execFile } = require('child_process');
const path = require('path');
const { clampPositiveInt, DEFAULT_PROCESS_TIME_LIMIT_MS } = require('../timing');

function parseRssKb(stdout) {
  const value = Number(String(stdout || '').trim().split(/\s+/)[0]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

// Wraps a bot subprocess as a line-oriented request/response channel with memory
// sampling and a hard lifetime cap. Knows nothing about any game's protocol.
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
    this.processTimeLimitMs = clampPositiveInt(options.processTimeLimitMs, DEFAULT_PROCESS_TIME_LIMIT_MS, { min: 500, max: 1200000 });
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

module.exports = { LineProcess, parseRssKb };
