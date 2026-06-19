'use strict';

// Runtime-adapter registry. Maps a bot language to its compile step + on-disk
// executable name. Today only C++ ships; adding Python/Java/etc. is a localized
// change here plus a new adapter file — no judge or harness edits required.

const { compileCpp, makePortableCppSource } = require('./compileCpp');

const adapters = {
  cpp: {
    language: 'cpp',
    sourceExt: '.cpp',
    exeName: 'bot',
    compile: compileCpp
  }
};

function getRuntimeAdapter(language = 'cpp') {
  const adapter = adapters[language];
  if (!adapter) throw new Error(`No runtime adapter for language: ${language}`);
  return adapter;
}

module.exports = { getRuntimeAdapter, adapters, compileCpp, makePortableCppSource };
