'use strict';

// Move wire format: "r1 c1 r2 c2", or "-1 -1 -1 -1" to pass.

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

module.exports = { parseMoveLine, moveToString };
