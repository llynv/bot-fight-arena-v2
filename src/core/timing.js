'use strict';

// Generic timing math for the turn runner. Defaults are fallbacks only; a judge
// supplies its own budgets via `judge.timing`. Nothing here knows the game.

const DEFAULT_TOTAL_TIME_MS = 30000;
const DEFAULT_READY_TIMEOUT_MS = 10000;
const PROCESS_TIME_LIMIT_GRACE_MS = 5000;
const DEFAULT_PROCESS_TIME_LIMIT_MS = DEFAULT_TOTAL_TIME_MS * 2 + DEFAULT_READY_TIMEOUT_MS * 2 + PROCESS_TIME_LIMIT_GRACE_MS;

function clampPositiveInt(value, fallback, { min = 1, max = 600000 } = {}) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function deriveProcessTimeLimitMs(firstTimeLimitMs, secondTimeLimitMs, readyTimeoutMs) {
  return firstTimeLimitMs + secondTimeLimitMs + readyTimeoutMs * 2 + PROCESS_TIME_LIMIT_GRACE_MS;
}

function normalizeSingleGameTiming(options = {}, defaults = {}) {
  const totalTimeMs = defaults.totalTimeMs || DEFAULT_TOTAL_TIME_MS;
  const readyDefault = defaults.readyTimeoutMs || DEFAULT_READY_TIMEOUT_MS;
  const readyTimeoutMs = clampPositiveInt(options.readyTimeoutMs, readyDefault, { min: 100, max: 600000 });
  const firstTimeLimitMs = clampPositiveInt(options.timeLimitsMs?.first, totalTimeMs, { min: 100, max: 600000 });
  const secondTimeLimitMs = clampPositiveInt(options.timeLimitsMs?.second, totalTimeMs, { min: 100, max: 600000 });
  const derivedProcessTimeLimitMs = deriveProcessTimeLimitMs(firstTimeLimitMs, secondTimeLimitMs, readyTimeoutMs);
  const processTimeLimitMs = clampPositiveInt(options.processTimeLimitMs, derivedProcessTimeLimitMs, { min: 500, max: 1200000 });
  return { readyTimeoutMs, firstTimeLimitMs, secondTimeLimitMs, processTimeLimitMs };
}

function normalizeFightTiming(options = {}, defaults = {}) {
  const totalTimeMs = defaults.totalTimeMs || DEFAULT_TOTAL_TIME_MS;
  const readyDefault = defaults.readyTimeoutMs || DEFAULT_READY_TIMEOUT_MS;
  const botATimeLimitMs = clampPositiveInt(options.botATimeLimitMs, totalTimeMs, { min: 100, max: 600000 });
  const botBTimeLimitMs = clampPositiveInt(options.botBTimeLimitMs, totalTimeMs, { min: 100, max: 600000 });
  const readyTimeoutMs = clampPositiveInt(options.readyTimeoutMs, readyDefault, { min: 100, max: 600000 });
  const derivedProcessTimeLimitMs = deriveProcessTimeLimitMs(botATimeLimitMs, botBTimeLimitMs, readyTimeoutMs);
  const processTimeLimitMs = clampPositiveInt(options.processTimeLimitMs, derivedProcessTimeLimitMs, { min: 500, max: 1200000 });
  return { botATimeLimitMs, botBTimeLimitMs, readyTimeoutMs, processTimeLimitMs };
}

module.exports = {
  DEFAULT_TOTAL_TIME_MS,
  DEFAULT_READY_TIMEOUT_MS,
  DEFAULT_PROCESS_TIME_LIMIT_MS,
  PROCESS_TIME_LIMIT_GRACE_MS,
  clampPositiveInt,
  deriveProcessTimeLimitMs,
  normalizeSingleGameTiming,
  normalizeFightTiming
};
