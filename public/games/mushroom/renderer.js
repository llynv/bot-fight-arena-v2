'use strict';

// Client renderer for the Mushroom Game. Self-registers on window.ArenaGames.
// The generic SPA (public/app.js) delegates all board-specific drawing here.
// A new game ships its own public/games/<id>/renderer.js with the same shape.
(function registerMushroomRenderer() {
  const COLS = 17;
  const ROWS = 10;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function formatMove(m) {
    if (!m || m.pass) return 'PASS';
    return `${m.r1} ${m.c1} ${m.r2} ${m.c2}`;
  }

  function describeMove(m) {
    if (!m || m.pass) return 'Pass turn';
    return `Rect area ${(m.r2 - m.r1 + 1) * (m.c2 - m.c1 + 1)} cells`;
  }

  function inRect(r, c, m) {
    return r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2;
  }

  function buildReplayState(game, turnCount) {
    const originals = [];
    const owners = new Array(ROWS * COLS).fill(-1);
    for (const row of game.boardRows || (game.scenario && game.scenario.boardRows) || []) {
      for (const ch of String(row)) originals.push(ch);
    }
    for (let i = 0; i < turnCount; i++) {
      const move = game.moves[i];
      if (!move || move.move.pass) continue;
      for (let r = move.move.r1; r <= move.move.r2; r++) {
        for (let c = move.move.c1; c <= move.move.c2; c++) {
          owners[r * COLS + c] = move.player;
        }
      }
    }
    return { originals, owners };
  }

  // helpers: { ownerName(player) }. Returns the boardGrid innerHTML.
  function renderBoard(game, turnCount, helpers = {}) {
    const ownerName = helpers.ownerName || (p => (p === 0 ? 'FIRST' : 'SECOND'));
    const state = buildReplayState(game, turnCount);
    const lastMove = turnCount > 0 ? game.moves[turnCount - 1] : null;
    return state.originals.map((digit, idx) => {
      const r = Math.floor(idx / COLS);
      const c = idx % COLS;
      const owner = state.owners[idx];
      const ownerClass = owner === 0 ? ' firstOwned' : owner === 1 ? ' secondOwned' : '';
      const active = lastMove && !lastMove.move.pass && inRect(r, c, lastMove.move) ? ' activeRect' : '';
      const title = owner === -1
        ? `r${r} c${c} · value ${digit}`
        : `r${r} c${c} · ${ownerName(owner)} owns value ${digit}`;
      return `<span class="boardCell${ownerClass}${active}" role="gridcell" title="${escapeHtml(title)}">${digit}</span>`;
    }).join('');
  }

  window.ArenaGames = window.ArenaGames || {};
  window.ArenaGames.mushroom = {
    meta: { scoreNoun: 'cells', cols: COLS, rows: ROWS },
    formatMove,
    describeMove,
    buildReplayState,
    renderBoard
  };
})();
