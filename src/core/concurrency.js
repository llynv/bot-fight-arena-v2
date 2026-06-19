'use strict';

// Bounded-concurrency map. Runs `worker(item, index)` over `items` with at most
// `limit` in flight, preserving result order. Game-agnostic.
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

module.exports = { runWithConcurrency };
