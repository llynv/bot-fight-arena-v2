'use strict';

// Fail-fast validation that a game plugin satisfies the GameJudge contract.
// Run at registration time so a broken plugin surfaces immediately instead of
// crashing mid-tournament.

function validateJudge(judge) {
  const errors = [];
  const requireType = (path, value, type) => {
    if (typeof value !== type) errors.push(`${path} must be ${type} (got ${typeof value})`);
  };

  if (!judge || typeof judge !== 'object') {
    return { ok: false, errors: ['judge must be an object'] };
  }

  requireType('id', judge.id, 'string');
  requireType('name', judge.name, 'string');
  requireType('createScenario', judge.createScenario, 'function');

  const timing = judge.timing || {};
  for (const key of ['totalTimeMs', 'readyTimeoutMs', 'maxPlies']) {
    if (!Number.isFinite(timing[key])) errors.push(`timing.${key} must be a finite number`);
  }

  const protocol = judge.protocol || {};
  requireType('protocol.initMessage', protocol.initMessage, 'function');
  requireType('protocol.turnMessage', protocol.turnMessage, 'function');
  requireType('protocol.parseMove', protocol.parseMove, 'function');
  requireType('protocol.serializeMove', protocol.serializeMove, 'function');
  requireType('protocol.opponentMessage', protocol.opponentMessage, 'function');
  const ready = protocol.ready || {};
  for (const key of ['first', 'second', 'expect']) {
    if (typeof ready[key] !== 'string') errors.push(`protocol.ready.${key} must be a string`);
  }

  const rules = judge.rules || {};
  for (const key of ['createState', 'isLegal', 'applyMove', 'isTerminal', 'score']) {
    requireType(`rules.${key}`, rules[key], 'function');
  }

  return { ok: errors.length === 0, errors };
}

function assertValidJudge(judge) {
  const { ok, errors } = validateJudge(judge);
  if (!ok) {
    throw new Error(`Invalid game judge "${judge?.id || 'unknown'}":\n - ${errors.join('\n - ')}`);
  }
  return judge;
}

module.exports = { validateJudge, assertValidJudge };
