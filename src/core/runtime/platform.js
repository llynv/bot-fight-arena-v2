'use strict';

// OS adapter. Isolates the two places bot execution differs between macOS/Linux
// and Windows: the compiled executable's name, and how resident memory is sampled
// from a running pid. Everything else in the harness is platform-neutral.

const { execFile } = require('child_process');

const IS_WINDOWS = process.platform === 'win32';

// Windows requires the .exe suffix for spawn() to locate the compiled bot;
// POSIX runs the bare file. Used for both the compiler's -o target and spawn.
function exeName(base = 'bot') {
  return IS_WINDOWS ? `${base}.exe` : base;
}

// `ps` prints just the RSS in KB (one integer).
function parsePsRssKb(stdout) {
  const value = Number(String(stdout || '').trim().split(/\s+/)[0]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

// `tasklist /FO CSV /NH` row: "img.exe","1234","Console","1","12,345 K".
// Last field is working set in KB with a thousands separator. A missing pid
// yields an "INFO:" line instead, which parses to null.
function parseTasklistRssKb(stdout) {
  const line = String(stdout || '').trim().split(/\r?\n/)[0] || '';
  const fields = line.match(/"([^"]*)"/g);
  if (!fields || fields.length < 5) return null;
  const value = Number(fields[fields.length - 1].replace(/[^\d]/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

// Resident memory (KB) for a pid, or null if it can't be read. ps on POSIX,
// tasklist on Windows.
function sampleRssKb(pid) {
  return new Promise(resolve => {
    if (IS_WINDOWS) {
      execFile('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { timeout: 1000 }, (err, stdout) => {
        resolve(err ? null : parseTasklistRssKb(stdout));
      });
    } else {
      execFile('ps', ['-o', 'rss=', '-p', String(pid)], { timeout: 1000 }, (err, stdout) => {
        resolve(err ? null : parsePsRssKb(stdout));
      });
    }
  });
}

module.exports = { IS_WINDOWS, exeName, sampleRssKb, parsePsRssKb, parseTasklistRssKb };
