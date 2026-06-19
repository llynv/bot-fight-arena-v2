'use strict';

// Deterministic, dependency-free PRNG helpers shared by every game.
// Game-agnostic: seeds in, floats/shuffles out. No board knowledge here.

const crypto = require('crypto');

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
  return `${baseSeed || crypto.randomBytes(8).toString('hex')}#${index}`;
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

module.exports = { xmur3, mulberry32, makeSeed, makeRandomFromSeed, shuffleInPlace };
